# Customizable Shared Chat Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow members of any conversation to set, upload, or reset a shared chat background image synced in real-time across participants, rendered with adaptive contrast in both light and dark themes.

**Architecture:** Add a `background_url` column to `public.conversations` (and `public.channels`), create a public `chat-backgrounds` Supabase Storage bucket with access policies, export preset definitions and styling helpers in `app/utils/chat.ts`, wire optimistic state updates and realtime sync in `useChatRoom.ts`, create `ChatBackgroundModal.vue` with preset gallery and file upload, and render the background with an adaptive contrast overlay in `MessageViewport.vue`.

**Tech Stack:** Nuxt 4, Vue 3, Supabase (Postgres RLS, Storage, Realtime `postgres_changes`), Tailwind CSS, Vitest.

## Global Constraints

- Preserve all existing tests and functional `data-test` attributes.
- Use explicit foreign-key embedding disambiguation where multiple relationships exist.
- Ensure all message text, timestamps, and dividers meet WCAG contrast over custom backgrounds.
- Keep unit tests runnable in Vitest (`happy-dom`) without requiring live network calls.

---

### Task 1: Database Schema & Storage Bucket Setup

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Consumes: `public.conversations`, `public.channels`, `public.can_access_conversation`, `public.storage_conversation_id`
- Produces: `background_url` column on `conversations` (and `channels`), `chat-backgrounds` bucket, and storage policies

- [ ] **Step 1: Update schema with `background_url` column and storage bucket policies**

Add to `supabase/schema.sql`:
```sql
-- Migration: add background_url column to conversations and channels
alter table public.conversations
  add column if not exists background_url text;

alter table public.channels
  add column if not exists background_url text;

-- Storage Bucket for shared chat backgrounds (publicly readable)
insert into storage.buckets (id, name, public)
values ('chat-backgrounds', 'chat-backgrounds', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload chat backgrounds" on storage.objects;
create policy "Authenticated users can upload chat backgrounds"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-backgrounds'
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

drop policy if exists "Anyone can view chat backgrounds" on storage.objects;
create policy "Anyone can view chat backgrounds"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'chat-backgrounds');

drop policy if exists "Authenticated users can update chat backgrounds" on storage.objects;
create policy "Authenticated users can update chat backgrounds"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chat-backgrounds'
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

drop policy if exists "Authenticated users can delete chat backgrounds" on storage.objects;
create policy "Authenticated users can delete chat backgrounds"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-backgrounds'
    and public.can_access_conversation(public.storage_conversation_id(name))
  );
```

- [ ] **Step 2: Verify schema syntax with git diff**

