# Sub-Project 4: Direct Messages (1-on-1 Private Conversations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver private 1-on-1 Direct Messages (DMs) between friends backed by canonical participant pair ordering (`dm_user_a < dm_user_b`), strict Postgres Row-Level Security (RLS) on `channels`, `messages`, and `message_reactions`, a dedicated `"Direct Messages"` section in `ChatSidebar.vue`, clickable online friends, `StartDmModal.vue` to search/pick any friend (online or offline), and DM-aware header and composer states.

**Architecture:** Extend `public.channels` with `is_dm`, `dm_user_a`, and `dm_user_b` enforced by a `check` constraint and partial unique index (`where is_dm = true`), plus a `security definer` helper `public.can_access_channel(cid uuid)` used across RLS policies. Add pure helpers (`normalizeDmPair`, `getDmPeerId`, `canUserAccessChannel`, `hydrateDmChannelPeers`) in `app/utils/chat.ts` and `app/composables/useChatRoom.ts`. Wire `publicChannels`, `dmChannels`, `allProfiles`, and `openOrCreateDm` into `ChatSidebar.vue`, `StartDmModal.vue`, `MessageComposer.vue`, and `app/pages/index.vue`.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Supabase (`@nuxtjs/supabase`), Tailwind CSS, Vitest + `@vue/test-utils` (`happy-dom`).

---

## Global Invariants & Constraints (From `AGENTS.md`)

- **Auth User ID Resolution:** Always resolve user IDs via `authProfile.currentProfile.value` or `authProfile.ensureProfile()` before writing `channels` (`created_by`, `dm_user_a`, `dm_user_b`) so Postgres RLS checks (`auth.uid() = dm_user_a or auth.uid() = dm_user_b`) succeed.
- **Canonical Pair & Duplicate-Key Idempotency (`23505`):** Always normalize DM participant UUIDs with `normalizeDmPair(u1, u2)` (`dm_user_a < dm_user_b`). If `openOrCreateDm` hits a duplicate-key error (`isDuplicateKeyError(error)`), query the existing channel row by `slug = pair.slug` and select it.
- **Channel Isolation:** Switching between public channels and DMs uses the exact same `selectChannel(channelId)` race-condition guard (`if (activeChannelId.value !== channelId) return`) and `messagesStore.setInitialHistory(hydrated, channelId)`.
- **Verification Gate:** Run `npx vitest run` after each task and `npm test` at the end.

---

## File Structure & Responsibilities

| File | Action | Responsibility |
| --- | --- | --- |
| `supabase/schema.sql` | Modify | Add `is_dm`, `dm_user_a`, `dm_user_b`, `channels_dm_pair_check`, `channels_dm_pair_unique_idx`, `public.can_access_channel(uuid)`, and strict RLS policies on `channels`, `messages`, and `message_reactions` |
| `app/types/chat.ts` | Modify | Extend `Channel` interface with optional `is_dm`, `dm_user_a`, `dm_user_b`, and `peer` |
| `app/utils/chat.ts` | Modify | Add `normalizeDmPair`, `getDmPeerId`, and `canUserAccessChannel` |
| `app/composables/useChatRoom.ts` | Modify | Add exported `hydrateDmChannelPeers` helper, `allProfiles` loading (`loadAllProfiles`), `publicChannels` & `dmChannels` computed lists, `openOrCreateDm(peerUserId)`, and Realtime `channels` `INSERT` access filter |
| `app/components/ChatSidebar.vue` | Modify | Render `"Direct Messages"` section with `+ New` button, peer avatar + online dot, unread/mention badges, and clickable `"Online Friends"` rows |
| `app/components/StartDmModal.vue` | Create | Searchable modal listing all friends (excluding self) to start or open a 1-on-1 DM |
| `app/components/MessageComposer.vue` | Modify | Add optional `isDm?: boolean` prop to format placeholder as `Message @PeerName...` vs `Message #channel...` |
| `app/pages/index.vue` | Modify | Pass `publicChannels` and `dmChannels` to `ChatSidebar`, render DM peer avatar + `@DisplayName` in header when `activeChannel?.is_dm`, and mount `StartDmModal` |
| `tests/utils/chat.test.ts` | Modify | Unit tests for `normalizeDmPair`, `getDmPeerId`, and `canUserAccessChannel` |
| `tests/composables/useChatRoom.test.ts` | Modify | Unit tests for `hydrateDmChannelPeers` and DM access filtering |
| `tests/components/chatUi.test.ts` | Modify | Component tests for `ChatSidebar.vue` DM section + clickable online friends and `StartDmModal.vue` |

