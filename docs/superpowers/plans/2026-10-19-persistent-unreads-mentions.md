# Sub-Project 3: Persistent Unread Tracking & `@mentions` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-channel read timestamps in `public.channel_reads` so unread badges and `@` mention indicators survive page reloads and offline gaps, show a `"New messages"` divider line when entering a channel with unread messages, and provide `@DisplayName` autocomplete in the composer plus highlighted mention pills in the message viewport.

**Architecture:** Add `public.channel_reads (user_id, channel_id, last_read_at)` with user-scoped RLS policies in `supabase/schema.sql`. Implement pure helpers in `app/utils/chat.ts` (`extractActiveMentionQuery`, `applyMentionAutocomplete`, `doesMessageMentionUser`, `tokenizeMessageMentions`, and unread-aware `buildMessageTimeline`). Hydrate `unreadCounts`, `unreadMentions`, and `activeChannelUnreadSince` in `useChatRoom.ts` via `computeUnreadSnapshot` and `markChannelRead`, and wire the UI in `ChatSidebar.vue`, `MessageComposer.vue`, `MessageViewport.vue`, and `app/pages/index.vue`.

**Tech Stack:** Nuxt 4 (`app/` directory), Vue 3 (`<script setup lang="ts">`), Supabase (`@nuxtjs/supabase`, `@supabase/supabase-js`), Tailwind CSS, Vitest + `@vue/test-utils` (`happy-dom`).

## Global Constraints

- Always resolve the user ID via `extractAuthUserId(authUser)` (or `authProfile.currentProfile.value?.id`) before reading or writing `public.channel_reads` so Postgres RLS checks (`auth.uid() = user_id`) succeed.
- When switching into a channel with unread messages (`selectChannel(channelId)`), capture its previous `last_read_at` into `activeChannelUnreadSince` **before** clearing `unreadCounts[channelId]` and upserting `last_read_at = now()` so `MessageViewport.vue` can display the `"New messages"` divider line for that session view.
- The first unread message from another user (`msg.user_id !== currentUserId` and `!msg.deleted_at` and `Date.parse(msg.created_at) > Date.parse(lastReadAt)`) sets `showUnreadDivider: true` and forces `isCompact: false` in `buildMessageTimeline`.
- Soft-deleted messages (`Boolean(msg.deleted_at)`) never trigger unread mention badges or render `@mention` highlights.

---

### Task 1: Pure `@mention` Autocomplete, Tokenizer & Unread Divider Timeline

**Files:**
- Modify: `app/types/chat.ts:1-70`
- Modify: `app/utils/chat.ts:1-201`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `TimelineMessageItem` from `~/types/chat`
- Produces:
  - `ChannelRead`, `MentionSegment`, `ActiveMentionQuery`, and extended `TimelineMessageItem` (`showUnreadDivider?: boolean`, `isMentioningMe?: boolean`) in `~/types/chat`
  - `extractActiveMentionQuery(text: string, cursorIndex: number): ActiveMentionQuery | null` in `~/utils/chat`
  - `applyMentionAutocomplete(text: string, activeQuery: ActiveMentionQuery, displayName: string): string` in `~/utils/chat`
  - `doesMessageMentionUser(content: string, displayName?: string | null): boolean` in `~/utils/chat`
  - `tokenizeMessageMentions(content: string, currentDisplayName?: string | null, knownDisplayNames?: string[]): MentionSegment[]` in `~/utils/chat`
  - `buildMessageTimeline(messages: ChatMessage[], now?: Date, options?: { lastReadAt?: string | null; currentUserId?: string; currentDisplayName?: string | null }): TimelineMessageItem[]` in `~/utils/chat`

- [x] **Step 1: Write failing tests in `tests/utils/chat.test.ts`**

Append tests for `extractActiveMentionQuery`, `applyMentionAutocomplete`, `doesMessageMentionUser`, `tokenizeMessageMentions`, and `buildMessageTimeline` with `lastReadAt` / `currentDisplayName` to `tests/utils/chat.test.ts`:

