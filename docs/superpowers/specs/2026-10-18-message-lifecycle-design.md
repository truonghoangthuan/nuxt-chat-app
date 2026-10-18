# Sub-Project 2: Interactive Message Lifecycle (Edit, Soft-Delete, Replies & Emoji Reactions) — Design Specification

## 1. Context & Purpose

Building on **Sub-Project 1** (Core Resiliency, Viewport Grouping & Profile Settings), **Sub-Project 2** transforms messages in `nuxt-chat-app` from append-only plain text into an interactive, real-time conversation flow. Friends can quote-reply to specific messages, react with an 8-emoji quick palette, edit their own messages to fix typos, and soft-delete their own messages without breaking reply chains or message ordering.

---

## 2. Goals & Non-Goals

### Goals
- **Inline Message Editing**: Authors can edit their own non-deleted messages (`content` `1..4000` trimmed chars), setting `edited_at = now()` and displaying a muted `(edited)` indicator across all connected clients in real time.
- **Soft-Delete Tombstones**: Authors can delete their own messages, setting `deleted_at = now()` and rendering `"This message was deleted"` in muted italics while preserving the row so reply references and pagination cursors remain intact.
- **Discord-Style Inline Quote-Replies (`reply_to_id`)**:
  - Users can click **Reply** on any non-deleted confirmed message to attach a `"Replying to @DisplayName"` banner above `MessageComposer.vue`.
  - Sent replies store `reply_to_id` in `public.messages` and display a compact quoted preview above the message row in `MessageViewport.vue`.
  - Messages with `reply_to_id` always render as a full message row (`isCompact: false`) so the quoted preview has clear visual separation.
- **8-Emoji Quick Reactions (`public.message_reactions`)**:
  - Users can toggle any of the 8 preset emojis (`👍`, `❤️`, `😂`, `🎉`, `🔥`, `😮`, `😢`, `👀`) on any confirmed, non-deleted message.
  - Reactions are stored in `public.message_reactions` with `REPLICA IDENTITY FULL` and synced in real time via `postgres_changes` (`INSERT` and `DELETE`).
  - Reaction pills below the message show each emoji and its count, highlighting pills the current user has reacted with.

### Non-Goals
- Nested multi-level Slack thread drawers (replies are inline quote-replies in the main channel timeline).
- Hard deletion (`DELETE FROM public.messages`) or admin moderation of other users' messages.
- Full Unicode emoji picker dependency (uses the curated 8-emoji quick palette).

---

## 3. Architecture & Data Flow

### 3.1 Database Schema & RLS (`supabase/schema.sql`)

1. **Extend `public.messages`**:
   ```sql
   alter table public.messages
     add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
     add column if not exists edited_at timestamptz,
     add column if not exists deleted_at timestamptz;

   create policy "Users can update their own messages"
     on public.messages for update
     to authenticated
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

2. **Create `public.message_reactions`**:
   ```sql
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

3. **Realtime Publication**:
   Add `public.message_reactions` to `supabase_realtime` alongside `public.messages`, `public.channels`, and `public.profiles`.

### 3.2 Domain Types & Pure Helpers (`app/types/chat.ts` & `app/utils/chat.ts`)

#### Types (`app/types/chat.ts`)
```ts
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
```
Extend `ChatMessage` with:
- `reply_to_id?: string | null`
- `reply_to?: ReplyTarget | null`
- `edited_at?: string | null`
- `deleted_at?: string | null`
- `reactions?: MessageReaction[]`

#### Pure Helpers (`app/utils/chat.ts`)
1. **`REACTION_EMOJIS`**:
   `['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👀'] as const`
2. **`isValidReactionEmoji(emoji: string): boolean`**:
   Returns `true` iff `(REACTION_EMOJIS as readonly string[]).includes(emoji)`.
