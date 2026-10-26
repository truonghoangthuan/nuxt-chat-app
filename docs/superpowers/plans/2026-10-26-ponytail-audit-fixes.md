# Ponytail Audit Fixes (17 Findings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 17 bugs, security gaps, dead code paths, duplications, and performance issues identified in the repository quality audit while shrinking the codebase by ~660 lines.

**Architecture:** Apply surgical fixes across seven focused tasks grouped by subsystem: (1) E2EE key generation, runtime config passphrase, and shared crypto helpers; (2) Database RLS hardening and atomic DM creation RPC wiring; (3) Group/wallpaper error toasts, preset wallpaper system messages, and unused confetti/font cleanup; (4) Dead component and legacy `channels`/`channel_reads` removal; (5) Unified image attachment cache helpers and blob URL lifecycle fixes; (6) Composable extraction from `useChatRoom.ts` (`useContacts.ts`, `useConversations.ts`, `useUnreadReads.ts`) with bounded startup queries; (7) Single-pass message timeline payload parsing and multi-word `@mention` highlighting in `MessageViewport.vue`.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Supabase (`@nuxtjs/supabase`, Postgres RLS, Storage), WebCrypto API (AES-GCM-256, PBKDF2-HMAC-SHA256), Vitest + `@vue/test-utils` (`happy-dom`).

