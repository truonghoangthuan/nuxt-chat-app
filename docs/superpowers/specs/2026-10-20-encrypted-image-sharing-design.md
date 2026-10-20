# Design Specification: End-to-End Encrypted Image Sharing

- **Date:** 2026-10-20
- **Status:** Draft / Reviewing
- **Target Platform:** Nuxt 4, Supabase, WebCrypto (AES-GCM-256)

---

## 1. Intent & Problem Statement

Users need the ability to share pictures securely in group channels and direct messages (DMs). Because the chat application enforces zero-knowledge end-to-end encryption (E2EE) on all message payloads via PostgreSQL triggers and client-side WebCrypto, image attachments must also be encrypted end-to-end before leaving the browser. Supabase Storage must never possess unencrypted image data.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Allow users to attach 1 to 10 images in a single message.
- Images-only messages: messages are either text or a batch of images (mutually exclusive).
- Immutable image messages: image messages cannot be edited after sending (only deleted).
- Client-side pre-processing: resize images larger than 2048px dimension (preserving aspect ratio) to balance upload performance, encryption speed, and storage footprint.
- End-to-end encryption for all image files: encrypt image bytes in the browser using AES-GCM-256 with the workspace crypto key and channel ID bound as Authenticated Additional Data (AAD).
- Storage in Supabase: upload encrypted binary blobs to a private Supabase Storage bucket (`message-attachments`).
- Channel-level Storage RLS: enforce that only members who can access the channel can download or upload objects within that channel's storage folder.
- Envelope consistency: store metadata (file paths, dimensions, MIME type, file size) inside the standard `e2ee:v1:<iv>:<ciphertext>` envelope in `messages.content`, preserving the database trigger `enforce_message_e2ee_envelope()`.
- Optimistic UI & fast feedback: show instant preview thumbnails in the composer and timeline using local blob URLs while uploading and sending.
- Responsive message rendering: compact grid (1 large, 2x2 grid for 2-4, or 4 tiles with "+N" badge for 5+) with blurred loading skeletons.
- Decryption & caching: lazy download and decrypt attachments as they scroll into view; cache decrypted blob URLs in memory per session.
- Lightbox / Full-screen viewer: arrow navigation, keyboard controls (`ArrowLeft`, `ArrowRight`, `Escape`), image counter ("X / Y"), download button for decrypted image.
- Deletion support: deleting a message cleans up its storage attachments.

### Non-Goals
- Server-side thumbnails or transcoding (impossible without giving the server the encryption key).
- Mixed text + image captions (explicitly scoped to images-only per user requirements).
- Video, audio, or arbitrary file documents (scoped strictly to standard web image formats: JPEG, PNG, WebP, GIF).
- Video streaming or animated GIF frame-by-frame compression.

### Anti-Goals
- Plaintext image uploads or public storage buckets.
- Storing unencrypted metadata or file names in Supabase tables.
- Blocking UI rendering during batch image uploads.

---

## 3. System Architecture & Data Flow

### 3.1 Encryption Format & Storage Architecture
1. **Storage Bucket:** A private Supabase bucket named `message-attachments`.
   - RLS Policy: Authenticated users can upload (`INSERT`) and read (`SELECT`) objects belonging to their channels.
   - Object path structure: `channels/<channel_id>/<client_id>/<image_index>.enc`.
2. **Binary Encryption:**
   - Image files are converted to `Uint8Array`.
   - WebCrypto `crypto.subtle.encrypt` with AES-GCM-256:
     - Initialization Vector (IV): 12-byte random cryptographically secure nonce.
     - Authenticated Additional Data (AAD): channel ID encoded as UTF-8.
     - Payload layout in storage: `[12 bytes IV][Ciphertext + 16 bytes Auth Tag]`.
3. **Message Envelope Payload:**
   - The message row in PostgreSQL uses the existing `messages.content` column.
   - The plaintext content of the message is a JSON envelope string:
     ```json
     {
       "type": "images",
       "images": [
         {
           "path": "channels/<channel_id>/<client_id>/0.enc",
           "mimeType": "image/jpeg",
           "width": 1920,
           "height": 1080,
           "size": 245120
         }
       ]
     }
     ```
   - This JSON string is encrypted using the existing `encryptContent(key, jsonString, channelId)` utility, producing standard string: `e2ee:v1:<iv-base64url>:<ciphertext-base64url>`.
   - This satisfies the database trigger `enforce_message_e2ee_envelope()` with zero schema breakage to the `content` column.

### 3.2 Database Schema & Storage Updates (`supabase/schema.sql`)
- Create bucket `message-attachments` with `public = false`.
- Storage RLS policies for `storage.objects`:
  - `Authenticated users can upload channel attachments`: allows insert into `message-attachments` if `auth.role() = 'authenticated'` and the user has access to the channel extracted from the storage path `channels/<channel_id>/...` (via `public.channels` membership check or public channel status).
  - `Authenticated users can download channel attachments`: allows select from `message-attachments` if `auth.role() = 'authenticated'` and user can access the channel corresponding to the path.
  - `Users can delete their own uploaded attachments`: allows delete if `auth.uid() = owner` or user matches message author.

### 3.3 Limits & Mutability Rules
- **File limits:** Max 10MB per file; max 30MB total batch across all attachments in a message. Files are processed sequentially to avoid blocking the UI thread during canvas resize and WebCrypto encryption.
- **Mutability:** Image messages are immutable. Editing is strictly disabled for image messages (the edit option is hidden in the message actions menu, and `editMessage` returns an error if attempted). Messages can still be soft-deleted.
- **Retry Scope:** In-memory session-based retry. Raw files and pending upload state are held in an in-memory Map in `useChatRoom`. If the user hard-reloads the browser before an upload finishes, the pending draft/retry is cleared.

