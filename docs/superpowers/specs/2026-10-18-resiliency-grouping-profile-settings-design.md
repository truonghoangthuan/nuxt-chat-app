# Sub-Project 1: Core Resiliency, Viewport Grouping & Profile Settings — Design Specification

## 1. Context & Roadmap Overview

Following the critical investigation of `nuxt-chat-app`, the next major evolution of the application is decomposed into **4 sequential sub-projects**:

1. **Sub-Project 1 (This Spec): Core Resiliency, Viewport Grouping & Profile Settings** — Fixes the three core realtime/viewport bugs (channel-switch scroll reset, full 3-channel reconnection with live 1-second countdown, and reactive profile caching) while introducing Slack-style 5-minute message grouping, date dividers, and live-synced Profile Settings (`display_name` + 8-color `avatar_color`).
2. **Sub-Project 2: Interactive Message Lifecycle** — Inline message editing, soft-deletion (`deleted_at`), quote-replies (`reply_to_id`), and emoji reactions (`public.message_reactions`).
3. **Sub-Project 3: Persistent Unread Tracking & `@mentions`** — Database-backed `public.channel_reads` (`last_read_at`) across reloads and `@display_name` mention badges.
4. **Sub-Project 4: Direct Messages (1-on-1 Private Conversations)** — Private 1-on-1 DM channels with participant RLS policies in the sidebar.

---

## 2. Goals & Non-Goals (Sub-Project 1)

### Goals
- **Eliminate Channel-Switch Scroll & Unread Pill Bugs**: Switching channels in `MessageViewport.vue` must reset `unreadNewCount` to `0`, mark `isNearBottom = true`, and scroll to the bottom of the newly loaded channel history rather than treating the newly selected channel's history as a single unread message.
- **Full 3-Channel Reconnection & Live Countdown**:
  - `createConnectionManager` ticks `nextRetryMs` down every `1000ms` so `reconnectCountdownSec` displays a live countdown (`4s → 3s → 2s → 1s`) in `ConnectionBanner.vue`.
  - `reconnectChat` restores all 3 realtime channels (`presence:global`, `chat:db_changes`, and `typing:<activeChannelId>`).
  - `fetchGapMessages` recovers missed messages even when the active channel had zero messages prior to disconnect.
- **Profile Caching & Zero Redundant Queries**:
  - Cache known `Profile` objects in a reactive `Map<string, Profile>` inside `useChatRoom`.
  - Skip querying `public.profiles` when a realtime message arrives for an inactive channel, or when the sender's `user_id` is already in `profilesCache`.
- **Slack-Style 5-Minute Message Grouping & Date Dividers**:
  - Insert date divider pills (`Today`, `Yesterday`, or `Oct 18, 2026`) whenever the local calendar day changes between messages.
  - Group consecutive messages from the same `user_id` sent on the same local calendar day within `5 minutes` (`300,000 ms`) into compact rows that hide the repeated avatar and author name, showing the short `HH:MM` timestamp in the left gutter on hover.
- **User Profile Settings with Live Realtime Sync**:
  - Allow authenticated users to edit their `display_name` (`1–40` chars) and choose an `avatar_color` from `AVATAR_PALETTE` via a `ProfileSettingsModal.vue` opened from the sidebar footer.
  - Add `public.profiles` to `supabase_realtime` and handle `UPDATE` events in `chat:db_changes` + re-track `presence:global` so updated names and avatar colors propagate immediately across loaded messages, online friends, and the user footer for all connected users.

### Non-Goals (Deferred to Sub-Projects 2–4)
- Custom image file uploads for avatars or custom status text (`status_text`).
- Message editing, deletion, replies, or emoji reactions (Sub-Project 2).
- Database-persisted unread counts (Sub-Project 3) or 1-on-1 DMs (Sub-Project 4).

---

## 3. Architecture & Data Flow

### 3.1 Database Schema Update (`supabase/schema.sql`)
- Existing table `public.profiles` already includes `display_name`, `avatar_color`, and the RLS policy `"Users can update their own profile"` (`using (auth.uid() = id) with check (auth.uid() = id)`).
- Update the `supabase_realtime` publication block at the bottom of `supabase/schema.sql` so `public.profiles` is included alongside `public.messages` and `public.channels`:
  ```sql
  do $$
  begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      alter publication supabase_realtime add table public.messages, public.channels;
    end if;
  exception when duplicate_object then
    null;
  end;
  $$;

  do $$
  begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      alter publication supabase_realtime add table public.profiles;
    end if;
  exception when duplicate_object then
    null;
  end;
  $$;
  ```

### 3.2 Pure Helpers (`app/utils/chat.ts`)
Add four pure, deterministic functions:
1. **`isValidDisplayName(name: string): boolean`**
   - Trims input; returns `true` iff `trimmed.length >= 1 && trimmed.length <= 40`.
2. **`isValidAvatarColor(color: string): boolean`**
   - Returns `true` iff `AVATAR_PALETTE.includes(color as any)`.
