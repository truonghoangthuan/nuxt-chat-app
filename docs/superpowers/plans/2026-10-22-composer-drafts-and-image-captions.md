# Composer Drafts & Image Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitHub issue #18 (persist composer drafts per conversation in memory) and GitHub issue #20 (support text captions for image attachments across composer, E2EE payload, and viewport).

**Architecture:** Add reactive in-memory drafts map keyed by conversation ID to `MessageComposer.vue` with switch restoration; update `ImageMessagePayload` in `chat.ts` and `image.ts` with optional `caption`; update `MessageComposer` to retain typed text upon image attachment and emit `sendImages(files, caption)`; wire `sendImages` in `useChatRoom.ts` to include `caption` in optimistic and encrypted E2EE payload; render caption below `MessageImageGrid` in `MessageViewport.vue` using existing mention tokenization.

**Tech Stack:** Vue 3 Composition API, Nuxt 4, TypeScript, Supabase Realtime/Storage, Vitest + @vue/test-utils.

**Spec:** GitHub issues [#18](https://github.com/truonghoangthuan/nuxt-chat-app/issues/18) and [#20](https://github.com/truonghoangthuan/nuxt-chat-app/issues/20).

## Global Constraints

- Do not break existing chat test suites (`npm test`).
- Preserve all existing `data-test` attributes and functional hooks.
- Encrypt both images metadata and caption within the client-side AES-GCM-256 envelope bound to `conversation_id`.
- Adhere to Ponytail principles: minimal code, zero bloat, reuse existing tokenizers and helpers.

## Review Focus

1. Switching conversations preserves typed draft and restores previous conversation's draft without cross-contamination.
2. Sending a message (text or image) clears the draft for that specific conversation.
3. Attaching images does not erase textarea input; user can edit caption before sending.
4. Image messages without captions serialize and render identically to existing payloads (backwards compatibility).
5. Retrying a failed image message preserves both the files and caption.

---

### Task 1: Types and Serialization for Image Message Captions (Issue #20)

**Files:**
- Modify: `app/types/chat.ts:175-179`
- Modify: `app/utils/image.ts:88-130`
- Test: `tests/utils/image.test.ts`

**Interfaces:**
- Produces: `ImageMessagePayload.caption?: string`
- Produces: `parseImagePayload(content: unknown): ImageMessagePayload | null` (validates `caption` is string if present)
- Produces: `formatImageMessageSummary(count: number, caption?: string): string`

- [ ] **Step 1: Write failing tests in `tests/utils/image.test.ts`**

Add tests asserting:
1. `parseImagePayload` returns valid payload with `caption` field when present in JSON.
2. `parseImagePayload` returns `null` if `caption` is not a string (e.g. number or object).
3. `formatImageMessageSummary` formats caption if provided (e.g. `📷 1 photo: Sunset`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/image.test.ts`
Expected: FAIL on new caption assertions.

- [ ] **Step 3: Update `app/types/chat.ts` and `app/utils/image.ts`**

1. In `app/types/chat.ts`:
```typescript
export interface ImageMessagePayload {
  type: 'images'
  images: EncryptedImageMetadata[]
  caption?: string
}
```
2. In `app/utils/image.ts`:
- Update `parseImagePayload` to validate `if (parsed.caption !== undefined && typeof parsed.caption !== 'string') return null`.
- Update `formatImageMessageSummary(count: number, caption?: string): string`: return `caption?.trim() ? `${prefix}: ${caption.trim()}` : prefix`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/image.ts tests/utils/image.test.ts
git commit -m "feat(types): add caption field to ImageMessagePayload and update parser"
```

---

### Task 2: Composer Drafts & Image Caption Support (Issues #18 & #20)

**Files:**
- Modify: `app/components/MessageComposer.vue`
- Modify: `app/pages/index.vue:480-493`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `conversationId?: string` prop on `MessageComposer`
- Produces: `(e: 'sendImages', files: File[], caption?: string): void` emit from `MessageComposer`
- Produces: In-memory reactive `drafts` map in `MessageComposer` keyed by `conversationKey = props.conversationId || props.channelSlug || 'default'`

- [ ] **Step 1: Write failing tests in `tests/components/chatUi.test.ts`**

1. In `MessageComposer` suite:
   - Test draft preservation across conversation switches: type draft in conversation A, switch to conversation B (textarea empty), type draft in B, switch back to A (restores A's draft).
   - Test draft cleared on text send and image send.
   - Test that attaching images keeps textarea content and keeps textarea enabled with placeholder `'Add a caption...'`.
   - Test that clicking send with images and caption emits `'sendImages'` with `[files, caption]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL on draft preservation and caption emission assertions.

- [ ] **Step 3: Implement in `app/components/MessageComposer.vue` and `app/pages/index.vue`**

1. In `app/components/MessageComposer.vue`:
   - Add `conversationId?: string` to `defineProps`.
   - Update `emit`: `(e: 'sendImages', files: File[], caption?: string): void`.
   - Define module-scoped or reactive drafts store: `const drafts = reactive<Record<string, string>>({})`.
   - Compute `conversationKey = computed(() => props.conversationId || props.channelSlug || 'default')`.
   - Initialize `content = ref(drafts[conversationKey.value] || '')`.
   - Watch `conversationKey`:
     ```typescript
     watch(conversationKey, (newKey, oldKey) => {
       if (oldKey) drafts[oldKey] = content.value
       content.value = drafts[newKey] || ''
       clearPendingAttachments()
       cursorIndex.value = content.value.length
       dismissedMentionStartIndex.value = null
       selectedMentionIndex.value = 0
       nextTick(() => autoResize())
     })
     ```
   - In `handleInput`: update `drafts[conversationKey.value] = content.value`.
   - In `queueFiles`: remove `content.value = ''` (keep typed text).
   - In `handleSend`:
     - If `pendingAttachments.length > 0`: grab `captionText = content.value.trim() || undefined`, clear attachments, reset `content.value = ''`, `drafts[conversationKey.value] = ''`, emit `'sendImages', filesToSend, captionText`.
     - Else: reset `drafts[conversationKey.value] = ''`, emit `'send', trimmed`.
   - In template:
     - Textarea `:disabled="disabled"` (do not disable on pending attachments).
     - Textarea `:placeholder="pendingAttachments.length > 0 ? 'Add a caption...' : \`Message ${isDm ? '@' : '#'}${channelSlug || 'channel'}\`"`.
2. In `app/pages/index.vue`:
   - Pass `:conversation-id="activeConversationId || activeChannelId"` to `<MessageComposer>`.
   - Update `handleSendImages(files: File[], caption?: string)` to pass `caption` to `sendImages(files, caption)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageComposer.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(composer): persist drafts per conversation and support captions for image attachments"
```

---

### Task 3: useChatRoom sendImages Caption Orchestration & Immutability (Issue #20)

**Files:**
- Modify: `app/composables/useChatRoom.ts:2079-2285`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `sendImages(files: File[], caption?: string, overrideClientId?: string): Promise<boolean>`
- Produces: Encrypted image payload containing `caption` inserted into messages and stored in `pendingImageFiles` for retry.

- [ ] **Step 1: Write failing test in `tests/composables/useChatRoom.test.ts`**

Add test asserting:
1. `sendImages` with caption produces optimistic message containing `caption` in payload.
2. `sendImages` inserts encrypted row containing `caption`.
3. If upload fails, retrying `retryMessage(clientId)` preserves and resends caption.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL on caption check.

- [ ] **Step 3: Implement caption handling in `app/composables/useChatRoom.ts`**

1. Update `pendingImageFiles` type: `Map<string, { files: File[]; caption?: string; conversationId: string; channelId?: string }>`.
2. Update `sendImages(files: File[], captionOrClientId?: string, overrideClientId?: string)`:
   - Disambiguate arguments: if `overrideClientId` is not provided and `captionOrClientId` exists in `pendingImageFiles`, treat as `overrideClientId`.
   - Store `{ files, caption, conversationId }` in `pendingImageFiles`.
   - Include `caption: caption?.trim() || undefined` in `optimisticPayload` and `finalPayload`.
3. In `retryMessage`:
   - Pass `pending.caption` to `sendImages(pending.files, pending.caption, clientId)`.
4. In mention checking / notifications:
   - Check mentions in `parseImagePayload(msg.content)?.caption` if present.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(chatRoom): persist and encrypt image captions in sendImages and retry"
```

---

### Task 4: Message Viewport Caption Rendering (Issue #20)

**Files:**
- Modify: `app/components/MessageViewport.vue:642-650`
- Test: `tests/components/MessageImageGrid.test.ts`

**Interfaces:**
- Consumes: `ChatMessage.content` with `ImageMessagePayload` containing `caption`
- Produces: DOM node `[data-test="image-caption"]` rendered below `MessageImageGrid` with mention/link tokenization.

- [ ] **Step 1: Write failing test in `tests/components/MessageImageGrid.test.ts`**

Add test mounting `MessageViewport`:
1. Message with `ImageMessagePayload` containing `caption: "Sunset at the beach with @Alice"` renders `[data-test="image-caption"]` with tokenized mention `@Alice`.
2. Message with `ImageMessagePayload` without caption does not render `[data-test="image-caption"]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/MessageImageGrid.test.ts`
Expected: FAIL (`[data-test="image-caption"]` not found).

- [ ] **Step 3: Implement caption rendering in `app/components/MessageViewport.vue`**

In `app/components/MessageViewport.vue`:
Wrap `MessageImageGrid` in a container and conditionally render caption below it:
```vue
              <div
                v-else-if="isImagePayload(item.message.content) && parseImagePayload(item.message.content)"
                class="flex flex-col gap-2"
              >
                <MessageImageGrid
                  :images="parseImagePayload(item.message.content)!.images"
                  :channel-id="effectiveConversationId"
                  :is-sending="item.message.status === 'sending'"
                  @select-image="emit('selectImage', $event)"
                />
                <div
                  v-if="parseImagePayload(item.message.content)?.caption"
                  data-test="image-caption"
                  class="whitespace-pre-wrap break-words text-[14px]"
                  :class="item.isSender ? 'text-white' : 'text-[var(--ap-text-primary)]'"
                >
                  <template
                    v-for="(seg, sIdx) in tokenizeMessageMentions(parseImagePayload(item.message.content)!.caption!, currentDisplayName)"
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
                </div>
              </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/MessageImageGrid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue tests/components/MessageImageGrid.test.ts
git commit -m "feat(viewport): render tokenized image captions below MessageImageGrid"
```

---

### Task 5: Full Suite Verification & Build Gate

**Files:** None

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: 22 test files passed, zero regressions.

- [ ] **Step 2: Run production build check**

Run: `npm run build`
Expected: Clean build without TypeScript or bundling errors.

- [ ] **Step 3: Verification gate review**

Check git status to ensure working directory is clean.