**Spec:** Conversation audit report (Findings #1–#17 in session `4d55911a-91c6-4f56-8461-4930036bff42`) and `AGENTS.md` invariants.

## Global Constraints

- Never overwrite an existing PBKDF2 salt in `public.e2ee_config` (`ON CONFLICT (id) DO NOTHING;` only, per `AGENTS.md` Invariant #6).
- Preserve all functional `data-test` hooks, event emits, and keyboard shortcuts (`AGENTS.md` Invariant #9).
- Composables using `useState` or `useRuntimeConfig` must guard `typeof ... !== 'undefined'` with module-scoped fallbacks so Vitest unit tests run without the full Nuxt runtime (`AGENTS.md` Invariant #5).
- Keep `channel_id` as an in-memory alias property on `ChatMessage` for existing unit test fixtures, while removing dead database queries against `public.channels`, `public.channel_reads`, and `messages.channel_id`.
- Normalize CRLF/LF cleanly when editing files on Windows (`AGENTS.md` Section 2).

## Review Focus

- Calling `selectConversation(id)` with the already-active `conversationId` when `messages.value.length > 0` must be a no-op so active decrypted `blob:` URLs are not revoked while `MessageImageGrid` is mounted.
- Calling `openOrCreateDirectChat(peerUserId)` when `supabase.rpc` returns an error or is unmocked in legacy unit tests must gracefully fall back to the existing client-side lookup so existing unit tests and edge environments still succeed.
- Calling `loadAllProfiles()` and `loadConversationReadsAndUnreads()` with test mocks that omit `.limit()` or `.in()` must check `typeof query.limit === 'function'` and `typeof query.in === 'function'` before chaining.
- Removing `E2eeGate.vue` and `MessageActionsMenu.vue` must also remove their obsolete mount blocks in `tests/components/chatUi.test.ts`, `tests/components/MessageImageGrid.test.ts`, and `tests/components/messageActionsMenu.test.ts`.
- Passing `members` display names into `tokenizeMessageMentions` in `MessageViewport.vue` must handle empty or undefined `members` arrays without throwing.

---

### Task 1: E2EE Salt Safety, Runtime Passphrase Config & Crypto Deduplication (Findings #3, #8, #12)

**Files:**
- Modify: `app/utils/crypto.ts`
- Modify: `scripts/generate-e2ee-config.mjs`
- Modify: `app/composables/useE2ee.ts`
- Modify: `nuxt.config.ts:19-28`
- Modify: `tests/utils/generateE2eeConfig.test.ts`
- Modify: `tests/composables/useE2ee.test.ts`

**Interfaces:**
- Produces:
  - `buildE2eeSeedSql(config: { salt: string; iterations: number; verifier: string }): string` in `scripts/generate-e2ee-config.mjs` outputting `on conflict (id) do nothing;`
  - `resolveDefaultE2eePhrase(): string` in `app/composables/useE2ee.ts` reading `useRuntimeConfig().public.e2eeDefaultPhrase` with fallback to `DEFAULT_E2EE_PHRASE`
  - `nuxt.config.ts` without unused Google Fonts (`Hanken Grotesk`, `Schibsted Grotesk`) and with `runtimeConfig.public.e2eeDefaultPhrase`

- [ ] **Step 1: Write failing tests in `tests/utils/generateE2eeConfig.test.ts` and `tests/composables/useE2ee.test.ts`**

```ts
// In tests/utils/generateE2eeConfig.test.ts:
it('generates idempotent ON CONFLICT (id) DO NOTHING SQL seed to preserve existing salt', async () => {
  const result = await generateE2eeConfigSeed('my-test-secret-phrase', 1000)
  expect(result.sql).toContain('on conflict (id) do nothing;')
  expect(result.sql.toLowerCase()).not.toContain('do update set')
})

// In tests/composables/useE2ee.test.ts:
it('initializeE2ee uses runtimeConfig.public.e2eeDefaultPhrase when configured', async () => {
  const customPhrase = 'custom-runtime-workspace-phrase'
  const customCfg = await createPhraseConfig(customPhrase, 1000)
  vi.stubGlobal('useRuntimeConfig', () => ({
    public: { e2eeDefaultPhrase: customPhrase },
  }))
  mockSelectMaybeSingle.mockResolvedValueOnce({ data: customCfg, error: null })

  const e2ee = useE2ee()
  await e2ee.initializeE2ee()
  expect(e2ee.status.value).toBe('unlocked')
  expect(e2ee.key.value).not.toBeNull()
  vi.unstubAllGlobals()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/generateE2eeConfig.test.ts tests/composables/useE2ee.test.ts`
Expected: FAIL (`result.sql` contains `do update set`; `useRuntimeConfig` is not read by `useE2ee.ts`)

- [ ] **Step 3: Deduplicate `scripts/generate-e2ee-config.mjs`, fix SQL template, wire `runtimeConfig.public.e2eeDefaultPhrase`, and remove unused Google Fonts in `nuxt.config.ts` (Finding #17)**

1. In `scripts/generate-e2ee-config.mjs`, change `buildE2eeSeedSql` to emit `on conflict (id) do nothing;` and remove redundant local helpers where `createPhraseConfig` already encapsulates salt + derive + encrypt in one function.
2. In `app/composables/useE2ee.ts`, add `resolveDefaultE2eePhrase(): string` that checks `typeof useRuntimeConfig === 'function' ? useRuntimeConfig()?.public?.e2eeDefaultPhrase : ''` and falls back to `DEFAULT_E2EE_PHRASE`. Use `resolveDefaultE2eePhrase()` inside `initializeE2ee()`.
3. In `nuxt.config.ts`, add `runtimeConfig: { public: { e2eeDefaultPhrase: process.env.NUXT_PUBLIC_E2EE_PHRASE || '' } }` and delete the three `<link>` objects for `fonts.googleapis.com` / `fonts.gstatic.com` (`Hanken Grotesk` and `Schibsted Grotesk`) from `app.head.link`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/generateE2eeConfig.test.ts tests/composables/useE2ee.test.ts tests/utils/crypto.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-e2ee-config.mjs app/composables/useE2ee.ts nuxt.config.ts tests/utils/generateE2eeConfig.test.ts tests/composables/useE2ee.test.ts
git commit -m "fix(e2ee): preserve salt on conflict, support runtime phrase, drop unused fonts"
```

---

### Task 2: Database RLS Hardening & Atomic Direct Chat RPC Wiring (Findings #4, #5)

**Files:**
- Modify: `supabase/schema.sql:228-249`
- Modify: `supabase/schema.sql:639-645`
- Modify: `app/composables/useChatRoom.ts:1705-1808`
- Modify: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Produces:
  - Updated `conversation_members` `INSERT` policy in `supabase/schema.sql` preventing a 3rd member from being added to a `direct` conversation
  - Updated `"Authenticated users can delete chat backgrounds"` storage policy in `supabase/schema.sql` requiring `and owner = auth.uid()`
  - `openOrCreateDirectChat(peerUserId: string)` in `app/composables/useChatRoom.ts` calling `supabase.rpc('get_or_create_direct_conversation', { target_user_id: peerUserId })` first with fallback to client-side lookup

- [ ] **Step 1: Write failing test in `tests/composables/useChatRoom.test.ts`**

```ts
it('openOrCreateDirectChat prefers atomic get_or_create_direct_conversation RPC before client queries', async () => {
  const rpcSpy = vi.spyOn(mockSupabase, 'rpc').mockImplementationOnce(async (fnName: string, args: any) => {
    if (fnName === 'get_or_create_direct_conversation') {
      mockConversationsDb.push({
        id: 'conv-rpc-dm-1',
        type: 'direct',
        name: null,
        created_by: 'u-alice',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      mockMembersDb.push(
        { conversation_id: 'conv-rpc-dm-1', user_id: 'u-alice', role: 'member', joined_at: new Date().toISOString() },
        { conversation_id: 'conv-rpc-dm-1', user_id: args.target_user_id, role: 'member', joined_at: new Date().toISOString() },
      )
      return { data: 'conv-rpc-dm-1', error: null }
    }
    return { data: null, error: { message: 'Unknown RPC' } }
  })

  const room = useChatRoom()
  const res = await room.openOrCreateDirectChat('u-bob')
  expect(rpcSpy).toHaveBeenCalledWith('get_or_create_direct_conversation', { target_user_id: 'u-bob' })
  expect(res.error).toBeNull()
  expect(res.conversation?.id).toBe('conv-rpc-dm-1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "openOrCreateDirectChat prefers atomic"`
Expected: FAIL (`expect(rpcSpy).toHaveBeenCalledWith(...)` fails because `rpc` is not called)

- [ ] **Step 3: Wire `get_or_create_direct_conversation` RPC in `openOrCreateDirectChat` and tighten RLS in `supabase/schema.sql`**

1. In `app/composables/useChatRoom.ts` (`openOrCreateDirectChat`), check `if (typeof (supabase as any).rpc === 'function')`: invoke `await (supabase as any).rpc('get_or_create_direct_conversation', { target_user_id: peerId })`. If `!rpcErr && typeof rpcConvId === 'string' && rpcConvId`, call `await loadConversations()` and select/return that conversation; otherwise fall back to the existing client-side query so test mocks without the RPC handler still pass.
2. In `supabase/schema.sql`, update `"Members can insert conversation_members"` `with check` so that adding members after initial creation requires `c.type = 'group'` (or total members `< 2` for `direct`), and add `and owner = auth.uid()` to `"Authenticated users can delete chat backgrounds"` on `storage.objects`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(security): use atomic DM RPC and tighten DM member and storage RLS"
```

---

### Task 3: Preset Wallpaper System Message, Error Toasts & Confetti Cleanup (Findings #1, #2, #9, #15)

**Files:**
- Modify: `app/composables/useChatRoom.ts:2075-2085`
- Modify: `app/pages/index.vue:31-35`
- Modify: `app/pages/index.vue:270-360`
- Modify: `tests/composables/useChatRoom.test.ts`
- Modify: `tests/components/indexPage.test.ts:324-337`

**Interfaces:**
- Produces:
  - `updateChatBackground` in `app/composables/useChatRoom.ts` matching `CHAT_BACKGROUND_PRESETS.find(p => p.value === finalUrl)` so preset names (`"Aurora Borealis"`, etc.) appear in system messages
  - `index.vue` passing `{ conversationId: activeConversationId.value || '', title, snippet }` to `addNotificationToast` across all 6 error handlers
  - `index.vue` with unused `shouldTriggerConfetti`, `handleUnlock`, and `handleRetryConfig` removed

- [ ] **Step 1: Write failing tests in `tests/composables/useChatRoom.test.ts` and `tests/components/indexPage.test.ts`**

```ts
// In tests/composables/useChatRoom.test.ts:
it('updateChatBackground emits preset label in system message when selecting a preset wallpaper', async () => {
  const room = useChatRoom()
  await room.createGroupChat('Design Team', ['u-bob'])
  const groupId = room.groupConversations.value[0].id

  const res = await room.updateChatBackground(groupId, 'preset:aurora')
  expect(res.error).toBeNull()

  const lastInsertCall = mockMessagesInsert.mock.calls[mockMessagesInsert.mock.calls.length - 1][0]
  const decrypted = await decryptContent(testKey, lastInsertCall.content, groupId)
  const parsed = JSON.parse(decrypted)
  expect(parsed.action).toBe('background_updated')
  expect(parsed.detail).toBe('Aurora Borealis')
})

// In tests/components/indexPage.test.ts (update line 333):
expect(mockNotification.addNotificationToast).toHaveBeenCalledWith({
  conversationId: 'conv-group-1',
  title: 'Failed to update group name',
  snippet: 'Network error',
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/composables/useChatRoom.test.ts tests/components/indexPage.test.ts`
Expected: FAIL (`parsed.detail` is `'a custom image'` instead of `'Aurora Borealis'`; `addNotificationToast` was called with `body` instead of `snippet`)

- [ ] **Step 3: Fix preset lookup in `useChatRoom.ts` and toast payloads + dead handlers in `app/pages/index.vue`**

1. In `app/composables/useChatRoom.ts:2079`, change `CHAT_BACKGROUND_PRESETS.find(p => p.url === finalUrl)` to `CHAT_BACKGROUND_PRESETS.find(p => p.value === finalUrl)`.
2. In `app/pages/index.vue`, update all 6 `addNotificationToast` calls in `handleAddGroupMember`, `handleLeaveGroup`, `handleUpdateGroupName`, `handleUpdateGroupAvatar`, `handleSelectBackground`, and `handleUploadCustomBackground` to pass `conversationId: activeConversationId.value || ''` and `snippet: ...` instead of `body: ...`.
3. In `app/pages/index.vue`, remove unused `shouldTriggerConfetti` from the `~/utils/chat` import and delete unused `handleUnlock` and `handleRetryConfig` functions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useChatRoom.test.ts tests/components/indexPage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts app/pages/index.vue tests/composables/useChatRoom.test.ts tests/components/indexPage.test.ts
git commit -m "fix(ui): use preset value for wallpaper system message and snippet in error toasts"
```

---

### Task 4: Remove Dead Components (`E2eeGate`, `MessageActionsMenu`) & Legacy `channels` Fallbacks (Findings #10, #11)

**Files:**
- Delete: `app/components/E2eeGate.vue`
- Delete: `app/components/MessageActionsMenu.vue`
- Delete: `tests/components/messageActionsMenu.test.ts`
- Modify: `app/utils/chat.ts:78-91`
- Modify: `app/utils/chat.ts:472-522`
- Modify: `app/composables/useChatRoom.ts`
- Modify: `tests/components/chatUi.test.ts`
- Modify: `tests/components/MessageImageGrid.test.ts`
- Modify: `tests/composables/useChatRoom.test.ts`
- Modify: `tests/utils/chat.test.ts`

**Interfaces:**
- Produces:
  - Clean `app/components/` without `E2eeGate.vue` or `MessageActionsMenu.vue`
  - Clean `app/utils/chat.ts` without unused `normalizeChannelSlug`, `isValidChannelSlug`, `normalizeDmPair`, `getDmPeerId`, `canUserAccessChannel`
  - Clean `app/composables/useChatRoom.ts` without `hydrateDmChannelPeers`, `shouldProcessChannelMessage`, `channel_reads` table queries, or double-fired `.eq('channel_id', ...)` fallback queries on `messages`

- [ ] **Step 1: Write test in `tests/composables/useChatRoom.test.ts` verifying failed `messages` query does not fire a second query against `channel_id`**

```ts
it('selectConversation does not fire a redundant second messages query when the primary query fails', async () => {
  const selectSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Network timeout' } }),
        }),
      }),
    }),
  })
  mockSupabase.from = vi.fn((table: string) => {
    if (table === 'messages') return { select: selectSpy }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
  })

  const room = useChatRoom()
  await room.selectConversation('conv-1')
  expect(selectSpy).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "selectConversation does not fire a redundant second"`
Expected: FAIL (`selectSpy` called 2 times due to legacy `channel_id` fallback)

- [ ] **Step 3: Delete `E2eeGate.vue`, `MessageActionsMenu.vue`, legacy `channels` helpers, and redundant DB fallback queries**

1. Delete `app/components/E2eeGate.vue`, `app/components/MessageActionsMenu.vue`, and `tests/components/messageActionsMenu.test.ts`.
2. In `tests/components/chatUi.test.ts`, remove `import E2eeGate` and the two `E2eeGate` test blocks (lines 1088–1128).
3. In `tests/components/MessageImageGrid.test.ts`, remove `import MessageActionsMenu` and the single `MessageActionsMenu` test block (lines 214–236), keeping the `MessageViewport` immutability test block.
4. In `app/utils/chat.ts`, remove `normalizeChannelSlug`, `isValidChannelSlug`, `normalizeDmPair`, `getDmPeerId`, and `canUserAccessChannel`, and remove their unit test blocks in `tests/utils/chat.test.ts`.
5. In `app/composables/useChatRoom.ts`, remove `hydrateDmChannelPeers` and `shouldProcessChannelMessage` (and their tests in `tests/composables/useChatRoom.test.ts`), and remove the secondary `from('channel_reads')` and `.eq('channel_id', ...)` database fallback queries in `createReadReceiptDebouncer`, `loadConversationReadsAndUnreads`, `fetchGapMessages`, `selectConversation`, `loadOlderMessages`, `sendMessage`, `sendImages`, `retryMessage`, and `sendSystemMessage`.

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove dead E2eeGate, MessageActionsMenu, and legacy channels fallbacks"
```

---

### Task 5: Image Attachment Cache Deduplication & Blob URL Lifecycle Fixes (Findings #6, #13)

**Files:**
- Modify: `app/composables/useImageAttachmentCache.ts`
- Modify: `app/components/MessageImageGrid.vue`
- Modify: `app/components/ChatMediaGallery.vue`
- Modify: `app/components/ImageViewerModal.vue`
- Modify: `app/composables/useChatRoom.ts:1557-1626`
- Modify: `app/composables/useChatRoom.ts:2340-2485`
- Modify: `tests/composables/useImageAttachmentCache.test.ts`
- Modify: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Produces:
  - `useImageAttachmentCache()` with optional `cryptoKey?: CryptoKey | null` and `supabaseClient?: any` parameters on `getOrFetchImage(storagePath, mimeType, channelId, cryptoKey?, supabaseClient?)` (auto-resolving from `useE2ee()` and `useSupabaseClient()` when omitted)
  - `selectConversation(conversationId)` returning early without revoking URLs when `activeConversationId.value === conversationId && messagesStore.messages.value.length > 0`
  - `sendImages` revoking temporary `localPreviews` blob URLs after upload completes

- [ ] **Step 1: Write failing tests in `tests/composables/useImageAttachmentCache.test.ts` and `tests/composables/useChatRoom.test.ts`**

```ts
// In tests/composables/useChatRoom.test.ts:
it('selectConversation skips revokeAllUrls when re-selecting the already active conversation with loaded messages', async () => {
  const room = useChatRoom()
  room.activeChannelId.value = 'ch-general'
  room.messages.value = [
    {
      id: 'm-1',
      client_id: 'c-1',
      conversation_id: 'ch-general',
      channel_id: 'ch-general',
      user_id: 'u-alice',
      content: 'Hello',
      created_at: '2026-10-20T12:00:00.000Z',
      status: 'sent',
    },
  ]
  const cache = useImageAttachmentCache()
  const revokeSpy = vi.spyOn(cache, 'revokeAllUrls')

  await room.selectConversation('ch-general')
  expect(revokeSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "selectConversation skips revokeAllUrls"`
Expected: FAIL (`revokeSpy` was called)

- [ ] **Step 3: Centralize key/client resolution in `useImageAttachmentCache.ts`, deduplicate the 3 image components, guard `selectConversation`, and revoke `localPreviews` in `sendImages`**

1. In `app/composables/useImageAttachmentCache.ts`, add internal `resolveDefaultKey()` and `resolveDefaultSupabase()` helpers so `getOrFetchImage(storagePath, mimeType, channelId, cryptoKey?, supabaseClient?)` resolves `cryptoKey ?? resolveDefaultKey()` and `supabaseClient ?? resolveDefaultSupabase()`.
2. In `app/components/MessageImageGrid.vue`, `app/components/ChatMediaGallery.vue`, and `app/components/ImageViewerModal.vue`, delete the duplicated `resolveKey()` and `resolveSupabase()` functions and call `cache.getOrFetchImage(img.path, img.mimeType, channelId)` directly.
3. In `app/composables/useChatRoom.ts` (`selectConversation`), if `activeConversationId.value === conversationId && messagesStore.messages.value.length > 0`, return `markChannelRead(conversationId)` immediately without calling `revokeAllUrls()` or re-fetching history.
4. In `app/composables/useChatRoom.ts` (`sendImages`), revoke `localPreviews` via `URL.revokeObjectURL(p.url)` once the message is marked `'sent'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useImageAttachmentCache.test.ts tests/components/MessageImageGrid.test.ts tests/components/ImageViewerModal.test.ts tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useImageAttachmentCache.ts app/components/MessageImageGrid.vue app/components/ChatMediaGallery.vue app/components/ImageViewerModal.vue app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(images): deduplicate image cache resolvers and preserve active chat blob URLs"
```

---

### Task 6: Bound Startup Queries & Split `useChatRoom.ts` by Responsibility (Findings #7, #14)

**Files:**
- Create: `app/composables/useContacts.ts`
- Create: `app/composables/useConversations.ts`
- Create: `app/composables/useUnreadReads.ts`
- Modify: `app/composables/useChatRoom.ts`
- Modify: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Produces:
  - `app/composables/useUnreadReads.ts`: exports `computeInitialUnreadSnapshot`, `applyIncomingUnreadIncrement`, `applyActiveChannelReadReset`, `applyCrossTabReadTimestamp`, `createReadReceiptDebouncer`
  - `app/composables/useContacts.ts`: exports `createContactsActions(deps)` handling `loadContacts`, `lookupUserByEmail`, `addContact`, `removeContact`
  - `app/composables/useConversations.ts`: exports `createConversationsActions(deps)` handling `openOrCreateDirectChat`, `createGroupChat`, `addGroupMember`, `leaveGroupChat`, `updateGroupName`, `updateGroupAvatar`, `uploadChatBackgroundFile`, `updateChatBackground`
  - `loadAllProfiles` in `app/composables/useChatRoom.ts` bounded with `.limit(200)` and `loadConversationReadsAndUnreads` filtering `conversation_reads` with `.in('conversation_id', convIds)`
  - `useChatRoom.ts` re-exporting all pure helpers so existing imports in `tests/composables/useChatRoom.test.ts` remain 100% compatible

- [ ] **Step 1: Write failing test in `tests/composables/useChatRoom.test.ts` for bounded startup queries**

```ts
it('loadConversationReadsAndUnreads scopes conversation_reads query to active conversation IDs', async () => {
  let capturedReadsInIds: string[] | null = null
  const origFrom = mockSupabase.from
  mockSupabase.from = vi.fn((table: string) => {
    if (table === 'conversation_reads') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn((_col: string, ids: string[]) => {
              capturedReadsInIds = ids
              return Promise.resolve({ data: [], error: null })
            }),
          }),
        }),
      }
    }
    return origFrom(table)
  })

  const room = useChatRoom()
  await room.createGroupChat('Alpha', ['u-bob'])
  await room.initializeChat()
  expect(capturedReadsInIds).toEqual([room.groupConversations.value[0].id])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "loadConversationReadsAndUnreads scopes conversation_reads"`
Expected: FAIL (`capturedReadsInIds` is `null` because `.in('conversation_id', convIds)` was not called)

- [ ] **Step 3: Add `.in('conversation_id', convIds)` and `.limit(200)` guards, and extract `useUnreadReads.ts`, `useContacts.ts`, and `useConversations.ts`**

1. In `loadAllProfiles()`, chain `if (typeof query.limit === 'function') query = query.limit(200)`.
2. In `loadConversationReadsAndUnreads()`, chain `if (convIds.length > 0 && typeof readsQuery.in === 'function') readsQuery = readsQuery.in('conversation_id', convIds)`.
3. Extract unread/read-receipt pure functions and debouncer into `app/composables/useUnreadReads.ts` (re-exporting them from `app/composables/useChatRoom.ts`).
4. Extract contact actions (`loadContacts`, `lookupUserByEmail`, `addContact`, `removeContact`) into `app/composables/useContacts.ts`.
5. Extract conversation and wallpaper actions (`openOrCreateDirectChat`, `createGroupChat`, `addGroupMember`, `leaveGroupChat`, `updateGroupName`, `updateGroupAvatar`, `uploadChatBackgroundFile`, `updateChatBackground`) into `app/composables/useConversations.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useUnreadReads.ts app/composables/useContacts.ts app/composables/useConversations.ts app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "refactor(chat): bound startup queries and split useChatRoom into focused composables"
```

---

### Task 7: Single-Pass Message Timeline Payload Parsing & Multi-Word `@mention` Highlighting (Finding #16)

**Files:**
- Modify: `app/utils/chat.ts:590-665`
- Modify: `app/components/MessageViewport.vue:760-795`
- Modify: `app/components/MessageViewport.vue:1240-1275`
- Modify: `tests/utils/chat.test.ts`
- Modify: `tests/components/chatUi.test.ts`

**Interfaces:**
- Produces:
  - `TimelineMessageItem` in `app/utils/chat.ts` pre-computing `imagePayload: ImageMessagePayload | null` and `systemPayload: SystemMessagePayload | null` once per message in `buildMessageTimeline`
  - `MessageViewport.vue` reading `item.imagePayload` and `item.systemPayload` instead of calling `isImagePayload` / `parseImagePayload` / `isSystemMessagePayload` repeatedly in the template, and passing `memberDisplayNames` (`props.members.map(m => m.display_name)`) to `tokenizeMessageMentions`

- [ ] **Step 1: Write failing tests in `tests/utils/chat.test.ts` and `tests/components/chatUi.test.ts`**

```ts
// In tests/utils/chat.test.ts:
it('buildMessageTimeline pre-parses imagePayload and systemPayload once per message item', () => {
  const imgContent = JSON.stringify({
    type: 'images',
    images: [{ path: 'a.enc', mimeType: 'image/png', width: 10, height: 10, size: 50 }],
    caption: 'Hello @Alice Smith',
  })
  const items = buildMessageTimeline([
    {
      id: 'm-1',
      client_id: 'c-1',
      conversation_id: 'conv-1',
      channel_id: 'conv-1',
      user_id: 'u-1',
      content: imgContent,
      created_at: '2026-10-20T10:00:00Z',
      status: 'sent',
    },
  ])
  const msgItem = items.find(i => i.type === 'message')
  expect(msgItem?.imagePayload?.caption).toBe('Hello @Alice Smith')
  expect(msgItem?.systemPayload).toBeNull()
})

// In tests/components/chatUi.test.ts:
it('MessageViewport highlights multi-word @Display Name mentions using conversation members list', () => {
  const wrapper = mount(MessageViewport, {
    props: {
      messages: [
        {
          id: 'm-multi-mention',
          client_id: 'c-multi',
          conversation_id: 'conv-1',
          channel_id: 'conv-1',
          user_id: 'u-bob',
          content: 'Hey @Alice Wonderland check this out',
          created_at: '2026-10-20T10:00:00Z',
          status: 'sent',
        },
      ],
      members: [
        { id: 'u-alice', display_name: 'Alice Wonderland', avatar_color: '#0284c7' },
        { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
      ],
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice Wonderland',
    },
  })
  expect(wrapper.text()).toContain('@Alice Wonderland')
  const mentionSpan = wrapper.find('[data-test="mention-self"]')
  expect(mentionSpan.exists()).toBe(true)
  expect(mentionSpan.text()).toBe('@Alice Wonderland')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/chat.test.ts tests/components/chatUi.test.ts -t "buildMessageTimeline pre-parses|MessageViewport highlights multi-word"`
Expected: FAIL (`msgItem?.imagePayload` is `undefined`; `mentionSpan.text()` is `'@Alice'` instead of `'@Alice Wonderland'`)

- [ ] **Step 3: Attach `imagePayload` and `systemPayload` in `buildMessageTimeline` and pass `memberDisplayNames` in `MessageViewport.vue`**

1. In `app/utils/chat.ts`, add `imagePayload?: ImageMessagePayload | null` and `systemPayload?: SystemMessagePayload | null` to `TimelineMessageItem`, computed once per message in `buildMessageTimeline` using `parseImagePayload(msg.content)` and `parseSystemMessagePayload(msg.content)` (skipping when `msg.deleted_at` or `msg.encryption === 'undecryptable'`).
2. In `app/components/MessageViewport.vue`, add `const memberDisplayNames = computed(() => (props.members || []).map(m => m.display_name).filter(Boolean))` and pass `memberDisplayNames.value` as the second argument to `tokenizeMessageMentions` in `getFormattedSegments` and caption rendering, and use `item.imagePayload` / `item.systemPayload` in the template.

- [ ] **Step 4: Run the full test suite to verify all tests pass**

Run: `npx vitest run`
Expected: PASS (all test files green)

- [ ] **Step 5: Commit**

```bash
git add app/utils/chat.ts app/components/MessageViewport.vue tests/utils/chat.test.ts tests/components/chatUi.test.ts
git commit -m "perf(viewport): parse timeline payloads once and highlight multi-word mentions"
```
