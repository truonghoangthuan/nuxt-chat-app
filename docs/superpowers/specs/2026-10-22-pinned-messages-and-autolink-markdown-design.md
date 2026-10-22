# Pinned Messages & Auto-Linkify Markdown Design Spec

**Issues:**
- GitHub Issue #19: `feat: Auto-linkify URLs and support lightweight markdown`
- GitHub Issue #21: `feat: Pinned messages in conversations`

---

## 1. Overview & Goals

This specification unifies two chat messaging improvements:
1. **Auto-linkify URLs & Lightweight Markdown (Issue #19):** Enable users to share clickable URLs and inline code snippets without importing heavy markdown parsers.
2. **Pinned Messages in Conversations (Issue #21):** Allow members of direct or group conversations to pin important notes, links, or announcements. Pinned messages are highlighted in a dedicated header banner with jump-to-message navigation.

---

## 2. Issue #19: Auto-linkify URLs & Lightweight Markdown

### 2.1 Requirements
- Tokenize `@mentions`, full URLs (`https://...` and `http://...`), and inline code (`` `code` ``).
- Strict protocol whitelist: `http:` and `https:` only. Disallow `javascript:`, `data:`, and arbitrary schemes.
- Strip trailing punctuation from detected URLs so trailing periods, commas, or parentheses in normal sentences do not break the link (e.g. `Visit https://example.com.` links to `https://example.com`).
- Render links with `target="_blank"`, `rel="noopener noreferrer"`, and `@click.stop`.
- Render inline code with monospace typography and distinct background/border tokens matching Apple Fluid / Obsidian design systems.
- Zero extra NPM dependencies (use regex tokenizer in `app/utils/chat.ts`).
- Preserve backward compatibility with existing `tokenizeMessageMentions` callers and tests.

### 2.2 Data Contract & Tokenizer Architecture

In `app/types/chat.ts`:
```typescript
export interface MentionSegment {
  text: string
  isMention: boolean
  isMe: boolean
  isLink?: boolean
  isCode?: boolean
  href?: string
}
```

In `app/utils/chat.ts`:
Extend `tokenizeMessageMentions`:
- Priority order:
  1. Inline code spans: `` `([^`\n]+)` `` (code content inside backticks should not tokenize internal mentions or URLs).
  2. Whitelisted URLs: `https?:\/\/[^\s<>"'{}|\\^`]+[^\s<>"'{}|\\^`.,;:!?)\]]`
  3. User mentions: `@<known_names>` or `@\w+`
  4. Plain text.

### 2.3 Visual Design
- **Links:**
  - Sender bubble: `text-white underline underline-offset-2 hover:opacity-85 font-medium`
  - Peer bubble: `text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:underline font-medium`
- **Inline code:**
  - Sender bubble: `bg-white/20 text-white border border-white/30 rounded px-1.5 py-0.5 font-mono text-[12px]`
  - Peer bubble: `bg-black/5 dark:bg-white/10 text-pink-600 dark:text-pink-400 border border-black/10 dark:border-white/10 rounded px-1.5 py-0.5 font-mono text-[12px]`

---

## 3. Issue #21: Pinned Messages

### 3.1 Requirements
- Any member of a conversation can pin or unpin messages in that conversation.
- A conversation can have multiple pinned messages.
- The latest pinned message (or active pin in a carousel/list) is rendered in a pinned header banner docked below the stage header.
- Clicking the pinned banner smoothly scrolls the viewport to the target message and briefly applies a focus ring/highlight animation.
- Users can unpin directly from the banner or from the message actions menu (desktop hover toolbar & mobile menu).
- Realtime sync: Pinning or unpinning updates the message in Supabase, triggering a realtime `UPDATE` event that updates all participants' local stores.

### 3.2 Database Schema & Security
In `supabase/schema.sql`:
1. Columns on `public.messages`:
   ```sql
   alter table public.messages
     add column if not exists pinned_at timestamptz,
     add column if not exists pinned_by uuid references public.profiles(id) on delete set null;
   ```
2. Partial index for efficient lookups:
   ```sql
   create index if not exists messages_pinned_idx
     on public.messages (conversation_id, pinned_at desc)
     where pinned_at is not null;
   ```
3. Atomic `SECURITY DEFINER` RPC `public.toggle_pin_message`:
   ```sql
   create or replace function public.toggle_pin_message(p_message_id uuid)
   returns jsonb
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     v_msg record;
     v_pinned_at timestamptz;
     v_pinned_by uuid;
   begin
     select id, conversation_id, pinned_at, pinned_by
     into v_msg
     from public.messages
     where id = p_message_id;

     if not found then
       return jsonb_build_object('error', 'Message not found');
     end if;

     if not public.can_access_conversation(v_msg.conversation_id) then
       return jsonb_build_object('error', 'Access denied');
     end if;

     if v_msg.pinned_at is null then
       v_pinned_at := now();
       v_pinned_by := auth.uid();
     else
       v_pinned_at := null;
       v_pinned_by := null;
     end if;

     update public.messages
     set pinned_at = v_pinned_at,
         pinned_by = v_pinned_by
     where id = p_message_id;

     return jsonb_build_object(
       'success', true,
       'pinned_at', v_pinned_at,
       'pinned_by', v_pinned_by
     );
   end;
   $$;
   ```

### 3.3 State Management & Composable Orchestration

1. In `app/types/chat.ts`:
   Add `pinned_at?: string | null` and `pinned_by?: string | null` to `ChatMessage`.

2. In `app/composables/useMessagesState.ts`:
   - `reconcileUpdatedMessage`:
     ```typescript
     pinned_at: serverRow.pinned_at !== undefined ? serverRow.pinned_at : msg.pinned_at,
     pinned_by: serverRow.pinned_by !== undefined ? serverRow.pinned_by : msg.pinned_by,
     ```
   - `markMessageSent` & `reconcileIncomingMessage`: preserve `pinned_at` and `pinned_by`.

3. In `app/composables/useChatRoom.ts`:
   - `togglePinMessage(messageId: string): Promise<{ error: string | null }>`:
     - Optimistically updates `messagesStore.reconcileUpdatedMessage`.
     - Calls Supabase `rpc('toggle_pin_message', { p_message_id: messageId })`.
     - Reverts on error.
   - Expose `togglePinMessage`.

### 3.4 UI Components

1. `app/components/MessageActionsMenu.vue`:
   - Add "Pin" / "Unpin" button (`data-test="mobile-pin"`).
   - Emits `(e: 'togglePin', messageId: string)`.

2. `app/components/MessageViewport.vue`:
   - Add Pin icon button to desktop hover toolbar (`data-test="pin-${item.message.id}"`).
   - Add Pinned Header Banner docked at the top of the viewport (`data-test="pinned-messages-banner"`):
     - Displays `Pin` icon from `@lucide/vue`.
     - Message author name and preview snippet (decrypted text or image count summary).
     - Jump-to-message button / click handler that scrolls to message and flashes ring.
     - Direct unpin button (`data-test="unpin-banner-btn"`).
     - If count > 1, shows "1 of N" and next/prev arrow buttons.
   - Emits `(e: 'togglePin', messageId: string)`.

3. `app/pages/index.vue`:
   - Binds `@toggle-pin="handleTogglePin"` on `<MessageViewport>`.
   - Invokes `await togglePinMessage(messageId)`.

---

## 4. Verification & Testing

- Unit tests:
  - `tests/utils/chat.test.ts`: URL parsing, code span parsing, punctuation trimming, backward compatibility with mentions.
  - `tests/composables/useMessagesState.test.ts`: Pinned state reconciliation.
  - `tests/composables/useChatRoom.test.ts`: `togglePinMessage` optimistic update, RPC invocation, error rollback.
- Component tests:
  - `tests/components/messageActionsMenu.test.ts`: Mobile menu pin/unpin action emit.
  - `tests/components/chatUi.test.ts`: Desktop pin button, pinned banner rendering, jump-to-message click, link rendering, code badge rendering.