3. **`formatDateDivider(isoString: string, now: Date = new Date()): string`**
   - Compares local calendar year/month/date of `new Date(isoString)` against `now`:
     - Same local day → `'Today'`
     - Previous local calendar day → `'Yesterday'`
     - Otherwise → formatted date string (e.g., `date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`).
4. **`buildMessageTimeline(messages: ChatMessage[], now: Date = new Date()): TimelineMessageItem[]`**
   - Interface `TimelineMessageItem`:
     ```ts
     export interface TimelineMessageItem {
       message: ChatMessage
       showDateDivider: boolean
       dateLabel: string
       isCompact: boolean
     }
     ```
   - For each message `curr` at index `i` (with `prev = messages[i - 1]`):
     - `showDateDivider` is `true` if `i === 0` or `curr` falls on a different local calendar day (`YYYY-MM-DD`) than `prev`.
     - `isCompact` is `true` iff `!showDateDivider`, `prev.user_id === curr.user_id`, and `Math.abs(Date.parse(curr.created_at) - Date.parse(prev.created_at)) <= 5 * 60 * 1000`.

### 3.3 Profile Update Action (`app/composables/useAuthProfile.ts`)
- Add `updateProfile(displayName: string, avatarColor: string): Promise<{ profile: Profile | null; error: string | null }>`:
  - Validates `isValidDisplayName(displayName)` and `isValidAvatarColor(avatarColor)`. If invalid, returns `{ profile: null, error: '...' }` without network I/O.
  - Resolves `userId` via `extractAuthUserId(user.value)` (with fallback to `supabase.auth.getUser()` or `currentProfile.value?.id`), preserving Invariant #1 in `AGENTS.md`.
  - Executes:
    ```ts
    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: cleanName,
        avatar_color: avatarColor,
      })
      .eq('id', userId)
      .select('*')
      .single()
    ```
  - Updates `currentProfile.value = data as Profile` and returns `{ profile: currentProfile.value, error: null }`.

### 3.4 Store & Connection Manager Enhancements

#### `app/composables/useMessagesState.ts`
- Add `updateAuthorProfile(profile: Profile): number`:
  - Iterates over `messages.value`; for every message where `msg.user_id === profile.id`, updates `msg.author = { ...profile }`.
  - Returns the count of updated messages.

#### `app/composables/useConnectionManager.ts`
- Add a 1-second countdown interval timer (`countdownTimer`) alongside `retryTimer`:
  - Whenever `scheduleRetry(delayMs)` starts a backoff wait, sets `nextRetryMs.value = delayMs` and starts a `setInterval(..., 1000)` that decrements `nextRetryMs.value = Math.max(0, nextRetryMs.value - 1000)`.
  - `clearTimer()` clears both `retryTimer` and `countdownTimer`.
  - Result: `reconnectCountdownSec` (`Math.ceil(nextRetryMs.value / 1000)`) in `useChatRoom.ts` automatically ticks down every second (`4 → 3 → 2 → 1`) until the retry executes or `handleConnected()` / `dispose()` clears it.

#### `app/composables/useChatRoom.ts`
- **Profile Cache (`profilesCache`)**:
  - Maintain `const profilesCache = new Map<string, Profile>()`.
  - Populate `profilesCache` from `authProfile.currentProfile.value`, `onlineFriends.value` on presence sync, and `author` objects returned in `selectChannel`, `loadOlderMessages`, `fetchGapMessages`, `sendMessage`, and `retryMessage`.
  - In `setupDbChangesSubscription()` for `INSERT` on `public.messages`:
    - If `newRow.channel_id !== activeChannelId.value`, pass straight to `handleIncomingRealtimeMessage` without querying `public.profiles`.
    - If `newRow.channel_id === activeChannelId.value`, check `profilesCache.get(newRow.user_id)` first; only query `supabase.from('profiles').select(...).eq('id', newRow.user_id).single()` on cache miss, caching the result.
  - Add `.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => ...)` to `dbChangesChannel`:
    - Applies `syncProfileUpdate(payload.new as Profile)` which updates `profilesCache`, calls `messagesStore.updateAuthorProfile(profile)`, updates `onlineFriends.value` if that user is online, and updates `authProfile.currentProfile.value` if `profile.id === authProfile.currentProfile.value?.id`.
  - Expose `syncOwnProfile(profile: Profile): Promise<void>`:
    - Calls `syncProfileUpdate(profile)` immediately for optimistic local responsiveness and re-tracks `presenceChannel.track({ user_id: profile.id, display_name: profile.display_name, avatar_color: profile.avatar_color, online_at: new Date().toISOString() })`.
- **Full 3-Channel Reconnect & Empty-Channel Gap Healing**:
  - In `reconnectChat()`: also subscribe `typingChannel` (if `activeChannelId.value` is present) alongside `presenceChannel` and `dbChangesChannel`.
  - In `fetchGapMessages()`: if `lastTimestamp` is `null` (the active channel had no confirmed messages before disconnect), query the latest `PAGE_SIZE` messages for `activeChannelId.value` ordered by `created_at ASC, id ASC` and pass them to `messagesStore.mergeGapMessages(data)`.