---

### Task 1: Pure DM Helpers (`normalizeDmPair`, `getDmPeerId`, `canUserAccessChannel`) & `Channel` Types

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `app/utils/chat.ts`
- Modify: `tests/utils/chat.test.ts`

- [x] **Step 1: Write failing unit tests in `tests/utils/chat.test.ts`**

Append the following `describe` block to `tests/utils/chat.test.ts` (and add `normalizeDmPair, getDmPeerId, canUserAccessChannel` to the import from `~/utils/chat`):

```ts
describe('direct message (DM) pure helpers (Sub-Project 4)', () => {
  it('normalizeDmPair sorts two distinct user IDs lexicographically regardless of input order', () => {
    const ab = normalizeDmPair('user-222', 'user-111')
    const ba = normalizeDmPair('user-111', 'user-222')

    expect(ab).toEqual({
      dm_user_a: 'user-111',
      dm_user_b: 'user-222',
      slug: 'dm:user-111:user-222',
    })
    expect(ba).toEqual(ab)
  })

  it('normalizeDmPair returns null for identical or empty user IDs', () => {
    expect(normalizeDmPair('user-111', 'user-111')).toBeNull()
    expect(normalizeDmPair('', 'user-111')).toBeNull()
    expect(normalizeDmPair('   ', 'user-111')).toBeNull()
  })

  it('getDmPeerId returns the other participant ID for a DM channel and null otherwise', () => {
    const dmChannel = {
      is_dm: true,
      dm_user_a: 'user-111',
      dm_user_b: 'user-222',
    }
    expect(getDmPeerId(dmChannel, 'user-111')).toBe('user-222')
    expect(getDmPeerId(dmChannel, 'user-222')).toBe('user-111')
    expect(getDmPeerId(dmChannel, 'user-333')).toBeNull()
    expect(getDmPeerId({ is_dm: false, dm_user_a: null, dm_user_b: null }, 'user-111')).toBeNull()
  })

  it('canUserAccessChannel allows all public channels and restricts DMs to the two participants', () => {
    const publicCh = { is_dm: false, dm_user_a: null, dm_user_b: null }
    const dmCh = { is_dm: true, dm_user_a: 'user-111', dm_user_b: 'user-222' }

    expect(canUserAccessChannel(publicCh, 'user-999')).toBe(true)
    expect(canUserAccessChannel(dmCh, 'user-111')).toBe(true)
    expect(canUserAccessChannel(dmCh, 'user-222')).toBe(true)
    expect(canUserAccessChannel(dmCh, 'user-333')).toBe(false)
    expect(canUserAccessChannel(dmCh, null)).toBe(false)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL (`normalizeDmPair is not a function` / export missing).

- [x] **Step 3: Extend `Channel` in `app/types/chat.ts` and implement DM helpers in `app/utils/chat.ts`**

In `app/types/chat.ts`, update `Channel`:

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

In `app/utils/chat.ts`, add `Channel` to the type import from `~/types/chat` and append:

```ts
export function normalizeDmPair(
  userId1: string,
  userId2: string,
): { dm_user_a: string; dm_user_b: string; slug: string } | null {
  const u1 = userId1?.trim() || ''
  const u2 = userId2?.trim() || ''
  if (!u1 || !u2 || u1 === u2) {
    return null
  }
  const [dm_user_a, dm_user_b] = u1 < u2 ? [u1, u2] : [u2, u1]
  return {
    dm_user_a,
    dm_user_b,
    slug: `dm:${dm_user_a}:${dm_user_b}`,
  }
}

