# Sub-Project 3: Persistent Unread Tracking & `@mentions` — Design Specification

## 1. Context & Purpose

Building on **Sub-Project 1** (Core Resiliency, Viewport Grouping & Profile Settings) and **Sub-Project 2** (Interactive Message Lifecycle), **Sub-Project 3** introduces persistent per-channel read tracking (`public.channel_reads`) and full `@mentions` support across the composer, message viewport, and sidebar. Unread counts and direct `@mention` badges survive page refreshes and offline gaps, and switching into a channel with unread messages highlights where the user left off with a `"New messages"` divider line.

---

## 2. Goals & Non-Goals

### Goals
- **Database-Backed Read State (`public.channel_reads`)**:
  - Persist `(user_id, channel_id, last_read_at)` in Postgres with Row-Level Security (`auth.uid() = user_id`).
  - Hydrate accurate `unreadCounts[channelId]` and `unreadMentions[channelId]` on initial app load (`initializeChat`) and after network reconnection (`reconnectChat`).
- **In-Viewport `"New messages"` Unread Divider**:
  - When a user selects a channel that has unread messages, snapshot its prior `last_read_at` timestamp into `activeChannelUnreadSince` before marking the channel read (`last_read_at = now()`).
  - Render a `"New messages"` horizontal divider (`data-test="unread-divider"`) in `MessageViewport.vue` immediately above the first non-deleted message from another user sent after `activeChannelUnreadSince`.
- **Full `@mentions` Experience**:
  - **Composer Autocomplete (`MessageComposer.vue`)**: Typing `@<query>` at the cursor opens a floating list of matching profiles (`mentionCandidates`), allowing selection via click or `Enter`/`Tab` without prematurely submitting the message.
  - **Viewport Highlighting (`MessageViewport.vue`)**: Render `@DisplayName` tokens as styled inline pills (`data-test="mention-token"`) and highlight message rows that mention or reply to the current user (`data-test="mention-row-<msg.id>"`).
  - **Sidebar Mention Badge (`ChatSidebar.vue`)**: Display a distinct `@` badge (`data-test="mention-badge-<channel.id>"`) next to the unread counter whenever an inactive channel has unread messages that mention (or quote-reply to) the current user.

### Non-Goals
- Browser Web Push / Service Worker OS notifications or email digests.
- Role-based group mentions (`@here`, `@everyone`, `@channel`).
- Server-side Postgres triggers to maintain materialized unread counters.

---

## 3. Architecture & Data Flow

### 3.1 Database Schema & RLS (`supabase/schema.sql`)

Add `public.channel_reads` with composite primary key `(user_id, channel_id)`:

```sql
-- 5. Channel Reads Table (Persistent Unread Tracking)
create table if not exists public.channel_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

alter table public.channel_reads enable row level security;

create policy "Users can view their own channel reads"
  on public.channel_reads for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own channel reads"
  on public.channel_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own channel reads"
  on public.channel_reads for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### 3.2 Domain Types & Pure Helpers (`app/types/chat.ts` & `app/utils/chat.ts`)

#### Types (`app/types/chat.ts`)
```ts
export interface ChannelRead {
  user_id: string
  channel_id: string
  last_read_at: string
}

export interface MentionSegment {
  text: string
  isMention: boolean
  isMe: boolean
}