### 3.5 Component Design

#### 1. `app/components/MessageViewport.vue`
- Add optional prop `channelId?: string | null` (default `null`), passed as `:channel-id="activeChannelId"` from `app/pages/index.vue`.
- Watch `() => props.channelId`:
  - Reset `unreadNewCount.value = 0` and `isNearBottom.value = true`.
  - Update `prevNewestId.value` and call `scrollToBottom(false)`.
- Compute `timelineItems = computed(() => buildMessageTimeline(props.messages))`.
- Template rendering for each `item` in `timelineItems`:
  - **Date Divider**: When `item.showDateDivider` is true, render a centered horizontal rule with a pill badge (`data-test="date-divider"`) displaying `item.dateLabel`.
  - **Full Message Row (`!item.isCompact`)**: Render `UserAvatar` + author `display_name` + `formatTime(msg.created_at)` + status indicator + content (existing layout).
  - **Compact Message Row (`item.isCompact`)**: Omit `UserAvatar` and the author name header; render a `w-9 shrink-0` left gutter displaying `formatTime(msg.created_at)` in `text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity select-none text-right pr-1`, alongside the message content and any `Sending...` / `Failed` status controls.

#### 2. `app/components/ProfileSettingsModal.vue` & `app/components/ChatSidebar.vue`
- In `ChatSidebar.vue`:
  - Add emit `(e: 'openProfileSettings'): void`.
  - Add a Profile Settings button (`data-test="open-profile-settings"`, gear/user-edit icon or clickable profile trigger) in the sidebar footer next to the Theme Toggle and Logout buttons.
- Create `app/components/ProfileSettingsModal.vue`:
  - Props: `isOpen: boolean`, `profile: Profile | null`.
  - Emits: `close`, `save(payload: { displayName: string; avatarColor: string; onSuccess?: () => void; onError?: (msg: string) => void })`.
  - Shows a live `UserAvatar` preview with the edited `displayName` and selected `avatarColor`.
  - Renders an input for Display Name (`maxlength="40"`) and an 8-swatch color picker (`AVATAR_PALETTE`) with an active ring/checkmark on the selected color.
  - Wired in `app/pages/index.vue` via `handleSaveProfile`, which invokes `authProfile.updateProfile(...)` and `syncOwnProfile(updated)`.

---

## 4. Error Handling & Edge Cases

- **Invalid Display Name / Color**: Caught synchronously before any Supabase request; inline error message shown inside `ProfileSettingsModal.vue`.
- **Supabase RLS / Network Failure on Profile Update**: `updateProfile` returns `{ profile: null, error: error.message }`; modal stays open, re-enables the Save button, and displays the error banner.
- **Pending/Failed Optimistic Messages in Compact Groups**: If a compact message is in `sending` or `failed` state, its status indicator (`Sending...` or `Failed to send — Retry / Dismiss`) remains visible inline so the user never loses retry controls.
- **Channel Switch During History Load**: `MessageViewport.vue` watches both `channelId` and `messages`; when initial history finishes loading (`setInitialHistory`) for a newly selected channel while `isNearBottom` is `true`, it smoothly lands at the bottom with `unreadNewCount === 0`.

---

## 5. Verification & Testing Plan (`npm test`)

1. **`tests/utils/chat.test.ts`**:
   - Test `isValidDisplayName` and `isValidAvatarColor`.
   - Test `formatDateDivider` for `Today`, `Yesterday`, and older dates.
   - Test `buildMessageTimeline` for:
     - First message showing date divider and `!isCompact`.
     - Same author within 5 minutes on same day → `isCompact: true`, `showDateDivider: false`.
     - Same author after `> 5` minutes → `isCompact: false`.
     - Different author within 1 minute → `isCompact: false`.
     - Same author across midnight boundary → `showDateDivider: true`, `isCompact: false`.
2. **`tests/composables/useMessagesState.test.ts`**:
   - Test `updateAuthorProfile` updates `author.display_name` and `author.avatar_color` across all matching messages in the store without perturbing message order.
3. **`tests/composables/useRealtimeStates.test.ts`**:
   - Test `createConnectionManager` decrements `nextRetryMs` every `1000ms` during backoff and resets cleanly on `handleConnected` or `dispose`.
4. **`tests/composables/useChatRoom.test.ts`**:
   - Test profile cache prevents duplicate `profiles` queries on consecutive realtime messages from the same user and skips `profiles` queries for inactive channels.
   - Test `UPDATE` event on `public.profiles` updates loaded messages and `onlineFriends`.
   - Test `reconnectChat` re-subscribes `typingChannel` and heals empty-channel gaps.
5. **`tests/components/chatUi.test.ts`**:
   - Test `MessageViewport.vue` renders date dividers, collapses consecutive same-user messages within 5 minutes into compact rows, and resets `unreadNewCount` on `channelId` change.
   - Test `ProfileSettingsModal.vue` validates display name, selects avatar colors, and emits `save`.
