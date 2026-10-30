# Bank QR Code Image Upload & Music Player Action Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload bank QR images directly in profile settings (replacing the URL text input) and display in-chat system message pills when users pause, stop, or skip tracks in the synchronized music player.

**Architecture:** 
1. **Bank QR Upload:** Replace `<input id="bank-qr-url" type="url">` in `ProfileSettingsModal.vue` with an image file uploader featuring instant preview, validation (PNG/JPG/WebP, max 5MB), and removal controls. Upload to Supabase Storage `profile-media` bucket (with seamless base64 Data URL fallback if storage is unprovisioned) and store the resulting URL in `public.profiles.bank_qr_url`.
2. **Music Action Notices:** Extend `SystemEventType` with `'music_pause' | 'music_stop' | 'music_skip'`. When a user clicks pause, stop, or next in `MusicPlayerBar.vue` (or triggers via Media Session API), dispatch an encrypted E2EE system message via `sendMusicActionSystemMessage` to render standard chat pill notices matching the reference visual style.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Supabase Storage & Database, WebCrypto AES-GCM-256 E2EE, Vitest.

**Spec:** User request:
1. User's bank QR code is an image, and the user will upload it, it is not an input the image url.
2. In the music player feature, show who clicked stop playback, who clicked next song, who clicked pause in the chat similar to the reference pill image.

## Global Constraints

- Preserve all existing tests and functional `data-test` attributes.
- Never introduce new Postgres tables or message columns (avoid `PGRST204` schema cache errors); persist chat milestones through existing encrypted `public.messages` system payloads.
- Ensure storage uploads fail safely with local base64 Data URL fallback so the application works even before bucket DDL is executed.
- Ensure only the initiating user sends the chat system message (never the receivers) to eliminate duplicate notifications.
- Keep Vitest SSR-safe state fallback discipline (`typeof useState !== 'undefined'`).

## Review Focus

1. **Storage RLS or unprovisioned bucket failure:** If Supabase storage bucket `profile-media` is missing or rejects upload, fallback to reading image as base64 Data URL so profile save never breaks.
2. **Duplicate system notices on remote sync:** Remote clients receiving websocket `music_sync` broadcasts must never dispatch chat messages; only user gesture triggers the system message.
3. **Empty queue skip behavior:** When skipping on an empty queue, trigger a clean stop action notice rather than an invalid next track reference.
4. **Rapid toggle spam:** Guard pause/play toggles so users double-clicking controls do not flood the chat timeline with duplicate system messages.
5. **Existing QR removal:** Provide explicit "Remove QR" capability in `ProfileSettingsModal.vue` so users can clear their bank QR code without uploading a replacement.

---

### Task 1: System Event Types & Message Formatter for Music Actions

**Files:**
- Modify: `app/types/chat.ts:224-232`
- Modify: `app/utils/chat.ts:820-835`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: `SystemMessagePayload` from `app/types/chat.ts`
- Produces: `SystemEventType` extended with `'music_pause' | 'music_stop' | 'music_skip'`, and `formatSystemMessageText` returning formatted pill copy.

- [ ] **Step 1: Write failing tests for music action system message formatting**

In `tests/utils/chat.test.ts`, add test cases for `music_pause`, `music_stop`, and `music_skip`:

```typescript
it('formats music_pause, music_stop, and music_skip system messages', () => {
  expect(formatSystemMessageText({
    type: 'system',
    event: 'music_pause',
    actorName: 'Hà Anh Tuấn',
    detail: 'COOLKID - SAU CƠN MƯA (ft. RHYDER)',
  })).toBe('Hà Anh Tuấn paused playback 🎵 COOLKID - SAU CƠN MƯA (ft. RHYDER)')

  expect(formatSystemMessageText({
    type: 'system',
    event: 'music_pause',
    actorName: 'Hà Anh Tuấn',
  })).toBe('Hà Anh Tuấn paused playback')

  expect(formatSystemMessageText({
    type: 'system',
    event: 'music_stop',
    actorName: 'Hà Anh Tuấn',
  })).toBe('Hà Anh Tuấn stopped playback')

  expect(formatSystemMessageText({
    type: 'system',
    event: 'music_skip',
    actorName: 'Hà Anh Tuấn',
    detail: 'COOLKID - SAU CƠN MƯA (ft. RHYDER)',
  })).toBe('Hà Anh Tuấn skipped to next song 🎵 COOLKID - SAU CƠN MƯA (ft. RHYDER)')

  expect(formatSystemMessageText({
    type: 'system',
    event: 'music_skip',
    actorName: 'Hà Anh Tuấn',
  })).toBe('Hà Anh Tuấn skipped to next song')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts -t "formats music_pause, music_stop, and music_skip"`
