# End-to-End Encrypted Message Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt all outgoing and edited chat message content in the browser with AES-256-GCM derived from a single shared secret phrase, enforce the `e2ee:v1:` envelope in Postgres on new writes, keep legacy plaintext messages readable with a badge, and remember the derived key per tab in `sessionStorage`.

**Architecture:** Pure WebCrypto helpers in `app/utils/crypto.ts` handle NFKC phrase normalization, PBKDF2-SHA-256 key derivation, AES-256-GCM encryption/decryption with `channel_id` bound as AAD, and raw key import/export. `app/composables/useE2ee.ts` manages the key lifecycle against the operator-seeded `public.e2ee_config` singleton and `sessionStorage['nuxt-chat-e2ee-key']`. `app/composables/useChatRoom.ts` encrypts on every write path (`sendMessage`, `retryMessage`, `editMessage`) while keeping plaintext in `messagesStore`, and runs every read/realtime row through `decryptMessageRow` before state reconciliation or mention counting.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), WebCrypto API (`crypto.subtle`), Supabase (`@nuxtjs/supabase`), Tailwind CSS, Vitest + `@vue/test-utils` (`happy-dom`).

**Spec:** `docs/superpowers/specs/2026-10-19-e2ee-message-content-design.md`

## Global Constraints

- **Phrase Normalization:** Always normalize with `phrase.normalize('NFKC').trim()` before PBKDF2 derivation.
- **Crypto Parameters:** PBKDF2-SHA-256 with `600000` default iterations and 16-byte random salt; AES-256-GCM with 12-byte random IV and UTF-8 `channel_id` bytes as `additionalData` (AAD).
- **Envelope Format:** `e2ee:v1:<base64url-iv>:<base64url-ciphertext-and-tag>`. Verifier plaintext is `'nuxt-chat-e2ee-verifier:v1'` encrypted with AAD `'e2ee-config'`.
- **Storage Rules:** Never send the phrase or `CryptoKey` to Supabase or write it to `localStorage`/cookies. Store only the base64url raw key in `sessionStorage['nuxt-chat-e2ee-key']` and wipe it on sign-out or verifier mismatch.
- **Plaintext Store Invariant:** `messagesStore` holds decrypted plaintext (`1..4000` chars validated before encryption) so optimistic UI and `retryMessage(clientId)` idempotency work unchanged; Supabase receives only `e2ee:v1:...` envelopes (up to `24000` chars).
- **SSR / Vitest State Fallback:** `useE2ee.ts` must guard `typeof useState !== 'undefined'` with module-scoped `ref` fallbacks per `AGENTS.md` §4.5.

## Review Focus

