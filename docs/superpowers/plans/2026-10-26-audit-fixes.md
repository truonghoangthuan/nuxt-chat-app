# Audit Fixes (13 Findings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 13 findings from the repository quality audit across concurrency guards, database unread queries, optimistic rollbacks, light-mode theme tokens, UI edge cases, test coverage, and dead prototype cleanup.

**Architecture:** Apply surgical, minimal-diff fixes directly in `useChatRoom.ts`, Vue presentational components, and `supabase/schema.sql` while preserving all existing component `data-test` hooks and E2EE invariants. Every behavioral fix is paired with a targeted Vitest unit or component test.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Supabase (`@nuxtjs/supabase`), Tailwind CSS v4, Vitest + `@vue/test-utils` (`happy-dom`).

**Spec:** Conversation audit report (`/ponytail-audit` findings 1–13) and `AGENTS.md` architectural invariants.

## Global Constraints

- Preserve all `data-test` hooks, event emits, and keyboard shortcuts (`AGENTS.md` Invariant 9).
- Never hardcode `text-white/*` on elements inside adaptive containers (`--ap-stage`, `--ap-sidebar`, `--ap-canvas`) (`AGENTS.md` Invariant 7).
- All message content and attachment captions remain encrypted with `e2ee:v1:` AES-GCM-256 envelopes (`AGENTS.md` Invariant 6).
- Zero new runtime or dev dependencies (`package.json` unchanged).

## Review Focus

- Rapid conversation switching while `loadOlderMessages` or `fetchGapMessages` is awaiting decryption must discard stale results and never mutate `messagesStore`.
- Unread query in `loadConversationReadsAndUnreads` when a conversation has no `conversation_reads` row must not query from `1970-01-01` unbounded and must scope to known conversation IDs.
- Failed `editMessage`, `deleteMessage`, and `toggleReaction` calls must restore exact prior message content, timestamps, and reaction arrays in `messagesStore`.
- Concurrent `openOrCreateDirectChat(peerUserId)` calls for the same peer must return the same conversation promise without inserting duplicate conversations.
- Initial message history load in `index.vue` containing confetti keywords (`congratulations`, `rõ ràng`) must not fire confetti until a new message actually arrives or is sent.

---

### Task 1: Guard `loadOlderMessages` and `fetchGapMessages` Against Channel-Switch Races (Findings 1 & 2)

**Files:**
- Modify: `app/composables/useChatRoom.ts:1041-1083, 1556-1605`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `activeConversationId: Ref<string | null>`, `messagesStore.prependHistoryPage`, `messagesStore.mergeGapMessages`
- Produces: Race-safe `loadOlderMessages(): Promise<number>` and `fetchGapMessages(): Promise<void>`

- [ ] **Step 1: Write the failing test in `tests/composables/useChatRoom.test.ts`**