```ts
  it('detects active @mention query at cursor and replaces it with selected display name', () => {
    const text = 'Hey @ali how are you?'
    const active = extractActiveMentionQuery(text, 8) // cursor right after "@ali"
    expect(active).toEqual({
      query: 'ali',
      startIndex: 4,
      endIndex: 8,
    })

    const replaced = applyMentionAutocomplete(text, active!, 'Alice Wonderland')
    expect(replaced).toBe('Hey @Alice Wonderland  how are you?')

    // Email address should not trigger @mention autocomplete
    expect(extractActiveMentionQuery('contact me@example.com', 18)).toBeNull()
  })

  it('detects whether a message mentions a display name and tokenizes mention segments', () => {
    expect(doesMessageMentionUser('Hello @Alice!', 'Alice')).toBe(true)
    expect(doesMessageMentionUser('Hey @Alice Wonderland, ready?', 'Alice Wonderland')).toBe(true)
    expect(doesMessageMentionUser('Hello @Alicia', 'Alice')).toBe(false)

    const segments = tokenizeMessageMentions(
      'Hey @Alice Wonderland and @Bob!',
      'Alice Wonderland',
      ['Alice Wonderland', 'Bob'],
    )
    expect(segments).toEqual([
      { text: 'Hey ', isMention: false, isMe: false },
      { text: '@Alice Wonderland', isMention: true, isMe: true },
      { text: ' and ', isMention: false, isMe: false },
      { text: '@Bob', isMention: true, isMe: false },
      { text: '!', isMention: false, isMe: false },
    ])
  })

  it('places showUnreadDivider on the first unread message from another user and flags isMentioningMe', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0)
    const lastReadAt = new Date(2026, 9, 18, 10, 0, 30).toISOString()

    const messages: ChatMessage[] = [
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Already read message',
        created_at: new Date(2026, 9, 18, 10, 0, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'First unread message mentioning @Alice',
        created_at: new Date(2026, 9, 18, 10, 1, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-3',
        client_id: 'c-3',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Second unread message 30s later',
        created_at: new Date(2026, 9, 18, 10, 1, 30).toISOString(),
        status: 'sent',
      },
    ]

    const timeline = buildMessageTimeline(messages, now, {
      lastReadAt,
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice',
    })

    expect(timeline[0].showUnreadDivider).toBe(false)
    expect(timeline[1].showUnreadDivider).toBe(true)
    expect(timeline[1].isCompact).toBe(false) // Unread boundary breaks compact grouping
    expect(timeline[1].isMentioningMe).toBe(true)
    expect(timeline[2].showUnreadDivider).toBe(false)
    expect(timeline[2].isCompact).toBe(true)
    expect(timeline[2].isMentioningMe).toBe(false)
  })
```

And add `extractActiveMentionQuery`, `applyMentionAutocomplete`, `doesMessageMentionUser`, and `tokenizeMessageMentions` to the imports from `~/utils/chat` at the top of `tests/utils/chat.test.ts`.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL (`extractActiveMentionQuery`, `applyMentionAutocomplete`, `doesMessageMentionUser`, `tokenizeMessageMentions` are not exported from `~/utils/chat`).

- [x] **Step 3: Implement types in `app/types/chat.ts` and pure helpers in `app/utils/chat.ts`**

Update `app/types/chat.ts` to add `ChannelRead`, `MentionSegment`, `ActiveMentionQuery`, and `showUnreadDivider` / `isMentioningMe` on `TimelineMessageItem`:

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

export interface TimelineMessageItem {
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isCompact: boolean
  showUnreadDivider?: boolean
  isMentioningMe?: boolean
}
```

In `app/utils/chat.ts`, import `MentionSegment` and `ActiveMentionQuery` from `~/types/chat`, add `extractActiveMentionQuery`, `applyMentionAutocomplete`, `doesMessageMentionUser`, `tokenizeMessageMentions`, and update `buildMessageTimeline`:

```ts
import type {
  ChatMessage,
  TimelineMessageItem,
  MessageReaction,
  ReactionSummary,
  MentionSegment,
  ActiveMentionQuery,
} from '~/types/chat'
```

Add the mention helpers to `app/utils/chat.ts`:

```ts
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractActiveMentionQuery(
  text: string,
  cursorIndex: number,
): ActiveMentionQuery | null {
  if (!text || cursorIndex < 0) return null
  const prefix = text.slice(0, cursorIndex)
  const match = prefix.match(/(?:^|\s)@([^\s@]{0,40})$/)
  if (!match) return null

  const query = match[1] || ''
  const startIndex = cursorIndex - query.length - 1
  return {
    query,
    startIndex,
    endIndex: cursorIndex,
  }
}

