# Sub-Project 2: Interactive Message Lifecycle (Edit, Soft-Delete, Replies & Emoji Reactions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline message editing (`edited_at`), soft-delete tombstones (`deleted_at`), Discord-style inline quote-replies (`reply_to_id`), and an 8-emoji quick reaction system (`public.message_reactions`) synced in real time via Supabase Realtime (`postgres_changes`).

**Architecture:** Extend `public.messages` with `reply_to_id`, `edited_at`, and `deleted_at` plus author-only `UPDATE` RLS, and add `public.message_reactions` with `REPLICA IDENTITY FULL` for realtime `INSERT`/`DELETE` payloads. Keep state transitions pure and deterministic in `createMessagesStore` (`reconcileUpdatedMessage`, `applyReactionAdded`, `applyReactionRemoved`), wire Supabase mutations and realtime listeners in `useChatRoom`, and add a hover action toolbar, inline editor, quote preview, reaction pills, and composer reply banner to `MessageViewport.vue` and `MessageComposer.vue`.

**Tech Stack:** Nuxt 4 (`app/` directory), Vue 3 (`<script setup lang="ts">`), Supabase (`@nuxtjs/supabase`, `@supabase/supabase-js`), Tailwind CSS, Vitest + `@vue/test-utils` (`happy-dom`).

## Global Constraints

- Prerequisite: Assumes **Sub-Project 1** (`2026-10-18-resiliency-grouping-profile-settings.md`) is applied first (`TimelineMessageItem`, `buildMessageTimeline`, `profilesCache`, `updateAuthorProfile`).
- Always resolve the user ID via `extractAuthUserId(authUser)` (or `authProfile.currentProfile.value?.id`) before mutating `public.messages` or `public.message_reactions` so Postgres RLS checks (`auth.uid() = user_id`) succeed.
- Soft-deleted messages set `deleted_at = now()`, remain in chronological position in `messagesStore`, display `"This message was deleted"`, and hide edit/delete/reaction controls.
- Only the 8 preset emojis in `REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👀']` are valid (`isValidReactionEmoji`).
- Any message with a non-null `reply_to_id` must render as a full message row (`isCompact: false` in `buildMessageTimeline`) so its quoted reply preview has visual separation.

---

### Task 1: Reaction Palette, Summary Aggregator & Reply-Aware Timeline Grouping

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `app/utils/chat.ts`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ChatMessage`, `TimelineMessageItem` from `~/types/chat`
- Produces:
  - `MessageReaction`, `ReactionSummary`, `ReplyTarget`, and extended `ChatMessage` in `~/types/chat`
  - `REACTION_EMOJIS` (`['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👀'] as const`) in `~/utils/chat`
  - `isValidReactionEmoji(emoji: string): boolean` in `~/utils/chat`
  - `summarizeReactions(reactions: MessageReaction[] | undefined, currentUserId?: string): ReactionSummary[]` in `~/utils/chat`
  - Reply-aware `buildMessageTimeline` (`isCompact: false` whenever `Boolean(msg.reply_to_id)`)

- [ ] **Step 1: Write failing tests in `tests/utils/chat.test.ts`**

Append tests for `REACTION_EMOJIS`, `isValidReactionEmoji`, `summarizeReactions`, and `buildMessageTimeline` with `reply_to_id` to `tests/utils/chat.test.ts`:

```ts
  it('validates reaction emojis against the 8-emoji palette and summarizes reactions per emoji', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👀'])
    expect(isValidReactionEmoji('👍')).toBe(true)
    expect(isValidReactionEmoji('🔥')).toBe(true)
    expect(isValidReactionEmoji('💩')).toBe(false)

    const summary = summarizeReactions(
      [
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-alice', emoji: '👍' },
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-bob', emoji: '👍' },
        // Duplicate from same user should be deduplicated
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-bob', emoji: '👍' },
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-alice', emoji: '❤️' },
      ],
      'u-bob',
    )

    expect(summary).toEqual([
      {
        emoji: '👍',
        count: 2,
        userIds: ['u-alice', 'u-bob'],
        reactedByMe: true,
      },
      {
        emoji: '❤️',
        count: 1,
        userIds: ['u-alice'],
        reactedByMe: false,
      },
    ])
  })

  it('forces isCompact to false when a consecutive message is a quote-reply (reply_to_id is set)', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0)
    const messages: ChatMessage[] = [
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'First message',
        created_at: new Date(2026, 9, 18, 10, 0, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Replying 30s later to an older message',
        created_at: new Date(2026, 9, 18, 10, 0, 30).toISOString(),
        status: 'sent',
        reply_to_id: 'm-1',
      },
    ]

    const timeline = buildMessageTimeline(messages, now)
    expect(timeline[1].isCompact).toBe(false)
  })
```

And add `REACTION_EMOJIS`, `isValidReactionEmoji`, and `summarizeReactions` to the import list at the top of `tests/utils/chat.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL (`REACTION_EMOJIS`, `isValidReactionEmoji`, `summarizeReactions` are not exported from `~/utils/chat`).

