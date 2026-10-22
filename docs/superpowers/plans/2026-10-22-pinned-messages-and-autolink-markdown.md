# Pinned Messages & Auto-Linkify Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement auto-linkified URLs and inline code markdown rendering (Issue #19) alongside pinned messages with a header banner and jump-to-message navigation (Issue #21).

**Architecture:** Extend `tokenizeMessageMentions` into a multi-token lexer in `app/utils/chat.ts` that safely handles URLs and inline code without external dependencies, and update `MessageViewport.vue` to render them. For message pins, add `pinned_at` and `pinned_by` columns with an atomic Postgres RPC in `supabase/schema.sql`, wire optimistic pin toggling in `useChatRoom.ts` and `useMessagesState.ts`, and display a responsive pinned header banner with smooth scroll anchoring in `MessageViewport.vue`.

**Tech Stack:** Nuxt 4, Vue 3, Supabase JS, Tailwind CSS, Lucide icons, Vitest (`@vue/test-utils`).

**Spec:** `docs/superpowers/specs/2026-10-22-pinned-messages-and-autolink-markdown-design.md`

## Global Constraints
- Target tables: `public.messages` with `pinned_at timestamptz` and `pinned_by uuid references public.profiles(id) on delete set null`.
- Security: URLs must strictly whitelist `http:` and `https:` schemes. Disallow `javascript:`, `data:`, `file:`, and scheme-less strings.
- Dependencies: Zero new NPM packages; use lightweight regex tokenization.
- Backward compatibility: Retain `MentionSegment` properties (`text`, `isMention`, `isMe`) so existing tests in `tests/utils/chat.test.ts` pass without regression.
- Performance: Add partial index on `public.messages (conversation_id, pinned_at desc) where pinned_at is not null`.
- Realtime: Maintain optimistic UI updates with automatic Supabase Realtime synchronization.