Expected: FAIL due to missing switch cases.

- [ ] **Step 3: Update `app/types/chat.ts` and `app/utils/chat.ts`**

1. In `app/types/chat.ts`:
```typescript
export type SystemEventType =
  | 'buzz'
  | 'group_rename'
  | 'background_change'
  | 'background_reset'
  | 'music_play'
  | 'music_pause'
  | 'music_stop'
  | 'music_skip'
```
2. In `app/utils/chat.ts`:
```typescript
    case 'music_play':
      return `${payload.actorName} started playing 🎵 ${payload.detail || 'a track'}`
    case 'music_pause':
      return `${payload.actorName} paused playback${payload.detail ? ` 🎵 ${payload.detail}` : ''}`
    case 'music_stop':
      return `${payload.actorName} stopped playback`
    case 'music_skip':
      return `${payload.actorName} skipped to next song${payload.detail ? ` 🎵 ${payload.detail}` : ''}`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts -t "formats music_pause, music_stop, and music_skip"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(music): add system event types and formatting for pause, stop, and skip"
```

---

### Task 2: Supabase Storage Bucket & Image File Validation Helper

**Files:**
- Modify: `supabase/schema.sql:670-710`
- Modify: `app/utils/chat.ts:684-700`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: File object `{ type: string, size: number }`
- Produces: `validateImageFile(file, maxBytes)` returning `{ valid: boolean, error?: string }`

- [ ] **Step 1: Write test for image file validation helper**

In `tests/utils/chat.test.ts`:
```typescript
describe('validateImageFile', () => {
  it('validates supported image types within size limit', () => {
    expect(validateImageFile({ type: 'image/png', size: 1024 * 1024 })).toEqual({ valid: true })
    expect(validateImageFile({ type: 'image/jpeg', size: 2 * 1024 * 1024 })).toEqual({ valid: true })
    expect(validateImageFile({ type: 'image/webp', size: 500 * 1024 })).toEqual({ valid: true })
  })

  it('rejects unsupported types and oversized files', () => {
    expect(validateImageFile({ type: 'application/pdf', size: 100 }).valid).toBe(false)
    expect(validateImageFile({ type: 'image/png', size: 6 * 1024 * 1024 }).valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts -t "validateImageFile"`
Expected: FAIL with `validateImageFile is not defined`.

- [ ] **Step 3: Implement `validateImageFile` and storage SQL policies**

1. In `app/utils/chat.ts`:
```typescript
export function validateImageFile(
  file: { type: string; size: number },
  maxBytes = 5 * 1024 * 1024,
): { valid: boolean; error?: string } {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return { valid: false, error: 'Only PNG, JPEG, WebP, or GIF images are supported.' }
  }
  if (file.size > maxBytes) {
    return { valid: false, error: 'Image file size must be 5MB or less.' }
  }
  return { valid: true }
}
```
2. In `supabase/schema.sql`, add idempotent `profile-media` public bucket and storage RLS policies:
```sql
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload profile media" on storage.objects;
create policy "Authenticated users can upload profile media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-media');

drop policy if exists "Anyone can view profile media" on storage.objects;
create policy "Anyone can view profile media"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'profile-media');

drop policy if exists "Authenticated users can update profile media" on storage.objects;
create policy "Authenticated users can update profile media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-media');

drop policy if exists "Authenticated users can delete profile media" on storage.objects;
create policy "Authenticated users can delete profile media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profile-media');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts -t "validateImageFile"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/chat.ts supabase/schema.sql tests/utils/chat.test.ts
git commit -m "feat(profile): add image validation helper and profile-media bucket definition"
```