- [ ] **Step 3: Implement types in `app/types/chat.ts` and helpers in `app/utils/chat.ts`**

Update `app/types/chat.ts`:

```ts
export type MessageStatus = 'sending' | 'sent' | 'failed'
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface Profile {
  id: string
  display_name: string
  avatar_color: string
  created_at?: string
}

export interface Channel {
  id: string
  slug: string
  description: string | null
  created_by: string | null
  created_at: string
}

export interface MessageReaction {
  id?: string
  message_id: string
  channel_id: string
  user_id: string
  emoji: string
  created_at?: string
}

export interface ReactionSummary {
  emoji: string
  count: number
  userIds: string[]
  reactedByMe: boolean
}

export interface ReplyTarget {
  id: string
  user_id: string
  content: string
  deleted_at?: string | null
  author?: Profile
}

export interface ChatMessage {
  id: string
  client_id: string
  channel_id: string
  user_id: string
  content: string
  created_at: string
  status: MessageStatus
  author?: Profile
  reply_to_id?: string | null
  reply_to?: ReplyTarget | null
  edited_at?: string | null
  deleted_at?: string | null
  reactions?: MessageReaction[]
}

export interface TimelineMessageItem {
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isCompact: boolean
}

export interface TypingUser {
  user_id: string
  display_name: string
  expires_at: number
}
```

In `app/utils/chat.ts`, import `MessageReaction` and `ReactionSummary` from `~/types/chat`, add `REACTION_EMOJIS`, `isValidReactionEmoji`, `summarizeReactions`, and update `isCompact` in `buildMessageTimeline`:

```ts
import type { ChatMessage, TimelineMessageItem, MessageReaction, ReactionSummary } from '~/types/chat'

export const REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '🔥',
  '😮',
  '😢',
  '👀',
] as const

export function isValidReactionEmoji(emoji: string): boolean {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji)
}

export function summarizeReactions(
  reactions: MessageReaction[] | undefined,
  currentUserId?: string,
): ReactionSummary[] {
  if (!reactions || reactions.length === 0) {
    return []
  }

  const map = new Map<string, Set<string>>()
  for (const r of reactions) {
    if (!r || !r.emoji || !r.user_id) continue
    let set = map.get(r.emoji)
    if (!set) {
      set = new Set<string>()
      map.set(r.emoji, set)
    }
    set.add(r.user_id)
  }

  const summaries: ReactionSummary[] = []
  for (const [emoji, userSet] of map.entries()) {
    const userIds = Array.from(userSet)
    summaries.push({
      emoji,
      count: userIds.length,
      userIds,
      reactedByMe: Boolean(currentUserId && userSet.has(currentUserId)),
    })
  }
  return summaries
}
```

And inside `buildMessageTimeline` in `app/utils/chat.ts`:

```ts
    const timeDiffMs = Math.abs(currDate.getTime() - prevDate.getTime())
    const isCompact = !showDateDivider
      && !msg.reply_to_id
      && prev.user_id === msg.user_id
      && !Number.isNaN(timeDiffMs)
      && timeDiffMs <= GROUPING_WINDOW_MS
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(utils): add reaction palette, reaction aggregator, and reply-aware timeline grouping"
```

---

### Task 2: Store Transitions for Message Edit, Soft-Delete, Cascading Reply Quotes & Reaction Toggles