3. **`summarizeReactions(reactions: MessageReaction[] | undefined, currentUserId?: string): ReactionSummary[]`**:
   Groups reactions by `emoji` in order of first appearance (or `REACTION_EMOJIS` order), deduplicating `user_id` per emoji, and computing `count` and `reactedByMe: Boolean(currentUserId && userIds.includes(currentUserId))`.
4. **Update `buildMessageTimeline`**:
   A message with `Boolean(msg.reply_to_id)` must always set `isCompact: false` so its quoted reply header is never squeezed into a compact row.

### 3.3 Pure Store Transitions (`app/composables/useMessagesState.ts`)
Extend `createMessagesStore()` with:
- **`addOptimisticMessage`**: Accepts optional `replyToId?: string | null` and `replyTo?: ReplyTarget | null` and attaches them to the optimistic `ChatMessage` (`reactions: []`).
- **`reconcileUpdatedMessage(serverRow: Omit<ChatMessage, 'status'>): boolean`**:
  - Finds message by `id === serverRow.id`.
  - Updates `content`, `edited_at`, and `deleted_at` in-place while preserving existing `author`, `reply_to`, and `reactions`.
  - Also updates `msg.reply_to` on any message in `messages.value` where `msg.reply_to_id === serverRow.id` so quoted replies immediately reflect edits or `"This message was deleted"`.
- **`applyReactionAdded(reaction: MessageReaction): boolean`**:
  - Finds message by `id === reaction.message_id`.
  - If a reaction with the same `(user_id, emoji)` does not already exist on `msg.reactions`, appends it.
- **`applyReactionRemoved(target: { message_id: string; user_id: string; emoji: string }): boolean`**:
  - Finds message by `id === target.message_id` and removes any entry matching `r.user_id === target.user_id && r.emoji === target.emoji`.

### 3.4 Realtime & Supabase Orchestration (`app/composables/useChatRoom.ts`)
- **Hydrating Replies & Reactions on History / Gap Load**:
  - Add a pure helper `hydrateMessagesMetadata(rows, reactions, profilesCache)` that attaches `reactions` to each message and resolves `reply_to` from loaded messages (or a batch lookup on `public.messages` for any parent `reply_to_id` outside the current page).
- **Realtime Listeners in `setupDbChangesSubscription()`**:
  - `postgres_changes` `UPDATE` on `public.messages`: if `updatedRow.channel_id === activeChannelId.value`, calls `messagesStore.reconcileUpdatedMessage(updatedRow)`.
  - `postgres_changes` `INSERT` on `public.message_reactions`: if `newReaction.channel_id === activeChannelId.value`, calls `messagesStore.applyReactionAdded(newReaction)`.
  - `postgres_changes` `DELETE` on `public.message_reactions`: uses `payload.old` (complete via `REPLICA IDENTITY FULL`) and calls `messagesStore.applyReactionRemoved(oldReaction)`.
- **User Actions Exposed by `useChatRoom()`**:
  1. `sendMessage(content: string, replyToId?: string | null)`: includes `reply_to_id: replyToId || null` in the optimistic message and Supabase `insert` payload.
  2. `editMessage(messageId: string, newContent: string)`: validates `isValidMessageContent(newContent)`, optimistically updates `content` and `edited_at` in `messagesStore`, and runs `supabase.from('messages').update({ content: newContent.trim(), edited_at: new Date().toISOString() }).eq('id', messageId).eq('user_id', current.id)`. Rolls back on error.
  3. `deleteMessage(messageId: string)`: optimistically sets `deleted_at` in `messagesStore`, and runs `supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId).eq('user_id', current.id)`.
  4. `toggleReaction(messageId: string, emoji: string)`: validates `isValidReactionEmoji(emoji)`. Checks if `current.id` already reacted with `emoji` on `messageId`:
     - If already reacted: optimistically calls `applyReactionRemoved` and executes `supabase.from('message_reactions').delete().match({ message_id: messageId, user_id: current.id, emoji })`.
     - If not yet reacted: optimistically calls `applyReactionAdded` and executes `supabase.from('message_reactions').insert({ message_id: messageId, channel_id: activeChannelId.value, user_id: current.id, emoji })`.