## Review Focus
1. Malicious schemes in URLs: `javascript:alert(1)` or `data:text/html;...` must NOT emit link tokens; they must remain safe plain text.
2. Trailing punctuation on URLs: `https://example.com.` and `(https://example.com)` must trim trailing punctuation (`.`, `,`, `)`, `]`, `!`, `?`) from the link href and text.
3. Unclosed backticks: `` `incomplete code `` must not freeze regex or produce invalid HTML; it must render as regular plain text.
4. Deleted messages pinned state: Messages with `deleted_at` set must never be included in the pinned messages banner.
5. Jump-to-message target not in DOM: If a pinned message is not loaded in current viewport history, clicking jump-to-message must handle it gracefully without crashing.

---

### Task 1: Extend tokenizer for URLs & inline code in `app/utils/chat.ts`

**Files:**
- Modify: `app/types/chat.ts:131-136`
- Modify: `app/utils/chat.ts:221-284`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: `MentionSegment` interface
- Produces:
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
  `tokenizeMessageMentions(content: string, currentDisplayName?: string | null, knownDisplayNames?: string[]): MentionSegment[]`

- [ ] **Step 1: Write failing unit tests in `tests/utils/chat.test.ts`**

Add tests to `tests/utils/chat.test.ts`:
```typescript
  it('tokenizes URLs with http and https and strips trailing punctuation', () => {
    const text = 'Check out https://nuxt.com/docs and http://example.org/test! Also visit https://site.com.'
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: 'Check out ', isMention: false, isMe: false },
      { text: 'https://nuxt.com/docs', isMention: false, isMe: false, isLink: true, href: 'https://nuxt.com/docs' },
      { text: ' and ', isMention: false, isMe: false },
      { text: 'http://example.org/test', isMention: false, isMe: false, isLink: true, href: 'http://example.org/test' },
      { text: '! Also visit ', isMention: false, isMe: false },
      { text: 'https://site.com', isMention: false, isMe: false, isLink: true, href: 'https://site.com' },
      { text: '.', isMention: false, isMe: false },
    ])
  })

  it('rejects unsafe schemes like javascript: and data: from being linkified', () => {
    const text = 'Run javascript:alert(1) or data:text/html,test'
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: 'Run javascript:alert(1) or data:text/html,test', isMention: false, isMe: false },
    ])
  })

  it('tokenizes inline code spans wrapped in backticks', () => {
    const text = 'Use `const x = 1` in code'
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: 'Use ', isMention: false, isMe: false },
      { text: 'const x = 1', isMention: false, isMe: false, isCode: true },
      { text: ' in code', isMention: false, isMe: false },
    ])
  })

  it('handles unclosed backticks as normal plain text', () => {
    const text = 'This is `unclosed code'
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: 'This is `unclosed code', isMention: false, isMe: false },
    ])
  })

  it('prioritizes inline code over internal @mentions or links', () => {
    const text = 'Do not ping `@Alice` or open `https://evil.com` inside code'
    const segments = tokenizeMessageMentions(text, 'Alice', ['Alice'])

    expect(segments).toEqual([
      { text: 'Do not ping ', isMention: false, isMe: false },
      { text: '@Alice', isMention: false, isMe: false, isCode: true },
      { text: ' or open ', isMention: false, isMe: false },
      { text: 'https://evil.com', isMention: false, isMe: false, isCode: true },
      { text: ' inside code', isMention: false, isMe: false },
    ])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL on the new test cases because URLs and backticks are treated as plain text.

- [ ] **Step 3: Implement tokenizer extension in `app/types/chat.ts` and `app/utils/chat.ts`**

Update `MentionSegment` in `app/types/chat.ts`:
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

Update `tokenizeMessageMentions` in `app/utils/chat.ts`:
- First, extract code spans using regex ``/`([^`\n]+)`/g``.
- For regions outside code spans, scan for mentions and URLs (`/https?:\/\/[^\s<>"'{}|\\^`]+[^\s<>"'{}|\\^`.,;:!?)\]]/gi`).
- Split text cleanly, preserving segment positions.
- When a segment is a URL: set `isLink: true`, `href: cleanUrl`.
- When a segment is code: set `isCode: true`, `text: codeContent`.
- When a segment is a mention: set `isMention: true`, `isMe: isMe`.
- Otherwise: plain text `{ text, isMention: false, isMe: false }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS (all tests including existing mention tests pass).

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(chat): extend tokenizer to support URLs and inline code"
```

---

### Task 2: Render links & inline code in `MessageViewport.vue`

**Files:**
- Modify: `app/components/MessageViewport.vue:565-585`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `MentionSegment` with `isLink`, `isCode`, `href` from `tokenizeMessageMentions`
- Produces: Clickable `<a>` tags and styled `<code>` tags inside message bubbles

- [ ] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Add tests to `tests/components/chatUi.test.ts`:
```typescript
  it('MessageViewport renders clickable links with target=_blank and rel=noopener', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-link',
            client_id: 'c-link',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Visit https://nuxt.com today',
            created_at: '2026-10-22T10:00:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const link = wrapper.find('[data-test="link-token"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('https://nuxt.com')
    expect(link.attributes('href')).toBe('https://nuxt.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.attributes('rel')).toContain('noreferrer')
  })

  it('MessageViewport renders inline code with styled badge', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-code',
            client_id: 'c-code',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Check `npm run test` command',
            created_at: '2026-10-22T10:00:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const code = wrapper.find('[data-test="code-token"]')
    expect(code.exists()).toBe(true)
    expect(code.text()).toBe('npm run test')
    expect(code.classes()).toContain('font-mono')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL because `[data-test="link-token"]` and `[data-test="code-token"]` do not exist.

- [ ] **Step 3: Update `MessageViewport.vue` template**

In `app/components/MessageViewport.vue`:
```vue
<template
  v-for="(seg, sIdx) in tokenizeMessageMentions(item.message.content, currentDisplayName)"
  :key="sIdx"
>
  <span
    v-if="seg.isMention"
    data-test="mention-token"
    class="px-1.5 py-0.5 rounded-md text-[13px] font-semibold"
    :class="[
      item.isSender
        ? 'bg-white/20 text-white border border-white/30'
        : (seg.isMe
            ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/35'
            : 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border border-blue-500/30')
    ]"
  >{{ seg.text }}</span>
  <a
    v-else-if="seg.isLink"
    :href="seg.href"
    target="_blank"
    rel="noopener noreferrer"
    data-test="link-token"
    class="underline underline-offset-2 hover:opacity-85 transition-opacity font-medium break-all"
    :class="item.isSender ? 'text-white' : 'text-blue-600 dark:text-blue-400'"
    @click.stop
  >{{ seg.text }}</a>
  <code
    v-else-if="seg.isCode"
    data-test="code-token"
    class="px-1.5 py-0.5 rounded font-mono text-[12px] border"
    :class="item.isSender
      ? 'bg-white/20 border-white/30 text-white'
      : 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 text-pink-600 dark:text-pink-400'"
  >{{ seg.text }}</code>
  <span v-else>{{ seg.text }}</span>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): render auto-linkified URLs and inline code in message bubbles"