1. **Cross-platform phrase copy-paste (Unicode NFD vs NFKC & whitespace):** Copying a phrase with decomposed accents (`"caf\u0065\u0301 secret phrase"`) or trailing newlines must derive the exact same key as `"caf\u00e9 secret phrase"` (tested in Task 1).
2. **Cross-channel ciphertext replay (AAD mismatch):** Moving a valid `e2ee:v1:...` envelope from `ch-1` into `ch-2` must fail AES-GCM authentication and classify the row as `encryption: 'undecryptable'` with `content: ''` (tested in Tasks 1 and 3).
3. **Stale `sessionStorage` key after operator phrase rotation:** If `sessionStorage['nuxt-chat-e2ee-key']` holds a key that fails to decrypt the current `e2ee_config.verifier`, `initializeE2ee()` must delete the `sessionStorage` entry and transition to `status = 'locked'` (tested in Task 2).
4. **Encrypted `@mention` and reply-preview hydration:** Incoming Realtime and unread-hydration rows must be decrypted via `decryptMessageRow` before `computeUnreadSnapshot` and `handleIncomingRealtimeMessage` run, so `@DisplayName` mentions in encrypted messages count toward `unreadMentions` while `undecryptable` messages never false-trigger mentions or leak ciphertext in reply quotes (tested in Task 3).
5. **Partial Realtime updates & undecryptable edit protection:** A Realtime `UPDATE` carrying only `deleted_at` (soft-delete) must not overwrite a message's content or misclassify its `encryption` state, and `MessageViewport.vue` must hide the Edit button on `undecryptable` messages (tested in Tasks 3 and 4).

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `app/types/chat.ts` | Modify | Add `MessageEncryptionState`, `E2eeConfig`, and optional `encryption` field on `ChatMessage` and `ReplyTarget` |
| `app/utils/crypto.ts` | Create | Pure WebCrypto helpers: phrase normalization, PBKDF2 derivation, AES-GCM encrypt/decrypt with AAD, base64url, key import/export, verifier creation/check |
| `scripts/generate-e2ee-config.mjs` | Create | Operator CLI script generating idempotent SQL to seed/reset `public.e2ee_config` |
| `app/composables/useE2ee.ts` | Create | Reactive E2EE session state (`loading`, `unconfigured`, `locked`, `unlocked`), `sessionStorage` restore + verifier re-check, unlock action, sign-out wipe |
| `app/composables/useAuthProfile.ts` | Modify | Clear E2EE session storage and in-memory key on `signOut()` |
| `app/composables/useMessagesState.ts` | Modify | Preserve `encryption` metadata across optimistic add, sent confirmation, incoming reconciliation, and updates (including `reply_to`) |
| `app/composables/useChatRoom.ts` | Modify | Add `decryptMessageRow` / `decryptMessageRows` on all read/realtime paths and `encryptContent` on `sendMessage`, `retryMessage`, and `editMessage` |
| `app/components/E2eeGate.vue` | Create | Passphrase unlock screen & unconfigured state notice |
| `app/components/MessageViewport.vue` | Modify | Render `Legacy · unencrypted` badge, `🔒 Unable to decrypt this message` placeholder (body + reply quote), and hide Edit on `undecryptable` rows |
| `app/pages/index.vue` | Modify | Gate chat initialization and workspace rendering behind `useE2ee()` unlock |
| `supabase/schema.sql` | Modify | Add `public.e2ee_config`, widen `messages_content_check` to `24000`, add `enforce_message_e2ee_envelope` trigger, revoke `anon` on `can_access_channel` |
| `nuxt.config.ts` | Modify | Disable Nuxt DevTools in production builds |
| `tests/utils/crypto.test.ts` | Create | Unit tests for WebCrypto primitives, AAD binding, normalization, and verifier helpers |
| `tests/composables/useE2ee.test.ts` | Create | Unit tests for `useE2ee` state transitions, `sessionStorage` persistence, and stale-key eviction |
| `tests/composables/useChatRoom.test.ts` | Modify | Unit tests for `decryptMessageRow`, encrypted unread/mention calculation, and encrypted write/retry payloads |
| `tests/components/chatUi.test.ts` | Modify | Component tests for `E2eeGate.vue` and `MessageViewport.vue` E2EE states |

---

### Task 1: WebCrypto Primitives, Domain Types & Operator Provisioning Script

**Files:**
- Modify: `app/types/chat.ts`
- Create: `app/utils/crypto.ts`
- Create: `scripts/generate-e2ee-config.mjs`
- Test: `tests/utils/crypto.test.ts`

**Interfaces:**
- Produces in `app/types/chat.ts`:
  - `export type MessageEncryptionState = 'e2ee' | 'legacy' | 'undecryptable'`
  - `export interface E2eeConfig { id: number; salt: string; iterations: number; verifier: string; created_at?: string }`
  - `ReplyTarget.encryption?: MessageEncryptionState`
  - `ChatMessage.encryption?: MessageEncryptionState`
- Produces in `app/utils/crypto.ts`:
  - `export const E2EE_ENVELOPE_PREFIX = 'e2ee:v1:'`
  - `export const E2EE_VERIFIER_PLAINTEXT = 'nuxt-chat-e2ee-verifier:v1'`
  - `export const E2EE_VERIFIER_AAD = 'e2ee-config'`
  - `export const DEFAULT_PBKDF2_ITERATIONS = 600_000`
  - `export const MIN_SECRET_PHRASE_LENGTH = 12`
  - `export function normalizeSecretPhrase(phrase: string): string`
  - `export function isEncryptedEnvelope(value: string | null | undefined): boolean`
  - `export function deriveKey(phrase: string, saltBase64Url: string, iterations?: number): Promise<CryptoKey>`
  - `export function encryptContent(key: CryptoKey, plaintext: string, channelId: string): Promise<string>`
  - `export function decryptContent(key: CryptoKey, envelope: string, channelId: string): Promise<string>`
  - `export function exportKeyRaw(key: CryptoKey): Promise<string>`
  - `export function importKeyRaw(rawBase64Url: string): Promise<CryptoKey>`
  - `export function createPhraseConfig(phrase: string, iterations?: number): Promise<{ salt: string; iterations: number; verifier: string }>`
  - `export function verifyKeyWithConfig(key: CryptoKey, config: Pick<E2eeConfig, 'verifier'>): Promise<boolean>`