export function applyMentionAutocomplete(
  text: string,
  activeQuery: ActiveMentionQuery,
  displayName: string,
): string {
  const before = text.slice(0, activeQuery.startIndex)
  const after = text.slice(activeQuery.endIndex)
  return `${before}@${displayName} ${after}`
}

export function doesMessageMentionUser(
  content: string,
  displayName?: string | null,
): boolean {
  const cleanName = displayName?.trim()
  if (!content || !cleanName) return false

  const escaped = escapeRegExp(cleanName)
  const regex = new RegExp(`(?:^|\\s)@${escaped}(?=$|\\s|[.,!?:;])`, 'i')
  return regex.test(content)
}

export function tokenizeMessageMentions(
  content: string,
  currentDisplayName?: string | null,
  knownDisplayNames: string[] = [],
): MentionSegment[] {
  if (!content) return []

  const cleanCurrent = currentDisplayName?.trim() || ''
  const namesSet = new Set<string>()
  if (cleanCurrent) namesSet.add(cleanCurrent)
  for (const name of knownDisplayNames) {
    if (name && name.trim()) namesSet.add(name.trim())
  }

  // Sort longer names first so "@Alice Wonderland" matches before "@Alice"
  const sortedNames = Array.from(namesSet).sort((a, b) => b.length - a.length)
  const escapedKnown = sortedNames.map(escapeRegExp)
  const patternParts = [...escapedKnown, '[A-Za-z0-9_.-]+']
  const mentionRegex = new RegExp(`(@(?:${patternParts.join('|')}))(?=$|\\s|[.,!?:;])`, 'gi')

  const segments: MentionSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(content)) !== null) {
    const matchIndex = match.index
    const token = match[1]
    const prevChar = matchIndex > 0 ? content[matchIndex - 1] : ''
    if (prevChar && !/\s/.test(prevChar)) {
      continue
    }

    if (matchIndex > lastIndex) {
      segments.push({
        text: content.slice(lastIndex, matchIndex),
        isMention: false,
        isMe: false,
      })
    }

    const rawName = token.slice(1)
    const isMe = Boolean(cleanCurrent && rawName.toLowerCase() === cleanCurrent.toLowerCase())
    segments.push({
      text: token,
      isMention: true,
      isMe,
    })

    lastIndex = matchIndex + token.length
  }

  if (lastIndex < content.length) {
    segments.push({
      text: content.slice(lastIndex),
      isMention: false,
      isMe: false,
    })
  }

  return segments.length > 0
    ? segments
    : [{ text: content, isMention: false, isMe: false }]
}
```

And update `buildMessageTimeline` in `app/utils/chat.ts`:

```ts
export function buildMessageTimeline(
  messages: ChatMessage[],
  now: Date = new Date(),
  options?: {
    lastReadAt?: string | null
    currentUserId?: string
    currentDisplayName?: string | null
  },
): TimelineMessageItem[] {
  const lastReadMs = options?.lastReadAt ? Date.parse(options.lastReadAt) : Number.NaN
  const hasValidLastRead = !Number.isNaN(lastReadMs)
  let unreadDividerPlaced = false

  return messages.map((msg, index) => {
    const currDate = new Date(msg.created_at)
    const currTimeMs = currDate.getTime()
    const currDayKey = Number.isNaN(currTimeMs) ? '' : getLocalDayKey(currDate)
    const dateLabel = formatDateDivider(msg.created_at, now)

    const isFromOtherUser = !options?.currentUserId || msg.user_id !== options.currentUserId
    let showUnreadDivider = false
    if (
      !unreadDividerPlaced
      && hasValidLastRead
      && !msg.deleted_at
      && isFromOtherUser
      && !Number.isNaN(currTimeMs)
      && currTimeMs > lastReadMs
    ) {
      showUnreadDivider = true
      unreadDividerPlaced = true
    }

    const isMentioningMe = Boolean(
      !msg.deleted_at
      && isFromOtherUser
      && (
        doesMessageMentionUser(msg.content, options?.currentDisplayName)
        || ( options?.currentUserId && msg.reply_to?.user_id === options.currentUserId )
      ),
    )

    if (index === 0) {
      return {
        message: msg,
        showDateDivider: true,
        dateLabel,
        isCompact: false,
        showUnreadDivider,
        isMentioningMe,
      }
    }

    const prev = messages[index - 1]
    const prevDate = new Date(prev.created_at)
    const prevDayKey = Number.isNaN(prevDate.getTime()) ? '' : getLocalDayKey(prevDate)
    const showDateDivider = currDayKey !== prevDayKey

    const timeDiffMs = Math.abs(currTimeMs - prevDate.getTime())
    const isCompact = !showDateDivider
      && !showUnreadDivider
      && !msg.reply_to_id
      && prev.user_id === msg.user_id
      && !Number.isNaN(timeDiffMs)
      && timeDiffMs <= GROUPING_WINDOW_MS

    return {
      message: msg,
      showDateDivider,
      dateLabel,
      isCompact,
      showUnreadDivider,
      isMentioningMe,
    }
  })
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(utils): add @mention query parser, tokenizer, and unread divider timeline logic"
```

---

### Task 2: `public.channel_reads` Schema, Unread/Mention Snapshot Hydration & Realtime Mention Tracking

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `doesMessageMentionUser` from `~/utils/chat`, `ChannelRead` from `~/types/chat`
- Produces:
  - `computeUnreadSnapshot(params)` exported helper in `~/composables/useChatRoom`
  - Extended `handleIncomingRealtimeMessage(params)` supporting `unreadMentions`, `currentUserId`, `currentDisplayName`
  - `unreadMentions`, `activeChannelUnreadSince`, `knownProfiles`, and `markChannelRead` on `useChatRoom()`

- [x] **Step 1: Write failing tests in `tests/composables/useChatRoom.test.ts`**

Append tests for `computeUnreadSnapshot` and `handleIncomingRealtimeMessage` mention tracking to `tests/composables/useChatRoom.test.ts`:

```ts
  it('computes initial unread counts and @mention counts per channel from channel_reads timestamps', () => {
    const snapshot = computeUnreadSnapshot({
      messages: [
        {
          id: 'm-1',
          channel_id: 'ch-general',
          user_id: 'u-bob',
          content: 'Already read in general',
          created_at: '2026-10-18T10:00:00Z',
        },
        {
          id: 'm-2',
          channel_id: 'ch-random',
          user_id: 'u-bob',
          content: 'Hey @Alice check this out!',
          created_at: '2026-10-18T10:05:00Z',
        },
        {
          id: 'm-3',
          channel_id: 'ch-random',
          user_id: 'u-bob',
          content: 'Another unread in random',
          created_at: '2026-10-18T10:06:00Z',
        },
        {
          id: 'm-4',
          channel_id: 'ch-random',
          user_id: 'u-alice',
          content: 'Own message should not count as unread',
          created_at: '2026-10-18T10:07:00Z',
        },
      ],
      lastReadByChannel: {
        'ch-general': '2026-10-18T10:01:00Z',
        'ch-random': '2026-10-18T10:00:00Z',
      },
      activeChannelId: 'ch-general',
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice',
    })

    expect(snapshot.unreadCounts['ch-general'] || 0).toBe(0)
    expect(snapshot.unreadCounts['ch-random']).toBe(2)
    expect(snapshot.unreadMentions['ch-random']).toBe(1)
  })

  it('increments unreadMentions when an incoming realtime message for an inactive channel mentions current user', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-alice', 3000)
    const unreadCounts: Record<string, number> = {}
    const unreadMentions: Record<string, number> = {}

    handleIncomingRealtimeMessage({
      row: {
        id: 'm-20',
        client_id: 'c-20',
        channel_id: 'ch-random',
        user_id: 'u-bob',
        content: 'Ping @Alice for game night',
        created_at: '2026-10-18T11:00:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
      unreadMentions,
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice',
    })

    expect(unreadCounts['ch-random']).toBe(1)
    expect(unreadMentions['ch-random']).toBe(1)
  })
```

And add `computeUnreadSnapshot` to the import list from `~/composables/useChatRoom` at the top of `tests/composables/useChatRoom.test.ts`.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL (`computeUnreadSnapshot` is not exported from `~/composables/useChatRoom`).

- [x] **Step 3: Update `supabase/schema.sql` and `app/composables/useChatRoom.ts`**

Add Section 5 (`public.channel_reads`) to `supabase/schema.sql`:

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

In `app/composables/useChatRoom.ts`:
1. Import `doesMessageMentionUser` from `~/utils/chat` and `ChannelRead` from `~/types/chat`.
2. Export `computeUnreadSnapshot` and update `handleIncomingRealtimeMessage`:
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
   } {
     const unreadCounts: Record<string, number> = {}
     const unreadMentions: Record<string, number> = {}

     for (const msg of params.messages) {
       if (!msg || msg.deleted_at) continue
       if (msg.channel_id === params.activeChannelId) continue
       if (params.currentUserId && msg.user_id === params.currentUserId) continue

       const lastReadIso = params.lastReadByChannel[msg.channel_id]
       if (lastReadIso && Date.parse(msg.created_at) <= Date.parse(lastReadIso)) {
         continue
       }

       unreadCounts[msg.channel_id] = (unreadCounts[msg.channel_id] || 0) + 1
       if (doesMessageMentionUser(msg.content, params.currentDisplayName)) {
         unreadMentions[msg.channel_id] = (unreadMentions[msg.channel_id] || 0) + 1
       }
     }

     return { unreadCounts, unreadMentions }
   }

   export function handleIncomingRealtimeMessage(params: {
     row: Omit<ChatMessage, 'status'>
     activeChannelId: string | null
     messagesStore: ReturnType<typeof createMessagesStore>
     typingTracker: ReturnType<typeof createTypingTracker>
     unreadCounts: Record<string, number>
     unreadMentions?: Record<string, number>
     currentUserId?: string
     currentDisplayName?: string | null
   }): void {
     if (params.row.channel_id === params.activeChannelId) {
       params.messagesStore.reconcileIncomingMessage(params.row)
       params.typingTracker.clearUserTyping(params.row.user_id)
     } else {
       params.unreadCounts[params.row.channel_id] = (params.unreadCounts[params.row.channel_id] || 0) + 1
       if (
         params.unreadMentions
         && !params.row.deleted_at
         && (!params.currentUserId || params.row.user_id !== params.currentUserId)
         && (
           doesMessageMentionUser(params.row.content, params.currentDisplayName)
           || (params.currentUserId && params.row.reply_to?.user_id === params.currentUserId)
         )
       ) {
         params.unreadMentions[params.row.channel_id] = (params.unreadMentions[params.row.channel_id] || 0) + 1
       }
     }
   }
   ```
3. Inside `useChatRoom()`:
   - Add reactive state:
     ```ts
     const unreadMentions = ref<Record<string, number>>({})
     const lastReadByChannel = ref<Record<string, string>>({})
     const activeChannelUnreadSince = ref<string | null>(null)
     const knownProfiles = computed<Profile[]>(() => {
       const map = new Map<string, Profile>()
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
   - Add `markChannelRead(channelId: string)` and `loadChannelReadsAndUnreads()`:
     ```ts
     async function markChannelRead(channelId: string): Promise<void> {
       const current = authProfile.currentProfile.value
       const nowIso = new Date().toISOString()
       lastReadByChannel.value[channelId] = nowIso
       if (!current?.id) return

       try {
         await supabase
           .from('channel_reads')
           .upsert({
             user_id: current.id,
             channel_id: channelId,
             last_read_at: nowIso,
           })
       } catch {
         // Ignore channel_reads upsert error
       }
     }

     async function loadChannelReadsAndUnreads(): Promise<void> {
       const current = authProfile.currentProfile.value
       if (!current?.id || channels.value.length === 0) return

       try {
         const { data: readRows } = await supabase
           .from('channel_reads')
           .select('*')
           .eq('user_id', current.id)

         const map: Record<string, string> = {}
         const nowIso = new Date().toISOString()
         if (readRows) {
           for (const r of readRows as ChannelRead[]) {
             map[r.channel_id] = r.last_read_at
           }
         }
         for (const ch of channels.value) {
           if (!map[ch.id]) {
             map[ch.id] = nowIso
           }
         }
         lastReadByChannel.value = map

         const timestamps = Object.values(map)
         if (timestamps.length === 0) return
         const oldestRead = timestamps.reduce((a, b) => (a < b ? a : b))

         const { data: recentMessages } = await supabase
           .from('messages')
           .select('id, channel_id, user_id, content, created_at, deleted_at, reply_to_id')
           .gt('created_at', oldestRead)
           .order('created_at', { ascending: true })

         if (recentMessages) {
           const snapshot = computeUnreadSnapshot({
             messages: recentMessages as any,
             lastReadByChannel: map,
             activeChannelId: activeChannelId.value,
             currentUserId: current.id,
             currentDisplayName: current.display_name,
           })
           unreadCounts.value = snapshot.unreadCounts
           unreadMentions.value = snapshot.unreadMentions
         }
       } catch {
         // Ignore unread hydration failure
       }
     }
     ```
   - In `selectChannel(channelId)`:
     ```ts
     const priorLastRead = lastReadByChannel.value[channelId] || null
     const hadUnreads = (unreadCounts.value[channelId] || 0) > 0
     activeChannelUnreadSince.value = hadUnreads ? priorLastRead : null
     activeChannelId.value = channelId
     unreadCounts.value[channelId] = 0
     unreadMentions.value[channelId] = 0
     markChannelRead(channelId)
     ```
   - In `setupDbChangesSubscription()` for `messages` `INSERT`: pass `unreadMentions: unreadMentions.value`, `currentUserId: authProfile.currentProfile.value?.id`, `currentDisplayName: authProfile.currentProfile.value?.display_name` to `handleIncomingRealtimeMessage`, and if `newRow.channel_id === activeChannelId.value`, call `markChannelRead(newRow.channel_id)`.
   - Call `await loadChannelReadsAndUnreads()` in `initializeChat()` (after `loadChannels()`) and in `reconnectChat()`.
   - Expose `unreadMentions`, `activeChannelUnreadSince`, `knownProfiles`, and `markChannelRead` from `useChatRoom()`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add supabase/schema.sql app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(chat): add channel_reads persistence and unread/@mention tracking"
```

---

### Task 3: Sidebar `@` Mention Badge, Composer `@` Autocomplete Menu & Viewport `"New messages"` Divider + Highlighted Mentions

**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Modify: `app/components/MessageComposer.vue`
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `extractActiveMentionQuery`, `applyMentionAutocomplete`, `tokenizeMessageMentions`, `buildMessageTimeline` from `~/utils/chat`
- Produces:
  - `ChatSidebar.vue` with `unreadMentions?: Record<string, number>` prop and `[data-test="mention-badge-<ch.id>"]`
  - `MessageComposer.vue` with `mentionCandidates?: Profile[]` prop and `[data-test="mention-autocomplete"]`
  - `MessageViewport.vue` with `lastReadAt?: string | null` and `currentDisplayName?: string` props, `[data-test="unread-divider"]`, `[data-test="mention-row-<msg.id>"]`, and `[data-test="mention-token"]`

- [x] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Append tests to `tests/components/chatUi.test.ts`:

```ts
  it('ChatSidebar renders @ mention badge alongside unread count when unreadMentions > 0', () => {
    const wrapper = mount(ChatSidebar, {
      props: {
        channels: [
          { id: 'ch-1', slug: 'general', description: null, created_by: null, created_at: '2026-10-16T00:00:00Z' },
        ],
        activeChannelId: null,
        unreadCounts: { 'ch-1': 3 },
        unreadMentions: { 'ch-1': 1 },
        onlineFriends: [],
        currentUser: null,
        isDark: true,
        connectionStatus: 'connected',
        isOpenMobile: false,
      },
    })

    const mentionBadge = wrapper.find('[data-test="mention-badge-ch-1"]')
    expect(mentionBadge.exists()).toBe(true)
    expect(mentionBadge.text()).toContain('@')
  })

  it('MessageComposer shows @mention autocomplete popup when typing @ and inserts selected display name', async () => {
    const wrapper = mount(MessageComposer, {
      props: {
        channelSlug: 'general',
        mentionCandidates: [
          { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
          { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
        ],
      },
    })

    const textarea = wrapper.find('textarea')
    ;(textarea.element as HTMLTextAreaElement).value = 'Hello @al'
    ;(textarea.element as HTMLTextAreaElement).selectionStart = 9
    await textarea.trigger('input')

    const popup = wrapper.find('[data-test="mention-autocomplete"]')
    expect(popup.exists()).toBe(true)
    expect(popup.text()).toContain('Alice')

    await wrapper.find('[data-test="mention-option-u-alice"]').trigger('click')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Hello @Alice ')
  })

  it('MessageViewport renders New messages unread divider and highlights @mentions for current user', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-alice',
        currentDisplayName: 'Alice',
        lastReadAt: '2026-10-18T10:00:30.000Z',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'm-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Older read message',
            created_at: '2026-10-18T10:00:00.000Z',
            status: 'sent',
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
          {
            id: 'm-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Hey @Alice welcome back!',
            created_at: '2026-10-18T10:01:00.000Z',
            status: 'sent',
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
        ],
      },
    })

    expect(wrapper.find('[data-test="unread-divider"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mention-row-m-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mention-token"]').text()).toBe('@Alice')
  })
```

And import `ChatSidebar` at the top of `tests/components/chatUi.test.ts` (`import ChatSidebar from '~/components/ChatSidebar.vue'`).

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (`[data-test="mention-badge-ch-1"]`, `[data-test="mention-autocomplete"]`, and `[data-test="unread-divider"]` do not exist).

- [x] **Step 3: Implement updates in `ChatSidebar.vue`, `MessageComposer.vue`, `MessageViewport.vue`, and `app/pages/index.vue`**

In `app/components/ChatSidebar.vue`:
1. Add optional `unreadMentions?: Record<string, number>` prop:
   ```ts
   const props = withDefaults(
     defineProps<{
       channels: Channel[]
       activeChannelId: string | null
       unreadCounts: Record<string, number>
       unreadMentions?: Record<string, number>
       onlineFriends: Profile[]
       currentUser: Profile | null
       isDark: boolean
       connectionStatus: ConnectionStatus
       isOpenMobile: boolean
     }>(),
     {
       unreadMentions: () => ({}),
     },
   )
   ```
2. Update the unread badge section inside `<button v-for="ch in channels">`:
   ```vue
              <!-- Unread & Mention badges -->
              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="(unreadMentions?.[ch.id] || 0) > 0"
                  :data-test="`mention-badge-${ch.id}`"
                  class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950 shadow-sm"
                  title="You were mentioned"
                >
                  @
                </span>
                <span
                  v-if="(unreadCounts[ch.id] || 0) > 0"
                  class="px-1.5 py-0.5 rounded-full text-xs font-bold bg-sky-500 text-white min-w-5 text-center shadow-sm"
                >
                  {{ unreadCounts[ch.id] }}
                </span>
              </div>
   ```

In `app/components/MessageComposer.vue`:
1. Import `Profile` from `~/types/chat`, `extractActiveMentionQuery`, `applyMentionAutocomplete`, and `shouldSendOnKeydown` from `~/utils/chat`, and `UserAvatar` from `~/components/UserAvatar.vue`.
2. Add `mentionCandidates?: Profile[]` to `defineProps` (default `() => []`).
3. Add cursor tracking and mention autocomplete state:
   ```ts
   const cursorIndex = ref(0)
   const selectedMentionIndex = ref(0)

   const activeMention = computed(() => {
     return extractActiveMentionQuery(content.value, cursorIndex.value)
   })

   const filteredMentions = computed(() => {
     if (!activeMention.value) return []
     const q = activeMention.value.query.toLowerCase()
     return props.mentionCandidates
       .filter(p => p.display_name.toLowerCase().includes(q))
       .slice(0, 6)
   })

   function syncCursor() {
     const el = textareaRef.value
     cursorIndex.value = el?.selectionStart ?? content.value.length
   }

   function selectMention(profile: Profile) {
     if (!activeMention.value) return
     content.value = applyMentionAutocomplete(
       content.value,
       activeMention.value,
       profile.display_name,
     )
     cursorIndex.value = content.value.length
     selectedMentionIndex.value = 0
     nextTick(() => {
       textareaRef.value?.focus()
       autoResize()
     })
   }
   ```
4. In `handleInput()`: call `syncCursor()`, `selectedMentionIndex.value = 0`, `autoResize()`, and `emit('typing')`.
5. In `handleKeydown(event: KeyboardEvent)`:
   ```ts
   function handleKeydown(event: KeyboardEvent) {
     if (filteredMentions.value.length > 0) {
       if (event.key === 'ArrowDown') {
         event.preventDefault()
         selectedMentionIndex.value = (selectedMentionIndex.value + 1) % filteredMentions.value.length
         return
       }
       if (event.key === 'ArrowUp') {
         event.preventDefault()
         selectedMentionIndex.value = (selectedMentionIndex.value - 1 + filteredMentions.value.length) % filteredMentions.value.length
         return
       }
       if (event.key === 'Enter' || event.key === 'Tab') {
         event.preventDefault()
         const chosen = filteredMentions.value[selectedMentionIndex.value] || filteredMentions.value[0]
         if (chosen) {
           selectMention(chosen)
         }
         return
       }
     }

     if (shouldSendOnKeydown(event)) {
       event.preventDefault()
       handleSend()
     }
   }
   ```
6. Render the floating `@mention` autocomplete menu in `<template>` of `app/components/MessageComposer.vue`:
   ```vue
    <!-- @Mention Autocomplete Menu -->
    <div
      v-if="filteredMentions.length > 0"
      data-test="mention-autocomplete"
      class="mb-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden"
    >
      <div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700/60">
        Mention a friend
      </div>
      <button
        v-for="(candidate, idx) in filteredMentions"
        :key="candidate.id"
        type="button"
        :data-test="`mention-option-${candidate.id}`"
        class="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-left transition-colors cursor-pointer"
        :class="idx === selectedMentionIndex ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'"
        @click="selectMention(candidate)"
      >
        <UserAvatar
          :display-name="candidate.display_name"
          :avatar-color="candidate.avatar_color"
          size="sm"
        />
        <span>@{{ candidate.display_name }}</span>
      </button>
    </div>
   ```

In `app/components/MessageViewport.vue`:
1. Import `tokenizeMessageMentions` from `~/utils/chat`.
2. Add optional props `lastReadAt?: string | null` (default `null`) and `currentDisplayName?: string` (default `''`).
3. Update `timelineItems`:
   ```ts
   const timelineItems = computed(() =>
     buildMessageTimeline(props.messages, new Date(), {
       lastReadAt: props.lastReadAt,
       currentUserId: props.currentUserId,
       currentDisplayName: props.currentDisplayName,
     }),
   )
   ```
4. In `<template>` of `app/components/MessageViewport.vue`, inside `v-for="item in timelineItems"`:
   - Render the `"New messages"` Unread Divider when `item.showUnreadDivider` is true:
     ```vue
        <!-- Unread Messages Divider -->
        <div
          v-if="item.showUnreadDivider"
          data-test="unread-divider"
          class="flex items-center gap-3 my-3"
        >
          <div class="flex-1 h-px bg-rose-500/60"></div>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
            New messages
          </span>
          <div class="flex-1 h-px bg-rose-500/60"></div>
        </div>
     ```
   - Add `:data-test="item.isMentioningMe ? `mention-row-${item.message.id}` : 'full-message'"` (or wrap with a `data-test` attribute) and highlight class `:class="item.isMentioningMe ? 'bg-amber-500/10 border-l-2 border-amber-500 pl-2' : ''"` on message rows.
   - Render message content tokens using `tokenizeMessageMentions(item.message.content, currentDisplayName)`:
     ```vue
              <template
                v-for="(seg, sIdx) in tokenizeMessageMentions(item.message.content, currentDisplayName)"
                :key="sIdx"
              >
                <span
                  v-if="seg.isMention"
                  data-test="mention-token"
                  class="px-1 py-0.5 rounded font-medium"
                  :class="seg.isMe ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'"
                >{{ seg.text }}</span>
                <span v-else>{{ seg.text }}</span>
              </template>
     ```

In `app/pages/index.vue`:
- Destructure `unreadMentions`, `activeChannelUnreadSince`, and `knownProfiles` from `useChatRoom()`.
- Pass `:unread-mentions="unreadMentions"` to `<ChatSidebar>`.
- Pass `:last-read-at="activeChannelUnreadSince"` and `:current-display-name="currentProfile?.display_name"` to `<MessageViewport>`.
- Pass `:mention-candidates="knownProfiles"` to `<MessageComposer>`.

- [x] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`
Expected: PASS (all unit and component test suites pass).

- [x] **Step 5: Commit**

```bash
git add app/components/ChatSidebar.vue app/components/MessageComposer.vue app/components/MessageViewport.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): add sidebar @mention badge, composer @autocomplete, and viewport unread divider"
```