```ts
it('discards stale loadOlderMessages and fetchGapMessages results when activeConversationId changes in flight', async () => {
  // Switch activeConversationId while select query is pending; assert messagesStore remains empty for the new conversation
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL — old conversation messages are prepended/merged into the new conversation.

- [ ] **Step 3: Add `activeConversationId.value !== convId` guards in `app/composables/useChatRoom.ts`**

In `fetchGapMessages` (`app/composables/useChatRoom.ts:1075-1079`), check `if (activeConversationId.value !== convId) return` after awaiting the query and after awaiting `hydrateMessagesWithReactionsAndReplies(data)`.
In `loadOlderMessages` (`app/composables/useChatRoom.ts:1592-1600`), check `if (activeConversationId.value !== convId) return 0` after awaiting the query and after awaiting `hydrateMessagesWithReactionsAndReplies(chronological)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(chat): guard loadOlderMessages and fetchGapMessages against channel switch races"
```

---

### Task 2: Scope and Bound Unread Query in `loadConversationReadsAndUnreads` (Finding 3)

**Files:**
- Modify: `app/composables/useChatRoom.ts:646-709`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `conversations: Ref<Conversation[]>`, `authProfile.currentProfile`
- Produces: Scoped unread query bounded to accessible conversation IDs and 30-day fallback window (`UNREAD_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000`)

- [ ] **Step 1: Write the failing test in `tests/composables/useChatRoom.test.ts`**

```ts
it('loadConversationReadsAndUnreads scopes query to conversation IDs and clamps default read timestamp to 30-day window instead of 1970', async () => {
  // Verify .gt('created_at', oldestRead) does not use 1970-01-01 when user.created_at is absent, and filters by conversation_id
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL — `oldestRead` falls back to `'1970-01-01T00:00:00.000Z'` and query does not scope conversation IDs.

- [ ] **Step 3: Clamp default read timestamp and filter by conversation IDs in `app/composables/useChatRoom.ts:667-693`**

Replace `'1970-01-01T00:00:00.000Z'` fallback at line 667 with `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()`. Filter query with `.in('conversation_id', convIds)` when `typeof query.in === 'function'` and limit to `1000` when `typeof query.limit === 'function'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(chat): bound unread messages query lookback and scope to conversation IDs"
```

---

### Task 3: Roll Back Optimistic State on Failed `editMessage`, `deleteMessage`, and `toggleReaction` (Finding 5)

**Files:**
- Modify: `app/composables/useChatRoom.ts:2436-2483, 2528-2567, 2569-2612`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `messagesStore.reconcileUpdatedMessage`, `messagesStore.applyReactionAdded`, `messagesStore.applyReactionRemoved`
- Produces: Automatic state rollback in `editMessage`, `deleteMessage`, and `toggleReaction` when Supabase returns an error or throws

- [ ] **Step 1: Write the failing tests in `tests/composables/useChatRoom.test.ts`**

```ts
it('rolls back optimistic editMessage, deleteMessage, and toggleReaction when database mutation fails', async () => {
  // Trigger editMessage, deleteMessage, and toggleReaction with failing Supabase update/insert/delete; assert messages.value reverts to original state
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL — optimistic mutations remain in `messages.value` after error.

- [ ] **Step 3: Implement state rollback in `editMessage`, `deleteMessage`, and `toggleReaction` in `app/composables/useChatRoom.ts`**

- In `editMessage`: save `prevContent = targetMsg?.content`, `prevEditedAt = targetMsg?.edited_at ?? null`, `prevEncryption = targetMsg?.encryption`; call `messagesStore.reconcileUpdatedMessage({ id: messageId, content: prevContent, edited_at: prevEditedAt, encryption: prevEncryption })` when `error` is truthy or in `catch`.
- In `deleteMessage`: save `prevDeletedAt = targetMsg?.deleted_at ?? null`; call `messagesStore.reconcileUpdatedMessage({ id: messageId, deleted_at: prevDeletedAt })` when `error` is truthy.
- In `toggleReaction`: if `alreadyReacted` and `.delete()` fails, re-add `existingReaction` via `messagesStore.applyReactionAdded`; if not `alreadyReacted` and `.insert()` fails, remove `optimisticReaction` via `messagesStore.applyReactionRemoved`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(chat): roll back optimistic edits, deletes, and reactions on server error"
```

---

### Task 4: Deduplicate Concurrent `openOrCreateDirectChat` Calls and Add Atomic RPC (Finding 8)

**Files:**
- Modify: `supabase/schema.sql:264-266`
- Modify: `app/composables/useChatRoom.ts:540-544, 1607-1724`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `conversations: Ref<Conversation[]>`, `supabase.from('conversation_members')`
- Produces: In-flight deduplicated `openOrCreateDirectChat(peerUserId: string): Promise<Conversation>` and SQL function `public.get_or_create_direct_conversation(target_user_id uuid)`

- [ ] **Step 1: Write the failing test in `tests/composables/useChatRoom.test.ts`**

```ts
it('deduplicates concurrent openOrCreateDirectChat calls for the same peerUserId', async () => {
  const [c1, c2] = await Promise.all([
    room.openOrCreateDirectChat('u-bob'),
    room.openOrCreateDirectChat('u-bob'),
  ])
  expect(c1.id).toBe(c2.id)
  expect(mockConversationsDb.filter(c => c.type === 'direct')).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL — two direct conversations are inserted into `mockConversationsDb`.

- [ ] **Step 3: Add `inFlightDirectChats` map in `app/composables/useChatRoom.ts` and atomic RPC in `supabase/schema.sql`**

- In `useChatRoom.ts`: maintain `const inFlightDirectChats = new Map<string, Promise<Conversation>>()`. Wrap the body of `openOrCreateDirectChat(peerUserId)` so concurrent calls for `peerUserId` share the in-flight promise and clean up in `finally`. Also verify `existingMemberships` only matches conversations where `current.id` is a member or accessible.
- In `supabase/schema.sql`: define `public.get_or_create_direct_conversation(target_user_id uuid) returns uuid` using `pg_advisory_xact_lock(hashtext(least(auth.uid()::text, target_user_id::text) || ':' || greatest(auth.uid()::text, target_user_id::text)))` to prevent cross-user race conditions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(chat): deduplicate concurrent direct chat creation and add atomic SQL RPC"
```

---

### Task 5: Fix Light-Mode Contrast Tokens in `login.vue` and `E2eeGate.vue` (Finding 4)

**Files:**
- Modify: `app/pages/login.vue:68-164`
- Modify: `app/components/E2eeGate.vue:48-164`
- Test: `tests/components/login.test.ts`, `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: CSS variables `--ap-text-primary`, `--ap-text-secondary`, `--ap-text-muted`, `--ap-glass`, `--ap-glass-border`
- Produces: High-contrast light/dark adaptive `login.vue` and `E2eeGate.vue`

- [ ] **Step 1: Write the failing tests in `tests/components/login.test.ts` and `tests/components/chatUi.test.ts`**

```ts
// In tests/components/login.test.ts:
it('uses semantic theme tokens instead of hardcoded white text on adaptive stage surfaces', () => {
  const wrapper = mount(LoginPage)
  const heading = wrapper.find('h2')
  expect(heading.classes()).not.toContain('text-white/95')
  expect(heading.classes()).toContain('text-[var(--ap-text-primary)]')
})

// In tests/components/chatUi.test.ts:
it('E2eeGate binds semantic text tokens for light and dark mode contrast', () => {
  const wrapper = mount(E2eeGate, { props: { status: 'locked' } })
  expect(wrapper.find('h1').classes()).toContain('text-[var(--ap-text-primary)]')
  expect(wrapper.find('[data-test="e2ee-phrase-input"]').classes()).toContain('text-[var(--ap-text-primary)]')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/login.test.ts tests/components/chatUi.test.ts`
Expected: FAIL — `text-white/95` and `text-white` are still hardcoded.

- [ ] **Step 3: Replace hardcoded `text-white/*` and `bg-white/*` with semantic tokens in `app/pages/login.vue` and `app/components/E2eeGate.vue`**

In both files, replace `text-white/95` and `text-white` on headings/inputs with `text-[var(--ap-text-primary)]`, `text-white/70` and `text-white/60` with `text-[var(--ap-text-secondary)]`, `text-white/40` and `placeholder-white/40` with `text-[var(--ap-text-muted)]` / `placeholder-[var(--ap-text-muted)]`, and `border-white/10 bg-white/8` / `bg-white/5` with `border-[var(--ap-glass-border)] bg-[var(--ap-glass)]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/login.test.ts tests/components/chatUi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/pages/login.vue app/components/E2eeGate.vue tests/components/login.test.ts tests/components/chatUi.test.ts
git commit -m "fix(ui): use adaptive theme tokens in login page and E2EE gate for light mode"
```

---

### Task 6: Format Image Payloads in `ChatSidebar.vue` Subtitles and Add Escape Handler in `UserProfileModal.vue` (Findings 6 & 12)

**Files:**
- Modify: `app/components/ChatSidebar.vue:129-156`
- Modify: `app/components/UserProfileModal.vue:1-53`
- Test: `tests/components/chatUi.test.ts`, `tests/components/UserProfileModal.test.ts`

**Interfaces:**
- Consumes: `isImagePayload`, `parseImagePayload`, `formatImageMessageSummary` from `~/utils/image`
- Produces: Human-readable photo summary in `ChatSidebar.vue` subtitles and Escape-key dismissal in `UserProfileModal.vue`

- [ ] **Step 1: Write the failing tests in `tests/components/chatUi.test.ts` and `tests/components/UserProfileModal.test.ts`**

```ts
// In tests/components/chatUi.test.ts:
it('ChatSidebar formats image payload lastMessage as photo summary instead of raw JSON', () => {
  // Mount ChatSidebar with lastMessage.content = JSON.stringify({ type: 'images', images: [{ path: 'a', mimeType: 'image/jpeg', width: 10, height: 10, size: 100 }], caption: 'Sunset' })
  // Expect wrapper.text() to contain '📷 1 photo: Sunset' and not '{"type":"images"'
})

// In tests/components/UserProfileModal.test.ts:
it('emits close when Escape key is pressed while open', async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(wrapper.emitted('close')).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/chatUi.test.ts tests/components/UserProfileModal.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `ChatSidebar.vue` and `UserProfileModal.vue`**

- In `app/components/ChatSidebar.vue`: import `isImagePayload`, `parseImagePayload`, `formatImageMessageSummary` from `~/utils/image`. In `getConvSubtitle(conv)`, format image payloads via `formatImageMessageSummary(parsed?.images.length || 1, parsed?.caption)` before prepending group sender name.
- In `app/components/UserProfileModal.vue`: watch `() => props.isOpen` (with `{ immediate: true }`) to register/remove `window` `keydown` listener for `Escape` that emits `'close'`, and clean up in `onUnmounted`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/chatUi.test.ts tests/components/UserProfileModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/ChatSidebar.vue app/components/UserProfileModal.vue tests/components/chatUi.test.ts tests/components/UserProfileModal.test.ts
git commit -m "fix(ui): format image subtitles in sidebar and close profile modal on Escape"
```

---

### Task 7: Fix Historical Confetti Trigger, Service Worker Listener Leak, and Group Member Error Handling in `index.vue` (Findings 7, 9, 10)

**Files:**
- Modify: `app/pages/index.vue:223-233, 318-343, 367-386`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `shouldTriggerConfetti`, `addMemberToGroup`, `leaveGroup`, `addNotificationToast`
- Produces: Leak-free service worker message listener, non-historical confetti watcher, and error-handled `handleAddMember` / `handleLeaveGroup`

- [ ] **Step 1: Write the failing tests in `tests/components/indexPage.test.ts`**

```ts
it('does not trigger confetti on initial history load or conversation switch when existing last message has confetti keyword', async () => {
  mockChatRoomState.messages.value = [{
    id: 'm-old-1', client_id: 'c-old-1', conversation_id: 'conv-1', user_id: 'u-other',
    content: 'congratulations on yesterday!', created_at: '2026-10-20T10:00:00Z', status: 'sent',
  } as any]
  const wrapper = mount(IndexPage)
  await flushPromises()
  expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)
})

it('catches errors in handleAddMember and handleLeaveGroup and shows notification toast', async () => {
  mockChatRoomState.addMemberToGroup.mockRejectedValueOnce(new Error('User not found'))
  // Emit addMember from GroupInfoModal; assert addNotificationToast called with error message
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/indexPage.test.ts`
Expected: FAIL — confetti triggers on initial mount with historical message, and `handleAddMember` rejects unhandled.

- [ ] **Step 3: Implement fixes in `app/pages/index.vue`**

- Confetti watcher (`app/pages/index.vue:318-343`): track `let confettiReadyConvId: string | null = null`. When `activeConversationId.value` changes or on first non-empty snapshot for that conversation when `prevConfettiMessageId === null` and `newMessages[newMessages.length - 1]` was already present at conversation open, record `prevConfettiMessageId = newestId` without firing `triggerConfetti()`; only fire `triggerConfetti()` when `newestId` changes after initial snapshot (including from empty `[]` to `[newMsg]` on active conversation).
- Service worker listener (`app/pages/index.vue:367-386`): extract `function handleServiceWorkerMessage(event: MessageEvent)` and remove it via `navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)` in `onUnmounted`.
- Group actions (`app/pages/index.vue:223-233`): wrap `addMemberToGroup` and `leaveGroup` in `try / catch (err: any)` and invoke `addNotificationToast?.({ title: 'Group action failed', body: err?.message || 'Operation failed' })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/indexPage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue tests/components/indexPage.test.ts
git commit -m "fix(workspace): prevent historical confetti, clean up SW listener, and catch group errors"
```

---

### Task 8: Add Unit Test for `scripts/generate-e2ee-config.mjs` and Remove Obsolete Design Prototypes (Findings 11 & 13)

**Files:**
- Modify: `scripts/generate-e2ee-config.mjs:77-103`
- Create: `tests/utils/generateE2eeConfig.test.ts`
- Delete: `design-demos/`, `direction-approved.md`

**Interfaces:**
- Consumes: `verifyKeyWithConfig`, `deriveKey` from `~/utils/crypto`
- Produces: Exported `generateE2eeSeed(phrase: string, iterations?: number)` in `scripts/generate-e2ee-config.mjs` verified by Vitest

- [ ] **Step 1: Write the failing test in `tests/utils/generateE2eeConfig.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { generateE2eeSeed } from '../../scripts/generate-e2ee-config.mjs'
import { deriveKey, verifyKeyWithConfig } from '~/utils/crypto'

describe('generate-e2ee-config CLI seed generator', () => {
  it('generates salt, verifier, and SQL compatible with browser WebCrypto verification', async () => {
    const seed = await generateE2eeSeed('correct horse battery staple', 1000)
    expect(seed.sql).toContain('INSERT INTO public.e2ee_config')
    const browserKey = await deriveKey('correct horse battery staple', seed.salt, 1000)
    expect(await verifyKeyWithConfig(browserKey, { verifier: seed.verifier })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/generateE2eeConfig.test.ts`
Expected: FAIL — `generateE2eeSeed` is not exported.

- [ ] **Step 3: Export `generateE2eeSeed` in `scripts/generate-e2ee-config.mjs` and delete `design-demos/` and `direction-approved.md`**

In `scripts/generate-e2ee-config.mjs`, extract `export async function generateE2eeSeed(phrase, iterations = DEFAULT_PBKDF2_ITERATIONS)` returning `{ salt, iterations, verifier, sql }` and call it from `main()`. Remove `design-demos/` and `direction-approved.md`.

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npm test`
Expected: PASS (all 27 test files green)

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-e2ee-config.mjs tests/utils/generateE2eeConfig.test.ts design-demos direction-approved.md
git commit -m "chore: test E2EE config generator and remove obsolete design prototypes"
```