```

---

### Task 3: Database schema & RPC for message pinning in `supabase/schema.sql`

**Files:**
- Modify: `supabase/schema.sql:287-323`
- Modify: `app/types/chat.ts:99-118`

**Interfaces:**
- Schema: columns `pinned_at timestamptz`, `pinned_by uuid references public.profiles(id)` on `public.messages`
- Index: `messages_pinned_idx` on `public.messages (conversation_id, pinned_at desc) where pinned_at is not null`
- Function: `public.toggle_pin_message(p_message_id uuid) returns jsonb`
- ChatMessage: `pinned_at?: string | null`, `pinned_by?: string | null`

- [ ] **Step 1: Write idempotent SQL migration in `supabase/schema.sql`**

Add columns and index to `public.messages`:
```sql
alter table public.messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

create index if not exists messages_pinned_idx
  on public.messages (conversation_id, pinned_at desc)
  where pinned_at is not null;
```

Add `toggle_pin_message` RPC:
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

revoke execute on function public.toggle_pin_message(uuid) from anon;
grant execute on function public.toggle_pin_message(uuid) to authenticated;
```

- [ ] **Step 2: Update `ChatMessage` interface in `app/types/chat.ts`**

Add fields:
```typescript
export interface ChatMessage {
  // ...
  pinned_at?: string | null
  pinned_by?: string | null
  // ...
}
```

- [ ] **Step 3: Run existing test suite to ensure schema and types compile cleanly**

Run: `npx vitest run`
Expected: PASS (256+ tests passing).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql app/types/chat.ts
git commit -m "feat(schema): add pinned columns, partial index, and toggle_pin_message RPC"
```

---

### Task 4: Store & Composable state management for pinned messages

**Files:**
- Modify: `app/composables/useMessagesState.ts:95-255`
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useMessagesState.test.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- `reconcileUpdatedMessage(serverRow: Partial<ChatMessage> & { id: string }): boolean`
- `togglePinMessage(messageId: string): Promise<{ error: string | null }>` exported from `useChatRoom()`

- [ ] **Step 1: Write failing store and composable tests**

In `tests/composables/useMessagesState.test.ts`:
```typescript
  it('reconcileUpdatedMessage updates pinned_at and pinned_by', () => {
    const store = createMessagesStore()
    const msg = store.addOptimisticMessage({
      clientId: 'c-1',
      conversationId: 'conv-1',
      user: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
      content: 'Hello pin',
    })!
    store.markMessageSent('c-1', { ...msg, id: 'm-1' })

    const pinnedAt = new Date().toISOString()
    store.reconcileUpdatedMessage({
      id: 'm-1',
      pinned_at: pinnedAt,
      pinned_by: 'u-1',
    })

    const found = store.messages.value.find(m => m.id === 'm-1')
    expect(found?.pinned_at).toBe(pinnedAt)
    expect(found?.pinned_by).toBe('u-1')

    // Unpin
    store.reconcileUpdatedMessage({
      id: 'm-1',
      pinned_at: null,
      pinned_by: null,
    })
    expect(found?.pinned_at).toBeNull()
    expect(found?.pinned_by).toBeNull()
  })
