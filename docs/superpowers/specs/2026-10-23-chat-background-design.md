# Customizable Shared Chat Background Design (#35)

**Date:** 2026-10-23
**Issue:** `https://github.com/truonghoangthuan/nuxt-chat-app/issues/35`
**Status:** Approved

## 1. Problem & Goal

Chat backgrounds are currently fixed to the solid/frosted stage surface (`--ap-stage`). Conversation members cannot personalize their direct or group chats with shared wallpapers or gradients.

**Goal:** Allow any member of a conversation (direct or group) to set, upload, or reset a shared chat background image synced in real-time across all participants, while preserving WCAG text contrast in both Light and Dark themes.

## 2. Architecture & Data Model

### 2.1 Database & Storage (`supabase/schema.sql`)

- **`public.conversations` (and legacy `public.channels` if present):**
  - Add nullable column `background_url text`.
  - Value formats:
    - `null`: Default theme stage surface (`--ap-stage`).
    - `preset:<id>`: Built-in curated CSS gradient/pattern preset (e.g., `preset:aurora`, `preset:sunset`, `preset:midnight`, `preset:ocean`, `preset:cyberpunk`, `preset:forest`).
    - `https://...`: Public URL from the `chat-backgrounds` Supabase Storage bucket (or valid HTTPS image URL).
- **Supabase Storage (`chat-backgrounds` bucket):**
  - Public bucket (`public = true`) for fast zero-overhead CSS background rendering without blob URL lifecycle management.
  - Object path convention: `conversations/<conversation_id>/bg-<timestamp>.<ext>`.
  - RLS policies on `storage.objects`:
    - `SELECT`: Allow authenticated users (`bucket_id = 'chat-backgrounds'`).
    - `INSERT` / `UPDATE` / `DELETE`: Require `bucket_id = 'chat-backgrounds' and public.can_access_conversation(public.storage_conversation_id(name))`.

### 2.2 TypeScript Domain Interfaces (`app/types/chat.ts`)

- Add `background_url?: string | null` to `Conversation` and `Channel`.
- Add `ChatBackgroundPreset` interface:
  ```ts
  export interface ChatBackgroundPreset {
    id: string
    value: string // e.g. 'preset:aurora'
    label: string
    cssBackground: string
  }
  ```

### 2.3 Pure Helpers (`app/utils/chat.ts`)

- `CHAT_BACKGROUND_PRESETS`: 6 curated presets (`preset:aurora`, `preset:sunset`, `preset:ocean`, `preset:midnight`, `preset:cyberpunk`, `preset:forest`).
- `MAX_BACKGROUND_FILE_SIZE = 5 * 1024 * 1024` (5MB).
- `validateBackgroundFile(file: File): { valid: boolean; error?: string }`: checks allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) and size `<= 5MB`.
- `resolveChatBackgroundStyle(backgroundUrl?: string | null): Record<string, string> | null`:
  - Returns `null` when empty/invalid.
  - If `preset:<id>`, returns `{ backgroundImage: preset.cssBackground, backgroundSize: 'cover', backgroundPosition: 'center' }`.
  - If valid `http://` or `https://` URL, returns `{ backgroundImage: `url("${escapedUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }`.

### 2.4 State & Realtime Sync (`app/composables/useChatRoom.ts`)

- Map `background_url: c.background_url ?? null` in `loadConversations`, `openOrCreateDirectChat`, and `createGroup`.
- `updateChatBackground(conversationId: string, backgroundOrFile: string | File): Promise<{ error: string | null }>`:
  - Verifies authentication and target conversation existence.
  - If `backgroundOrFile` is a `File`:
    - Validates with `validateBackgroundFile(file)`.
    - Uploads to `supabase.storage.from('chat-backgrounds').upload(path, file, { contentType: file.type, upsert: true })`.
    - Resolves `supabase.storage.from('chat-backgrounds').getPublicUrl(path).data.publicUrl`.
  - Optimistically updates `targetConv.background_url` and `targetConv.updated_at`.
  - Persists via `supabase.from('conversations').update({ background_url, updated_at }).eq('id', conversationId)`.
  - Rolls back on error.
- `removeChatBackground(conversationId: string): Promise<{ error: string | null }>`:
  - Optimistically sets `targetConv.background_url = null` and updates `public.conversations` with `{ background_url: null, updated_at }`, rolling back on failure.
- Realtime sync: Existing `postgres_changes` listener on `public.conversations` (`UPDATE`) merges `payload.new` into `conversations.value`, automatically propagating `background_url` changes in real-time to all members.

### 2.5 UI Components

1. **`app/components/ChatBackgroundModal.vue`:**
   - Props: `isOpen: boolean`, `conversation: Conversation | null`, `isSubmitting?: boolean`.
   - Emits: `close`, `selectPreset(presetValue: string)`, `uploadFile(file: File)`, `reset()`.
   - Renders:
     - Live preview banner showing current/selected background.
     - 6-item preset gallery grid (`data-test="preset-item-<id>"`).
     - Custom image upload trigger (`data-test="upload-background-input"`) with client-side validation error display (`data-test="background-error"`).
     - "Reset to Default" button (`data-test="reset-background-btn"`) when a background is active.
2. **Entry Points (`app/pages/index.vue` & `app/components/GroupInfoModal.vue`):**
   - Stage header in `app/pages/index.vue`: icon button (`data-test="open-chat-background-btn"`, `Image` / `Wallpaper` icon from `@lucide/vue`) visible whenever an active conversation or channel is selected.
   - `GroupInfoModal.vue`: button (`data-test="group-change-background-btn"`) emitting `openBackground` to open `ChatBackgroundModal`.
3. **Viewport Contrast Rendering (`app/components/MessageViewport.vue`):**
   - Accept `backgroundUrl?: string | null` prop.
   - Render an absolute non-interactive background layer (`data-test="chat-background-layer"`) behind the scroll container when `resolveChatBackgroundStyle(backgroundUrl)` is non-null, paired with an adaptive contrast overlay (`data-test="chat-background-scrim"`, `bg-white/65 dark:bg-[#0d0f17]/70 backdrop-blur-[2px]`) so message bubbles, timestamps, and dividers remain WCAG-compliant in both Light and Dark modes.

## 3. Testing Strategy

- `tests/utils/chat.test.ts`: Unit tests for `CHAT_BACKGROUND_PRESETS`, `validateBackgroundFile`, and `resolveChatBackgroundStyle`.
- `tests/composables/useChatRoom.test.ts`: Unit tests for `updateChatBackground` (preset string, File upload, validation error, DB rollback), `removeChatBackground`, and Realtime `conversations` `UPDATE` sync of `background_url`.
- `tests/components/ChatBackgroundModal.test.ts`: Component tests for preset selection, custom file upload validation, reset button, and modal close.
- `tests/components/MessageViewport.test.ts` / `tests/components/indexPage.test.ts`: Verify `backgroundUrl` rendering and adaptive scrim layer in `MessageViewport` and header/group modal triggers in `index.vue`.
