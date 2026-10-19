# End-to-End Encrypted Message Content — Design

Date: 2026-10-19
Status: Ready for review

## 1. Intent & Why

Today every message travels and rests as plaintext: the browser talks directly to Supabase (PostgREST + Realtime websocket), so message bodies are visible in DevTools Network/WS frames, HAR exports, corporate TLS-inspection proxy logs, Supabase logs, and the `public.messages` table.

The user does not want an **administrator** (e.g. company IT with access to network/proxy/browser logs, or Supabase/DB operator) to read message content. The fix is client-side end-to-end encryption (E2EE) of message content using one shared secret phrase that friends exchange outside the app.

## 2. Threat Model

| Actor | Protected? |
| --- | --- |
| Network / TLS-inspecting proxy / HAR / Network & WS tab captures | **Yes** — only ciphertext on the wire |
| Supabase operator, DB admin, DB backups, Supabase logs | **Yes** — only ciphertext at rest |
| Admin with endpoint monitoring capturing screen / DOM / process memory while chat is open | **No** — browser must decrypt to display; impossible to prevent in a web app |
| Someone with physical access to an unlocked session ("stolen computer") | **Out of scope** (explicit user decision) |
| Friend who knows the phrase | Can read everything (accepted) |

## 3. Goals, Non-Goals, Anti-Goals

**Goals**
- Encrypt `messages.content` in the browser before insert/update; decrypt only after receipt.
- Enforce at the database layer that all newly inserted or edited `messages.content` rows use the encrypted envelope format (`e2ee:v1:%`), while keeping existing legacy rows intact.
- One secret phrase for the whole app (all public channels and DMs), provisioned by the operator via a local CLI script / SQL seed.
- Verify the phrase on unlock against `public.e2ee_config` so a mistyped phrase is rejected before entering the chat.
- Remember the derived key for the browser tab session (`sessionStorage`) so reloads don't re-prompt.
- Keep existing plaintext messages readable, marked as "legacy, unencrypted".
- Keep all existing invariants in `AGENTS.md` (optimistic UI, `client_id` idempotency, channel isolation, ordering, cursors).

**Non-Goals**
- Encrypting metadata: reactions/emoji, display names, avatars, channel slugs/descriptions, typing indicator, presence, timestamps, who-talks-to-whom.
- Per-channel or per-user keys, key rotation, member revocation.
- Re-encrypting or deleting legacy plaintext messages in bulk.
- Stolen/unlocked-computer protection (idle lock, session hardening).

**Anti-Goals (failure even if it "works")**
- "Encoding" (base64/obfuscation) instead of real authenticated encryption.
- The phrase or key ever sent to Supabase, logged, or written to `localStorage`/cookies.
- Plaintext content appearing in any outgoing request or Realtime payload, or accepted by the database on new inserts/content edits.
- Silent failures: undecryptable messages rendered as raw ciphertext, or wrong-phrase users allowed into the chat.

## 4. Decided Design (user decisions)

1. **Real E2EE** via WebCrypto (`AES-256-GCM` + `PBKDF2-SHA-256`), not encoding.
2. **Single shared secret phrase** for the entire app, distributed out-of-band.
3. **Operator-seeded phrase config**: the operator runs a local provisioning script to generate the salt + verifier SQL (or upserts it); the web app only shows an **Unlock** screen (`SELECT`-only RLS on `e2ee_config`).
4. **DB-enforced envelope check**: a Postgres trigger rejects any `INSERT` or content-changing `UPDATE` on `public.messages` whose `content` does not match `e2ee:v1:%`. Soft-deletes (`deleted_at` update with unchanged `content`) and existing legacy rows remain valid.
5. **Legacy plaintext messages stay readable**, shown with a "Legacy · unencrypted" label. Editing a legacy message encrypts the updated content (`legacy` → `e2ee`). Editing an `undecryptable` message is disabled in the UI.
6. **Remember key per tab** in `sessionStorage` (and re-verify against `e2ee_config` on restore; if verification fails, clear and prompt).
7. **Encrypt message text only** (incl. edits and reply previews); metadata stays plaintext.

## 5. Technical Design

