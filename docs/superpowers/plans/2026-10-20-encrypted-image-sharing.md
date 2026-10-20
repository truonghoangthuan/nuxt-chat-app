# Encrypted Image Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to securely attach and view batches of 1–10 end-to-end encrypted images in channels and DMs without plaintext storage in Supabase.

**Architecture:** Client-side canvas downscaling (max 2048px), WebCrypto AES-GCM-256 binary encryption with channel ID as AAD, direct upload to a private Supabase Storage bucket (`message-attachments`), and payload JSON encrypted in the existing `e2ee:v1:` envelope on `messages.content`. Messages render in a responsive grid with lazy decryption, memory caching, and a full-screen lightbox viewer.

**Tech Stack:** Nuxt 4, Vue 3, WebCrypto API (AES-GCM-256), Supabase Storage & Database RLS, Lucide Icons, Vitest, `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-20-encrypted-image-sharing-design.md`

## Global Constraints

- Storage bucket name: `message-attachments` (private).
- Max 10 images per message; max 10MB per file; max 30MB total batch size.
- Max image dimension: 2048px (rescaling via canvas before encryption).
- Binary encryption format: `[12-byte IV][Ciphertext + 16-byte Auth Tag]`, AAD = `channel_id` (UTF-8).
- Database payload format: JSON `{"type":"images","images":[{path,mimeType,width,height,size}]}` encrypted inside `e2ee:v1:<iv>:<ciphertext>`.
- Image messages are immutable (editing disabled; deleting allowed).
- All Vitest suites must pass (`npm test`) without breaking existing tests.

## Review Focus

1. **Tampered/Corrupted storage blob:** WebCrypto auth tag verification fails -> handled gracefully with fallback locked/error thumbnail without crashing.
2. **Cross-channel ciphertext injection:** Storage blob referenced in a different channel ID fails decryption due to AAD mismatch -> displays error.
3. **Invalid attachment validation:** Pasting or dropping >10 files, files >10MB, or non-image MIME types -> rejected upfront without partial upload.
4. **Channel switch during active download/decrypt:** Component unmount or channel change clears object URLs and ignores pending decryption promises without memory leaks.
5. **Session upload failure & retry:** Network drop midway through a 5-image upload reuses the same `client_id` and does not duplicate already-uploaded blobs.

---

### Task 1: Domain Types and Schema Definition

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `supabase/schema.sql`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Produces: `EncryptedImageMetadata`, `ImageMessagePayload`, `LocalImageAttachment` interfaces in `app/types/chat.ts`.
- Produces: Storage bucket SQL definition and channel-aware RLS policies in `supabase/schema.sql`.

- [ ] **Step 1: Write the failing test for image message payload typing and detector**

In `tests/utils/chat.test.ts`, add test asserting `isImagePayload(content)` identifies stringified JSON payload with `type: 'images'`.

```ts
import { isImagePayload } from '~/utils/image'

describe('isImagePayload', () => {
  it('returns true for valid image message JSON structure', () => {
    const valid = JSON.stringify({
      type: 'images',
      images: [{ path: 'channels/1/0.enc', mimeType: 'image/jpeg', width: 800, height: 600, size: 1024 }],
    })
    expect(isImagePayload(valid)).toBe(true)
  })

  it('returns false for regular text or malformed JSON', () => {
    expect(isImagePayload('Hello world')).toBe(false)
    expect(isImagePayload('{"type":"text"}')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/utils/chat.test.ts`
Expected: FAIL (`Cannot find module '~/utils/image'`)

- [ ] **Step 3: Implement domain types in `app/types/chat.ts` and stub in `app/utils/image.ts`**

Add interfaces to `app/types/chat.ts`:
```ts
export interface EncryptedImageMetadata {
  path: string
  mimeType: string
  width: number
  height: number
  size: number
}

export interface ImageMessagePayload {
  type: 'images'
  images: EncryptedImageMetadata[]
}

export interface LocalImageAttachment {
  file: File
  localUrl: string
  width: number
  height: number
}
```

