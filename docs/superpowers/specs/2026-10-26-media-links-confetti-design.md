# Media Subtab (#33), Shared Links Subtab (#34) & Confetti Trigger — Design Spec

**Date:** 2026-10-26  
**Issues:** [#33](https://github.com/truonghoangthuan/nuxt-chat-app/issues/33), [#34](https://github.com/truonghoangthuan/nuxt-chat-app/issues/34)

## 1. Problem & Goals

1. **Media Subtab (#33):** Sent images are currently only visible inline inside `MessageViewport`. Users need a `Media` subtab in the chat stage header to browse all decrypted images in a responsive grid, open any image in `ImageViewerModal` (cycling across all loaded conversation images), and load older history on demand.
2. **Links Subtab (#34):** Shared URLs are buried in message bubbles. Users need a `Links` subtab listing all URLs extracted client-side from decrypted messages (including image captions), showing domain badge, full external link, sender avatar/name, timestamp, and a "Jump to message" button that switches back to `Messages` and scrolls/highlights the source message.
3. **Confetti Trigger:** When a user sends or receives a message in the active conversation containing `congratulation` (or `congratulations`), `rõ ràng`, `ok`, or `cool` as a whole word/phrase (case-insensitive), the app renders a celebratory confetti burst without adding external npm dependencies.

## 2. Approaches Considered

1. **Recommended (Ponytail Minimalist — Pure Client Helpers + Native Canvas/DOM):**
   - Extract media (`extractMediaFromMessages`), links (`extractLinksFromMessages`, `extractDomainFromUrl`), and confetti keyword detection (`shouldTriggerConfetti`) as pure, deterministic functions in `app/utils/chat.ts` reusing `isImagePayload`, `parseImagePayload`, and `tokenizeMessageMentions`.
   - Render `ChatMediaGallery.vue` and `ChatLinksList.vue` conditionally inside the stage in `app/pages/index.vue` controlled by `activeStageTab: 'messages' | 'media' | 'links'`.
   - Implement confetti with a lightweight, zero-dependency component/helper (`ConfettiOverlay.vue`) so no new npm package is needed.
2. **Composable-Heavy Store Caching:**
   - Maintain separate reactive stores for media and links inside `useChatRoom.ts`. Rejected (YAGNI): `computed` derivations over the active conversation's decrypted `messages` array are instantaneous for in-memory pages and automatically stay in sync with edits, soft-deletes, and `loadOlderMessages`.
3. **Server-Side Queries for Media/Links:**
   - Impossible under Invariant #6 & #17 because all message payloads are E2EE AES-GCM-256 ciphertexts in Postgres. Client-side extraction over decrypted `ChatMessage[]` is mandatory.

## 3. Architecture & Component Boundaries

### 3.1 Pure Helpers (`app/utils/chat.ts` & `app/types/chat.ts`)
- `ExtractedMediaItem`: `{ id: string; messageId: string; image: EncryptedImageMetadata; caption?: string; createdAt: string; author?: Profile; userId: string }`
- `extractMediaFromMessages(messages: ChatMessage[]): ExtractedMediaItem[]`:
  - Skips messages with `deleted_at` or `encryption === 'undecryptable'`.
  - Uses `isImagePayload` + `parseImagePayload` and flattens images in reverse-chronological order (newest message first, preserving per-message image order).
- `ExtractedLinkItem`: `{ id: string; messageId: string; url: string; domain: string; createdAt: string; author?: Profile; userId: string }`
- `extractDomainFromUrl(url: string): string`:
  - Uses native `new URL(url).hostname.replace(/^www\./i, '')` with safe fallback.
- `extractLinksFromMessages(messages: ChatMessage[]): ExtractedLinkItem[]`:
  - Skips messages with `deleted_at` or `encryption === 'undecryptable'`.
  - Extracts text from standard messages or `parseImagePayload(msg.content)?.caption` for image messages.
  - Uses `tokenizeMessageMentions(text)` to collect segments where `seg.isLink && seg.href`, returning items in reverse-chronological order (newest first).
- `shouldTriggerConfetti(content: string): boolean`:
  - Extracts text (or image caption if `isImagePayload(content)`).
  - Strips inline/fenced code or matches Unicode-aware whole-word/phrase regex: `/(?<=^|[^\p{L}\p{N}_])(congratulations?|rõ\s+ràng|ok|cool)(?=$|[^\p{L}\p{N}_])/iu`.

### 3.2 `app/components/ChatMediaGallery.vue` (#33)
- **Props:** `messages: ChatMessage[]`, `channelId?: string | null`, `hasMoreHistory?: boolean`, `isLoadingHistory?: boolean`, `loadOlder?: () => Promise<number>`
- **Emits:** `selectImage(payload: { images: EncryptedImageMetadata[]; initialIndex: number })`, `viewProfile(profile: Profile)`
- **Behavior:**
  - Resolves decrypted image URLs via `useImageAttachmentCache()` + `useE2ee()` (same pattern as `MessageImageGrid.vue`).
  - Clicking tile `idx` emits `selectImage` with all gallery `EncryptedImageMetadata[]` and `initialIndex: idx`.
  - Shows hover metadata (sender name + formatted date) and empty state `"No media shared yet"`.
  - Provides `"Load older media"` button when `hasMoreHistory` is true.

### 3.3 `app/components/ChatLinksList.vue` (#34)
- **Props:** `messages: ChatMessage[]`, `hasMoreHistory?: boolean`, `isLoadingHistory?: boolean`, `loadOlder?: () => Promise<number>`
- **Emits:** `jumpToMessage(messageId: string)`, `viewProfile(profile: Profile)`
- **Behavior:**
  - Displays each extracted link with domain badge (`domain`), external anchor (`target="_blank" rel="noopener noreferrer"`), sender `UserAvatar` + display name (clickable to `viewProfile`), timestamp, and `"Jump to message"` button (`data-test="jump-to-link-message"`).
  - Shows `"No links shared yet"` empty state and optional `"Load older links"` button when `hasMoreHistory` is true.

### 3.4 Stage Sub-Header & Confetti in `app/pages/index.vue`
- Sub-header bar below the main stage header when an active conversation/channel is selected:
  - Tabs: `Messages` (`data-test="subtab-messages"`), `Media` (`data-test="subtab-media"`), `Links` (`data-test="subtab-links"`) with item count badges.
  - Resets `activeStageTab` to `'messages'` when switching conversations.
  - Jumping to a message from `ChatLinksList` sets `activeStageTab = 'messages'`, awaits `nextTick()`, and calls `messageViewportRef.value?.jumpToMessage(messageId)`.
- Confetti overlay (`data-test="confetti-overlay"`):
  - Triggers when current user sends a matching message/caption OR when a new realtime message arrives in the active conversation matching `shouldTriggerConfetti`.
  - Auto-hides after 2.5 seconds (`pointer-events-none fixed inset-0 z-50`).
