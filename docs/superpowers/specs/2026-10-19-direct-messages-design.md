# Sub-Project 4: Direct Messages (1-on-1 Private Conversations) — Design Specification

## 1. Context & Purpose

Completing the 4-phase evolution of `nuxt-chat-app`, **Sub-Project 4** adds private 1-on-1 Direct Messages (DMs) between friends. By modeling a DM as a channel row in `public.channels` with `is_dm = true` and canonical sorted participant UUIDs (`dm_user_a < dm_user_b`), DMs enforce strict Postgres Row-Level Security (RLS) without join recursion while automatically inheriting every capability from Sub-Projects 1–3: cursor pagination, optimistic delivery, typing indicators, message grouping, date dividers, inline editing, soft-deletion, quote-replies, 8-emoji reactions, and persistent unread/mention badges.

---

## 2. Goals & Non-Goals

### Goals
- **Strict Postgres RLS Privacy for 1-on-1 DMs**:
  - Only the two participants (`auth.uid() = dm_user_a or auth.uid() = dm_user_b`) can `SELECT` or `INSERT` a DM channel row, its messages in `public.messages`, or its reactions in `public.message_reactions`.
- **Canonical, Idempotent DM Creation (`normalizeDmPair`)**:
  - Any two user UUIDs `(u1, u2)` map deterministically to `dm_user_a = min(u1, u2)`, `dm_user_b = max(u1, u2)`, and `slug = 'dm:' || dm_user_a || ':' || dm_user_b`, enforced by a partial unique index `on public.channels (dm_user_a, dm_user_b) where is_dm = true`.
  - If two friends click each other simultaneously, duplicate-key (`23505`) recovery selects the existing DM channel row and opens it seamlessly.
- **Dedicated Sidebar `"Direct Messages"` Section + Clickable Online Friends + `+ New DM` Modal**:
  - `ChatSidebar.vue` displays a `"Direct Messages"` section listing active DM threads with the peer's `UserAvatar`, live online indicator, display name, and unread / `@` mention badges.
  - Clicking any friend (other than yourself) in `"Online Friends"` immediately opens or creates the 1-on-1 DM with that friend.
  - Clicking `+ New` in the `"Direct Messages"` header opens `StartDmModal.vue`, allowing the user to search and start a DM with any registered friend (online or offline).
- **DM-Aware Header & Composer**:
  - When viewing a DM, the top bar displays the peer's `UserAvatar` and `@DisplayName` (`Direct Message`), and `MessageComposer.vue` uses a DM-appropriate placeholder (`Message @DisplayName...`).

### Non-Goals
- Multi-user (3+ participant) private group DMs or invite-only topic channels.
- Blocking/friending request workflows (all authenticated users in the friends workspace can DM each other).

---

## 3. Architecture & Data Flow

### 3.1 Database Schema & Strict RLS (`supabase/schema.sql`)

1. **Extend `public.channels` for 1-on-1 DMs**:
   ```sql
   alter table public.channels
     add column if not exists is_dm boolean not null default false,
     add column if not exists dm_user_a uuid references public.profiles(id) on delete cascade,
     add column if not exists dm_user_b uuid references public.profiles(id) on delete cascade;

   do $$
   begin
     if not exists (
       select 1 from pg_constraint where conname = 'channels_dm_pair_check'
     ) then
       alter table public.channels
         add constraint channels_dm_pair_check
         check (
           (not is_dm and dm_user_a is null and dm_user_b is null)
           or (is_dm and dm_user_a is not null and dm_user_b is not null and dm_user_a < dm_user_b)
         );
     end if;
   end;
   $$;

   create unique index if not exists channels_dm_pair_unique_idx
     on public.channels (dm_user_a, dm_user_b)
     where is_dm = true;
   ```

2. **Channel Access Helper Function (`public.can_access_channel`)**:
   ```sql
   create or replace function public.can_access_channel(cid uuid)
   returns boolean
   language sql
   security definer
   stable
   set search_path = public
   as $$
     select exists (
       select 1
       from public.channels c
       where c.id = cid
         and (not c.is_dm or auth.uid() = c.dm_user_a or auth.uid() = c.dm_user_b)
     );
   $$;
   ```

