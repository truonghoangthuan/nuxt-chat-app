# Seen Receipts, Confetti Setting, Passphrase Removal, Yahoo Buzz & Activity Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Messenger-style "Seen by who" read receipts, a confetti on/off toggle in user settings, transparent E2EE auto-unlock removing the passphrase gate, a Yahoo-style Buzz button with window shake and audio, and timeline attribution for conversation background and group name changes.

**Architecture:** Reuse the existing encrypted JSON-in-`messages.content` pattern (`SystemMessagePayload`) for Buzz and conversation activity events so all events satisfy the `e2ee:v1:` database trigger, sync over Realtime, and persist in history without extra database tables. Expand `public.conversation_reads` RLS and Realtime publication so peers in a conversation receive live `last_read_at` timestamps, computed into per-message reader lists via a pure helper (`computeSeenByMessageId`). Auto-derive the workspace AES-GCM-256 key in `useE2ee.ts` so `E2eeGate.vue` is removed from the entry flow.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Supabase (`@nuxtjs/supabase`), Tailwind CSS v4, Web Crypto API, Web Audio API, Vitest + `@vue/test-utils` (`happy-dom`).

**Spec:** `docs/superpowers/specs/2026-10-26-seen-confetti-nopassphrase-buzz-activity-design.md`

## Global Constraints