- [ ] **Step 1: Write failing unit tests in `tests/utils/crypto.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  E2EE_ENVELOPE_PREFIX,
  normalizeSecretPhrase,
  isEncryptedEnvelope,
  deriveKey,
  encryptContent,
  decryptContent,
  exportKeyRaw,
  importKeyRaw,
  createPhraseConfig,
  verifyKeyWithConfig,
} from '~/utils/crypto'

const TEST_ITERATIONS = 1000

describe('E2EE WebCrypto utilities', () => {
  it('normalizes secret phrase with NFKC and trims outer whitespace', async () => {
    const nfd = '  caf\u0065\u0301 correct horse battery  \n'
    const nfc = 'caf\u00e9 correct horse battery'
    expect(normalizeSecretPhrase(nfd)).toBe(nfc)

    const cfg = await createPhraseConfig(nfd, TEST_ITERATIONS)
    const keyFromNfc = await deriveKey(nfc, cfg.salt, TEST_ITERATIONS)
    expect(await verifyKeyWithConfig(keyFromNfc, cfg)).toBe(true)
  })

  it('encrypts with unique random IVs and decrypts back to original UTF-8 text', async () => {
    const cfg = await createPhraseConfig('correct horse battery staple', TEST_ITERATIONS)
    const key = await deriveKey('correct horse battery staple', cfg.salt, TEST_ITERATIONS)

    const plaintext = 'Hello @Alice 👋 — secret launch at 21:00!'
    const env1 = await encryptContent(key, plaintext, 'ch-general')
    const env2 = await encryptContent(key, plaintext, 'ch-general')

    expect(env1.startsWith(E2EE_ENVELOPE_PREFIX)).toBe(true)
    expect(isEncryptedEnvelope(env1)).toBe(true)
    expect(env1).not.toBe(env2)
    expect(env1).not.toContain('secret launch')

    expect(await decryptContent(key, env1, 'ch-general')).toBe(plaintext)
    expect(await decryptContent(key, env2, 'ch-general')).toBe(plaintext)
  })

  it('rejects decryption when key is wrong or channelId AAD does not match', async () => {
    const cfg1 = await createPhraseConfig('first secret phrase 123', TEST_ITERATIONS)
    const key1 = await deriveKey('first secret phrase 123', cfg1.salt, TEST_ITERATIONS)
    const key2 = await deriveKey('second secret phrase 456', cfg1.salt, TEST_ITERATIONS)

    const env = await encryptContent(key1, 'Top secret DM', 'ch-dm-1')

    await expect(decryptContent(key2, env, 'ch-dm-1')).rejects.toThrow()
    await expect(decryptContent(key1, env, 'ch-other-channel')).rejects.toThrow()
  })

  it('exports and re-imports raw AES-GCM key for sessionStorage persistence', async () => {
    const cfg = await createPhraseConfig('session persistence phrase', TEST_ITERATIONS)
    const originalKey = await deriveKey('session persistence phrase', cfg.salt, TEST_ITERATIONS)
    const env = await encryptContent(originalKey, 'Persisted across reload', 'ch-1')

    const raw = await exportKeyRaw(originalKey)
    const restoredKey = await importKeyRaw(raw)

    expect(await verifyKeyWithConfig(restoredKey, cfg)).toBe(true)
    expect(await decryptContent(restoredKey, env, 'ch-1')).toBe('Persisted across reload')
  })

  it('detects valid e2ee:v1 envelopes vs legacy plaintext or malformed strings', () => {
    expect(isEncryptedEnvelope('Hello world')).toBe(false)
    expect(isEncryptedEnvelope('e2ee:v1:short:bad')).toBe(false)
    expect(isEncryptedEnvelope('e2ee:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/crypto.test.ts`