### 3.5 UI Components (`MessageViewport.vue`, `MessageComposer.vue`, `index.vue`)

1. **`app/components/MessageViewport.vue`**:
   - New emits:
     - `(e: 'reply', message: ChatMessage): void`
     - `(e: 'edit', payload: { messageId: string; content: string }): void`
     - `(e: 'delete', messageId: string): void`
     - `(e: 'toggleReaction', payload: { messageId: string; emoji: string }): void`
   - **Quoted Reply Preview (`item.message.reply_to_id`)**:
     - Rendered above the author header with a left border accent (`data-test="reply-quote-<msg.id>"`), showing `@ParentAuthor` and either a single-line truncated preview of `reply_to.content` or `"Original message was deleted"` when `reply_to.deleted_at` is truthy.
   - **Inline Editing Mode (`editingMessageId === item.message.id`)**:
     - Replaces the message text with an input/textarea (`data-test="edit-input-<msg.id>"`) + **Save** (`data-test="save-edit-<msg.id>"`) and **Cancel** (`data-test="cancel-edit-<msg.id>"`) buttons (`Enter` saves, `Escape` cancels).
   - **Deleted Tombstone (`item.message.deleted_at`)**:
     - Renders `<p data-test="deleted-tombstone" class="text-sm italic text-slate-400 dark:text-slate-500">This message was deleted</p>` and hides reactions and hover actions.
   - **Hover Action Bar (`item.message.status === 'sent' && !item.message.deleted_at`)**:
     - Floating toolbar on `group-hover` with quick emoji buttons (`data-test="react-<msg.id>-<emoji>"`), Reply button (`data-test="reply-<msg.id>"`), and—when `item.message.user_id === currentUserId`—Edit (`data-test="edit-<msg.id>"`) and Delete (`data-test="delete-<msg.id>"`) buttons.
   - **Reaction Pills Bar**:
     - Renders `summarizeReactions(item.message.reactions, currentUserId)` as clickable pills (`data-test="reaction-pill-<msg.id>-<emoji>"`) below the message text.

2. **`app/components/MessageComposer.vue`**:
   - New optional prop `replyingTo?: ChatMessage | null` (default `null`) and emit `(e: 'cancelReply'): void`.
   - Renders a reply banner (`data-test="reply-banner"`) above the input row when `replyingTo` is non-null, with a dismiss button (`data-test="cancel-reply"`).

3. **`app/pages/index.vue`**:
   - Holds `const replyingTo = ref<ChatMessage | null>(null)`, resets it on channel change (`handleSelectChannel`), passes `:replying-to="replyingTo"` to `MessageComposer`, and wires `@edit`, `@delete`, `@reply`, and `@toggle-reaction` from `MessageViewport`.

---

## 4. Verification & Testing Plan (`npm test`)

1. **`tests/utils/chat.test.ts`**:
   - Verify `isValidReactionEmoji` and `summarizeReactions` (counts, deduplication per user, `reactedByMe`).
   - Verify `buildMessageTimeline` forces `isCompact: false` when `reply_to_id` is set.
2. **`tests/composables/useMessagesState.test.ts`**:
   - Verify `reconcileUpdatedMessage` updates `content`, `edited_at`, and `deleted_at` and cascades changes to any child message's `reply_to` preview.
   - Verify `applyReactionAdded` and `applyReactionRemoved` deduplicate and remove reactions deterministically.
3. **`tests/composables/useChatRoom.test.ts`**:
   - Verify realtime `UPDATE` on `messages` and `INSERT`/`DELETE` on `message_reactions` update active channel state and ignore inactive channels.
4. **`tests/components/chatUi.test.ts`**:
   - Verify `MessageViewport` renders quoted replies, inline edit save/cancel, `(edited)` indicator, `"This message was deleted"` tombstone, and reaction pills.
   - Verify `MessageComposer` renders the `"Replying to..."` banner and emits `cancelReply`.