**Files:**
- Modify: `app/composables/useMessagesState.ts`
- Test: `tests/composables/useMessagesState.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `MessageReaction`, `ReplyTarget`, `Profile` from `~/types/chat`
- Produces on `createMessagesStore()`:
  - `addOptimisticMessage` supporting `replyToId?: string | null` and `replyTo?: ReplyTarget | null`
  - `reconcileUpdatedMessage(serverRow: Partial<ChatMessage> & { id: string }): boolean`
  - `applyReactionAdded(reaction: MessageReaction): boolean`
  - `applyReactionRemoved(target: { message_id: string; user_id: string; emoji: string }): boolean`

- [ ] **Step 1: Write failing tests in `tests/composables/useMessagesState.test.ts`**

Append tests to `tests/composables/useMessagesState.test.ts`:

```ts
  it('reconciles message edits and soft-deletes in-place and cascades updates to child reply_to previews', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-parent',
        client_id: 'c-parent',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Original parent text',
        created_at: '2026-10-18T10:00:00Z',
        author: alice,
      },
      {
        id: 'm-reply',
        client_id: 'c-reply',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Replying to Alice',
        created_at: '2026-10-18T10:01:00Z',
        reply_to_id: 'm-parent',
        reply_to: {
          id: 'm-parent',
          user_id: alice.id,
          content: 'Original parent text',
          author: alice,
        },
      },
    ])

    // 1. Edit parent message
    const edited = store.reconcileUpdatedMessage({
      id: 'm-parent',
      content: 'Edited parent text',
      edited_at: '2026-10-18T10:02:00Z',
      deleted_at: null,
    })
    expect(edited).toBe(true)
    expect(store.messages.value[0].content).toBe('Edited parent text')
    expect(store.messages.value[0].edited_at).toBe('2026-10-18T10:02:00Z')
    expect(store.messages.value[1].reply_to?.content).toBe('Edited parent text')

    // 2. Soft-delete parent message
    const deleted = store.reconcileUpdatedMessage({
      id: 'm-parent',
      content: 'Edited parent text',
      edited_at: '2026-10-18T10:02:00Z',
      deleted_at: '2026-10-18T10:03:00Z',
    })
    expect(deleted).toBe(true)
    expect(store.messages.value[0].deleted_at).toBe('2026-10-18T10:03:00Z')
    expect(store.messages.value[1].reply_to?.deleted_at).toBe('2026-10-18T10:03:00Z')
  })

  it('adds and removes message reactions idempotently', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'React to me!',
        created_at: '2026-10-18T10:00:00Z',
        author: alice,
      },
    ])

    const added1 = store.applyReactionAdded({
      id: 'r-1',
      message_id: 'm-1',
      channel_id: 'ch-1',
      user_id: 'u-bob',
      emoji: '👍',
    })
    expect(added1).toBe(true)
    expect(store.messages.value[0].reactions).toHaveLength(1)

    // Duplicate (same user_id + emoji) is ignored
    const addedDup = store.applyReactionAdded({
      id: 'r-1',
      message_id: 'm-1',
      channel_id: 'ch-1',
      user_id: 'u-bob',
      emoji: '👍',
    })
    expect(addedDup).toBe(false)
    expect(store.messages.value[0].reactions).toHaveLength(1)

    const removed = store.applyReactionRemoved({
      message_id: 'm-1',
      user_id: 'u-bob',
      emoji: '👍',
    })
    expect(removed).toBe(true)
    expect(store.messages.value[0].reactions).toHaveLength(0)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useMessagesState.test.ts`
Expected: FAIL (`store.reconcileUpdatedMessage is not a function` and `store.applyReactionAdded is not a function`).

- [ ] **Step 3: Implement lifecycle methods in `app/composables/useMessagesState.ts`**

In `app/composables/useMessagesState.ts`:
1. Update imports to include `MessageReaction` and `ReplyTarget` from `~/types/chat`.
2. Update `addOptimisticMessage`:
   ```ts
   function addOptimisticMessage(params: {
     clientId: string
     channelId: string
     user: Profile
     content: string
     createdAt?: string
     replyToId?: string | null
     replyTo?: ReplyTarget | null
   }): ChatMessage | null {
     if (!isValidMessageContent(params.content)) {
       return null
     }

     const existing = messages.value.find(m => m.client_id === params.clientId)
     if (existing) {
       return existing
     }

     const newMessage: ChatMessage = {
       id: params.clientId,
       client_id: params.clientId,
       channel_id: params.channelId,
       user_id: params.user.id,
       content: params.content,
       created_at: params.createdAt || new Date().toISOString(),
       status: 'sending',
       author: params.user,
       reply_to_id: params.replyToId || null,
       reply_to: params.replyTo || null,
       edited_at: null,
       deleted_at: null,
       reactions: [],
     }

     messages.value.push(newMessage)
     return newMessage
   }
   ```
3. Add `reconcileUpdatedMessage`, `applyReactionAdded`, and `applyReactionRemoved` (and also update `updateAuthorProfile` so `msg.reply_to.author` is updated if `msg.reply_to?.user_id === profile.id`):
   ```ts
   function reconcileUpdatedMessage(
     serverRow: Partial<ChatMessage> & { id: string },
   ): boolean {
     let found = false
     messages.value = messages.value.map((msg) => {
       let updated = msg
       if (msg.id === serverRow.id) {
         found = true
         updated = {
           ...msg,
           content: serverRow.content !== undefined ? serverRow.content : msg.content,
           edited_at: serverRow.edited_at !== undefined ? serverRow.edited_at : msg.edited_at,
           deleted_at: serverRow.deleted_at !== undefined ? serverRow.deleted_at : msg.deleted_at,
         }
       }
       if (updated.reply_to_id === serverRow.id && updated.reply_to) {
         updated = {
           ...updated,
           reply_to: {
             ...updated.reply_to,
             content: serverRow.content !== undefined ? serverRow.content : updated.reply_to.content,
             deleted_at: serverRow.deleted_at !== undefined ? serverRow.deleted_at : updated.reply_to.deleted_at,
           },
         }
       }
       return updated
     })
     return found
   }

   function applyReactionAdded(reaction: MessageReaction): boolean {
     const idx = messages.value.findIndex(m => m.id === reaction.message_id)
     if (idx === -1) return false

     const target = messages.value[idx]
     const currentReactions = target.reactions || []
     const exists = currentReactions.some(
       r => r.user_id === reaction.user_id && r.emoji === reaction.emoji,
     )
     if (exists) return false

     const copy = [...messages.value]
     copy[idx] = {
       ...target,
       reactions: [...currentReactions, reaction],
     }
     messages.value = copy
     return true
   }

   function applyReactionRemoved(target: {
     message_id: string
     user_id: string
     emoji: string
   }): boolean {
     const idx = messages.value.findIndex(m => m.id === target.message_id)
     if (idx === -1) return false

     const msg = messages.value[idx]
     const currentReactions = msg.reactions || []
     const nextReactions = currentReactions.filter(
       r => !(r.user_id === target.user_id && r.emoji === target.emoji),
     )
     if (nextReactions.length === currentReactions.length) {
       return false
     }

     const copy = [...messages.value]
     copy[idx] = {
       ...msg,
       reactions: nextReactions,
     }
     messages.value = copy
     return true
   }
   ```
4. Export `reconcileUpdatedMessage`, `applyReactionAdded`, and `applyReactionRemoved` from `createMessagesStore()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useMessagesState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMessagesState.ts tests/composables/useMessagesState.test.ts
git commit -m "feat(store): add message edit, soft-delete, cascading reply quote, and reaction store methods"
```

---

### Task 3: Database Schema, Realtime `UPDATE`/`INSERT`/`DELETE` Subscriptions & Lifecycle Actions

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `isValidMessageContent`, `isValidReactionEmoji` from `~/utils/chat`, `reconcileUpdatedMessage`, `applyReactionAdded`, `applyReactionRemoved` from `~/composables/useMessagesState`
- Produces:
  - `handleRealtimeMessageUpdate(params)` and `handleRealtimeReactionEvent(params)` exported helpers in `~/composables/useChatRoom`
  - `sendMessage(content: string, replyToId?: string | null): Promise<void>` on `useChatRoom()`
  - `editMessage(messageId: string, newContent: string): Promise<{ error: string | null }>` on `useChatRoom()`
  - `deleteMessage(messageId: string): Promise<{ error: string | null }>` on `useChatRoom()`
  - `toggleReaction(messageId: string, emoji: string): Promise<{ error: string | null }>` on `useChatRoom()`

- [ ] **Step 1: Write failing tests in `tests/composables/useChatRoom.test.ts`**

Append tests for `handleRealtimeMessageUpdate` and `handleRealtimeReactionEvent` to `tests/composables/useChatRoom.test.ts`:

```ts
  it('routes realtime message UPDATE and reaction INSERT/DELETE events for the active channel', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: 'Initial text',
        created_at: '2026-10-18T10:00:00Z',
      },
    ])

    // Ignore UPDATE from inactive channel
    handleRealtimeMessageUpdate({
      row: {
        id: 'm-1',
        channel_id: 'ch-random',
        content: 'Should be ignored',
        edited_at: '2026-10-18T10:01:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].content).toBe('Initial text')

    // Apply UPDATE for active channel
    handleRealtimeMessageUpdate({
      row: {
        id: 'm-1',
        channel_id: 'ch-general',
        content: 'Updated text',
        edited_at: '2026-10-18T10:01:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].content).toBe('Updated text')
    expect(store.messages.value[0].edited_at).toBe('2026-10-18T10:01:00Z')

    // Reaction INSERT & DELETE
    handleRealtimeReactionEvent({
      eventType: 'INSERT',
      reaction: {
        id: 'r-1',
        message_id: 'm-1',
        channel_id: 'ch-general',
        user_id: 'u-bob',
        emoji: '🔥',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].reactions).toHaveLength(1)

    handleRealtimeReactionEvent({
      eventType: 'DELETE',
      reaction: {
        id: 'r-1',
        message_id: 'm-1',
        channel_id: 'ch-general',
        user_id: 'u-bob',
        emoji: '🔥',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].reactions).toHaveLength(0)
  })
```

And import `handleRealtimeMessageUpdate` and `handleRealtimeReactionEvent` from `~/composables/useChatRoom` at the top of `tests/composables/useChatRoom.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL (`handleRealtimeMessageUpdate` and `handleRealtimeReactionEvent` are not exported from `~/composables/useChatRoom`).

- [ ] **Step 3: Update `supabase/schema.sql` and `app/composables/useChatRoom.ts`**

Update `supabase/schema.sql` to add `reply_to_id`, `edited_at`, `deleted_at`, author `UPDATE` policy on `public.messages`, and `public.message_reactions` table + RLS + `supabase_realtime` publication:

```sql
-- 3b. Message Lifecycle Extensions (Edit, Soft-Delete, Replies)
alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create policy "Users can update their own messages"
  on public.messages for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Message Reactions Table
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions replica identity full;
alter table public.message_reactions enable row level security;

create policy "Authenticated users can view message reactions"
  on public.message_reactions for select
  to authenticated
  using (true);

create policy "Authenticated users can insert their own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can delete their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists message_reactions_channel_idx
  on public.message_reactions (channel_id, message_id);
```

And add `public.message_reactions` to `supabase_realtime` at the bottom of `supabase/schema.sql`:

```sql
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
exception when duplicate_object then
  null;
end;
$$;
```

In `app/composables/useChatRoom.ts`:
1. Export `handleRealtimeMessageUpdate` and `handleRealtimeReactionEvent`:
   ```ts
   export function handleRealtimeMessageUpdate(params: {
     row: Partial<ChatMessage> & { id: string; channel_id?: string }
     activeChannelId: string | null
     messagesStore: ReturnType<typeof createMessagesStore>
   }): void {
     if (params.row.channel_id && params.row.channel_id !== params.activeChannelId) {
       return
     }
     params.messagesStore.reconcileUpdatedMessage(params.row)
   }

   export function handleRealtimeReactionEvent(params: {
     eventType: 'INSERT' | 'DELETE'
     reaction: MessageReaction
     activeChannelId: string | null
     messagesStore: ReturnType<typeof createMessagesStore>
   }): void {
     if (params.reaction.channel_id && params.reaction.channel_id !== params.activeChannelId) {
       return
     }
     if (params.eventType === 'INSERT') {
       params.messagesStore.applyReactionAdded(params.reaction)
     } else {
       params.messagesStore.applyReactionRemoved(params.reaction)
     }
   }
   ```
2. Add helper `hydrateMessagesWithReactionsAndReplies(rows: any[]): Promise<Array<Omit<ChatMessage, 'status'>>>` inside `useChatRoom()` to attach `reactions` and `reply_to` whenever `selectChannel`, `loadOlderMessages`, or `fetchGapMessages` runs:
   ```ts
   async function hydrateMessagesWithReactionsAndReplies(
     rows: any[],
   ): Promise<Array<Omit<ChatMessage, 'status'>>> {
     if (!rows || rows.length === 0) return []

     const messageIds = rows.map(r => r.id)
     const reactionsByMsgId = new Map<string, MessageReaction[]>()

     try {
       const { data: reactionRows } = await supabase
         .from('message_reactions')
         .select('*')
         .in('message_id', messageIds)

       if (reactionRows) {
         for (const r of reactionRows as MessageReaction[]) {
           const list = reactionsByMsgId.get(r.message_id) || []
           list.push(r)
           reactionsByMsgId.set(r.message_id, list)
         }
       }
     } catch {
       // Ignore reaction hydration errors
     }

     const knownById = new Map<string, any>()
     for (const m of messages.value) {
       knownById.set(m.id, m)
     }
     for (const r of rows) {
       knownById.set(r.id, r)
     }

     return rows.map((r) => {
       const parent = r.reply_to_id ? knownById.get(r.reply_to_id) : null
       return {
         ...r,
         reactions: reactionsByMsgId.get(r.id) || r.reactions || [],
         reply_to: parent
           ? {
               id: parent.id,
               user_id: parent.user_id,
               content: parent.content,
               deleted_at: parent.deleted_at || null,
               author: parent.author,
             }
           : (r.reply_to || null),
       }
     })
   }
   ```
3. In `setupDbChangesSubscription()`, add listeners for `UPDATE` on `messages` and `INSERT`/`DELETE` on `message_reactions`:
   ```ts
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          handleRealtimeMessageUpdate({
            row: payload.new as any,
            activeChannelId: activeChannelId.value,
            messagesStore,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          handleRealtimeReactionEvent({
            eventType: 'INSERT',
            reaction: payload.new as MessageReaction,
            activeChannelId: activeChannelId.value,
            messagesStore,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          handleRealtimeReactionEvent({
            eventType: 'DELETE',
            reaction: payload.old as MessageReaction,
            activeChannelId: activeChannelId.value,
            messagesStore,
          })
        },
      )
   ```
4. Update `sendMessage(content: string, replyToId?: string | null)`:
   ```ts
   async function sendMessage(content: string, replyToId?: string | null): Promise<void> {
     if (!activeChannelId.value || !isValidMessageContent(content)) return
     let current = authProfile.currentProfile.value
     if (!current?.id) {
       current = await authProfile.ensureProfile()
     }
     if (!current?.id) return

     const clientId = typeof crypto !== 'undefined' && crypto.randomUUID
       ? crypto.randomUUID()
       : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')

     const parentMsg = replyToId ? messages.value.find(m => m.id === replyToId) : undefined
     const replyTarget: ReplyTarget | null = parentMsg
       ? {
           id: parentMsg.id,
           user_id: parentMsg.user_id,
           content: parentMsg.content,
           deleted_at: parentMsg.deleted_at || null,
           author: parentMsg.author,
         }
       : null

     messagesStore.addOptimisticMessage({
       clientId,
       channelId: activeChannelId.value,
       user: current,
       content: content.trim(),
       replyToId: replyToId || null,
       replyTo: replyTarget,
     })

     try {
       const { data, error } = await supabase
         .from('messages')
         .insert({
           client_id: clientId,
           channel_id: activeChannelId.value,
           user_id: current.id,
           content: content.trim(),
           reply_to_id: replyToId || null,
         })
         .select('*, author:profiles(id, display_name, avatar_color)')
         .single()

       if (error) {
         if (isDuplicateKeyError(error)) {
           const { data: existing } = await supabase
             .from('messages')
             .select('*, author:profiles(id, display_name, avatar_color)')
             .eq('client_id', clientId)
             .single()
           if (existing) {
             messagesStore.markMessageSent(clientId, { ...existing, reply_to: replyTarget })
           } else {
             messagesStore.markMessageFailed(clientId)
           }
         } else {
           messagesStore.markMessageFailed(clientId)
         }
       } else if (data) {
         messagesStore.markMessageSent(clientId, { ...data, reply_to: replyTarget })
       }
     } catch {
       messagesStore.markMessageFailed(clientId)
     }
   }
   ```
5. Add `editMessage`, `deleteMessage`, and `toggleReaction`:
   ```ts
   async function editMessage(
     messageId: string,
     newContent: string,
   ): Promise<{ error: string | null }> {
     if (!isValidMessageContent(newContent)) {
       return { error: 'Message content must be 1–4000 characters.' }
     }
     const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
     if (!current?.id) {
       return { error: 'Not authenticated.' }
     }

     const trimmed = newContent.trim()
     const editedAt = new Date().toISOString()
     messagesStore.reconcileUpdatedMessage({
       id: messageId,
       content: trimmed,
       edited_at: editedAt,
     })

     const { error } = await supabase
       .from('messages')
       .update({ content: trimmed, edited_at: editedAt })
       .eq('id', messageId)
       .eq('user_id', current.id)

     return { error: error ? error.message : null }
   }

   async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
     const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
     if (!current?.id) {
       return { error: 'Not authenticated.' }
     }

     const deletedAt = new Date().toISOString()
     messagesStore.reconcileUpdatedMessage({
       id: messageId,
       deleted_at: deletedAt,
     })

     const { error } = await supabase
       .from('messages')
       .update({ deleted_at: deletedAt })
       .eq('id', messageId)
       .eq('user_id', current.id)

     return { error: error ? error.message : null }
   }

   async function toggleReaction(
     messageId: string,
     emoji: string,
   ): Promise<{ error: string | null }> {
     if (!isValidReactionEmoji(emoji) || !activeChannelId.value) {
       return { error: 'Invalid reaction.' }
     }
     const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
     if (!current?.id) {
       return { error: 'Not authenticated.' }
     }

     const targetMsg = messages.value.find(m => m.id === messageId)
     const alreadyReacted = Boolean(
       targetMsg?.reactions?.some(r => r.user_id === current.id && r.emoji === emoji),
     )

     if (alreadyReacted) {
       messagesStore.applyReactionRemoved({
         message_id: messageId,
         user_id: current.id,
         emoji,
       })
       const { error } = await supabase
         .from('message_reactions')
         .delete()
         .match({ message_id: messageId, user_id: current.id, emoji })
       return { error: error ? error.message : null }
     } else {
       const optimisticReaction: MessageReaction = {
         message_id: messageId,
         channel_id: activeChannelId.value,
         user_id: current.id,
         emoji,
       }
       messagesStore.applyReactionAdded(optimisticReaction)
       const { error } = await supabase
         .from('message_reactions')
         .insert(optimisticReaction)
       return { error: error ? error.message : null }
     }
   }
   ```
6. Export `editMessage`, `deleteMessage`, and `toggleReaction` from `useChatRoom()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(chat): add schema and realtime actions for message edit, delete, replies, and reactions"
```

---

### Task 4: Message Hover Toolbar, Inline Edit, Tombstone, Quoted Reply Header, Reaction Pills & Composer Reply Banner

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/components/MessageComposer.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `REACTION_EMOJIS`, `summarizeReactions` from `~/utils/chat`, `editMessage`, `deleteMessage`, `toggleReaction` from `~/composables/useChatRoom`
- Produces:
  - `MessageViewport.vue` with `@reply`, `@edit`, `@delete`, and `@toggleReaction` emits, inline editor, tombstone rendering, quoted reply header, and reaction pills
  - `MessageComposer.vue` with `replyingTo?: ChatMessage | null` prop and `@cancelReply` emit

- [ ] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Append tests to `tests/components/chatUi.test.ts`:

```ts
  it('MessageViewport supports inline editing, soft-delete tombstones, quote-reply headers, and reaction pills', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-alice',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'm-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-alice',
            content: 'Editable message',
            created_at: '2026-10-18T10:00:00Z',
            edited_at: '2026-10-18T10:01:00Z',
            status: 'sent',
            author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
            reactions: [
              { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-alice', emoji: '👍' },
            ],
          },
          {
            id: 'm-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Deleted message',
            created_at: '2026-10-18T10:02:00Z',
            deleted_at: '2026-10-18T10:03:00Z',
            status: 'sent',
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
          {
            id: 'm-3',
            client_id: 'c-3',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Reply message',
            created_at: '2026-10-18T10:04:00Z',
            status: 'sent',
            reply_to_id: 'm-1',
            reply_to: {
              id: 'm-1',
              user_id: 'u-alice',
              content: 'Editable message',
              author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
            },
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
        ],
      },
    })

    // 1. Edited badge & reaction pill
    expect(wrapper.find('[data-test="edited-badge-m-1"]').exists()).toBe(true)
    const reactionPill = wrapper.find('[data-test="reaction-pill-m-1-👍"]')
    expect(reactionPill.exists()).toBe(true)
    expect(reactionPill.text()).toContain('1')
    await reactionPill.trigger('click')
    expect(wrapper.emitted('toggleReaction')?.[0]).toEqual([{ messageId: 'm-1', emoji: '👍' }])

    // 2. Deleted tombstone hides original content
    expect(wrapper.find('[data-test="deleted-tombstone-m-2"]').text()).toContain('This message was deleted')
    expect(wrapper.text()).not.toContain('Deleted message')

    // 3. Quoted reply preview
    expect(wrapper.find('[data-test="reply-quote-m-3"]').text()).toContain('Editable message')

    // 4. Inline edit flow for own message (m-1)
    await wrapper.find('[data-test="edit-m-1"]').trigger('click')
    const editInput = wrapper.find('[data-test="edit-input-m-1"]')
    await editInput.setValue('Updated message text')
    await wrapper.find('[data-test="save-edit-m-1"]').trigger('click')
    expect(wrapper.emitted('edit')?.[0]).toEqual([
      { messageId: 'm-1', content: 'Updated message text' },
    ])

    // 5. Delete button for own message (m-1)
    await wrapper.find('[data-test="delete-m-1"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]).toEqual(['m-1'])
  })

  it('MessageComposer displays replyingTo banner and emits cancelReply when dismissed', async () => {
    const wrapper = mount(MessageComposer, {
      props: {
        channelSlug: 'general',
        replyingTo: {
          id: 'm-1',
          client_id: 'c-1',
          channel_id: 'ch-1',
          user_id: 'u-alice',
          content: 'Original message to quote',
          created_at: '2026-10-18T10:00:00Z',
          status: 'sent',
          author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
        },
      },
    })

    const banner = wrapper.find('[data-test="reply-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Alice')
    expect(banner.text()).toContain('Original message to quote')

    await wrapper.find('[data-test="cancel-reply"]').trigger('click')
    expect(wrapper.emitted('cancelReply')).toBeTruthy()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (`[data-test="edited-badge-m-1"]` and `[data-test="reply-banner"]` do not exist).

- [ ] **Step 3: Implement UI updates in `MessageViewport.vue`, `MessageComposer.vue`, and `app/pages/index.vue`**

In `app/components/MessageViewport.vue`:
1. Import `REACTION_EMOJIS` and `summarizeReactions` from `~/utils/chat`:
   ```ts
   import { buildMessageTimeline, REACTION_EMOJIS, summarizeReactions } from '~/utils/chat'
   ```
2. Extend `defineEmits`:
   ```ts
   const emit = defineEmits<{
     (e: 'retry', clientId: string): void
     (e: 'dismiss', clientId: string): void
     (e: 'reply', message: ChatMessage): void
     (e: 'edit', payload: { messageId: string; content: string }): void
     (e: 'delete', messageId: string): void
     (e: 'toggleReaction', payload: { messageId: string; emoji: string }): void
   }>()
   ```
3. Add inline editing state and helpers:
   ```ts
   const editingMessageId = ref<string | null>(null)
   const editingContent = ref('')

   function startEdit(msg: ChatMessage) {
     editingMessageId.value = msg.id
     editingContent.value = msg.content
   }

   function cancelEdit() {
     editingMessageId.value = null
     editingContent.value = ''
   }

   function saveEdit(messageId: string) {
     const trimmed = editingContent.value.trim()
     if (!trimmed) return
     emit('edit', { messageId, content: trimmed })
     editingMessageId.value = null
     editingContent.value = ''
   }
   ```
4. In `<template>` of `app/components/MessageViewport.vue`, inside each message row (`compact` or `full`):
   - Render Quoted Reply Header when `item.message.reply_to_id`:
     ```vue
     <div
       v-if="item.message.reply_to_id"
       :data-test="`reply-quote-${item.message.id}`"
       class="mb-1 pl-2.5 border-l-2 border-sky-500 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate"
     >
       <span class="font-semibold text-slate-700 dark:text-slate-300">
         @{{ item.message.reply_to?.author?.display_name || 'Friend' }}
       </span>
       <span class="truncate italic">
         {{ item.message.reply_to?.deleted_at ? 'Original message was deleted' : (item.message.reply_to?.content || 'Message') }}
       </span>
     </div>
     ```
   - Render Deleted Tombstone when `item.message.deleted_at`:
     ```vue
     <p
       v-if="item.message.deleted_at"
       :data-test="`deleted-tombstone-${item.message.id}`"
       class="text-sm italic text-slate-400 dark:text-slate-500 mt-0.5"
     >
       This message was deleted
     </p>
     ```
   - Render Inline Edit Box when `editingMessageId === item.message.id`:
     ```vue
     <div v-else-if="editingMessageId === item.message.id" class="mt-1 space-y-1.5">
       <input
         v-model="editingContent"
         type="text"
         :data-test="`edit-input-${item.message.id}`"
         class="w-full px-2.5 py-1.5 text-sm rounded-lg border border-sky-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
         @keydown.enter.prevent="saveEdit(item.message.id)"
         @keydown.esc.prevent="cancelEdit"
       />
       <div class="flex items-center gap-2 text-xs">
         <button
           type="button"
           :data-test="`save-edit-${item.message.id}`"
           class="px-2.5 py-1 rounded bg-sky-600 text-white font-medium hover:bg-sky-500"
           @click="saveEdit(item.message.id)"
         >
           Save
         </button>
         <button
           type="button"
           :data-test="`cancel-edit-${item.message.id}`"
           class="px-2.5 py-1 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
           @click="cancelEdit"
         >
           Cancel
         </button>
       </div>
     </div>
     ```
   - Otherwise render the message content + `(edited)` badge (`v-if="item.message.edited_at && !item.message.deleted_at" :data-test="'edited-badge-' + item.message.id"`), Reaction Pills (`summarizeReactions(item.message.reactions, currentUserId)`), and the Hover Action Bar (`v-if="item.message.status === 'sent' && !item.message.deleted_at"`):
     ```vue
     <!-- Reaction Pills -->
     <div
       v-if="!item.message.deleted_at && summarizeReactions(item.message.reactions, currentUserId).length > 0"
       class="mt-1.5 flex items-center flex-wrap gap-1"
     >
       <button
         v-for="summary in summarizeReactions(item.message.reactions, currentUserId)"
         :key="summary.emoji"
         type="button"
         :data-test="`reaction-pill-${item.message.id}-${summary.emoji}`"
         class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors"
         :class="summary.reactedByMe ? 'bg-sky-500/15 border-sky-500/50 text-sky-600 dark:text-sky-300 font-semibold' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
         @click="emit('toggleReaction', { messageId: item.message.id, emoji: summary.emoji })"
       >
         <span>{{ summary.emoji }}</span>
         <span>{{ summary.count }}</span>
       </button>
     </div>

     <!-- Hover Action Toolbar -->
     <div
       v-if="item.message.status === 'sent' && !item.message.deleted_at"
       class="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 shadow-sm shrink-0"
     >
       <button
         v-for="emoji in REACTION_EMOJIS"
         :key="emoji"
         type="button"
         :data-test="`react-${item.message.id}-${emoji}`"
         class="p-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-transform hover:scale-110"
         :title="`React ${emoji}`"
         @click="emit('toggleReaction', { messageId: item.message.id, emoji })"
       >
         {{ emoji }}
       </button>
       <button
         type="button"
         :data-test="`reply-${item.message.id}`"
         class="px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700"
         @click="emit('reply', item.message)"
       >
         Reply
       </button>
       <template v-if="item.message.user_id === currentUserId">
         <button
           type="button"
           :data-test="`edit-${item.message.id}`"
           class="px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700"
           @click="startEdit(item.message)"
         >
           Edit
         </button>
         <button
           type="button"
           :data-test="`delete-${item.message.id}`"
           class="px-1.5 py-0.5 text-[11px] font-medium text-rose-500 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
           @click="emit('delete', item.message.id)"
         >
           Delete
         </button>
       </template>
     </div>
     ```

In `app/components/MessageComposer.vue`:
1. Import `ChatMessage` from `~/types/chat`, add `replyingTo?: ChatMessage | null` to `defineProps` (default `null`), and add `(e: 'cancelReply'): void` to `defineEmits`.
2. Render the Reply Banner above the input box in `<template>`:
   ```vue
   <!-- Replying To Banner -->
   <div
     v-if="replyingTo"
     data-test="reply-banner"
     class="mb-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border-l-2 border-sky-500 flex items-center justify-between gap-2 text-xs"
   >
     <div class="truncate text-slate-600 dark:text-slate-300">
       Replying to <span class="font-semibold text-slate-900 dark:text-white">@{{ replyingTo.author?.display_name || 'Friend' }}</span>:
       <span class="italic ml-1">{{ replyingTo.content }}</span>
     </div>
     <button
       type="button"
       data-test="cancel-reply"
       class="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold px-1"
       @click="emit('cancelReply')"
     >
       ×
     </button>
   </div>
   ```

In `app/pages/index.vue`:
- Destructure `editMessage`, `deleteMessage`, and `toggleReaction` from `useChatRoom()`.
- Add `const replyingTo = ref<ChatMessage | null>(null)`.
- Wire `handleSendMessage(content: string)` to call `await sendMessage(content, replyingTo.value?.id)` and reset `replyingTo.value = null`.
- Wire `@reply="replyingTo = $event"`, `@edit="editMessage($event.messageId, $event.content)"`, `@delete="deleteMessage($event)"`, and `@toggle-reaction="toggleReaction($event.messageId, $event.emoji)"` on `<MessageViewport>`.
- Pass `:replying-to="replyingTo"` and `@cancel-reply="replyingTo = null"` on `<MessageComposer>`.

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`
Expected: PASS (all unit and component test suites pass).

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue app/components/MessageComposer.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): add message hover actions, inline edit, soft-delete tombstone, replies, and reactions"
```