Add storage definition in `supabase/schema.sql`:
```sql
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;
```

Implement `isImagePayload` in `app/utils/image.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/utils/chat.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/image.ts supabase/schema.sql tests/utils/chat.test.ts
git commit -m "feat: add image attachment types and storage schema definition"
```

---

### Task 2: Binary WebCrypto Encryption and Decryption

**Files:**
- Modify: `app/utils/crypto.ts`
- Test: `tests/utils/crypto.test.ts`

**Interfaces:**
- Consumes: `CryptoKey` from `useE2ee`.
- Produces: `encryptBinary(key: CryptoKey, data: Uint8Array, channelId: string): Promise<Uint8Array>`
- Produces: `decryptBinary(key: CryptoKey, encryptedBytes: Uint8Array, channelId: string): Promise<Uint8Array>`

- [ ] **Step 1: Write failing tests for binary encryption and decryption with AAD**

In `tests/utils/crypto.test.ts`:
```ts
describe('encryptBinary and decryptBinary', () => {
  it('encrypts and decrypts Uint8Array round-trip with channelId as AAD', async () => {
    const rawKey = new Uint8Array(32).fill(7)
    const key = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
    const original = new TextEncoder().encode('fake-image-bytes-data-stream')
    const encrypted = await encryptBinary(key, original, 'channel-123')
    expect(encrypted.byteLength).toBe(12 + original.byteLength + 16)

    const decrypted = await decryptBinary(key, encrypted, 'channel-123')
    expect(new TextDecoder().decode(decrypted)).toBe('fake-image-bytes-data-stream')
  })

  it('fails decryption if channelId does not match (cross-channel defense)', async () => {
    const rawKey = new Uint8Array(32).fill(7)
    const key = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
    const original = new TextEncoder().encode('secret-bytes')
    const encrypted = await encryptBinary(key, original, 'channel-123')

    await expect(decryptBinary(key, encrypted, 'channel-456')).rejects.toThrow()
  })

  it('fails decryption if ciphertext is tampered', async () => {
    const rawKey = new Uint8Array(32).fill(7)
    const key = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
    const original = new TextEncoder().encode('secret-bytes')
    const encrypted = await encryptBinary(key, original, 'channel-123')
    encrypted[15] ^= 0xff

    await expect(decryptBinary(key, encrypted, 'channel-123')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/utils/crypto.test.ts`
Expected: FAIL (`encryptBinary is not defined`)

- [ ] **Step 3: Implement `encryptBinary` and `decryptBinary` in `app/utils/crypto.ts`**

Use 12-byte random IV via `crypto.getRandomValues(new Uint8Array(12))`.
Encode `channelId` to UTF-8 for `additionalData`.
Prepend 12-byte IV to ciphertext output in `encryptBinary`.
Slice first 12 bytes as IV and remaining bytes as ciphertext in `decryptBinary`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/utils/crypto.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/crypto.ts tests/utils/crypto.test.ts
git commit -m "feat: add AES-GCM-256 binary encryption and decryption utilities"
```

---

### Task 3: Image Validation, Downscaling, and Parsing Utilities

**Files:**
- Create/Modify: `app/utils/image.ts`
- Test: `tests/utils/image.test.ts`

**Interfaces:**
- Produces: `validateImageFiles(files: File[]): { valid: boolean; error?: string }`
- Produces: `resizeImage(file: File, maxDim = 2048): Promise<{ blob: Blob; width: number; height: number }>`
- Produces: `parseImagePayload(content: string): ImageMessagePayload | null`
- Produces: `formatImageMessageSummary(count: number): string`

- [ ] **Step 1: Write failing tests for validation, sizing limits, and summary formatting**

In `tests/utils/image.test.ts`:
```ts
import { validateImageFiles, formatImageMessageSummary, parseImagePayload } from '~/utils/image'