Expected: FAIL with module `~/utils/crypto` not found.

- [ ] **Step 3: Update `app/types/chat.ts` and implement `app/utils/crypto.ts` and `scripts/generate-e2ee-config.mjs`**

In `app/types/chat.ts`, add `MessageEncryptionState`, `E2eeConfig`, and `encryption?: MessageEncryptionState` on `ReplyTarget` and `ChatMessage`.
In `app/utils/crypto.ts`, implement the exported functions using `globalThis.crypto.subtle` (`PBKDF2` with `SHA-256`, `AES-GCM` with `extractable: true`, 12-byte IV, `additionalData: new TextEncoder().encode(channelId)`, and URL-safe base64 without `=` padding).
In `scripts/generate-e2ee-config.mjs`, read `process.argv[2]`, enforce `normalizeSecretPhrase(phrase).length >= 12`, derive salt + verifier with `600_000` iterations using `node:crypto` `webcrypto`, and print the SQL `INSERT INTO public.e2ee_config (id, salt, iterations, verifier) VALUES (1, ..., 600000, ...) ON CONFLICT (id) DO UPDATE SET salt = excluded.salt, iterations = excluded.iterations, verifier = excluded.verifier;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/crypto.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/crypto.ts scripts/generate-e2ee-config.mjs tests/utils/crypto.test.ts
git commit -m "feat(e2ee): add WebCrypto primitives and config generator script"
```

---

### Task 2: E2EE Key Session Composable (`useE2ee.ts`) & Sign-Out Wipe

**Files:**
- Create: `app/composables/useE2ee.ts`
- Modify: `app/composables/useAuthProfile.ts:185-189`
- Test: `tests/composables/useE2ee.test.ts`

**Interfaces:**
- Consumes from `app/utils/crypto.ts`: `MIN_SECRET_PHRASE_LENGTH`, `normalizeSecretPhrase`, `deriveKey`, `exportKeyRaw`, `importKeyRaw`, `verifyKeyWithConfig`
- Produces in `app/composables/useE2ee.ts`:
  - `export const E2EE_SESSION_STORAGE_KEY = 'nuxt-chat-e2ee-key'`
  - `export type E2eeStatus = 'loading' | 'unconfigured' | 'locked' | 'unlocked'`
  - `export function clearE2eeSession(): void`
  - `export function useE2ee(): { key: Ref<CryptoKey | null>; status: Ref<E2eeStatus>; error: Ref<string | null>; isUnlocking: Ref<boolean>; initializeE2ee: () => Promise<E2eeStatus>; unlockWithPhrase: (phrase: string) => Promise<boolean>; clearE2eeSession: () => void }`

- [ ] **Step 1: Write failing unit tests in `tests/composables/useE2ee.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPhraseConfig, deriveKey, exportKeyRaw } from '~/utils/crypto'
import { useE2ee, clearE2eeSession, E2EE_SESSION_STORAGE_KEY } from '~/composables/useE2ee'

const TEST_ITERATIONS = 1000
let mockConfigRow: any = null

vi.stubGlobal('useSupabaseClient', () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: mockConfigRow, error: null }),
        single: async () => ({ data: mockConfigRow, error: mockConfigRow ? null : { message: 'not found' } }),
      }),
    }),
  }),
}))

describe('useE2ee composable', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearE2eeSession()
    mockConfigRow = null
  })

  it('transitions to unconfigured when e2ee_config row is missing', async () => {
    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('unconfigured')
    expect(e2ee.key.value).toBeNull()
  })

  it('rejects wrong phrase and unlocks + persists to sessionStorage on correct phrase', async () => {
    const cfg = await createPhraseConfig('shared friend secret phrase', TEST_ITERATIONS)
    mockConfigRow = { id: 1, ...cfg }

    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('locked')

    const badOk = await e2ee.unlockWithPhrase('wrong secret phrase 000')
    expect(badOk).toBe(false)
    expect(e2ee.status.value).toBe('locked')
    expect(e2ee.error.value).toBe('Incorrect secret phrase.')

    const goodOk = await e2ee.unlockWithPhrase('shared friend secret phrase')
    expect(goodOk).toBe(true)
    expect(e2ee.status.value).toBe('unlocked')
    expect(e2ee.key.value).not.toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeTruthy()
  })

  it('restores valid key from sessionStorage and evicts stale key after phrase rotation', async () => {
    const oldCfg = await createPhraseConfig('old secret phrase 111', TEST_ITERATIONS)
    const newCfg = await createPhraseConfig('new secret phrase 222', TEST_ITERATIONS)
    const oldKey = await deriveKey('old secret phrase 111', oldCfg.salt, TEST_ITERATIONS)
    sessionStorage.setItem(E2EE_SESSION_STORAGE_KEY, await exportKeyRaw(oldKey))

    // Matching config -> auto-unlocks
    mockConfigRow = { id: 1, ...oldCfg }
    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('unlocked')

    // Operator rotated phrase -> stale sessionStorage key is evicted and status becomes locked
    mockConfigRow = { id: 1, ...newCfg }
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('locked')
    expect(e2ee.key.value).toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useE2ee.test.ts`