```

In `tests/composables/useChatRoom.test.ts`:
```typescript
  it('togglePinMessage toggles pin state optimistically and calls RPC', async () => {
    const room = useChatRoom()
    // Seed message in room
    const clientId = 'c-pin-test'
    room.messagesStore.addOptimisticMessage({
      clientId,
      conversationId: 'conv-1',
      user: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
      content: 'Important note',
    })
    room.messagesStore.markMessageSent(clientId, {
      id: 'm-pin-1',
      client_id: clientId,
      conversation_id: 'conv-1',
      user_id: 'u-1',
      content: 'Important note',
      created_at: new Date().toISOString(),
    })

    const res = await room.togglePinMessage('m-pin-1')
    expect(res.error).toBeNull()
    const msg = room.messages.value.find(m => m.id === 'm-pin-1')
    expect(msg?.pinned_at).toBeTruthy()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/composables/useMessagesState.test.ts tests/composables/useChatRoom.test.ts`
Expected: FAIL because `pinned_at` reconciliation and `togglePinMessage` are not yet implemented.

- [ ] **Step 3: Implement in `app/composables/useMessagesState.ts` and `app/composables/useChatRoom.ts`**

In `useMessagesState.ts`:
- In `markMessageSent`, `reconcileIncomingMessage`, and `reconcileUpdatedMessage`, copy `pinned_at` and `pinned_by` properties:
```typescript
pinned_at: serverRow.pinned_at !== undefined ? serverRow.pinned_at : msg.pinned_at,
pinned_by: serverRow.pinned_by !== undefined ? serverRow.pinned_by : msg.pinned_by,
```

In `useChatRoom.ts`:
```typescript
async function togglePinMessage(messageId: string): Promise<{ error: string | null }> {
  const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
  if (!current?.id) {
    return { error: 'Not authenticated.' }
  }

  const targetMsg = messages.value.find(m => m.id === messageId)
  if (!targetMsg) {
    return { error: 'Message not found.' }
  }

  const wasPinned = Boolean(targetMsg.pinned_at)
  const newPinnedAt = wasPinned ? null : new Date().toISOString()
  const newPinnedBy = wasPinned ? null : current.id

  // Optimistic update
  messagesStore.reconcileUpdatedMessage({
    id: messageId,
    pinned_at: newPinnedAt,
    pinned_by: newPinnedBy,
  })

  const { error } = await supabase.rpc('toggle_pin_message', {
    p_message_id: messageId,
  })

  if (error) {
    // Revert optimistic update
    messagesStore.reconcileUpdatedMessage({
      id: messageId,
      pinned_at: targetMsg.pinned_at,
      pinned_by: targetMsg.pinned_by,
    })
    return { error: error.message }
  }

  return { error: null }
}
```
Export `togglePinMessage` from `useChatRoom()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useMessagesState.test.ts tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMessagesState.ts app/composables/useChatRoom.ts tests/composables/useMessagesState.test.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(pin): add pin state reconciliation and togglePinMessage orchestrator"
```

---

### Task 5: Add Pin/Unpin actions to `MessageActionsMenu.vue` and desktop hover toolbar

**Files:**
- Modify: `app/components/MessageActionsMenu.vue`
- Modify: `app/components/MessageViewport.vue:382-440`
- Test: `tests/components/messageActionsMenu.test.ts`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `message.pinned_at`
- Produces:
  `MessageActionsMenu.vue` emits `(event: 'togglePin', messageId: string)`
  `MessageViewport.vue` emits `(e: 'togglePin', messageId: string)`

- [ ] **Step 1: Write failing component tests**

In `tests/components/messageActionsMenu.test.ts`:
```typescript
  it('renders Pin/Unpin button and emits togglePin when clicked', async () => {
    const wrapper = mount(MessageActionsMenu, {
      props: { message, currentUserId: 'u-1' },
    })

    await wrapper.find('[data-test="open-mobile-actions"]').trigger('click')
    const pinBtn = wrapper.find('[data-test="mobile-pin"]')
    expect(pinBtn.exists()).toBe(true)
    expect(pinBtn.text()).toBe('Pin')

    await pinBtn.trigger('click')
    expect(wrapper.emitted('togglePin')?.[0]).toEqual(['m-1'])
  })
```

In `tests/components/chatUi.test.ts`:
```typescript
  it('MessageViewport desktop toolbar renders pin button and emits togglePin', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-pinned-item',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Pinned note',
            created_at: '2026-10-22T10:00:00Z',
            status: 'sent',
            pinned_at: '2026-10-22T10:05:00Z',
            author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const pinBtn = wrapper.find('[data-test="pin-m-pinned-item"]')
    expect(pinBtn.exists()).toBe(true)
    await pinBtn.trigger('click')
    expect(wrapper.emitted('togglePin')?.[0]).toEqual(['m-pinned-item'])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/messageActionsMenu.test.ts tests/components/chatUi.test.ts`
Expected: FAIL because `[data-test="mobile-pin"]` and `[data-test="pin-m-pinned-item"]` are missing.

- [ ] **Step 3: Implement Pin/Unpin button in `MessageActionsMenu.vue` and `MessageViewport.vue`**

In `MessageActionsMenu.vue`:
- Add `(event: 'togglePin', messageId: string): void` to emits.
- Add Pin button to mobile actions menu:
```vue
<button
  type="button"
  role="menuitem"
  data-test="mobile-pin"
  class="rounded-[6px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--om-text-primary)] hover:bg-[var(--om-hover)] transition-colors cursor-pointer"
  @click="run(() => emit('togglePin', message.id))"
>
  {{ message.pinned_at ? 'Unpin' : 'Pin' }}
</button>
```

In `MessageViewport.vue`:
- In desktop hover toolbar:
```vue
<button
  type="button"
  :data-test="`pin-${item.message.id}`"
  class="px-2 py-0.5 text-[11px] font-medium text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] rounded-full hover:bg-black/5 dark:hover:bg-white/15 cursor-pointer"
  :title="item.message.pinned_at ? 'Unpin message' : 'Pin message'"
  @click="emit('togglePin', item.message.id)"
>
  {{ item.message.pinned_at ? 'Unpin' : 'Pin' }}
</button>
```
- In `<MessageActionsMenu @toggle-pin="emit('togglePin', $event)" />`.
- Declare emit in `defineEmits`: `(e: 'togglePin', messageId: string): void`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/messageActionsMenu.test.ts tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageActionsMenu.vue app/components/MessageViewport.vue tests/components/messageActionsMenu.test.ts tests/components/chatUi.test.ts
git commit -m "feat(pin): add pin/unpin action triggers in mobile menu and desktop toolbar"
```

---

### Task 6: Pinned Messages Banner & Jump-to-Message in `MessageViewport.vue` and `pages/index.vue`

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Computes `pinnedMessages`: `messages.filter(m => m.pinned_at && !m.deleted_at)`
- Banner renders pinned message preview, pin icon, cycle controls (if > 1), and unpin button
- Method: `scrollToMessage(messageId: string)`:
  - Locates DOM element with `data-message-id="messageId"`.
  - Scrolls into view with `{ behavior: 'smooth', block: 'center' }`.
  - Flashes visual highlight ring on the message bubble.

- [ ] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Add tests to `tests/components/chatUi.test.ts`:
```typescript
  it('MessageViewport renders pinned message banner when pinned messages exist', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-pin-banner',
            client_id: 'c-pin',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Important announcement for all',
            created_at: '2026-10-22T10:00:00Z',
            pinned_at: '2026-10-22T10:05:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const banner = wrapper.find('[data-test="pinned-messages-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Important announcement for all')
    expect(banner.text()).toContain('Bob')

    // Clicking banner triggers scroll/jump
    await banner.find('[data-test="jump-pinned-message"]').trigger('click')

    // Unpin button inside banner emits togglePin
    const unpinBtn = banner.find('[data-test="unpin-banner-btn"]')
    expect(unpinBtn.exists()).toBe(true)
    await unpinBtn.trigger('click')
    expect(wrapper.emitted('togglePin')?.[0]).toEqual(['m-pin-banner'])
  })

  it('MessageViewport does not show deleted messages in pinned banner', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-pin-deleted',
            client_id: 'c-pin-del',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Deleted note',
            created_at: '2026-10-22T10:00:00Z',
            pinned_at: '2026-10-22T10:05:00Z',
            deleted_at: '2026-10-22T10:10:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    expect(wrapper.find('[data-test="pinned-messages-banner"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL because `[data-test="pinned-messages-banner"]` is not implemented.

- [ ] **Step 3: Implement Pinned Messages Banner and jump-to-message in `MessageViewport.vue`**

1. In `<script setup>`:
   - Import `Pin`, `ChevronLeft`, `ChevronRight`, `X` from `@lucide/vue`.
   - `const activePinnedIndex = ref(0)`
   - `const highlightedMessageId = ref<string | null>(null)`
   - Computed `pinnedMessages = computed(() => props.messages.filter(m => Boolean(m.pinned_at) && !m.deleted_at).sort((a, b) => Date.parse(b.pinned_at!) - Date.parse(a.pinned_at!)))`
   - Computed `currentPinnedMessage = computed(() => pinnedMessages.value[activePinnedIndex.value] || pinnedMessages.value[0] || null)`
   - Function `jumpToPinnedMessage(messageId: string)`:
     ```typescript
     function jumpToPinnedMessage(messageId: string) {
       const el = document.getElementById(`msg-${messageId}`) || viewportRef.value?.querySelector(`[data-message-id="${messageId}"]`)
       if (el) {
         el.scrollIntoView({ behavior: 'smooth', block: 'center' })
         highlightedMessageId.value = messageId
         setTimeout(() => {
           if (highlightedMessageId.value === messageId) {
             highlightedMessageId.value = null
           }
         }, 2500)
       }
     }
     ```
2. In `<template>`:
   - Add `id="`msg-${item.message.id}`"` and `:data-message-id="item.message.id"` to the message row.
   - Bind dynamic focus ring `:class="highlightedMessageId === item.message.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''"`.
   - Add pinned banner docked at top of viewport:
     ```vue
     <div
       v-if="pinnedMessages.length > 0 && currentPinnedMessage"
       data-test="pinned-messages-banner"
       class="sticky top-0 z-20 mx-4 mt-2 px-3.5 py-2 rounded-2xl bg-white/80 dark:bg-[#1a1d28]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-lg flex items-center justify-between gap-3 text-xs"
     >
       <div
         data-test="jump-pinned-message"
         class="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
         @click="jumpToPinnedMessage(currentPinnedMessage.id)"
       >
         <div class="size-6 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
           <Pin class="size-3.5 fill-current" />
         </div>
         <div class="min-w-0 flex flex-col">
           <div class="flex items-center gap-1.5 font-semibold text-[var(--ap-text-primary)]">
             <span>Pinned Message</span>
             <span v-if="pinnedMessages.length > 1" class="text-[10px] text-[var(--ap-text-muted)] font-normal">
               ({{ activePinnedIndex + 1 }} of {{ pinnedMessages.length }})
             </span>
           </div>
           <p class="truncate text-[var(--ap-text-secondary)] text-[11.5px]">
             <span class="font-medium text-[var(--ap-text-primary)]">{{ currentPinnedMessage.author?.display_name || 'Friend' }}:</span>
             {{ isImagePayload(currentPinnedMessage.content) ? 'Shared photos' : currentPinnedMessage.content }}
           </p>
         </div>
       </div>

       <div class="flex items-center gap-1 shrink-0">
         <template v-if="pinnedMessages.length > 1">
           <button
             type="button"
             aria-label="Previous pinned message"
             class="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] cursor-pointer"
             @click.stop="activePinnedIndex = (activePinnedIndex - 1 + pinnedMessages.length) % pinnedMessages.length"
           >
             <ChevronLeft class="size-3.5" />
           </button>
           <button
             type="button"
             aria-label="Next pinned message"
             class="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] cursor-pointer"
             @click.stop="activePinnedIndex = (activePinnedIndex + 1) % pinnedMessages.length"
           >
             <ChevronRight class="size-3.5" />
           </button>
         </template>

         <button
           type="button"
           data-test="unpin-banner-btn"
           title="Unpin message"
           class="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-muted)] hover:text-rose-500 cursor-pointer transition-colors"
           @click.stop="emit('togglePin', currentPinnedMessage.id)"
         >
           <X class="size-3.5" />
         </button>
       </div>
     </div>
     ```

3. In `app/pages/index.vue`:
   - Bind `@toggle-pin="togglePinMessage"` on `<MessageViewport>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(pin): add pinned messages banner and jump-to-message viewport navigation"
```

---

### Task 7: Full Verification Gate

**Files:**
- Entire repository

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All test suites pass cleanly (`0` failures).

- [ ] **Step 2: Run production build check**

Run: `npm run build`
Expected: Clean build without TypeScript or bundling errors.

- [ ] **Step 3: Verification commit**

```bash
git status
```
Ensure working tree is clean.