3. **Replace RLS Policies on `channels`, `messages`, and `message_reactions`**:
   ```sql
   drop policy if exists "Authenticated users can view channels" on public.channels;
   create policy "Authenticated users can view accessible channels"
     on public.channels for select
     to authenticated
     using (not is_dm or auth.uid() = dm_user_a or auth.uid() = dm_user_b);

   drop policy if exists "Authenticated users can create channels" on public.channels;
   create policy "Authenticated users can create channels"
     on public.channels for insert
     to authenticated
     with check (
       (not is_dm and (auth.uid() = created_by or created_by is null))
       or (is_dm and (auth.uid() = dm_user_a or auth.uid() = dm_user_b))
     );

   drop policy if exists "Authenticated users can view messages" on public.messages;
   create policy "Authenticated users can view accessible messages"
     on public.messages for select
     to authenticated
     using (public.can_access_channel(channel_id));

   drop policy if exists "Authenticated users can insert messages" on public.messages;
   create policy "Authenticated users can insert accessible messages"
     on public.messages for insert
     to authenticated
     with check (auth.uid() = user_id and public.can_access_channel(channel_id));

   drop policy if exists "Authenticated users can view message reactions" on public.message_reactions;
   create policy "Authenticated users can view accessible message reactions"
     on public.message_reactions for select
     to authenticated
     using (public.can_access_channel(channel_id));

   drop policy if exists "Authenticated users can insert their own reactions" on public.message_reactions;
   create policy "Authenticated users can insert accessible reactions"
     on public.message_reactions for insert
     to authenticated
     with check (auth.uid() = user_id and public.can_access_channel(channel_id));
   ```

### 3.2 Domain Types & Pure Helpers (`app/types/chat.ts` & `app/utils/chat.ts`)

#### Types (`app/types/chat.ts`)
Extend `Channel`:
```ts
export interface Channel {
  id: string
  slug: string
  description: string | null
  created_by: string | null
  created_at: string
  is_dm?: boolean
  dm_user_a?: string | null
  dm_user_b?: string | null
  peer?: Profile | null
}
```

#### Pure Helpers (`app/utils/chat.ts`)
1. **`normalizeDmPair(userId1: string, userId2: string): { dm_user_a: string; dm_user_b: string; slug: string } | null`**:
   - Trims both IDs; returns `null` if `!u1 || !u2 || u1 === u2`.
   - Sorts `[a, b] = u1 < u2 ? [u1, u2] : [u2, u1]`.
   - Returns `{ dm_user_a: a, dm_user_b: b, slug: `dm:${a}:${b}` }`.
2. **`getDmPeerId(channel: Pick<Channel, 'is_dm' | 'dm_user_a' | 'dm_user_b'>, currentUserId?: string | null): string | null`**:
   - Returns `null` if `!channel.is_dm || !currentUserId`.
   - If `channel.dm_user_a === currentUserId`, returns `channel.dm_user_b || null`.
   - If `channel.dm_user_b === currentUserId`, returns `channel.dm_user_a || null`.
   - Otherwise returns `null`.
3. **`canUserAccessChannel(channel: Pick<Channel, 'is_dm' | 'dm_user_a' | 'dm_user_b'>, currentUserId?: string | null): boolean`**:
   - Returns `true` if `!channel.is_dm`.
   - Returns `Boolean(currentUserId && (channel.dm_user_a === currentUserId || channel.dm_user_b === currentUserId))`.

### 3.3 DM Orchestration (`app/composables/useChatRoom.ts`)
- **All Profiles Loading (`loadAllProfiles`)**:
  - Queries `public.profiles` (`select('id, display_name, avatar_color').order('display_name', { ascending: true })`) during `initializeChat()` and stores them in `profilesCache` and `allProfiles = ref<Profile[]>([])` so offline friends' names/avatars are available for DM headers, sidebar items, and `StartDmModal.vue`.