### 3.3 Domain Types (`app/types/chat.ts`)
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

---

## 4. User Experience & Component Design

### 4.1 Message Composer (`MessageComposer.vue`)
- **Attach Button & Drop/Paste Targets:**
  - A paperclip icon button (`Paperclip` from Lucide) opens the native file selector (`accept="image/png,image/jpeg,image/webp,image/gif"`).
  - Drag-and-drop zone over the composer area.
  - Clipboard `paste` event handler: detects pasted images (`event.clipboardData.items`).
- **Draft Attachment Tray:**
  - When images are selected, the text input is cleared/disabled. An attachment strip displays horizontal thumbnail previews (up to 10).
  - Each thumbnail has an overlay remove button (`✕`).
  - Validation: rejects files > 10MB or exceeding 10 total images, displaying a toast or inline error.
- **Send Trigger:**
  - Send button or `Enter` key emits `sendImages(files: File[])` instead of regular text `send`.

### 4.2 Optimistic Upload & Message Delivery (`useChatRoom.ts`)
1. User clicks Send with $N$ files.
2. Composer generates a UUID `client_id` and creates local object URLs for immediate rendering.
3. Message is inserted into `messagesStore` with `status: 'sending'` and local attachment metadata.
4. Client processes files:
   - Resize via canvas if width/height > 2048px.
   - Encrypt each image binary with AES-GCM-256 + channel AAD.
   - Upload each encrypted blob to Supabase Storage: `message-attachments/channels/<channelId>/<clientId>/<index>.enc`.
5. Once all blobs are uploaded, client constructs `ImageMessagePayload` JSON, encrypts it to `e2ee:v1:...` format, and inserts the row into `messages`.
6. On success: message status marked `sent`.
7. On failure: message status marked `failed`. User can click "Retry" which resumes/retries failed storage uploads using the identical `client_id` before re-trying row insert.

### 4.3 Message Viewport & Grid Layout (`MessageViewport.vue`)
- Detects if decrypted content matches `ImageMessagePayload`.
- Displays images in a CSS Grid:
  - 1 image: single image up to 384px height, aspect-ratio preserved.
  - 2 images: 2 columns, side-by-side.
  - 3 images: 1 large on top or left, 2 stacked.
  - 4 images: 2x2 grid.
  - 5+ images: 2x2 grid with the 4th item displaying a frosted overlay with `+N` more photos.
- Each tile displays a blur skeleton while downloading/decrypting.
- Clicking any tile opens the Lightbox Viewer with the selected image index.

### 4.4 Decryption Cache (`useImageAttachmentCache.ts`)
- Maintain a memory Map: `cache.get(path) -> string (objectUrl)`.
- When viewing a message:
  - If in cache, return cached object URL.
  - If not in cache, download encrypted blob from Supabase Storage -> extract 12-byte IV -> decrypt ciphertext using AES-GCM with channel ID -> create `new Blob([decryptedBytes], { type: mimeType })` -> `URL.createObjectURL(blob)`.
- Cleanup: revoke object URLs when switching channels or upon component disposal to avoid memory leaks.

### 4.5 Lightbox Viewer Component (`ImageViewerModal.vue`)
- Fullscreen dialog overlay.
- High-res image display with loading spinner and error fallback.
- Navigation:
  - Previous / Next buttons on sides (hidden if single image).
  - Keyboard shortcuts: `ArrowLeft` (previous), `ArrowRight` (next), `Escape` (close).
  - Counter badge: e.g. "3 / 6".
  - Download button: downloads the decrypted file with default naming (`image-<index>.<ext>`).
  - Close button (`✕`) at top right or click outside backdrop.

### 4.6 Sidebar & Channel Summaries
- For unread badges, mention counts, and reply previews:
  - When content is an image payload, text representation displays: `"📷 {N} photo{s}"`.

---

## 5. Security & Edge Cases

1. **Storage Integrity:**
   - File uploads in storage are completely scrambled ciphertext. Storage inspection cannot reveal file contents, dimensions, or previews.
2. **Channel Splicing Attack:**
   - Binding `channelId` into AES-GCM AAD prevents encrypted blobs from one channel from being copied or referenced legitimately into another channel.
3. **Offline / Failed Uploads:**
   - If an upload fails midway, the message enters `failed` state. Retrying checks if blobs exist or re-uploads missing files before inserting the database message row.
4. **Key Rotation / Undecryptable State:**
   - If the user has not entered the passphrase or key cannot decrypt the message, the message renders the standard locked state: `"🔒 Encrypted image attachment"`.
5. **Soft Deletes:**
   - When a user deletes their message, a database trigger or client action issues a cleanup request to remove the uploaded files from Supabase Storage.

---

## 6. Verification & Test Plan

1. **Unit Tests (`tests/utils/crypto.test.ts`):**
   - Test binary encryption and decryption of image byte arrays.
   - Test AAD integrity failure if channel ID does not match.
2. **Store & State Tests (`tests/composables/useMessagesState.test.ts`):**
   - Verify handling of `ImageMessagePayload` content serialization and status transitions.
3. **Component Tests (`tests/components/`):**
   - Test `MessageComposer.vue`: file selection, paste handler, 10-file ceiling, clear/remove thumbnail.
   - Test `MessageViewport.vue` / image grid: 1, 2, 4, and 5+ image layouts.
   - Test `ImageViewerModal.vue`: keyboard navigation, index wrapping, close on escape.
4. **End-to-End Test Verification:**
   - Run `npm test` to verify zero regression across existing 49+ tests and full pass of new test suites.