export interface ActiveMentionQuery {
  query: string
  startIndex: number
  endIndex: number
}
```
Extend `TimelineMessageItem`:
```ts
export interface TimelineMessageItem {
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isCompact: boolean
  showUnreadDivider?: boolean
  isMentioningMe?: boolean
}
```

#### Pure Helpers (`app/utils/chat.ts`)
1. **`extractActiveMentionQuery(text: string, cursorIndex: number): ActiveMentionQuery | null`**:
   - Inspects `text.slice(0, cursorIndex)`.
   - Matches an `@` preceded by start-of-string or whitespace followed by `0..40` non-whitespace characters (`/(?:^|\s)@([^\s@]{0,40})$/`).
   - Returns `{ query, startIndex, endIndex: cursorIndex }` or `null`.
2. **`applyMentionAutocomplete(text: string, activeQuery: ActiveMentionQuery, displayName: string): string`**:
   - Replaces the slice `[activeQuery.startIndex, activeQuery.endIndex]` with `@${displayName} `.
3. **`doesMessageMentionUser(content: string, displayName?: string | null): boolean`**:
   - Returns `false` if `!content || !displayName?.trim()`.
   - Escapes regex metacharacters in `displayName.trim()` and checks case-insensitively whether `@<displayName>` appears preceded by start-of-string or whitespace and followed by end-of-string, whitespace, or punctuation (`/(?:^|\s)@<escaped>(?=$|\s|[.,!?:;])/i`).
4. **`tokenizeMessageMentions(content: string, currentDisplayName?: string | null, knownDisplayNames: string[] = []): MentionSegment[]`**:
   - Splits `content` into ordered `MentionSegment` items so `@<knownName>` (and any `@Word` token) is marked `isMention: true`, with `isMe: true` when matching `currentDisplayName` case-insensitively.
5. **Update `buildMessageTimeline(messages, now, options?: { lastReadAt?: string | null; currentUserId?: string; currentDisplayName?: string })`**:
   - Tracks `let unreadDividerPlaced = false`.
   - For each message `msg`:
     - If `!unreadDividerPlaced`, `options?.lastReadAt`, `!msg.deleted_at`, `msg.user_id !== options.currentUserId`, and `Date.parse(msg.created_at) > Date.parse(options.lastReadAt)`, sets `showUnreadDivider = true` and `unreadDividerPlaced = true`.
     - If `showUnreadDivider` is `true`, forces `isCompact = false`.
     - Sets `isMentioningMe = Boolean(!msg.deleted_at && options?.currentUserId && msg.user_id !== options.currentUserId && (doesMessageMentionUser(msg.content, options?.currentDisplayName) || (msg.reply_to && msg.reply_to.user_id === options.currentUserId)))`.

### 3.3 Unread & Mention Orchestration (`app/composables/useChatRoom.ts`)
- **Pure Snapshot Helper (`computeUnreadSnapshot`)**:
  ```ts
  export function computeUnreadSnapshot(params: {
    messages: Array<Pick<ChatMessage, 'id' | 'channel_id' | 'user_id' | 'content' | 'created_at' | 'deleted_at' | 'reply_to_id'>>
    lastReadByChannel: Record<string, string>
    activeChannelId: string | null
    currentUserId: string
    currentDisplayName?: string | null
  }): {
    unreadCounts: Record<string, number>
    unreadMentions: Record<string, number>
  }
  ```
  - Counts non-deleted messages from other users (`m.user_id !== currentUserId`) in non-active channels (`m.channel_id !== activeChannelId`) where `Date.parse(m.created_at) > Date.parse(lastReadByChannel[m.channel_id])`.
  - Increments `unreadMentions[m.channel_id]` when `doesMessageMentionUser(m.content, currentDisplayName)` is true.
- **Realtime Updates (`handleIncomingRealtimeMessage`)**:
  - Extend `handleIncomingRealtimeMessage` parameters with `unreadMentions?: Record<string, number>`, `currentUserId?: string`, and `currentDisplayName?: string | null`.
  - When a message arrives for an inactive channel (`row.channel_id !== activeChannelId`), increments `unreadCounts[row.channel_id]` and—if `!row.deleted_at && row.user_id !== currentUserId && doesMessageMentionUser(row.content, currentDisplayName)`—increments `unreadMentions[row.channel_id]`.
- **Database Sync in `useChatRoom()`**:
  - State: `unreadMentions = ref<Record<string, number>>({})`, `lastReadByChannel = ref<Record<string, string>>({})`, `activeChannelUnreadSince = ref<string | null>(null)`, and `knownProfiles = computed<Profile[]>(...)` (merging `profilesCache` and `onlineFriends`).
  - `markChannelRead(channelId: string, readAtIso = new Date().toISOString())`: updates `lastReadByChannel.value[channelId] = readAtIso` and upserts `{ user_id: current.id, channel_id: channelId, last_read_at: readAtIso }` into `public.channel_reads`.
  - `selectChannel(channelId)`: captures `activeChannelUnreadSince.value = (unreadCounts.value[channelId] || 0) > 0 ? (lastReadByChannel.value[channelId] || null) : null`, clears `unreadCounts.value[channelId] = 0` and `unreadMentions.value[channelId] = 0`, and calls `markChannelRead(channelId)`.

### 3.4 UI Component Updates (`ChatSidebar.vue`, `MessageComposer.vue`, `MessageViewport.vue`, `index.vue`)

1. **`app/components/ChatSidebar.vue`**:
   - Add optional prop `unreadMentions?: Record<string, number>` (default `{}`).
   - Next to the unread count pill for channel `ch`, render `<span v-if="(unreadMentions?.[ch.id] || 0) > 0" :data-test="'mention-badge-' + ch.id" class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950">@</span>`.