- **Computed Channel Lists**:
  - `publicChannels = computed<Channel[]>(() => channels.value.filter(c => !c.is_dm))`
  - `dmChannels = computed<Channel[]>(() => ...)`: filters `channels.value.filter(c => Boolean(c.is_dm))`, resolves `peerId = getDmPeerId(c, currentUserId)`, and attaches `peer: profilesCache.get(peerId) || allProfiles.value.find(p => p.id === peerId) || null`.
- **`openOrCreateDm(peerUserId: string)`**:
  1. Resolves `current = authProfile.currentProfile.value || await authProfile.ensureProfile()`.
  2. Computes `pair = normalizeDmPair(current.id, peerUserId)`. If `!pair`, returns `{ channel: null, error: 'Invalid DM participant.' }`.
  3. Checks if `channels.value` already has a channel with `c.slug === pair.slug` (or matching `dm_user_a` & `dm_user_b`). If found, calls `await selectChannel(existing.id)` and returns `{ channel: existing, error: null }`.
  4. Inserts `{ slug: pair.slug, description: null, created_by: current.id, is_dm: true, dm_user_a: pair.dm_user_a, dm_user_b: pair.dm_user_b }` into `public.channels`.
  5. If `error && isDuplicateKeyError(error)`, queries `public.channels` by `.eq('slug', pair.slug).single()`.
  6. Appends the channel to `channels.value` (if not already added via Realtime) and calls `await selectChannel(dmChannel.id)`.
- **Realtime `channels` `INSERT` Guard**:
  - In `setupDbChangesSubscription()`, when a `public.channels` `INSERT` arrives, check `canUserAccessChannel(newChannel, authProfile.currentProfile.value?.id)` before adding to `channels.value`.

### 3.4 UI Components (`ChatSidebar.vue`, `StartDmModal.vue`, `MessageComposer.vue`, `index.vue`)

1. **`app/components/ChatSidebar.vue`**:
   - Add props `dmChannels?: Channel[]` (default `() => []`) and emits `(e: 'openStartDm'): void` and `(e: 'startDmWithUser', userId: string): void`.
   - Render the **Direct Messages** section below **Channels**:
     - Header with `Direct Messages` and `+ New` button (`data-test="open-start-dm"`).
     - Each `dm` in `dmChannels` renders a button (`data-test="dm-channel-<dm.id>"`) with `UserAvatar` (`:show-online="isPeerOnline(dm)"`), `dm.peer?.display_name || 'Friend'`, and unread/mention badges.
   - In **Online Friends**, make each friend row (where `!currentUser || friend.id !== currentUser.id`) clickable (`data-test="online-friend-<friend.id>"`) to emit `startDmWithUser(friend.id)` and `closeMobile`.
2. **`app/components/StartDmModal.vue`**:
   - Modal with search input (`data-test="dm-search-input"`) filtering `friends` (excluding `currentUserId`) by `display_name`.
   - Clicking a friend (`data-test="start-dm-friend-<friend.id>"`) emits `selectFriend(friend.id)`.
3. **`app/components/MessageComposer.vue` & `app/pages/index.vue`**:
   - Add optional prop `isDm?: boolean` (default `false`) to `MessageComposer.vue` so placeholder reads `Message @<channelSlug>...` for DMs and `Message #<channelSlug>...` for public channels.
   - In `app/pages/index.vue`, pass `publicChannels` and `dmChannels` to `ChatSidebar`, render `UserAvatar` + `@PeerName` in the top header when `activeChannel?.is_dm` is true, and wire `StartDmModal.vue` to `openOrCreateDm`.

---

## 4. Verification & Testing Plan (`npm test`)

1. **`tests/utils/chat.test.ts`**:
   - Test `normalizeDmPair` (lexicographical ordering regardless of argument order, rejecting self-DM or empty IDs).
   - Test `getDmPeerId` and `canUserAccessChannel`.
2. **`tests/composables/useChatRoom.test.ts`**:
   - Test `hydrateDmChannelPeers` attaching peer profiles from `profilesCache` and filtering inaccessible DM channels.
3. **`tests/components/chatUi.test.ts`**:
   - Test `ChatSidebar.vue` rendering `dmChannels` with unread badges and emitting `startDmWithUser` when clicking an online friend.
   - Test `StartDmModal.vue` filtering friends by search query and emitting `selectFriend`.