Expected: FAIL with module `~/composables/useE2ee` not found.

- [ ] **Step 3: Implement `app/composables/useE2ee.ts` and wire `clearE2eeSession()` into `app/composables/useAuthProfile.ts`**

In `app/composables/useE2ee.ts`, use module-scoped `ref` fallbacks when `typeof useState === 'undefined'` (per `AGENTS.md` §4.5), query `supabase.from('e2ee_config').select('*').eq('id', 1).maybeSingle()`, validate `sessionStorage['nuxt-chat-e2ee-key']` via `importKeyRaw` + `verifyKeyWithConfig`, and implement `unlockWithPhrase` + `clearE2eeSession`.
In `app/composables/useAuthProfile.ts`, call `clearE2eeSession()` inside `signOut()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useE2ee.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add app/composables/useE2ee.ts app/composables/useAuthProfile.ts tests/composables/useE2ee.test.ts
git commit -m "feat(e2ee): add useE2ee session composable and clear key on sign-out"
```

---

### Task 3: Chat Room Encrypt/Decrypt Boundaries (`useChatRoom.ts` & `useMessagesState.ts`)

**Files:**
- Modify: `app/composables/useMessagesState.ts:47-213`
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes from `app/utils/crypto.ts`: `isEncryptedEnvelope`, `encryptContent`, `decryptContent`
- Consumes from `app/composables/useE2ee.ts`: `useE2ee`
- Produces in `app/composables/useChatRoom.ts`:
  - `export async function decryptMessageRow<T extends { content?: string; channel_id?: string; reply_to?: ReplyTarget | null; encryption?: MessageEncryptionState }>(row: T, key: CryptoKey | null, fallbackChannelId?: string | null): Promise<T>`
  - `export async function decryptMessageRows<T extends { content?: string; channel_id?: string; reply_to?: ReplyTarget | null; encryption?: MessageEncryptionState }>(rows: T[], key: CryptoKey | null, fallbackChannelId?: string | null): Promise<T[]>`

- [ ] **Step 1: Write failing unit tests in `tests/composables/useChatRoom.test.ts`**

Append a new `describe('E2EE message row decryption and mention handling', ...)` block to `tests/composables/useChatRoom.test.ts`:

```ts
  describe('E2EE message row decryption and mention handling', () => {
    it('decryptMessageRow classifies e2ee, legacy, and undecryptable rows (including AAD mismatch and reply_to)', async () => {
      const cfg = await createPhraseConfig('chat room test phrase', 1000)
      const key = await deriveKey('chat room test phrase', cfg.salt, 1000)
      const cipher = await encryptContent(key, 'Hello @Alice!', 'ch-general')
      const parentCipher = await encryptContent(key, 'Quoted parent', 'ch-general')

      // Valid e2ee row + encrypted reply_to
      const okRow = await decryptMessageRow(
        {
          id: 'm-1',
          channel_id: 'ch-general',
          content: cipher,
          reply_to: { id: 'm-0', user_id: 'u-bob', content: parentCipher },
        },
        key,
      )
      expect(okRow.content).toBe('Hello @Alice!')
      expect(okRow.encryption).toBe('e2ee')
      expect(okRow.reply_to?.content).toBe('Quoted parent')
      expect(okRow.reply_to?.encryption).toBe('e2ee')

      // Legacy plaintext row
      const legacyRow = await decryptMessageRow(
        { id: 'm-2', channel_id: 'ch-general', content: 'Old unencrypted text' },
        key,
      )
      expect(legacyRow.content).toBe('Old unencrypted text')
      expect(legacyRow.encryption).toBe('legacy')

      // Cross-channel AAD mismatch -> undecryptable with empty content
      const replayedRow = await decryptMessageRow(
        { id: 'm-3', channel_id: 'ch-random', content: cipher },
        key,
      )
      expect(replayedRow.content).toBe('')
      expect(replayedRow.encryption).toBe('undecryptable')

      // Partial UPDATE row without content (e.g. soft-delete) leaves content undefined
      const softDeleteRow = await decryptMessageRow(
        { id: 'm-1', channel_id: 'ch-general', deleted_at: '2026-10-19T12:00:00Z' },
        key,
      )
      expect(softDeleteRow.content).toBeUndefined()
      expect(softDeleteRow.encryption).toBeUndefined()
    })

    it('counts @mentions on decrypted e2ee rows and never false-triggers on undecryptable rows', async () => {
      const cfg = await createPhraseConfig('unread mention phrase', 1000)
      const key = await deriveKey('unread mention phrase', cfg.salt, 1000)
      const mentionCipher = await encryptContent(key, 'Ping @Alice in encrypted channel', 'ch-random')

      const decryptedRows = await decryptMessageRows(
        [
          {
            id: 'm-enc-1',
            channel_id: 'ch-random',
            user_id: 'u-bob',
            content: mentionCipher,
            created_at: '2026-10-19T10:05:00Z',
          },
          {
            id: 'm-bad-1',
            channel_id: 'ch-random',
            user_id: 'u-bob',
            content: 'e2ee:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB',
            created_at: '2026-10-19T10:06:00Z',
          },
        ],
        key,
      )

      const snapshot = computeUnreadSnapshot({
        messages: decryptedRows as any,
        lastReadByChannel: { 'ch-random': '2026-10-19T10:00:00Z' },
        activeChannelId: 'ch-general',
        currentUserId: 'u-alice',
        currentDisplayName: 'Alice',
      })
      expect(snapshot.unreadCounts['ch-random']).toBe(2)
      expect(snapshot.unreadMentions['ch-random']).toBe(1)
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL with `decryptMessageRow is not a function`.

- [ ] **Step 3: Update `useMessagesState.ts` and `useChatRoom.ts` with E2EE decrypt/encrypt boundaries**

1. In `app/composables/useMessagesState.ts`:
   - In `addOptimisticMessage`, accept optional `encryption?: MessageEncryptionState` (defaulting to `'e2ee'`) and set it on `newMessage`.
   - In `markMessageSent` and `reconcileIncomingMessage`, copy `serverRow.encryption` if defined.
   - In `reconcileUpdatedMessage`, preserve or update `encryption` on both the target message and any matching `reply_to` reference.
2. In `app/composables/useChatRoom.ts`:
   - Export `decryptMessageRow` and `decryptMessageRows`:
     - If `typeof row.content !== 'string'`, return `row` unchanged (so partial soft-delete updates without `content` do not clobber existing state).
     - If `!row.content.startsWith('e2ee:v1:')`, set `encryption: 'legacy'`.
     - If `row.content.startsWith('e2ee:v1:')`, check `isEncryptedEnvelope(row.content)` and `key` and `channelId = row.channel_id || fallbackChannelId`; call `decryptContent(key, row.content, channelId)`. On success set `content: plaintext, encryption: 'e2ee'`; on error set `content: '', encryption: 'undecryptable'`.
     - If `row.reply_to && typeof row.reply_to.content === 'string'` and `row.reply_to.encryption === undefined`, decrypt `row.reply_to` with the same `channelId`.
   - Apply `decryptMessageRows` / `decryptMessageRow` in:
     - `loadChannelReadsAndUnreads` (before `computeUnreadSnapshot`)
     - `hydrateMessagesWithReactionsAndReplies` (decrypt `rows` first before building `knownById` and `reply_to` objects)
     - Realtime `messages` `INSERT` handler (decrypt `newRow` before `handleIncomingRealtimeMessage`)
     - Realtime `messages` `UPDATE` handler (make callback `async`, decrypt `payload.new` and `payload.old` with fallback `activeChannelId.value` before `handleRealtimeMessageUpdate`)
   - In `sendMessage`, `retryMessage`, and `editMessage`:
     - Require `e2ee.key.value` (if null in `sendMessage`, mark failed or return; in `editMessage`, return `{ error: 'Encryption key is locked.' }`).
     - Encrypt `content` via `await encryptContent(e2ee.key.value, plaintext, channelId)` for the Supabase `.insert(...)` / `.update(...)` payload while passing plaintext to `messagesStore`, and decrypt any row returned from `.select(...)` via `decryptMessageRow` before `markMessageSent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts tests/composables/useMessagesState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMessagesState.ts app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(e2ee): encrypt outgoing messages and decrypt all incoming/history rows"