2. **`app/components/MessageComposer.vue`**:
   - Add optional prop `mentionCandidates?: Profile[]` (default `[]`).
   - Track `cursorIndex = ref(0)` on `@input` / `@keyup` / `@click`.
   - Compute `activeMention = computed(() => extractActiveMentionQuery(content.value, cursorIndex.value))` and `filteredMentions = computed(...)` matching `mentionCandidates` by `display_name`.
   - When `filteredMentions.length > 0`, render a floating popup (`data-test="mention-autocomplete"`):
     - Pressing `Enter` or `Tab` (or clicking `[data-test="mention-option-<profile.id>"]`) calls `selectMention(profile)` which replaces `@query` with `@${profile.display_name} ` via `applyMentionAutocomplete` instead of submitting the message.
3. **`app/components/MessageViewport.vue`**:
   - Add optional props `lastReadAt?: string | null` (default `null`) and `currentDisplayName?: string` (default `''`).
   - Pass `{ lastReadAt: props.lastReadAt, currentUserId: props.currentUserId, currentDisplayName: props.currentDisplayName }` to `buildMessageTimeline`.
   - Render `<div v-if="item.showUnreadDivider" data-test="unread-divider" ...>New messages</div>` above the first unread message.
   - Add `:data-test="item.isMentioningMe ? 'mention-row-' + item.message.id : undefined"` and amber highlight styling when `item.isMentioningMe` is true, and render message text segments via `tokenizeMessageMentions`.

---

## 4. Verification & Testing Plan (`npm test`)

1. **`tests/utils/chat.test.ts`**:
   - Test `extractActiveMentionQuery` and `applyMentionAutocomplete`.
   - Test `doesMessageMentionUser` and `tokenizeMessageMentions` (including multi-word display names and `isMe` detection).
   - Test `buildMessageTimeline` with `lastReadAt` and `currentDisplayName` (`showUnreadDivider: true` on the first unread message from another user, `isCompact: false` on that boundary, and `isMentioningMe: true`).
2. **`tests/composables/useChatRoom.test.ts`**:
   - Test `computeUnreadSnapshot` and `handleIncomingRealtimeMessage` incrementing both `unreadCounts` and `unreadMentions` when mentioned in an inactive channel.
3. **`tests/components/chatUi.test.ts`**:
   - Test `ChatSidebar.vue` rendering `[data-test="mention-badge-<ch.id>"]` alongside unread counts.
   - Test `MessageComposer.vue` opening `[data-test="mention-autocomplete"]` on `@` input and inserting `@DisplayName ` on option click or `Enter`.
   - Test `MessageViewport.vue` rendering `[data-test="unread-divider"]`, `[data-test="mention-row-<msg.id>"]`, and `[data-test="mention-token"]`.