### 5.1 Crypto primitives (`app/utils/crypto.ts`, pure, unit-tested)
- **Phrase normalization (builder call):** `phrase.normalize('NFKC').trim()` before key derivation so copy-paste whitespace or Unicode composition differences across OSes don't produce different keys.
- **KDF:** PBKDF2-SHA-256, 600,000 iterations, 16-byte random salt → 256-bit AES-GCM `CryptoKey`.
- **Cipher:** AES-256-GCM, fresh 12-byte random IV per encryption (`crypto.getRandomValues`).
- **AAD:** UTF-8 bytes of `channel_id` — binds ciphertext to its channel so a row's content cannot be moved across channels and still decrypt.
- **Envelope format** in `messages.content`: `e2ee:v1:<base64url iv>:<base64url ciphertext+tag>`.
- **Detection:** `isEncryptedEnvelope(s)` checks `^e2ee:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22,}$`. Anything not starting with `e2ee:v1:` is treated as legacy plaintext; malformed `e2ee:v1:` strings are treated as `undecryptable`.
- Exports:
  - `deriveKey(phrase: string, saltBase64Url: string, iterations?: number): Promise<CryptoKey>`
  - `encryptContent(key: CryptoKey, plaintext: string, channelId: string): Promise<string>`
  - `decryptContent(key: CryptoKey, envelope: string, channelId: string): Promise<string>`
  - `isEncryptedEnvelope(value: string): boolean`
  - `exportKeyRaw(key: CryptoKey): Promise<string>` / `importKeyRaw(rawBase64Url: string): Promise<CryptoKey>`
  - `createPhraseConfig(phrase: string, iterations?: number): Promise<{ salt: string; iterations: number; verifier: string }>`