Run: `git diff supabase/schema.sql`
Expected: Clean additions without breaking existing policies.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add background_url column and chat-backgrounds storage bucket"
```

---

### Task 2: Domain Types & Background Utility Helpers (TDD)

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `app/utils/chat.ts`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: `Conversation`, `Channel` interfaces
- Produces:
  - `ChatBackgroundPreset` interface
  - `CHAT_BACKGROUND_PRESETS`
  - `MAX_BACKGROUND_FILE_SIZE`
  - `validateBackgroundFile(file: { type: string; size: number }): { valid: boolean; error?: string }`
  - `resolveChatBackgroundStyle(backgroundUrl?: string | null): Record<string, string> | null`

- [ ] **Step 1: Write failing unit tests for background helpers in `tests/utils/chat.test.ts`**

```ts
describe('Chat Background Helpers', () => {
  it('validates allowed image types and size limit', () => {
    expect(validateBackgroundFile({ type: 'image/png', size: 1024 })).toEqual({ valid: true })
    expect(validateBackgroundFile({ type: 'application/pdf', size: 1024 }).valid).toBe(false)
    expect(validateBackgroundFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 }).valid).toBe(false)
  })

  it('resolves preset styles and custom URLs correctly', () => {
    expect(resolveChatBackgroundStyle(null)).toBeNull()
    expect(resolveChatBackgroundStyle('')).toBeNull()

    const presetStyle = resolveChatBackgroundStyle('preset:aurora')
    expect(presetStyle).not.toBeNull()
    expect(presetStyle?.backgroundImage).toContain('gradient')

    const urlStyle = resolveChatBackgroundStyle('https://example.com/bg.jpg')
    expect(urlStyle?.backgroundImage).toBe('url("https://example.com/bg.jpg")')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/utils/chat.test.ts`
Expected: FAIL with missing functions `validateBackgroundFile`, `resolveChatBackgroundStyle`.

- [ ] **Step 3: Add types to `app/types/chat.ts`**

Update `Conversation` and `Channel`:
```ts
export interface ChatBackgroundPreset {
  id: string
  value: string
  label: string
  cssBackground: string
}

export interface Conversation {
  ...
  background_url?: string | null
}

export interface Channel {
  ...
  background_url?: string | null
}
```

- [ ] **Step 4: Implement helpers in `app/utils/chat.ts`**

```ts
export const MAX_BACKGROUND_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = [
  {
    id: 'aurora',
    value: 'preset:aurora',
    label: 'Aurora Borealis',
    cssBackground: 'linear-gradient(135deg, #09203f 0%, #537895 100%)',
  },
  {
    id: 'sunset',
    value: 'preset:sunset',
    label: 'Sunset Glow',
    cssBackground: 'linear-gradient(135deg, #2b1055 0%, #7597de 100%)',
  },
  {
    id: 'midnight',
    value: 'preset:midnight',
    label: 'Midnight Sky',
    cssBackground: 'radial-gradient(ellipse at top, #1e293b 0%, #090d16 100%)',
  },
  {
    id: 'ocean',
    value: 'preset:ocean',
    label: 'Deep Ocean',
    cssBackground: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  },
  {
    id: 'cyberpunk',
    value: 'preset:cyberpunk',
    label: 'Neon Dream',
    cssBackground: 'linear-gradient(135deg, #240b36 0%, #c31432 100%)',
  },
  {
    id: 'forest',
    value: 'preset:forest',
    label: 'Misty Forest',
    cssBackground: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  },
]

export function validateBackgroundFile(file: { type: string; size: number }): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'File is required.' }
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return { valid: false, error: 'Only JPEG, PNG, WebP, or GIF images are allowed.' }
  }
  if (file.size > MAX_BACKGROUND_FILE_SIZE) {
    return { valid: false, error: 'Image size must be 5MB or less.' }
  }
  return { valid: true }
}