export function getDmPeerId(
  channel: Pick<Channel, 'is_dm' | 'dm_user_a' | 'dm_user_b'>,
  currentUserId?: string | null,
): string | null {
  if (!channel?.is_dm || !currentUserId) {
    return null
  }
  if (channel.dm_user_a === currentUserId) {
    return channel.dm_user_b || null
  }
  if (channel.dm_user_b === currentUserId) {
    return channel.dm_user_a || null
  }
  return null
}

export function canUserAccessChannel(
  channel: Pick<Channel, 'is_dm' | 'dm_user_a' | 'dm_user_b'>,
  currentUserId?: string | null,
): boolean {
  if (!channel?.is_dm) {
    return true
  }
  if (!currentUserId) {
    return false
  }
  return channel.dm_user_a === currentUserId || channel.dm_user_b === currentUserId
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(chat): add pure DM pair normalization and access helpers"
```

---

### Task 2: DM Schema, Strict RLS Policies, Peer Hydration & `openOrCreateDm` in `useChatRoom.ts`

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `app/composables/useChatRoom.ts`
- Modify: `tests/composables/useChatRoom.test.ts`

- [x] **Step 1: Write failing unit tests in `tests/composables/useChatRoom.test.ts`**

Append the following tests to `tests/composables/useChatRoom.test.ts` (and import `hydrateDmChannelPeers` from `~/composables/useChatRoom`):

```ts
describe('hydrateDmChannelPeers (Sub-Project 4)', () => {
  it('filters DM channels accessible to currentUserId and attaches the peer Profile', () => {
    const profilesCache = new Map<string, Profile>([
      ['user-1', { id: 'user-1', display_name: 'Alice', avatar_color: '#0284c7' }],
      ['user-2', { id: 'user-2', display_name: 'Bob', avatar_color: '#7c3aed' }],
      ['user-3', { id: 'user-3', display_name: 'Charlie', avatar_color: '#059669' }],
    ])

    const channels = [
      {
        id: 'ch-general',
        slug: 'general',
        description: 'General',
        created_by: null,
        created_at: '2026-10-19T00:00:00Z',
        is_dm: false,
      },
      {
        id: 'dm-1-2',
        slug: 'dm:user-1:user-2',
        description: null,
        created_by: 'user-1',
        created_at: '2026-10-19T00:01:00Z',
        is_dm: true,
        dm_user_a: 'user-1',
        dm_user_b: 'user-2',
      },
      {
        id: 'dm-2-3',
        slug: 'dm:user-2:user-3',
        description: null,
        created_by: 'user-2',
        created_at: '2026-10-19T00:02:00Z',
        is_dm: true,
        dm_user_a: 'user-2',
        dm_user_b: 'user-3',
      },
    ]

    const hydratedForAlice = hydrateDmChannelPeers({
      channels,
      currentUserId: 'user-1',
      profilesCache,
    })

    expect(hydratedForAlice).toHaveLength(1)
    expect(hydratedForAlice[0]!.id).toBe('dm-1-2')
    expect(hydratedForAlice[0]!.peer?.display_name).toBe('Bob')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL (`hydrateDmChannelPeers is not a function`).

- [x] **Step 3: Update `supabase/schema.sql` with DM columns, constraints, `can_access_channel`, and strict RLS**

In `supabase/schema.sql`, update `public.channels`, `public.messages`, and `public.message_reactions` definitions and policies by appending the idempotent DM migration block right before Section 5 (`Realtime Publication Setup`):

```sql
-- ============================================================================
-- 3.7 Direct Messages (1-on-1 Private Conversations) & Strict Channel RLS
-- ============================================================================
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

drop policy if exists "Authenticated users can view channels" on public.channels;
drop policy if exists "Authenticated users can view accessible channels" on public.channels;
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
drop policy if exists "Authenticated users can view accessible messages" on public.messages;
create policy "Authenticated users can view accessible messages"
  on public.messages for select
  to authenticated
  using (public.can_access_channel(channel_id));

drop policy if exists "Authenticated users can insert messages" on public.messages;
drop policy if exists "Authenticated users can insert accessible messages" on public.messages;
create policy "Authenticated users can insert accessible messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_access_channel(channel_id));

drop policy if exists "Authenticated users can view message reactions" on public.message_reactions;
drop policy if exists "Authenticated users can view accessible message reactions" on public.message_reactions;
create policy "Authenticated users can view accessible message reactions"
  on public.message_reactions for select
  to authenticated
  using (public.can_access_channel(channel_id));

drop policy if exists "Authenticated users can insert their own reactions" on public.message_reactions;
drop policy if exists "Authenticated users can insert accessible reactions" on public.message_reactions;
create policy "Authenticated users can insert accessible reactions"
  on public.message_reactions for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_access_channel(channel_id));
```

- [x] **Step 4: Implement `hydrateDmChannelPeers`, `loadAllProfiles`, `publicChannels`, `dmChannels`, and `openOrCreateDm` in `app/composables/useChatRoom.ts`**

1. Import `normalizeDmPair`, `getDmPeerId`, and `canUserAccessChannel` from `~/utils/chat` in `app/composables/useChatRoom.ts`.
2. Export `hydrateDmChannelPeers` above `useChatRoom()`:

```ts
export function hydrateDmChannelPeers(params: {
  channels: Channel[]
  currentUserId?: string | null
  profilesCache: Map<string, Profile>
  fallbackProfiles?: Profile[]
}): Channel[] {
  if (!params.currentUserId) return []
  return params.channels
    .filter(ch => Boolean(ch.is_dm) && canUserAccessChannel(ch, params.currentUserId))
    .map((ch) => {
      const peerId = getDmPeerId(ch, params.currentUserId)
      const peer = peerId
        ? params.profilesCache.get(peerId)
          || params.fallbackProfiles?.find(p => p.id === peerId)
          || ch.peer
          || null
        : null
      return {
        ...ch,
        peer,
      }
    })
}
```

3. Inside `useChatRoom()`:
   - Add `allProfiles = ref<Profile[]>([])`.
   - Include `allProfiles.value` in `knownProfiles` computed:
     ```ts
     const knownProfiles = computed<Profile[]>(() => {
       const map = new Map<string, Profile>()
       for (const p of allProfiles.value) {
         map.set(p.id, p)
       }
       for (const p of profilesCache.values()) {
         map.set(p.id, p)
       }
       for (const f of onlineFriends.value) {
         map.set(f.id, f)
       }
       if (authProfile.currentProfile.value) {
         map.set(authProfile.currentProfile.value.id, authProfile.currentProfile.value)
       }
       return Array.from(map.values()).sort((a, b) => a.display_name.localeCompare(b.display_name))
     })
     ```
   - Add `publicChannels` and `dmChannels` computed refs and update `activeChannel`:
     ```ts
     const publicChannels = computed<Channel[]>(() => {
       return channels.value.filter(c => !c.is_dm)
     })

     const dmChannels = computed<Channel[]>(() => {
       return hydrateDmChannelPeers({
         channels: channels.value,
         currentUserId: authProfile.currentProfile.value?.id,
         profilesCache,
         fallbackProfiles: knownProfiles.value,
       })
     })

     const activeChannel = computed<Channel | null>(() => {
       const raw = channels.value.find(c => c.id === activeChannelId.value) || null
       if (!raw) return null
       if (raw.is_dm) {
         return dmChannels.value.find(c => c.id === raw.id) || raw
       }
       return raw
     })
     ```
   - Add `loadAllProfiles()`:
     ```ts
     async function loadAllProfiles(): Promise<void> {
       try {
         const { data, error } = await supabase
           .from('profiles')
           .select('id, display_name, avatar_color')
           .order('display_name', { ascending: true })

         if (data && !error) {
           allProfiles.value = data as Profile[]
           for (const p of data as Profile[]) {
             profilesCache.set(p.id, p)
           }
         }
       } catch {
         // Ignore profile directory load error
       }
     }
     ```
   - In `loadChannels()`, filter initial channel selection to prefer `#general` or the first public channel:
     ```ts
     if (!activeChannelId.value && data.length > 0) {
       const general = (data as Channel[]).find(c => !c.is_dm && c.slug === 'general')
       const firstPublic = (data as Channel[]).find(c => !c.is_dm)
       const initial = general || firstPublic || (data as Channel[])[0]
       if (initial) {
         await selectChannel(initial.id)
       }
     }
     ```
   - In `setupDbChangesSubscription()`, guard `channels` `INSERT` with `canUserAccessChannel`:
     ```ts
     .on(
       'postgres_changes',
       { event: 'INSERT', schema: 'public', table: 'channels' },
       (payload) => {
         const newChannel = payload.new as Channel
         if (!canUserAccessChannel(newChannel, authProfile.currentProfile.value?.id)) {
           return
         }
         if (!channels.value.some(c => c.id === newChannel.id)) {
           channels.value = [...channels.value, newChannel]
         }
       },
     )
     ```
   - Also in `setupDbChangesSubscription()`, when `profiles` `UPDATE` fires, update `allProfiles.value` as well:
     ```ts
     allProfiles.value = allProfiles.value.map(p =>
       p.id === updatedProfile.id ? { ...p, ...updatedProfile } : p,
     )
     ```
   - Implement `openOrCreateDm(peerUserId: string)`:
     ```ts
     async function openOrCreateDm(peerUserId: string): Promise<{ channel: Channel | null; error: string | null }> {
       let current = authProfile.currentProfile.value
       if (!current?.id) {
         current = await authProfile.ensureProfile()
       }
       if (!current?.id) {
         return { channel: null, error: 'Not authenticated.' }
       }

       const pair = normalizeDmPair(current.id, peerUserId)
       if (!pair) {
         return { channel: null, error: 'Cannot start a direct message with yourself.' }
       }

       const existingInMemory = channels.value.find(
         c => c.slug === pair.slug || (c.is_dm && c.dm_user_a === pair.dm_user_a && c.dm_user_b === pair.dm_user_b),
       )
       if (existingInMemory) {
         await selectChannel(existingInMemory.id)
         return { channel: existingInMemory, error: null }
       }

       const payload = {
         slug: pair.slug,
         description: null,
         created_by: current.id,
         is_dm: true,
         dm_user_a: pair.dm_user_a,
         dm_user_b: pair.dm_user_b,
       }

       const { data, error } = await supabase
         .from('channels')
         .insert(payload)
         .select('*')
         .single()

       let resolvedChannel: Channel | null = (data as Channel) || null

       if (error) {
         if (isDuplicateKeyError(error)) {
           const { data: existingRow } = await supabase
             .from('channels')
             .select('*')
             .eq('slug', pair.slug)
             .single()
           resolvedChannel = (existingRow as Channel) || null
         }
         if (!resolvedChannel) {
           return { channel: null, error: error.message }
         }
       }

       if (resolvedChannel) {
         if (!channels.value.some(c => c.id === resolvedChannel!.id)) {
           channels.value = [...channels.value, resolvedChannel]
         }
         await selectChannel(resolvedChannel.id)
       }

       return { channel: resolvedChannel, error: null }
     }
     ```
   - Call `await loadAllProfiles()` inside `initializeChat()` right before `await loadChannels()`.
   - Return `publicChannels`, `dmChannels`, and `openOrCreateDm` from `useChatRoom()`.

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add supabase/schema.sql app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(dm): add DM schema, RLS policies, peer hydration, and openOrCreateDm"
```

---

### Task 3: Sidebar `"Direct Messages"` Section, Clickable Online Friends, `StartDmModal.vue` & DM Header/Composer

**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Create: `app/components/StartDmModal.vue`
- Modify: `app/components/MessageComposer.vue`
- Modify: `app/pages/index.vue`
- Modify: `tests/components/chatUi.test.ts`

- [x] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Add `StartDmModal` import to `tests/components/chatUi.test.ts` and append:

```ts
describe('Direct Messages UI in ChatSidebar and StartDmModal (Sub-Project 4)', () => {
  it('ChatSidebar renders dmChannels with peer name and emits startDmWithUser when clicking an online friend', async () => {
    const wrapper = mount(ChatSidebar, {
      props: {
        channels: [
          { id: 'c1', slug: 'general', description: 'General', created_by: null, created_at: '' },
        ],
        dmChannels: [
          {
            id: 'dm-1',
            slug: 'dm:u1:u2',
            description: null,
            created_by: 'u1',
            created_at: '',
            is_dm: true,
            dm_user_a: 'u1',
            dm_user_b: 'u2',
            peer: { id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
        ],
        activeChannelId: 'c1',
        unreadCounts: { 'dm-1': 3 },
        unreadMentions: {},
        onlineFriends: [
          { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
          { id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' },
        ],
        currentUser: { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
        isDark: true,
        connectionStatus: 'connected',
        isOpenMobile: false,
      },
    })

    const dmBtn = wrapper.find('[data-test="dm-channel-dm-1"]')
    expect(dmBtn.exists()).toBe(true)
    expect(dmBtn.text()).toContain('Bob')
    expect(dmBtn.text()).toContain('3')

    const onlineFriendBtn = wrapper.find('[data-test="online-friend-u2"]')
    expect(onlineFriendBtn.exists()).toBe(true)
    await onlineFriendBtn.trigger('click')
    expect(wrapper.emitted('startDmWithUser')?.[0]).toEqual(['u2'])
  })

  it('StartDmModal filters friends by search query and emits selectFriend on click', async () => {
    const wrapper = mount(StartDmModal, {
      props: {
        isOpen: true,
        friends: [
          { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
          { id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' },
          { id: 'u3', display_name: 'Charlie', avatar_color: '#059669' },
        ],
        onlineFriends: [{ id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' }],
        currentUserId: 'u1',
      },
    })

    // Self (Alice) should not be listed
    expect(wrapper.find('[data-test="start-dm-friend-u1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="start-dm-friend-u2"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="start-dm-friend-u3"]').exists()).toBe(true)

    const searchInput = wrapper.find('[data-test="dm-search-input"]')
    await searchInput.setValue('char')

    expect(wrapper.find('[data-test="start-dm-friend-u2"]').exists()).toBe(false)
    const charlieBtn = wrapper.find('[data-test="start-dm-friend-u3"]')
    expect(charlieBtn.exists()).toBe(true)

    await charlieBtn.trigger('click')
    expect(wrapper.emitted('selectFriend')?.[0]).toEqual(['u3'])
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (`Failed to resolve import "~/components/StartDmModal.vue"`).

- [x] **Step 3: Create `app/components/StartDmModal.vue`**

Create `app/components/StartDmModal.vue`:

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Profile } from '~/types/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    friends: Profile[]
    onlineFriends?: Profile[]
    currentUserId?: string | null
    errorMessage?: string | null
  }>(),
  {
    onlineFriends: () => [],
    currentUserId: null,
    errorMessage: null,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectFriend', userId: string): void
}>()

const searchQuery = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = ''
    }
  },
)

const onlineSet = computed(() => {
  return new Set((props.onlineFriends || []).map(f => f.id))
})

const filteredFriends = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return (props.friends || [])
    .filter(f => !props.currentUserId || f.id !== props.currentUserId)
    .filter(f => !q || f.display_name.toLowerCase().includes(q))
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900 dark:text-white">
          New Direct Message
        </h3>
        <button
          type="button"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xl font-bold leading-none"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <div class="p-4 space-y-3">
        <input
          v-model="searchQuery"
          type="text"
          data-test="dm-search-input"
          placeholder="Search friends by name..."
          class="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />

        <p v-if="errorMessage" class="text-xs text-rose-500 font-medium">
          {{ errorMessage }}
        </p>

        <div class="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          <div
            v-if="filteredFriends.length === 0"
            class="py-6 text-center text-xs text-slate-500 dark:text-slate-400 italic"
          >
            No matching friends found
          </div>

          <button
            v-for="friend in filteredFriends"
            :key="friend.id"
            type="button"
            :data-test="`start-dm-friend-${friend.id}`"
            class="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors rounded-lg text-left cursor-pointer"
            @click="emit('selectFriend', friend.id)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UserAvatar
                :display-name="friend.display_name"
                :avatar-color="friend.avatar_color"
                :show-online="onlineSet.has(friend.id)"
                size="sm"
              />
              <div class="truncate">
                <div class="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {{ friend.display_name }}
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                  {{ onlineSet.has(friend.id) ? 'Online' : 'Offline' }}
                </div>
              </div>
            </div>

            <span class="text-xs font-medium text-sky-600 dark:text-sky-400 shrink-0">
              Message →
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 4: Update `app/components/ChatSidebar.vue`, `app/components/MessageComposer.vue`, and `app/pages/index.vue`**

1. In `app/components/ChatSidebar.vue`:
   - Add `dmChannels?: Channel[]` to props with default `() => []`.
   - Add emits `(e: 'openStartDm'): void` and `(e: 'startDmWithUser', userId: string): void`.
   - Add helper functions:
     ```ts
     function isPeerOnline(dm: Channel): boolean {
       const peerId = dm.peer?.id
       if (!peerId) return false
       return props.onlineFriends.some(f => f.id === peerId)
     }

     function onOnlineFriendClick(friend: Profile) {
       if (props.currentUser && friend.id === props.currentUser.id) return
       emit('startDmWithUser', friend.id)
       emit('closeMobile')
     }
     ```
   - Below the **Channels Section** (`</div>`), render the **Direct Messages Section**:
     ```vue
     <!-- Direct Messages Section -->
     <div>
       <div class="flex items-center justify-between px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
         <span>Direct Messages</span>
         <button
           type="button"
           data-test="open-start-dm"
           class="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium transition-colors"
           @click="emit('openStartDm')"
         >
           + New
         </button>
       </div>

       <div v-if="!dmChannels || dmChannels.length === 0" class="px-2 py-2 text-xs text-slate-500 italic">
         No conversations yet
       </div>

       <div v-else class="space-y-0.5">
         <button
           v-for="dm in dmChannels"
           :key="dm.id"
           type="button"
           :data-test="`dm-channel-${dm.id}`"
           class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all group"
           :class="activeChannelId === dm.id ? 'bg-sky-600/20 text-white font-semibold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'"
           @click="onChannelClick(dm.id)"
         >
           <div class="flex items-center gap-2 truncate">
             <UserAvatar
               :display-name="dm.peer?.display_name || 'Friend'"
               :avatar-color="dm.peer?.avatar_color"
               :show-online="isPeerOnline(dm)"
               size="sm"
             />
             <span class="truncate">{{ dm.peer?.display_name || 'Direct Message' }}</span>
           </div>

           <div class="flex items-center gap-1 shrink-0">
             <span
               v-if="(unreadMentions?.[dm.id] || 0) > 0"
               :data-test="`mention-badge-${dm.id}`"
               class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950 shadow-sm"
               title="You were mentioned"
             >
               @
             </span>
             <span
               v-if="(unreadCounts[dm.id] || 0) > 0"
               class="px-1.5 py-0.5 rounded-full text-xs font-bold bg-sky-500 text-white min-w-5 text-center shadow-sm"
             >
               {{ unreadCounts[dm.id] }}
             </span>
           </div>
         </button>
       </div>
     </div>
     ```
   - In **Online Friends Section**, replace the static `<div v-for="friend in onlineFriends">` with a clickable button/element:
     ```vue
     <button
       v-for="friend in onlineFriends"
       :key="friend.id"
       type="button"
       :data-test="`online-friend-${friend.id}`"
       class="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition-colors text-left"
       :class="currentUser && friend.id === currentUser.id ? 'cursor-default' : 'cursor-pointer'"
       @click="onOnlineFriendClick(friend)"
     >
       <div class="flex items-center gap-2 truncate">
         <UserAvatar
           :display-name="friend.display_name"
           :avatar-color="friend.avatar_color"
           :show-online="true"
           size="sm"
         />
         <span class="truncate">
           {{ friend.display_name }}
           <span v-if="currentUser && friend.id === currentUser.id" class="text-slate-500 text-[10px] ml-1">(you)</span>
         </span>
       </div>
       <span
         v-if="!currentUser || friend.id !== currentUser.id"
         class="text-[10px] text-slate-500 hover:text-sky-400 shrink-0"
       >
         DM
       </span>
     </button>
     ```

2. In `app/components/MessageComposer.vue`:
   - Add optional prop `isDm?: boolean` (default `false`).
   - Update textarea `:placeholder`:
     ```vue
     :placeholder="`Message ${isDm ? '@' : '#'}${channelSlug || 'channel'} (Enter to send, Shift+Enter for newline)`"
     ```

3. In `app/pages/index.vue`:
   - Import `StartDmModal` and `UserAvatar`.
   - Destructure `publicChannels`, `dmChannels`, and `openOrCreateDm` from `useChatRoom()`.
   - Add `isStartDmModalOpen = ref(false)` and `startDmError = ref<string | null>(null)`.
   - Add `handleStartDm(userId: string)`:
     ```ts
     async function handleStartDm(userId: string) {
       startDmError.value = null
       replyingTo.value = null
       const result = await openOrCreateDm(userId)
       if (result.error) {
         startDmError.value = result.error
       } else {
         isStartDmModalOpen.value = false
       }
     }
     ```
   - Pass `:channels="publicChannels"` and `:dm-channels="dmChannels"` to `ChatSidebar`, plus `@open-start-dm="isStartDmModalOpen = true"` and `@start-dm-with-user="handleStartDm"`.
   - Update the top `<header>` in `app/pages/index.vue` to render `UserAvatar` + `@{{ activeChannel.peer?.display_name || 'Direct Message' }}` when `activeChannel?.is_dm` is true.
   - Pass `:channel-slug="activeChannel?.is_dm ? (activeChannel.peer?.display_name || 'friend') : (activeChannel?.slug || 'general')"` and `:is-dm="Boolean(activeChannel?.is_dm)"` to `MessageComposer`.
   - Mount `<StartDmModal>` at the bottom of `app/pages/index.vue`.

- [x] **Step 5: Run full test suite to verify everything passes**

Run: `npm test`
Expected: PASS across all test files (`tests/utils/chat.test.ts`, `tests/composables/useMessagesState.test.ts`, `tests/composables/useRealtimeStates.test.ts`, `tests/composables/useTheme.test.ts`, `tests/composables/useChatRoom.test.ts`, `tests/components/chatUi.test.ts`).

- [x] **Step 6: Commit**

```bash
git add app/components/ChatSidebar.vue app/components/StartDmModal.vue app/components/MessageComposer.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): add Direct Messages sidebar section, StartDmModal, and DM header"
```