### 5.2 Shared salt + verifier (`public.e2ee_config`, new table)
```sql
create table if not exists public.e2ee_config (
  id smallint primary key default 1 check (id = 1),
  salt text not null,
  iterations integer not null check (iterations >= 100000),
  verifier text not null,
  created_at timestamptz not null default now()
);

alter table public.e2ee_config enable row level security;

create policy "Authenticated users can view e2ee config"
  on public.e2ee_config for select
  to authenticated
  using (true);
```
- `verifier` is `encryptContent(key, 'nuxt-chat-e2ee-verifier:v1', 'e2ee-config')`.
- **Operator seeding & reset runbook:**
  - Provide a local script `scripts/generate-e2ee-config.mjs "<secret-phrase>"` (using Node's built-in `node:crypto` `webcrypto`) that validates minimum phrase length (12 chars) and prints the idempotent SQL `INSERT INTO public.e2ee_config (id, salt, iterations, verifier) VALUES (...) ON CONFLICT (id) DO UPDATE ...` to paste into the Supabase SQL Editor.
  - **Reset procedure (documented in `README.md` / `AGENTS.md`):** Run `scripts/generate-e2ee-config.mjs "<new-phrase>"` and execute the upserted SQL in Supabase. All previously encrypted messages with the old key will safely render as `🔒 Unable to decrypt this message`.
- If `e2ee_config` has no row yet when a user opens the app, `E2eeGate.vue` displays an "Encryption not configured by administrator yet" state with a Retry button.

### 5.3 Key lifecycle (`app/composables/useE2ee.ts`)
- State:
  - `key: Ref<CryptoKey | null>`
  - `status: Ref<'loading' | 'unconfigured' | 'locked' | 'unlocked'>`
  - `error: Ref<string | null>`
- SSR/Vitest-safe state per `AGENTS.md` §4.5 (`typeof useState !== 'undefined'` guard with module-scoped `ref` fallback).
- `initializeE2ee()`:
  1. Fetch singleton row from `public.e2ee_config`. If missing → `status = 'unconfigured'`.
  2. Check `sessionStorage['nuxt-chat-e2ee-key']`. If present, import raw key and verify against `config.verifier` (AAD `'e2ee-config'`). If valid → `key = importedKey`, `status = 'unlocked'`. If invalid → remove stale `sessionStorage` entry and set `status = 'locked'`.
- `unlockWithPhrase(phrase: string)`:
  1. Derive key from `phrase`, `config.salt`, `config.iterations`.
  2. Attempt `decryptContent(key, config.verifier, 'e2ee-config')` and verify plaintext equals `'nuxt-chat-e2ee-verifier:v1'`.
  3. On failure → `error = 'Incorrect secret phrase.'`, keep `status = 'locked'`.
  4. On success → export raw key to `sessionStorage['nuxt-chat-e2ee-key']`, set `key`, set `status = 'unlocked'`, clear `error`.
- `clearE2eeSession()`: remove `sessionStorage['nuxt-chat-e2ee-key']`, set `key = null`, `status = 'locked'`. Called automatically on `useAuthProfile().signOut()`.

### 5.4 Encrypt / decrypt boundaries (`useChatRoom.ts`)
- Pure helper `decryptMessageRow(row, key)`:
  - If `row.content` does not start with `e2ee:v1:` → returns `{ ...row, encryption: 'legacy' }`.
  - If `row.content` starts with `e2ee:v1:`:
    - If `key` is present and `decryptContent(key, row.content, row.channel_id)` succeeds → returns `{ ...row, content: plaintext, encryption: 'e2ee' }`.
    - Otherwise → returns `{ ...row, content: '', encryption: 'undecryptable' }`.
  - Also normalizes `row.reply_to` if present.
- Every read path in `useChatRoom.ts` passes fetched/realtime rows through `decryptMessageRow` before touching `messagesStore` or `computeUnreadSnapshot`:
  - `selectChannel`, `loadOlderMessages`, `fetchGapMessages`
  - Realtime `messages` `INSERT` and `UPDATE` handlers
  - `sendMessage` / `retryMessage` returned row and duplicate-key fallback `SELECT`
  - `loadChannelReadsAndUnreads` (so `@mention` detection runs on decrypted plaintext and ignores `undecryptable` rows)
- Every write path (`sendMessage`, `retryMessage`, `editMessage`):
  - Validates plaintext length (`1..4000`) via `isValidMessageContent(plaintext)`.
  - Keeps **plaintext** inside `messagesStore` (optimistic row `status: 'sending'` and `encryption: 'e2ee'`).
  - Encrypts `content` via `encryptContent(key, plaintext, channelId)` right before calling `supabase.from('messages').insert(...)` or `.update(...)`.
  - On `retryMessage(clientId)`, reuses the existing `client_id` and encrypts `retrying.content` with a fresh IV.

### 5.5 Message model & UI rules
- Extend `ChatMessage` and `ReplyTarget` in `app/types/chat.ts` with `encryption?: 'e2ee' | 'legacy' | 'undecryptable'`.
- In `MessageViewport.vue`:
  - `encryption === 'legacy'`: render message content normally plus a subtle pill badge `Legacy · unencrypted`.
  - `encryption === 'undecryptable'`: render an italic muted placeholder `🔒 Unable to decrypt this message` and hide the **Edit** action button on that message. (Reply previews pointing to an undecryptable parent also render `🔒 Unable to decrypt this message`.)
- New component `app/components/E2eeGate.vue` rendered in `app/pages/index.vue`:
  - Blocks chat workspace mounting/initialization until `e2ee.status.value === 'unlocked'`.
  - Shows passphrase input, error feedback, loading spinner during PBKDF2 derivation, or "Encryption not configured" notice when `status === 'unconfigured'`.

### 5.6 Database schema changes (`supabase/schema.sql`)
1. Raise `messages.content` length check to `24000` chars so base64url ciphertext for 4000 UTF-8 characters (up to 16 KB raw) fits comfortably:
   ```sql
   alter table public.messages drop constraint if exists messages_content_check;
   alter table public.messages add constraint messages_content_check
     check (char_length(trim(content)) > 0 and char_length(content) <= 24000);
   ```
2. Enforce `e2ee:v1:` envelope on new inserts and content-modifying updates via trigger (so legacy rows stay untouched and soft-deletes of legacy rows still work):
   ```sql
   create or replace function public.enforce_message_e2ee_envelope()
   returns trigger
   language plpgsql
   as $$
   begin
     if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.content is distinct from old.content) then
       if new.content is null or new.content not like 'e2ee:v1:%' then
         raise exception 'Message content must use e2ee:v1 encrypted envelope';
       end if;
     end if;
     return new;
   end;
   $$;
   ```
3. Add `public.e2ee_config` table and `SELECT` RLS policy.
4. Harden `can_access_channel`: `revoke execute on function public.can_access_channel(uuid) from anon; grant execute on function public.can_access_channel(uuid) to authenticated;`.

### 5.7 Related Hardening
- `nuxt.config.ts`: disable Nuxt DevTools in production (`devtools: { enabled: process.env.NODE_ENV !== 'production' }`).
- Verify zero `console.*` calls log message payloads or phrases.

### 5.8 Testing
- `tests/utils/crypto.test.ts`: key derivation, NFKC/trim normalization, round-trip encrypt/decrypt, random IV uniqueness, wrong key failure, wrong `channel_id` (AAD) failure, envelope detection, raw key export/import, verifier generation.
- `tests/composables/useE2ee.test.ts`: unconfigured state, unlock with right/wrong phrase, `sessionStorage` restore + verifier re-check, stale `sessionStorage` eviction, clear on sign-out.
- `tests/composables/useChatRoom.test.ts`: `decryptMessageRow` for `e2ee`, `legacy`, and `undecryptable`; outgoing `insert`/`update` sends `e2ee:v1:...` ciphertext (never plaintext) while store holds plaintext; `retryMessage` reuses `client_id`.
- `tests/components/chatUi.test.ts`: `E2eeGate.vue` unlock flow, `MessageViewport.vue` legacy badge and undecryptable placeholder + disabled edit button.

## 6. Builder's Calls (for your review)
- **Phrase normalization:** `phrase.normalize('NFKC').trim()` before PBKDF2 so copy-pasting across platforms is reliable.
- **Cryptography parameters:** PBKDF2-SHA-256 with 600,000 iterations, AES-256-GCM with 12-byte random IV, `channel_id` bound as AAD.
- **Session key re-verification:** When restoring the key from `sessionStorage` on reload, verify it against `e2ee_config.verifier` so a rotated phrase immediately re-prompts the tab.
- **Soft-delete of legacy messages:** The DB trigger checks `new.content is distinct from old.content`, so deleting an old unencrypted message (`deleted_at` update) still succeeds without needing to re-encrypt it.