- Zero new npm dependencies (`package.json` unchanged).
- Preserve all existing `data-test` hooks, event emits, and keyboard shortcuts (`AGENTS.md` Invariant #9).
- All outgoing messages (including system activity and buzz payloads) remain encrypted with `e2ee:v1:` AES-GCM-256 envelopes (`AGENTS.md` Invariant #6).
- Bind semantic light/dark CSS tokens (`--ap-text-primary`, `--ap-text-secondary`, `--ap-text-muted`, `--ap-glass-border`) rather than hardcoded `text-white` inside adaptive containers (`AGENTS.md` Invariant #7).
- Celebration/buzz watchers in `app/pages/index.vue` must never fire on historical messages loaded during initial conversation open or pagination (`AGENTS.md` Invariant #26).

## Review Focus

- Historical buzz messages loaded when opening a conversation or paginating older messages must not shake the screen or play the buzz sound.
- `computeSeenByMessageId` must never show a user as having "seen" their own sent message if no other peer has read it, and must place each peer's avatar only on the single latest non-deleted message they have read (`created_at <= last_read_at`).
- When `confettiEnabled` is toggled off in `ProfileSettingsModal.vue`, neither outgoing messages nor incoming realtime messages may trigger `ConfettiOverlay`.
- System activity messages (`group_rename`, `background_change`, `background_reset`, `buzz`) must display formatted human-readable summaries in `ChatSidebar.vue` and `useNotification.ts` rather than raw JSON strings.
- Rapid clicks on `[data-test="buzz-button"]` must be blocked during the 5-second cooldown window.

---

### Task 1: Pure Helpers for Seen Receipts, System Activity Payloads & Confetti Preference (`app/types/chat.ts`, `app/utils/chat.ts`, `app/utils/confetti.ts`, `app/utils/sound.ts`)

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `app/utils/chat.ts`
- Modify: `app/utils/confetti.ts`
- Modify: `app/utils/sound.ts`
- Test: `tests/utils/chat.test.ts`
- Test: `tests/utils/confetti.test.ts`
- Test: `tests/utils/sound.test.ts`

**Interfaces:**
- Produces:
  - `SystemEventType` and `SystemMessagePayload` in `app/types/chat.ts`
  - `serializeSystemMessage(payload: SystemMessagePayload): string` in `app/utils/chat.ts`
  - `isSystemPayload(content?: string | null): boolean` in `app/utils/chat.ts`
  - `parseSystemPayload(content?: string | null): SystemMessagePayload | null` in `app/utils/chat.ts`
  - `formatSystemMessageText(payload: SystemMessagePayload): string` in `app/utils/chat.ts`
  - `computeSeenByMessageId(params: { messages: ChatMessage[]; readsByUser?: Record<string, string>; profiles: Profile[]; currentUserId?: string }): Record<string, Profile[]>` in `app/utils/chat.ts`
  - `STORAGE_KEY_CONFETTI`, `getConfettiEnabled(): boolean`, `setConfettiEnabled(enabled: boolean): void` in `app/utils/confetti.ts`
  - `playBuzzSound(customContext?: AudioContext | null): void` in `app/utils/sound.ts`

- [ ] **Step 1: Write the failing unit tests in `tests/utils/chat.test.ts`, `tests/utils/confetti.test.ts`, and `tests/utils/sound.test.ts`**

In `tests/utils/chat.test.ts`, add tests for `serializeSystemMessage`, `isSystemPayload`, `parseSystemPayload`, `formatSystemMessageText`, and `computeSeenByMessageId`:

```ts
  describe('SystemMessagePayload helpers & computeSeenByMessageId', () => {
    it('serializes, detects, parses, and formats system activity and buzz payloads', () => {
      const renameRaw = serializeSystemMessage({
        type: 'system',
        event: 'group_rename',
        actorName: 'Alice',
        detail: 'Weekend Trip',
      })
      expect(isSystemPayload(renameRaw)).toBe(true)
      expect(isSystemPayload('Hello world')).toBe(false)
      expect(formatSystemMessageText(parseSystemPayload(renameRaw)!)).toBe(
        'Alice changed the group name to "Weekend Trip"',
      )

      const bgRaw = serializeSystemMessage({
        type: 'system',
        event: 'background_change',
        actorName: 'Bob',
        detail: 'Aurora Borealis',
      })
      expect(formatSystemMessageText(parseSystemPayload(bgRaw)!)).toBe(
        'Bob changed the chat wallpaper to Aurora Borealis',
      )

      const resetRaw = serializeSystemMessage({
        type: 'system',
        event: 'background_reset',
        actorName: 'Bob',
      })
      expect(formatSystemMessageText(parseSystemPayload(resetRaw)!)).toBe(
        'Bob reset the chat wallpaper',
      )

      const buzzRaw = serializeSystemMessage({
        type: 'system',
        event: 'buzz',
        actorName: 'Charlie',
      })
      expect(formatSystemMessageText(parseSystemPayload(buzzRaw)!)).toBe(
        '⚡ Charlie buzzed the chat!',
      )
    })

    it('computes per-message seen-by profiles for the latest non-deleted message each peer has read', () => {
      const alice: Profile = { id: 'u-alice', email: 'a@b.c', display_name: 'Alice', avatar_color: '#0284c7' }
      const bob: Profile = { id: 'u-bob', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' }
      const charlie: Profile = { id: 'u-charlie', email: 'c@b.c', display_name: 'Charlie', avatar_color: '#059669' }

      const messages: ChatMessage[] = [
        {
          id: 'm-1',
          client_id: 'c-1',
          conversation_id: 'conv-1',
          user_id: 'u-alice',
          content: 'First message',
          created_at: '2026-10-26T10:00:00Z',
          status: 'sent',
        },
        {
          id: 'm-2',
          client_id: 'c-2',
          conversation_id: 'conv-1',
          user_id: 'u-alice',
          content: 'Second message',
          created_at: '2026-10-26T10:05:00Z',
          status: 'sent',
        },
      ]

      const seenMap = computeSeenByMessageId({
        messages,
        readsByUser: {
          'u-alice': '2026-10-26T10:06:00Z',
          'u-bob': '2026-10-26T10:02:00Z',
          'u-charlie': '2026-10-26T10:06:00Z',
        },
        profiles: [alice, bob, charlie],
        currentUserId: 'u-alice',
      })

      expect(seenMap['m-1']?.map(p => p.id)).toEqual(['u-bob'])
      expect(seenMap['m-2']?.map(p => p.id)).toEqual(['u-charlie'])
    })
  })
```

In `tests/utils/confetti.test.ts`, add a test verifying `getConfettiEnabled()` defaults to `true` and `setConfettiEnabled(false)` persists `'false'` to `localStorage[STORAGE_KEY_CONFETTI]`.
In `tests/utils/sound.test.ts`, add a test verifying `playBuzzSound(mockContext)` creates oscillators and gain nodes without throwing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/chat.test.ts tests/utils/confetti.test.ts tests/utils/sound.test.ts`  
Expected: FAIL with missing exports.

- [ ] **Step 3: Implement the types and pure helpers in `app/types/chat.ts`, `app/utils/chat.ts`, `app/utils/confetti.ts`, and `app/utils/sound.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/chat.test.ts tests/utils/confetti.test.ts tests/utils/sound.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts app/utils/confetti.ts app/utils/sound.ts tests/utils/chat.test.ts tests/utils/confetti.test.ts tests/utils/sound.test.ts
git commit -m "feat(utils): add seen-by calculator, system event payloads, confetti storage, and buzz sound"
```

---

### Task 2: Transparent E2EE Auto-Unlock Removing Passphrase Prompt (`app/composables/useE2ee.ts`, `supabase/schema.sql`, `tests/composables/useE2ee.test.ts`)

**Files:**
- Modify: `app/composables/useE2ee.ts`
- Modify: `supabase/schema.sql`
- Modify: `tests/composables/useE2ee.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_E2EE_PHRASE` and `DEFAULT_E2EE_CONFIG` in `app/composables/useE2ee.ts`
  - `initializeE2ee(): Promise<E2eeStatus>` auto-deriving the workspace `CryptoKey` and returning `'unlocked'` without requiring manual passphrase entry

- [ ] **Step 1: Update unit tests in `tests/composables/useE2ee.test.ts` for auto-unlock behavior**

```ts
  it('auto-unlocks transparently with default workspace key when initialized', async () => {
    const e2ee = useE2ee()
    const status = await e2ee.initializeE2ee()
    expect(status).toBe('unlocked')
    expect(e2ee.status.value).toBe('unlocked')
    expect(e2ee.key.value).not.toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeTruthy()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useE2ee.test.ts`  
Expected: FAIL (`status` is `'unconfigured'` or `'locked'` instead of `'unlocked'`).

- [ ] **Step 3: Implement transparent auto-unlock in `app/composables/useE2ee.ts` and update `supabase/schema.sql`**

1. In `app/composables/useE2ee.ts`, define `DEFAULT_E2EE_PHRASE = 'nuxt-chat-default-workspace-phrase-2026'` and fallback `DEFAULT_E2EE_CONFIG` (with low-latency PBKDF2 iterations when falling back in unconfigured/test environments, or `cfg.salt` + `cfg.iterations` from `public.e2ee_config`).
2. In `initializeE2ee()`, restore from `sessionStorage` if available; otherwise derive the key automatically, store it in `sessionStorage`, set `key.value = derivedKey`, set `status.value = 'unlocked'`, and return `'unlocked'`.
3. In `supabase/schema.sql`:
   - Update `public.conversation_reads` RLS policy to `using (public.can_access_conversation(conversation_id))` and add `'conversation_reads'` to the `supabase_realtime` publication.
   - Seed a default row in `public.e2ee_config` (`on conflict (id) do nothing`) so new deployments have a consistent config row out of the box.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useE2ee.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useE2ee.ts supabase/schema.sql tests/composables/useE2ee.test.ts
git commit -m "feat(e2ee): auto-unlock workspace key transparently without passphrase gate"
```

---

### Task 3: Orchestrate Read Receipts, Buzz & System Activity Messages in `useChatRoom.ts` and `useNotification.ts`

**Files:**
- Modify: `app/composables/useChatRoom.ts`
- Modify: `app/composables/useNotification.ts`
- Test: `tests/composables/useChatRoom.test.ts`
- Test: `tests/composables/useNotification.test.ts`

**Interfaces:**
- Consumes: `serializeSystemMessage`, `isSystemPayload`, `parseSystemPayload`, `formatSystemMessageText`, `CHAT_BACKGROUND_PRESETS` from `~/utils/chat`
- Produces:
  - `conversationReadsByConv: Ref<Record<string, Record<string, string>>>` and `activeConversationReads: ComputedRef<Record<string, string>>` in `useChatRoom()`
  - `sendBuzz(): Promise<void>` in `useChatRoom()`
  - Automatic system activity messages emitted on `updateGroupTitle`, `updateChatBackground`, and `removeChatBackground`
  - Human-readable notification snippets for system payloads in `useNotification.ts`

- [ ] **Step 1: Write failing unit tests in `tests/composables/useChatRoom.test.ts` and `tests/composables/useNotification.test.ts`**

Add tests verifying:
1. `sendBuzz()` inserts an encrypted system message with `event: 'buzz'`.
2. `updateGroupTitle()`, `updateChatBackground()`, and `removeChatBackground()` append corresponding encrypted system activity messages (`group_rename`, `background_change`, `background_reset`).
3. `loadConversationReadsAndUnreads()` and realtime `conversation_reads` `INSERT`/`UPDATE` events populate `conversationReadsByConv` for all conversation members.
4. `notifyIncomingMessage` formats system payloads via `formatSystemMessageText`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/composables/useChatRoom.test.ts tests/composables/useNotification.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `conversationReadsByConv`, `sendBuzz`, system activity messages in `app/composables/useChatRoom.ts`, and system snippet formatting in `app/composables/useNotification.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useChatRoom.test.ts tests/composables/useNotification.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts app/composables/useNotification.ts tests/composables/useChatRoom.test.ts tests/composables/useNotification.test.ts
git commit -m "feat(chat): wire realtime peer read receipts, sendBuzz, and activity system messages"
```

---

### Task 4: UI Components — Seen Badges, System Activity Pills, Buzz Button & Confetti Setting (`MessageViewport.vue`, `MessageComposer.vue`, `ProfileSettingsModal.vue`, `ChatSidebar.vue`)

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/components/MessageComposer.vue`
- Modify: `app/components/ProfileSettingsModal.vue`
- Modify: `app/components/ChatSidebar.vue`
- Modify: `app/assets/css/main.css`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `computeSeenByMessageId`, `isSystemPayload`, `parseSystemPayload`, `formatSystemMessageText` from `~/utils/chat`
- Produces:
  - `[data-test="seen-by-${item.message.id}"]` avatar badges in `MessageViewport.vue`
  - `[data-test="system-message-${item.message.id}"]` centered activity / buzz pills in `MessageViewport.vue`
  - `[data-test="buzz-button"]` with 5s cooldown emitting `buzz` in `MessageComposer.vue`
  - `[data-test="confetti-toggle"]` switch in `ProfileSettingsModal.vue`
  - Formatted system message preview snippet in `ChatSidebar.vue`

- [ ] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Add tests verifying:
1. `MessageViewport.vue` renders `[data-test="system-message-m-sys"]` with formatted text for `group_rename`, `background_change`, and `buzz` payloads.
2. `MessageViewport.vue` renders `[data-test="seen-by-m-1"]` with peer avatars when `readReceipts` and `members` are passed.
3. `MessageComposer.vue` renders `[data-test="buzz-button"]`, emits `buzz` on click, and disables the button during the 5s cooldown.
4. `ProfileSettingsModal.vue` renders `[data-test="confetti-toggle"]` and includes `confettiEnabled` in the `save` emit payload.

- [ ] **Step 2: Run component tests to verify failure**

Run: `npx vitest run tests/components/chatUi.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement UI updates in `MessageViewport.vue`, `MessageComposer.vue`, `ProfileSettingsModal.vue`, `ChatSidebar.vue`, and `app/assets/css/main.css`**

- [ ] **Step 4: Run component tests to verify pass**

Run: `npx vitest run tests/components/chatUi.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue app/components/MessageComposer.vue app/components/ProfileSettingsModal.vue app/components/ChatSidebar.vue app/assets/css/main.css tests/components/chatUi.test.ts
git commit -m "feat(ui): add seen-by badges, system event pills, buzz button, and confetti setting toggle"
```

---

### Task 5: Workspace Integration in `app/pages/index.vue` & Full Verification

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `activeConversationReads`, `sendBuzz` from `useChatRoom()`, `getConfettiEnabled`, `setConfettiEnabled` from `~/utils/confetti`, `playBuzzSound` from `~/utils/sound`, `isSystemPayload`, `parseSystemPayload` from `~/utils/chat`
- Produces:
  - Immediate workspace mount without `<E2eeGate>`
  - `confettiEnabled` state gating `triggerConfetti()` and persisted via `ProfileSettingsModal`
  - `isBuzzShaking` state + `playBuzzSound()` triggered on outgoing `@buzz` and incoming realtime `buzz` messages
  - `readReceipts` and `members` bound to `MessageViewport.vue`

- [ ] **Step 1: Update and add integration tests in `tests/components/indexPage.test.ts`**

Add/update tests in `tests/components/indexPage.test.ts` verifying:
1. Workspace mounts directly without `E2eeGate`.
2. When `confettiEnabled` is disabled via `ProfileSettingsModal`, sending a message does not mount `ConfettiOverlay`.
3. Emitting `buzz` from `MessageComposer` calls `sendBuzz()` and activates the buzz shake animation on `<main>`.
4. Incoming realtime `buzz` message activates the buzz shake animation, while historical `buzz` messages loaded during history fetch do not.

- [ ] **Step 2: Run `tests/components/indexPage.test.ts` to verify failure**

Run: `npx vitest run tests/components/indexPage.test.ts`  
Expected: FAIL

- [ ] **Step 3: Wire `app/pages/index.vue`**

- [ ] **Step 4: Run the full test suite (`npm test`)**

Run: `npm test`  
Expected: All test suites PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue tests/components/indexPage.test.ts
git commit -m "feat(workspace): integrate seen receipts, confetti preference, buzz shake, and auto-unlock"
```