```

---

### Task 4: E2EE Unlock Gate UI, Message Viewport Badges, Database Schema & Production Hardening

**Files:**
- Create: `app/components/E2eeGate.vue`
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/pages/index.vue`
- Modify: `supabase/schema.sql`
- Modify: `nuxt.config.ts`
- Modify: `AGENTS.md`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- `E2eeGate.vue` props & emits:
  - Props: `{ status: E2eeStatus; error?: string | null; isUnlocking?: boolean }`
  - Emits: `(e: 'unlock', phrase: string): void`, `(e: 'retryConfig'): void`, `(e: 'logout'): void`
- `MessageViewport.vue` E2EE selectors:
  - `[data-test="legacy-badge-<id>"]` with text `Legacy · unencrypted` when `item.message.encryption === 'legacy' && !item.message.deleted_at`
  - `[data-test="undecryptable-<id>"]` with text `🔒 Unable to decrypt this message` when `item.message.encryption === 'undecryptable' && !item.message.deleted_at`
  - Hide `[data-test="edit-<id>"]` when `item.message.encryption === 'undecryptable'`
  - Reply preview (`[data-test="reply-quote-<id>"]`) shows `🔒 Unable to decrypt this message` when `item.message.reply_to?.encryption === 'undecryptable'`

- [ ] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Append to `tests/components/chatUi.test.ts` (and import `E2eeGate` from `~/components/E2eeGate.vue`):