---

### Task 3: Bank QR Image Upload & Preview in `ProfileSettingsModal.vue`

**Files:**
- Modify: `app/components/ProfileSettingsModal.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `profile.bank_qr_url?: string | null`
- Produces: Image file picker with instant preview, delete action, upload to `profile-media` with base64 Data URL fallback, emitting `save` with updated `bankQrUrl: string | null`.

- [ ] **Step 1: Write component tests for Bank QR upload in `ProfileSettingsModal`**

In `tests/components/chatUi.test.ts`:
```typescript
it('ProfileSettingsModal allows uploading and removing a bank QR image', async () => {
  const ProfileSettingsModal = (await import('~/components/ProfileSettingsModal.vue')).default
  const wrapper = mount(ProfileSettingsModal, {
    props: {
      isOpen: true,
      profile: {
        id: 'u-1',
        display_name: 'Alice',
        avatar_color: '#0284c7',
        bank_qr_url: 'https://example.com/existing-qr.png',
      },
    },
  })

  // Should render existing preview
  expect(wrapper.find('[data-test="bank-qr-preview"]').exists()).toBe(true)
  expect(wrapper.find('[data-test="bank-qr-preview"] img').attributes('src')).toBe('https://example.com/existing-qr.png')

  // Click remove button
  await wrapper.find('[data-test="bank-qr-remove-btn"]').trigger('click')
  expect(wrapper.find('[data-test="bank-qr-preview"]').exists()).toBe(false)
  expect(wrapper.find('[data-test="bank-qr-upload-btn"]').exists()).toBe(true)

  // Submit form
  await wrapper.find('form').trigger('submit')
  const saveEvents = wrapper.emitted('save')
  expect(saveEvents).toBeTruthy()
  expect(saveEvents?.[0][0].bankQrUrl).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts -t "allows uploading and removing a bank QR image"`
Expected: FAIL due to missing `data-test="bank-qr-preview"`.

- [ ] **Step 3: Implement Bank QR upload, preview, and delete in `ProfileSettingsModal.vue`**

1. Replace the text input `<input id="bank-qr-url" type="url" ...>` with:
   - `<input ref="bankQrFileInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onBankQrFileSelected" />`
   - If `bankQrPreviewUrl` is present:
     - Preview image container (`data-test="bank-qr-preview"`) with small thumbnail, "Change QR" button (`data-test="bank-qr-upload-btn"`), and "Remove QR" button (`data-test="bank-qr-remove-btn"`).
   - If `bankQrPreviewUrl` is null:
     - Dotted upload zone with upload icon, "Upload QR Code image" button (`data-test="bank-qr-upload-btn"`), and helper text.
2. In `<script setup>`:
   - Handle file selection: validate with `validateImageFile`, create object URL for instant preview, set `selectedBankQrFile`.
   - On save: if `selectedBankQrFile` is set, upload to Supabase storage `profile-media` (`bank-qr/${props.profile.id}-${Date.now()}.${ext}`). If upload fails, fallback to `FileReader.readAsDataURL(file)`. If removed, set `bankQrUrl = null`. If unchanged, retain original `props.profile.bank_qr_url`.
   - Pass resolved `bankQrUrl` in the `save` event payload.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts -t "allows uploading and removing a bank QR image"`
Expected: PASS.

- [ ] **Step 5: Run full ProfileSettingsModal test suite**

Run: `npx vitest run tests/components/chatUi.test.ts -t "ProfileSettingsModal"`
Expected: All ProfileSettingsModal tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/ProfileSettingsModal.vue tests/components/chatUi.test.ts
git commit -m "feat(profile): replace bank qr url text input with image uploader and preview"
```

---

### Task 4: Music Player Action Notices Integration (`useChatRoom.ts` & `index.vue`)

**Files:**
- Modify: `app/composables/useChatRoom.ts:1240-1260, 2060-2071`
- Modify: `app/pages/index.vue:115-125, 230-260, 1170-1185`
- Test: `tests/components/musicUi.test.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `useChatRoom.ts` `sendMessage`, `currentProfile`
- Produces: `sendMusicActionSystemMessage(event, detail?, conversationId?, actorNameOverride?)` in `useChatRoom.ts`
- Triggers: In `index.vue`, call `sendMusicActionSystemMessage` on user-initiated pause, stop, and skip.

- [ ] **Step 1: Write unit tests in `useChatRoom.test.ts` for `sendMusicActionSystemMessage`**

```typescript
it('sendMusicActionSystemMessage dispatches encrypted system payloads for pause, stop, and skip', async () => {
  const room = await setupTestChatRoom()
  
  await room.sendMusicActionSystemMessage('music_pause', 'Track Title', 'conv-123')
  expect(lastSentMessagePayload(room)).toEqual(expect.objectContaining({
    type: 'system',
    event: 'music_pause',
    detail: 'Track Title',
  }))

  await room.sendMusicActionSystemMessage('music_stop', undefined, 'conv-123')
  expect(lastSentMessagePayload(room)).toEqual(expect.objectContaining({
    type: 'system',
    event: 'music_stop',
  }))

  await room.sendMusicActionSystemMessage('music_skip', 'Next Track Title', 'conv-123')
  expect(lastSentMessagePayload(room)).toEqual(expect.objectContaining({
    type: 'system',
    event: 'music_skip',
    detail: 'Next Track Title',
  }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "sendMusicActionSystemMessage"`
Expected: FAIL with `room.sendMusicActionSystemMessage is not a function`.

- [ ] **Step 3: Implement `sendMusicActionSystemMessage` in `useChatRoom.ts` and wire in `index.vue`**

1. In `app/composables/useChatRoom.ts`:
```typescript
  async function sendMusicActionSystemMessage(
    event: 'music_play' | 'music_pause' | 'music_stop' | 'music_skip',
    detail?: string,
    conversationId?: string,
    actorNameOverride?: string,
  ): Promise<void> {
    const targetId = conversationId || activeConversationId.value
    if (!targetId) return
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    const actorName = actorNameOverride || current?.display_name || 'Someone'
    const payload = serializeSystemMessage({
      type: 'system',
      event,
      actorName,
      ...(detail ? { detail } : {}),
    })
    await sendMessage(payload, undefined, targetId).catch(() => {})
  }
```
Expose `sendMusicActionSystemMessage` in the return object of `useChatRoom`. Keep `sendMusicPlaySystemMessage` calling it for backward compatibility.

2. In `app/pages/index.vue`:
- Import `sendMusicActionSystemMessage` from `useChatRoom`.
- In `handleTogglePlayPause`:
  - If currently playing, send `sendMusicActionSystemMessage('music_pause', musicCurrentTrack.value?.title, convId)`.
  - Toggle playback.
- In `handleStopPlayback`:
  - Send `sendMusicActionSystemMessage('music_stop', undefined, convId)`.
  - Call `musicStopPlayback(true)`.
- In `handleSkipToNext`:
  - If queue has items, send `sendMusicActionSystemMessage('music_skip', musicQueue.value[0]?.title, convId)`.
  - If queue is empty, send `sendMusicActionSystemMessage('music_stop', undefined, convId)`.
  - Call `musicSkipToNext()`.
- Add rate-limit guard (e.g., 1.5s cooldown per action) to avoid flood if user rapid clicks.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "sendMusicActionSystemMessage"`
Expected: PASS.

- [ ] **Step 5: Run music UI tests**

Run: `npx vitest run tests/components/musicUi.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useChatRoom.ts app/pages/index.vue tests/composables/useChatRoom.test.ts
git commit -m "feat(music): broadcast and render in-chat notices for pause, stop, and skip"
```

---

### Task 5: End-to-End Regression Testing & Build Verification

**Files:**
- Test: All test suites (`npm test`)
- Build: Nuxt build (`npm run build`)

- [ ] **Step 1: Run full unit & component test suite**

Run: `npm test`
Expected: All 52 test suites pass with 0 failures.

- [ ] **Step 2: Run Nuxt production build**

Run: `npm run build`
Expected: Production build succeeds with 0 errors.

- [ ] **Step 3: Verification commit if any lockfiles or generated files updated**

```bash
git status
```
Confirm working tree is clean.