describe('Image utilities', () => {
  it('validates file count between 1 and 10', () => {
    const empty: File[] = []
    expect(validateImageFiles(empty).valid).toBe(false)

    const eleven = Array.from({ length: 11 }, (_, i) => new File([''], `img${i}.jpg`, { type: 'image/jpeg' }))
    expect(validateImageFiles(eleven).valid).toBe(false)
    expect(validateImageFiles(eleven).error).toMatch(/maximum 10/i)
  })

  it('rejects files larger than 10MB or non-image types', () => {
    const huge = [new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })]
    expect(validateImageFiles(huge).valid).toBe(false)
    expect(validateImageFiles(huge).error).toMatch(/10MB/i)

    const pdf = [new File(['text'], 'doc.pdf', { type: 'application/pdf' })]
    expect(validateImageFiles(pdf).valid).toBe(false)
    expect(validateImageFiles(pdf).error).toMatch(/image/i)
  })

  it('formats summary label correctly', () => {
    expect(formatImageMessageSummary(1)).toBe('📷 1 photo')
    expect(formatImageMessageSummary(4)).toBe('📷 4 photos')
  })

  it('parses valid image payload', () => {
    const json = JSON.stringify({ type: 'images', images: [{ path: 'p', mimeType: 'image/png', width: 10, height: 10, size: 100 }] })
    expect(parseImagePayload(json)?.images).toHaveLength(1)
    expect(parseImagePayload('not json')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/utils/image.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement functions in `app/utils/image.ts`**

Include:
- `validateImageFiles`: checks count $\le 10$, file sizes $\le 10\text{MB}$, batch total $\le 30\text{MB}$, allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
- `resizeImage`: loads `HTMLImageElement` or uses `createImageBitmap`/`canvas`, scales down proportionally if $\max(w, h) > \text{maxDim}$, exports `canvas.toBlob`.
- `parseImagePayload`: safe JSON parse verifying `type === 'images'` and array structure.
- `formatImageMessageSummary`: returns `"📷 N photo"` / `"📷 N photos"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/utils/image.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/image.ts tests/utils/image.test.ts
git commit -m "feat: add image file validation, resizing, and payload parsing utilities"
```

---

### Task 4: Image Attachment Cache Composable

**Files:**
- Create: `app/composables/useImageAttachmentCache.ts`
- Test: `tests/composables/useImageAttachmentCache.test.ts`

**Interfaces:**
- Consumes: `decryptBinary` from `app/utils/crypto.ts`.
- Produces: `useImageAttachmentCache()` returning `{ getOrFetchImage, revokeAllUrls, isDecrypting }`.

- [ ] **Step 1: Write failing test for attachment caching and lazy download**

In `tests/composables/useImageAttachmentCache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'

describe('useImageAttachmentCache', () => {
  it('returns cached blob URL on second call without re-fetching', async () => {
    const cache = useImageAttachmentCache()
    const mockSupabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          download: vi.fn().mockResolvedValue({
            data: new Blob([new Uint8Array(40)]),
            error: null,
          }),
        }),
      },
    }
    const fakeKey = {} as CryptoKey
    // Mock decryptBinary
    vi.mock('~/utils/crypto', () => ({
      decryptBinary: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    }))

    const url1 = await cache.getOrFetchImage('path/1.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase as any)
    const url2 = await cache.getOrFetchImage('path/1.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase as any)

    expect(url1).toBe(url2)
    expect(mockSupabase.storage.from).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/composables/useImageAttachmentCache.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `useImageAttachmentCache.ts`**

Implement Map-based caching with in-flight Promise deduplication.
When `revokeAllUrls()` is called, call `URL.revokeObjectURL(url)` on each cached URL and clear the cache.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/composables/useImageAttachmentCache.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useImageAttachmentCache.ts tests/composables/useImageAttachmentCache.test.ts
git commit -m "feat: add image attachment download and decryption cache composable"
```

---

### Task 5: Optimistic Image Sending Orchestration in `useChatRoom`

**Files:**
- Modify: `app/composables/useChatRoom.ts`
- Modify: `app/composables/useMessagesState.ts`
- Test: `tests/composables/useChatRoom.test.ts`
- Test: `tests/composables/useMessagesState.test.ts`

**Interfaces:**
- Consumes: `resizeImage` from `app/utils/image.ts`, `encryptBinary`, `encryptContent` from `app/utils/crypto.ts`.
- Produces: `sendImages(files: File[]): Promise<boolean>` in `useChatRoom`.
- Produces: Guard in `editMessage` rejecting image messages.

- [ ] **Step 1: Write failing test in `tests/composables/useChatRoom.test.ts` for `sendImages`**

Test that `sendImages` produces optimistic sending message with local blob URLs, uploads encrypted binaries to Supabase Storage `message-attachments`, inserts encrypted payload into `messages` table, and marks status as `sent`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/composables/useChatRoom.test.ts`
Expected: FAIL (`sendImages is not a function`)

- [ ] **Step 3: Implement `sendImages` and editing guard in `app/composables/useChatRoom.ts`**

1. Validate active channel and user.
2. Generate `client_id = crypto.randomUUID()`.
3. Create local preview objects (`LocalImageAttachment`).
4. Add optimistic message to store (`status: 'sending'`).
5. Sequentially process files: downscale via `resizeImage`, encrypt bytes via `encryptBinary(key, bytes, channelId)`, upload to `supabase.storage.from('message-attachments').upload(...)`.
6. Construct `ImageMessagePayload` JSON, encrypt with `encryptContent(key, json, channelId)`.
7. Insert row into `public.messages`.
8. In `editMessage`, if existing message content is an image payload (`isImagePayload`), reject with error "Image messages cannot be edited".

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts app/composables/useMessagesState.ts tests/composables/useChatRoom.test.ts
git commit -m "feat: implement optimistic encrypted image upload and immutability guard in useChatRoom"
```

---

### Task 6: Message Composer Image Attachment UI

**Files:**
- Modify: `app/components/MessageComposer.vue`
- Test: `tests/components/MessageComposer.test.ts` (or `tests/components/chatUi.test.ts`)

**Interfaces:**
- Consumes: `validateImageFiles` from `app/utils/image.ts`.
- Emits: `(e: 'sendImages', files: File[]): void`

- [ ] **Step 1: Write failing test for image selection, tray rendering, and send**

In `tests/components/chatUi.test.ts` (or dedicated test):
Test adding files via file input, verify thumbnail tray renders with remove button, verify typing input is disabled/cleared, and verify emitting `sendImages` on Submit.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/components/chatUi.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Attachment UI in `MessageComposer.vue`**

1. Add Paperclip icon button triggering hidden `<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" />`.
2. Add paste event listener on textarea: if `e.clipboardData.files` contains images, intercept and queue files.
3. Add drag-and-drop listener over composer card.
4. Render horizontal attachment preview strip above input with remove button (`✕`) for each image.
5. If attachments exist, disable text input with placeholder "Images attached (text disabled)".
6. On submit, emit `sendImages(pendingFiles)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/components/chatUi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageComposer.vue tests/components/chatUi.test.ts
git commit -m "feat: add attachment tray, drag-and-drop, and paste support in MessageComposer"
```

---

### Task 7: Responsive Image Grid in Message Viewport

**Files:**
- Create: `app/components/MessageImageGrid.vue`
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/components/MessageActionsMenu.vue`
- Test: `tests/components/MessageImageGrid.test.ts`

**Interfaces:**
- Consumes: `ImageMessagePayload` from `app/types/chat.ts`, `useImageAttachmentCache`.
- Emits: `(e: 'selectImage', payload: { images: EncryptedImageMetadata[]; initialIndex: number }): void`.

- [ ] **Step 1: Write failing test for grid layout rendering**

In `tests/components/MessageImageGrid.test.ts`:
Verify rendering 1 image as single tile, 2 images as 2-column grid, 4 images as 2x2 grid, and 5 images showing 4 tiles with "+1" badge on 4th tile. Verify clicking a tile emits `selectImage`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/components/MessageImageGrid.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `MessageImageGrid.vue` and integrate into `MessageViewport.vue`**

1. Implement `MessageImageGrid.vue` with Tailwind grid layouts (`grid-cols-1`, `grid-cols-2`).
2. Integrate `useImageAttachmentCache` for lazy loading tiles.
3. When decrypted content is `ImageMessagePayload`, render `MessageImageGrid` instead of text markdown.
4. In `MessageActionsMenu.vue`, hide the "Edit" action if message content is an image payload.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/components/MessageImageGrid.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageImageGrid.vue app/components/MessageViewport.vue app/components/MessageActionsMenu.vue tests/components/MessageImageGrid.test.ts
git commit -m "feat: add responsive image grid and wire into MessageViewport"
```

---

### Task 8: Fullscreen Lightbox Viewer Component

**Files:**
- Create: `app/components/ImageViewerModal.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/ImageViewerModal.test.ts`

**Interfaces:**
- Props: `open: boolean`, `images: EncryptedImageMetadata[]`, `initialIndex: number`, `channelId: string`.
- Emits: `(e: 'update:open', val: boolean): void`.

- [ ] **Step 1: Write failing test for lightbox navigation and hotkeys**

In `tests/components/ImageViewerModal.test.ts`:
Test previous/next button clicks, keyboard `ArrowLeft`/`ArrowRight` advancing active index, `Escape` emitting close, and counter display (`"2 / 4"`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/components/ImageViewerModal.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `ImageViewerModal.vue` and integrate into `app/pages/index.vue`**

1. Modal with dark backdrop overlay.
2. Centered active image with high-res display and loading indicator.
3. Left/right chevron buttons (hidden if single image).
4. Top bar with counter (`X / Y`), download button (creates temporary link with `download` attribute from decrypted blob URL), and close button (`✕`).
5. `useEventListener(window, 'keydown', ...)` for `ArrowLeft`, `ArrowRight`, `Escape`.
6. Mount modal in `app/pages/index.vue` controlled by state emitted from `MessageViewport`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/components/ImageViewerModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/ImageViewerModal.vue app/pages/index.vue tests/components/ImageViewerModal.test.ts
git commit -m "feat: add fullscreen image lightbox viewer with hotkeys and download"
```

---

### Task 9: Reply Previews, Sidebar Summaries, and Cache Cleanup

**Files:**
- Modify: `app/composables/useChatRoom.ts`
- Modify: `app/components/ChatSidebar.vue`
- Modify: `app/components/MessageViewport.vue`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `formatImageMessageSummary` from `app/utils/image.ts`.

- [ ] **Step 1: Write failing test for image message summary in reply and unread mention text**

In `tests/composables/useChatRoom.test.ts`:
Assert that `reply_to` preview and `unreadMentions` evaluate `"📷 N photos"` when decrypting an image payload.
Assert that switching active channel calls cache `revokeAllUrls()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/composables/useChatRoom.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement summary labels and channel-switch cleanup**

1. When rendering reply preview in `MessageViewport`, format image payload as `📷 {N} photo(s)`.
2. In `selectChannel(channelId)`, invoke `imageAttachmentCache.revokeAllUrls()` to prevent memory accumulation across channels.
3. Handle soft delete: if message author soft-deletes message, delete storage objects from bucket `message-attachments`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts app/components/ChatSidebar.vue app/components/MessageViewport.vue tests/composables/useChatRoom.test.ts
git commit -m "feat: wire image summary previews and memory cache cleanup on channel switch"
```

---

### Task 10: Verification Gate and Full Regression Suite

**Files:**
- Test: `tests/**/*.test.ts`

- [ ] **Step 1: Run complete Vitest suite**

Run: `npm test`
Expected: All unit and component test suites PASS with 0 failures.

- [ ] **Step 2: Build verification**

Run: `npm run build`
Expected: Nuxt production build completes successfully without TypeScript or template errors.

- [ ] **Step 3: Final Commit and Documentation update**

```bash
git add -A
git commit -m "feat: complete end-to-end encrypted image sharing implementation"
```