```ts
  it('E2eeGate renders locked passphrase form, emits unlock, and shows unconfigured state', async () => {
    const wrapper = mount(E2eeGate, {
      props: {
        status: 'locked',
        error: 'Incorrect secret phrase.',
        isUnlocking: false,
      },
    })

    expect(wrapper.text()).toContain('Incorrect secret phrase.')
    const input = wrapper.find('[data-test="e2ee-phrase-input"]')
    await input.setValue('my shared secret phrase')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('unlock')?.[0]).toEqual(['my shared secret phrase'])

    await wrapper.setProps({ status: 'unconfigured', error: null })
    expect(wrapper.text()).toContain('Encryption not configured')
    await wrapper.find('[data-test="e2ee-retry-config"]').trigger('click')
    expect(wrapper.emitted('retryConfig')).toBeTruthy()
  })

  it('MessageViewport renders legacy badge, undecryptable placeholder, and hides Edit on undecryptable messages', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'm-leg',
            client_id: 'c-leg',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Plaintext before E2EE',
            encryption: 'legacy',
            created_at: '2026-10-19T10:00:00Z',
            status: 'sent',
            author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
          },
          {
            id: 'm-bad',
            client_id: 'c-bad',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: '',
            encryption: 'undecryptable',
            created_at: '2026-10-19T10:10:00Z',
            status: 'sent',
            author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
            reply_to_id: 'm-parent-bad',
            reply_to: {
              id: 'm-parent-bad',
              user_id: 'u-2',
              content: '',
              encryption: 'undecryptable',
            },
          },
        ],
      },
    })

    expect(wrapper.find('[data-test="legacy-badge-m-leg"]').text()).toContain('Legacy · unencrypted')
    expect(wrapper.find('[data-test="edit-m-leg"]').exists()).toBe(true)

    expect(wrapper.find('[data-test="undecryptable-m-bad"]').text()).toContain('🔒 Unable to decrypt this message')
    expect(wrapper.find('[data-test="reply-quote-m-bad"]').text()).toContain('🔒 Unable to decrypt this message')
    expect(wrapper.find('[data-test="edit-m-bad"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL with `~/components/E2eeGate.vue` not found.

- [ ] **Step 3: Implement `E2eeGate.vue`, update `MessageViewport.vue`, `index.vue`, `supabase/schema.sql`, `nuxt.config.ts`, and `AGENTS.md`**

1. Create `app/components/E2eeGate.vue` using the existing Precision Studio dark/light CSS variables (`var(--fp-void)`, `var(--fp-stage)`, `var(--fp-border)`, `fp-btn-primary`) with:
   - `status === 'loading'`: spinner card (`Verifying encryption key...`).
   - `status === 'unconfigured'`: notice explaining that `public.e2ee_config` has not been seeded yet, with `[data-test="e2ee-retry-config"]` and sign-out buttons.
   - `status === 'locked'`: password input `[data-test="e2ee-phrase-input"]`, show/hide toggle, error alert, submit button (`Unlock Chat`), and sign-out button.
2. In `app/components/MessageViewport.vue` (both compact and full message rows):
   - Render `[data-test="undecryptable-${item.message.id}"]` (`🔒 Unable to decrypt this message`) when `item.message.encryption === 'undecryptable'`.
   - Render `[data-test="legacy-badge-${item.message.id}"]` (`Legacy · unencrypted`) when `item.message.encryption === 'legacy' && !item.message.deleted_at`.
   - Guard the Edit button with `v-if="item.message.encryption !== 'undecryptable'"`.
   - In the reply quote preview, render `'🔒 Unable to decrypt this message'` when `item.message.reply_to?.encryption === 'undecryptable'`.
3. In `app/pages/index.vue`:
   - Call `useE2ee()`. In `onMounted`, call `const status = await initializeE2ee()`; if `status === 'unlocked'`, call `await initializeChat()`.
   - When `handleUnlock(phrase)` succeeds (`await unlockWithPhrase(phrase)`), call `await initializeChat()`.
   - Render `<E2eeGate v-if="e2eeStatus !== 'unlocked'" ... />` instead of the chat stage until unlocked.
4. In `supabase/schema.sql`:
   - Widen `messages_content_check` to `char_length(trim(content)) > 0 and char_length(content) <= 24000`.
   - Add `public.e2ee_config` singleton table and `SELECT` RLS policy for `authenticated`.
   - Add `public.enforce_message_e2ee_envelope()` trigger function and `before insert or update on public.messages` trigger requiring `new.content like 'e2ee:v1:%'` on `INSERT` or when `new.content is distinct from old.content`.
   - Change `grant execute on function public.can_access_channel(uuid) to authenticated, anon;` to revoke from `anon` and grant only to `authenticated`.
5. In `nuxt.config.ts`:
   - Change `devtools: { enabled: true }` to `devtools: { enabled: process.env.NODE_ENV !== 'production' }`.
6. In `AGENTS.md`:
   - Document the E2EE invariant (`node scripts/generate-e2ee-config.mjs "<secret-phrase>"` for initial seed and reset runbook).

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npm test`
Expected: PASS across all test files (`tests/utils/chat.test.ts`, `tests/utils/crypto.test.ts`, `tests/composables/useE2ee.test.ts`, `tests/composables/useMessagesState.test.ts`, `tests/composables/useRealtimeStates.test.ts`, `tests/composables/useChatRoom.test.ts`, `tests/composables/useTheme.test.ts`, `tests/components/chatUi.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add app/components/E2eeGate.vue app/components/MessageViewport.vue app/pages/index.vue supabase/schema.sql nuxt.config.ts AGENTS.md tests/components/chatUi.test.ts
git commit -m "feat(e2ee): add E2eeGate UI, viewport badges, DB envelope trigger, and ops docs"
```