export function resolveChatBackgroundStyle(backgroundUrl?: string | null): Record<string, string> | null {
  if (!backgroundUrl || typeof backgroundUrl !== 'string') return null
  const trimmed = backgroundUrl.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('preset:')) {
    const preset = CHAT_BACKGROUND_PRESETS.find(p => p.value === trimmed)
    if (preset) {
      return {
        backgroundImage: preset.cssBackground,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const escaped = trimmed.replace(/"/g, '\\"')
    return {
      backgroundImage: `url("${escaped}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }

  return null
}
```

- [ ] **Step 5: Run tests and verify PASS**

Run: `npm test tests/utils/chat.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(chat): add background presets, validation, and style resolver"
```

---

### Task 3: Background Composable Actions & Realtime Sync (TDD)

**Files:**
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `supabase.storage`, `supabase.from('conversations')`, `validateBackgroundFile`
- Produces:
  - `updateChatBackground(conversationId: string, backgroundOrFile: string | File): Promise<{ error: string | null }>`
  - `removeChatBackground(conversationId: string): Promise<{ error: string | null }>`
  - Exposes `updateChatBackground` and `removeChatBackground` on `useChatRoom()` return object.

- [ ] **Step 1: Write failing unit tests in `tests/composables/useChatRoom.test.ts`**

```ts
it('updates chat background with a preset and syncs to conversation state', async () => {
  const room = useChatRoom()
  const group = await room.createGroup('Background Group', ['u-bob'])

  const res = await room.updateChatBackground(group.id, 'preset:aurora')
  expect(res.error).toBeNull()

  const updated = room.conversations.value.find(c => c.id === group.id)
  expect(updated?.background_url).toBe('preset:aurora')
})

it('removes chat background and resets to null', async () => {
  const room = useChatRoom()
  const group = await room.createGroup('Background Reset Group', ['u-bob'])
  await room.updateChatBackground(group.id, 'preset:sunset')

  const res = await room.removeChatBackground(group.id)
  expect(res.error).toBeNull()

  const updated = room.conversations.value.find(c => c.id === group.id)
  expect(updated?.background_url).toBeNull()
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/composables/useChatRoom.test.ts`
Expected: FAIL with `updateChatBackground is not a function`.

- [ ] **Step 3: Implement `updateChatBackground` and `removeChatBackground` in `useChatRoom.ts`**

```ts
async function updateChatBackground(
  conversationId: string,
  backgroundOrFile: string | File,
): Promise<{ error: string | null }> {
  const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
  if (!current?.id) {
    return { error: 'Not authenticated.' }
  }

  const targetConv = conversations.value.find(c => c.id === conversationId)
  if (!targetConv) {
    return { error: 'Conversation not found.' }
  }

  let finalUrl: string
  if (typeof backgroundOrFile !== 'string') {
    const file = backgroundOrFile
    const validation = validateBackgroundFile(file)
    if (!validation.valid) {
      return { error: validation.error || 'Invalid background file.' }
    }

    try {
      const ext = file.name ? file.name.split('.').pop() || 'jpg' : 'jpg'
      const filePath = `conversations/${conversationId}/bg-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('chat-backgrounds')
        .upload(filePath, file, { contentType: file.type, upsert: true })

      if (uploadError) {
        return { error: uploadError.message || 'Failed to upload background image.' }
      }

      const { data: publicUrlData } = supabase.storage
        .from('chat-backgrounds')
        .getPublicUrl(filePath)

      finalUrl = publicUrlData.publicUrl
    } catch (err: any) {
      return { error: err?.message || 'Failed to upload background image.' }
    }
  } else {
    finalUrl = backgroundOrFile.trim()
  }

  const prevBg = targetConv.background_url
  const prevUpdated = targetConv.updated_at
  const nowIso = new Date().toISOString()

  // Optimistic update
  targetConv.background_url = finalUrl
  targetConv.updated_at = nowIso

  try {
    const { error: dbError } = await supabase
      .from('conversations')
      .update({ background_url: finalUrl, updated_at: nowIso })
      .eq('id', conversationId)

    if (dbError) {
      targetConv.background_url = prevBg
      targetConv.updated_at = prevUpdated
      return { error: dbError.message || 'Failed to update background.' }
    }
    return { error: null }
  } catch (err: any) {
    targetConv.background_url = prevBg
    targetConv.updated_at = prevUpdated
    return { error: err?.message || 'Failed to update background.' }
  }
}

async function removeChatBackground(conversationId: string): Promise<{ error: string | null }> {
  const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
  if (!current?.id) {
    return { error: 'Not authenticated.' }
  }

  const targetConv = conversations.value.find(c => c.id === conversationId)
  if (!targetConv) {
    return { error: 'Conversation not found.' }
  }

  const prevBg = targetConv.background_url
  const prevUpdated = targetConv.updated_at
  const nowIso = new Date().toISOString()

  targetConv.background_url = null
  targetConv.updated_at = nowIso

  try {
    const { error: dbError } = await supabase
      .from('conversations')
      .update({ background_url: null, updated_at: nowIso })
      .eq('id', conversationId)

    if (dbError) {
      targetConv.background_url = prevBg
      targetConv.updated_at = prevUpdated
      return { error: dbError.message || 'Failed to reset background.' }
    }
    return { error: null }
  } catch (err: any) {
    targetConv.background_url = prevBg
    targetConv.updated_at = prevUpdated
    return { error: err?.message || 'Failed to reset background.' }
  }
}
```

Ensure `background_url` is mapped in `loadConversations`, `openOrCreateDirectChat`, and `createGroup`, and return `updateChatBackground` and `removeChatBackground`.

- [ ] **Step 4: Run tests and verify PASS**

Run: `npm test tests/composables/useChatRoom.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(chat): add updateChatBackground and removeChatBackground actions"
```

---

### Task 4: Create `ChatBackgroundModal.vue` Component (TDD)

**Files:**
- Create: `app/components/ChatBackgroundModal.vue`
- Create: `tests/components/ChatBackgroundModal.test.ts`

**Interfaces:**
- Consumes: `Conversation`, `CHAT_BACKGROUND_PRESETS`, `resolveChatBackgroundStyle`, `validateBackgroundFile`
- Produces: Modal with preset swatches, file upload input, reset button, and close handler

- [ ] **Step 1: Write component tests in `tests/components/ChatBackgroundModal.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatBackgroundModal from '~/components/ChatBackgroundModal.vue'

describe('ChatBackgroundModal.vue', () => {
  const mockConversation = {
    id: 'conv-1',
    type: 'group',
    title: 'Designers',
    background_url: 'preset:aurora',
  }

  it('renders presets and indicates currently active preset', () => {
    const wrapper = mount(ChatBackgroundModal, {
      props: {
        isOpen: true,
        conversation: mockConversation as any,
      },
    })
    expect(wrapper.find('[data-test="preset-item-aurora"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="preset-item-sunset"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="reset-background-btn"]').exists()).toBe(true)
  })

  it('emits selectPreset when clicking a preset card', async () => {
    const wrapper = mount(ChatBackgroundModal, {
      props: {
        isOpen: true,
        conversation: mockConversation as any,
      },
    })
    await wrapper.find('[data-test="preset-item-sunset"]').trigger('click')
    expect(wrapper.emitted('selectPreset')).toEqual([['preset:sunset']])
  })

  it('emits reset when clicking reset button', async () => {
    const wrapper = mount(ChatBackgroundModal, {
      props: {
        isOpen: true,
        conversation: mockConversation as any,
      },
    })
    await wrapper.find('[data-test="reset-background-btn"]').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/components/ChatBackgroundModal.test.ts`
Expected: FAIL because component does not exist.

- [ ] **Step 3: Create `app/components/ChatBackgroundModal.vue`**

Implement modal with:
- Glassmorphic card styling matching `GroupInfoModal.vue`.
- Header with title and close button.
- Live preview card showing resolved background and chat bubble mock.
- 6-preset grid with active checkmark.
- File upload input (`data-test="upload-background-input"`) with client-side validation error message.
- "Reset to Theme Default" button (`data-test="reset-background-btn"`).

- [ ] **Step 4: Run tests and verify PASS**

Run: `npm test tests/components/ChatBackgroundModal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/ChatBackgroundModal.vue tests/components/ChatBackgroundModal.test.ts
git commit -m "feat(ui): add ChatBackgroundModal component"
```

---

### Task 5: Viewport Background Layer with Adaptive Contrast

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `resolveChatBackgroundStyle(props.backgroundUrl)`
- Produces: Non-interactive background layer and adaptive scrim behind message timeline.

- [ ] **Step 1: Write test assertion for background layer in `tests/components/chatUi.test.ts`**

```ts
it('renders chat background layer and adaptive scrim when backgroundUrl is set', () => {
  const wrapper = mount(MessageViewport, {
    props: {
      messages: [],
      backgroundUrl: 'preset:aurora',
    },
  })
  expect(wrapper.find('[data-test="chat-background-layer"]').exists()).toBe(true)
  expect(wrapper.find('[data-test="chat-background-scrim"]').exists()).toBe(true)
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/components/chatUi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `app/components/MessageViewport.vue`**

Add `backgroundUrl?: string | null` to `defineProps`:
```vue
const backgroundStyle = computed(() => resolveChatBackgroundStyle(props.backgroundUrl))
```

Render background container behind timeline:
```vue
<div
  v-if="backgroundStyle"
  data-test="chat-background-layer"
  class="absolute inset-0 pointer-events-none transition-all duration-300 z-0"
  :style="backgroundStyle"
>
  <div
    data-test="chat-background-scrim"
    class="absolute inset-0 bg-white/70 dark:bg-[#0d0f17]/75 backdrop-blur-[1px]"
  />
</div>
```

Ensure message list container is positioned relatively with `z-10` so clicks and scrolling remain unhindered.

- [ ] **Step 4: Run tests and verify PASS**

Run: `npm test tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): render background layer with adaptive scrim in MessageViewport"
```

---

### Task 6: Wire Modal & Entry Triggers in `GroupInfoModal.vue` and `index.vue`

**Files:**
- Modify: `app/components/GroupInfoModal.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/GroupModals.test.ts`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `ChatBackgroundModal.vue`, `updateChatBackground`, `removeChatBackground`
- Produces: Header wallpaper trigger (`data-test="open-chat-background-btn"`), Group info wallpaper trigger (`data-test="group-change-background-btn"`).

- [ ] **Step 1: Write test for triggers in `GroupModals.test.ts` and `indexPage.test.ts`**

In `GroupModals.test.ts`:
```ts
it('emits openBackground when clicking change background button', async () => {
  const wrapper = mount(GroupInfoModal, {
    props: {
      isOpen: true,
      conversation: mockGroupConversation,
    },
  })
  const btn = wrapper.find('[data-test="group-change-background-btn"]')
  expect(btn.exists()).toBe(true)
  await btn.trigger('click')
  expect(wrapper.emitted('openBackground')).toHaveLength(1)
})
```

In `indexPage.test.ts`:
```ts
it('renders chat background button in stage header and opens ChatBackgroundModal', async () => {
  mockChatRoomState.activeConversationId.value = 'conv-1'
  mockChatRoomState.activeConversation.value = {
    id: 'conv-1',
    type: 'group',
    title: 'General',
  }
  const wrapper = mount(IndexPage)
  const btn = wrapper.find('[data-test="open-chat-background-btn"]')
  expect(btn.exists()).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test tests/components/GroupModals.test.ts tests/components/indexPage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `GroupInfoModal.vue`**

Add `openBackground` emit and button in the modal body:
```vue
<button
  type="button"
  data-test="group-change-background-btn"
  class="w-full flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 text-xs font-semibold transition cursor-pointer"
  @click="emit('openBackground')"
>
  <span class="flex items-center gap-2">
    <Image class="w-4 h-4 text-blue-400" />
    Chat Wallpaper & Theme
  </span>
  <span class="text-[11px] text-white/40">Customize →</span>
</button>
```

- [ ] **Step 4: Update `app/pages/index.vue`**

- Import `ChatBackgroundModal.vue` and `Image as ImageIcon` from `@lucide/vue`.
- Add `isChatBackgroundModalOpen = ref(false)`.
- Pass `:background-url="activeConversation?.background_url || activeChannel?.background_url"` to `MessageViewport`.
- Add `<button data-test="open-chat-background-btn" ...>` in stage header next to search.
- Connect `@select-preset`, `@upload-file`, and `@reset` handlers calling `updateChatBackground` and `removeChatBackground`.

- [ ] **Step 5: Run all test suites and verify complete green pass**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/components/GroupInfoModal.vue app/pages/index.vue tests/components/GroupModals.test.ts tests/components/indexPage.test.ts
git commit -m "feat(ui): integrate ChatBackgroundModal and triggers across chat stage"
```

---

### Task 7: Full Verification & E2E Sanity Check

**Files:**
- Verification only

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: 100% test suites pass.

- [ ] **Step 2: Run production build check**

Run: `npm run build`
Expected: Build succeeds without type or bundling errors.
