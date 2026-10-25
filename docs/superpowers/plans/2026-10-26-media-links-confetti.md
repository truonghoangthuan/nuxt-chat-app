# Media Subtab (#33), Links Subtab (#34) & Confetti Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Messages` | `Media` | `Links` subtab navigation to the chat stage (#33, #34) and fire a confetti animation when a message containing `congratulation`, `rõ ràng`, `ok`, or `cool` is sent or received in the active conversation.

**Architecture:** Extract media items, shared links, and confetti trigger matches via pure client-side helpers in `app/utils/chat.ts` operating over decrypted `ChatMessage[]` (preserving E2EE invariants). Render `ChatMediaGallery.vue` (#33) and `ChatLinksList.vue` (#34) under a stage sub-header in `app/pages/index.vue`, reusing `ImageViewerModal.vue` for full-gallery carousel viewing and `MessageViewport.jumpToMessage` for link-to-message navigation, plus a zero-dependencyconfetti overlay triggered on matching outgoing or incoming active-chat messages.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS (`--ap-*` semantic theme variables), Vitest + `@vue/test-utils`.

## Global Constraints

- Zero new npm dependencies (Ponytail Rung 2–4: reuse existing helpers and native browser APIs).
- Preserve all E2EE invariants: all media/link extraction and confetti detection run strictly client-side on decrypted `ChatMessage` objects; skip soft-deleted (`deleted_at`) and `encryption === 'undecryptable'` messages.
- Strict Light/Dark theme token discipline (`--ap-text-primary`, `--ap-text-secondary`, `--ap-text-muted`, `--ap-glass-border`) — never hardcode `text-white` on adaptive surfaces.
- Every rendered member avatar or display name in `ChatMediaGallery.vue` and `ChatLinksList.vue` must emit `viewProfile` for `UserProfileModal.vue` inspection (Invariant #18).

---

### Task 1: Pure Extraction & Confetti Helpers (`app/types/chat.ts`, `app/utils/chat.ts`)

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `app/utils/chat.ts`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Produces:
  - `ExtractedMediaItem` and `ExtractedLinkItem` in `app/types/chat.ts`
  - `extractMediaFromMessages(messages: ChatMessage[]): ExtractedMediaItem[]` in `app/utils/chat.ts`
  - `extractDomainFromUrl(url: string): string` in `app/utils/chat.ts`
  - `extractLinksFromMessages(messages: ChatMessage[]): ExtractedLinkItem[]` in `app/utils/chat.ts`
  - `shouldTriggerConfetti(content: string): boolean` in `app/utils/chat.ts`

- [ ] **Step 1: Write the failing unit tests in `tests/utils/chat.test.ts`**

Append inside the top-level `describe` in `tests/utils/chat.test.ts` (and import `extractMediaFromMessages`, `extractDomainFromUrl`, `extractLinksFromMessages`, `shouldTriggerConfetti` from `~/utils/chat`):

```typescript
  describe('extractMediaFromMessages (#33)', () => {
    it('extracts images from decrypted image payloads in reverse chronological order and skips deleted or undecryptable messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'm1',
          client_id: 'c1',
          conversation_id: 'conv1',
          user_id: 'u1',
          content: JSON.stringify({
            type: 'images',
            images: [
              { path: 'conv1/img1.enc', mimeType: 'image/png', width: 800, height: 600, size: 1024 },
              { path: 'conv1/img2.enc', mimeType: 'image/jpeg', width: 400, height: 400, size: 512 },
            ],
            caption: 'First batch',
          }),
          created_at: '2026-10-22T10:00:00Z',
          status: 'sent',
          author: { id: 'u1', email: 'a@b.c', display_name: 'Alice', avatar_color: '#0284c7' },
        },
        {
          id: 'm2-deleted',
          client_id: 'c2',
          conversation_id: 'conv1',
          user_id: 'u1',
          content: JSON.stringify({
            type: 'images',
            images: [{ path: 'conv1/del.enc', mimeType: 'image/png', width: 100, height: 100, size: 100 }],
          }),
          created_at: '2026-10-22T10:01:00Z',
          deleted_at: '2026-10-22T10:02:00Z',
          status: 'sent',
        },
        {
          id: 'm3',
          client_id: 'c3',
          conversation_id: 'conv1',
          user_id: 'u2',
          content: JSON.stringify({
            type: 'images',
            images: [{ path: 'conv1/img3.enc', mimeType: 'image/webp', width: 1200, height: 900, size: 2048 }],
          }),
          created_at: '2026-10-22T10:05:00Z',
          status: 'sent',
          author: { id: 'u2', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' },
        },
      ]

      const media = extractMediaFromMessages(messages)
      expect(media).toHaveLength(3)
      expect(media.map(item => item.image.path)).toEqual([
        'conv1/img3.enc',
        'conv1/img1.enc',
        'conv1/img2.enc',
      ])
      expect(media[0].messageId).toBe('m3')
      expect(media[1].caption).toBe('First batch')
    })
  })

  describe('extractDomainFromUrl & extractLinksFromMessages (#34)', () => {
    it('extracts clean hostname from URLs and falls back safely', () => {
      expect(extractDomainFromUrl('https://www.github.com/nuxt/nuxt')).toBe('github.com')
      expect(extractDomainFromUrl('https://docs.astro.build/en/getting-started/')).toBe('docs.astro.build')
      expect(extractDomainFromUrl('not-a-valid-url')).toBe('not-a-valid-url')
    })

    it('extracts links from text messages and image captions in newest-first order, skipping inline code, deleted, and undecryptable messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'm1',
          client_id: 'c1',
          conversation_id: 'conv1',
          user_id: 'u1',
          content: 'Check https://github.com/truonghoangthuan/nuxt-chat-app and `https://ignored-in-code.com`!',
          created_at: '2026-10-22T10:00:00Z',
          status: 'sent',
          author: { id: 'u1', email: 'a@b.c', display_name: 'Alice', avatar_color: '#0284c7' },
        },
        {
          id: 'm2',
          client_id: 'c2',
          conversation_id: 'conv1',
          user_id: 'u2',
          content: JSON.stringify({
            type: 'images',
            images: [{ path: 'conv1/img1.enc', mimeType: 'image/png', width: 100, height: 100, size: 100 }],
            caption: 'Design ref: https://www.figma.com/file/123',
          }),
          created_at: '2026-10-22T10:05:00Z',
          status: 'sent',
          author: { id: 'u2', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' },
        },
        {
          id: 'm3-deleted',
          client_id: 'c3',
          conversation_id: 'conv1',
          user_id: 'u2',
          content: 'https://deleted.example.com',
          created_at: '2026-10-22T10:06:00Z',
          deleted_at: '2026-10-22T10:07:00Z',
          status: 'sent',
        },
      ]

      const links = extractLinksFromMessages(messages)
      expect(links).toHaveLength(2)
      expect(links[0]).toMatchObject({
        messageId: 'm2',
        url: 'https://www.figma.com/file/123',
        domain: 'figma.com',
      })
      expect(links[1]).toMatchObject({
        messageId: 'm1',
        url: 'https://github.com/truonghoangthuan/nuxt-chat-app',
        domain: 'github.com',
      })
    })
  })

  describe('shouldTriggerConfetti', () => {
    it('returns true when message contains congratulation, rõ ràng, ok, or cool as whole word/phrase case-insensitively', () => {
      expect(shouldTriggerConfetti('congratulation!')).toBe(true)
      expect(shouldTriggerConfetti('Big CONGRATULATIONS team')).toBe(true)
      expect(shouldTriggerConfetti('Quá rõ ràng luôn bạn ơi')).toBe(true)
      expect(shouldTriggerConfetti('ok bro')).toBe(true)
      expect(shouldTriggerConfetti('OK!')).toBe(true)
      expect(shouldTriggerConfetti('That sounds cool.')).toBe(true)
      expect(
        shouldTriggerConfetti(
          JSON.stringify({
            type: 'images',
            images: [{ path: 'a', mimeType: 'image/png', width: 10, height: 10, size: 10 }],
            caption: 'Rõ ràng nhé!',
          }),
        ),
      ).toBe(true)
    })

    it('returns false for partial word matches or unrelated text', () => {
      expect(shouldTriggerConfetti('I read a book and ate a cookie')).toBe(false)
      expect(shouldTriggerConfetti('Look at the cooler')).toBe(false)
      expect(shouldTriggerConfetti('Hello world')).toBe(false)
      expect(shouldTriggerConfetti('')).toBe(false)
    })
  })
```

- [ ] **Step 2: Run Vitest on `tests/utils/chat.test.ts` to verify failure**

Run: `npx vitest run tests/utils/chat.test.ts`  
Expected: FAIL with missing exports `extractMediaFromMessages`, `extractDomainFromUrl`, `extractLinksFromMessages`, `shouldTriggerConfetti`.

- [ ] **Step 3: Add types in `app/types/chat.ts` and implement helpers in `app/utils/chat.ts`**

In `app/types/chat.ts`, append at the end of the file:

```typescript
export interface ExtractedMediaItem {
  id: string
  messageId: string
  image: EncryptedImageMetadata
  caption?: string
  createdAt: string
  author?: Profile
  userId: string
}

export interface ExtractedLinkItem {
  id: string
  messageId: string
  url: string
  domain: string
  createdAt: string
  author?: Profile
  userId: string
}
```

In `app/utils/chat.ts`, import `ExtractedMediaItem` and `ExtractedLinkItem` from `~/types/chat`, and append:

```typescript
export function extractMediaFromMessages(messages: ChatMessage[]): ExtractedMediaItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const items: ExtractedMediaItem[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.deleted_at || msg.encryption === 'undecryptable') continue
    if (!isImagePayload(msg.content)) continue

    const payload = parseImagePayload(msg.content)
    if (!payload || !Array.isArray(payload.images)) continue

    payload.images.forEach((img, idx) => {
      items.push({
        id: `${msg.id || msg.client_id}-img-${idx}`,
        messageId: msg.id || msg.client_id,
        image: img,
        caption: payload.caption,
        createdAt: msg.created_at,
        author: msg.author,
        userId: msg.user_id,
      })
    })
  }

  return items
}

export function extractDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./i, '') || url
  } catch {
    return url
  }
}

export function extractLinksFromMessages(messages: ChatMessage[]): ExtractedLinkItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const items: ExtractedLinkItem[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.deleted_at || msg.encryption === 'undecryptable') continue

    const text = isImagePayload(msg.content)
      ? (parseImagePayload(msg.content)?.caption || '')
      : msg.content
    if (!text) continue

    const segments = tokenizeMessageMentions(text)
    let linkIdx = 0
    for (const seg of segments) {
      if (seg.isLink && seg.href) {
        items.push({
          id: `${msg.id || msg.client_id}-link-${linkIdx++}`,
          messageId: msg.id || msg.client_id,
          url: seg.href,
          domain: extractDomainFromUrl(seg.href),
          createdAt: msg.created_at,
          author: msg.author,
          userId: msg.user_id,
        })
      }
    }
  }

  return items
}

const CONFETTI_KEYWORD_REGEX = /(?<=^|[^\p{L}\p{N}_])(congratulations?|rõ\s+ràng|ok|cool)(?=$|[^\p{L}\p{N}_])/iu

export function shouldTriggerConfetti(content: string): boolean {
  if (!content || typeof content !== 'string') return false
  const text = isImagePayload(content)
    ? (parseImagePayload(content)?.caption || '')
    : content
  if (!text.trim()) return false
  return CONFETTI_KEYWORD_REGEX.test(text)
}
```

- [ ] **Step 4: Run Vitest on `tests/utils/chat.test.ts` to verify pass**

Run: `npx vitest run tests/utils/chat.test.ts`  
Expected: PASS

---

### Task 2: Media Subtab Gallery Component (`app/components/ChatMediaGallery.vue` — Issue #33)

**Files:**
- Create: `app/components/ChatMediaGallery.vue`
- Modify: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `extractMediaFromMessages`, `formatDateDivider` from `~/utils/chat`, `useImageAttachmentCache` from `~/composables/useImageAttachmentCache`, `useE2ee` from `~/composables/useE2ee`.
- Produces: `ChatMediaGallery.vue` accepting `{ messages, channelId, hasMoreHistory, isLoadingHistory, loadOlder, e2eeKey, supabaseClient }` and emitting `selectImage` and `viewProfile`.

- [ ] **Step 1: Write failing component tests for `ChatMediaGallery.vue` in `tests/components/chatUi.test.ts`**

Add tests verifying:
1. Empty state (`"No media shared yet"`) when no image messages exist.
2. Grid rendering of extracted images, sender metadata overlay (`viewProfile` emission on sender click), and clicking a thumbnail emits `selectImage` with all gallery `EncryptedImageMetadata[]` and the clicked `initialIndex`.
3. Clicking `"Load older media"` (`[data-test="load-older-media-btn"]`) calls `loadOlder()`.

- [ ] **Step 2: Run Vitest on `tests/components/chatUi.test.ts` to verify failure**

Run: `npx vitest run tests/components/chatUi.test.ts`  
Expected: FAIL (`ChatMediaGallery.vue` does not exist yet).

- [ ] **Step 3: Create `app/components/ChatMediaGallery.vue`**

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ChatMessage, EncryptedImageMetadata, Profile } from '~/types/chat'
import { extractMediaFromMessages, formatDateDivider } from '~/utils/chat'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'
import { useE2ee } from '~/composables/useE2ee'
import UserAvatar from '~/components/UserAvatar.vue'
import { Image as ImageIcon } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    channelId?: string | null
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    loadOlder?: () => Promise<number>
    e2eeKey?: CryptoKey | null
    supabaseClient?: any
  }>(),
  {
    channelId: '',
    hasMoreHistory: false,
    isLoadingHistory: false,
    loadOlder: () => Promise.resolve(0),
    e2eeKey: undefined,
    supabaseClient: undefined,
  },
)

const emit = defineEmits<{
  (e: 'selectImage', payload: { images: EncryptedImageMetadata[]; initialIndex: number }): void
  (e: 'viewProfile', profile: Profile): void
}>()

const resolvedUrls = ref<Record<string, string>>({})
const cache = useImageAttachmentCache()

const mediaItems = computed(() => extractMediaFromMessages(props.messages))
const allGalleryImages = computed(() => mediaItems.value.map(item => item.image))

function resolveKey(): CryptoKey | null {
  if (props.e2eeKey !== undefined) return props.e2eeKey
  try {
    return useE2ee().key.value
  } catch {
    return null
  }
}

function resolveSupabase(): any {
  if (props.supabaseClient !== undefined) return props.supabaseClient
  try {
    if (typeof useSupabaseClient !== 'undefined') return useSupabaseClient()
  } catch {
    return undefined
  }
  return undefined
}

async function loadImage(image: EncryptedImageMetadata) {
  if (!image?.path) return
  if (image.path.startsWith('blob:')) {
    resolvedUrls.value = { ...resolvedUrls.value, [image.path]: image.path }
    return
  }
  const cached = cache.getCachedUrl(image.path)
  if (cached) {
    resolvedUrls.value = { ...resolvedUrls.value, [image.path]: cached }
    return
  }
  const key = resolveKey()
  if (!key) return
  try {
    const url = await cache.getOrFetchImage(
      image.path,
      image.mimeType,
      props.channelId || '',
      key,
      resolveSupabase(),
    )
    resolvedUrls.value = { ...resolvedUrls.value, [image.path]: url }
  } catch {
    // Graceful fallback on decrypt or network error
  }
}

watch(
  [mediaItems, () => props.channelId, () => props.e2eeKey],
  () => {
    for (const item of mediaItems.value) {
      loadImage(item.image)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    data-test="chat-media-gallery"
    class="flex-1 overflow-y-auto p-4 md:p-6"
  >
    <!-- Empty State -->
    <div
      v-if="mediaItems.length === 0"
      data-test="media-empty-state"
      class="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3 text-[var(--ap-text-muted)]"
    >
      <div class="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--ap-glass-border)] flex items-center justify-center">
        <ImageIcon class="w-6 h-6 opacity-60" />
      </div>
      <div>
        <p class="text-sm font-semibold text-[var(--ap-text-primary)]">No media shared yet</p>
        <p class="text-xs text-[var(--ap-text-secondary)] mt-0.5">Photos and screenshots sent in this chat will appear here.</p>
      </div>
      <button
        v-if="hasMoreHistory"
        type="button"
        data-test="load-older-media-btn"
        :disabled="isLoadingHistory"
        class="mt-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer disabled:opacity-50"
        @click="loadOlder()"
      >
        {{ isLoadingHistory ? 'Loading history...' : 'Load older messages' }}
      </button>
    </div>

    <!-- Media Grid -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div
          v-for="(item, idx) in mediaItems"
          :key="item.id"
          data-test="media-gallery-tile"
          class="group relative aspect-square rounded-xl overflow-hidden border border-[var(--ap-glass-border)] bg-black/5 dark:bg-white/5 cursor-pointer"
          @click="emit('selectImage', { images: allGalleryImages, initialIndex: idx })"
        >
          <img
            v-if="resolvedUrls[item.image.path]"
            :src="resolvedUrls[item.image.path]"
            :alt="item.caption || item.image.path"
            class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <div
            v-else
            data-test="media-tile-skeleton"
            class="w-full h-full animate-pulse flex items-center justify-center text-[var(--ap-text-muted)]"
          >
            <ImageIcon class="w-6 h-6 opacity-40" />
          </div>

          <!-- Hover Metadata Overlay -->
          <div
            class="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between gap-2 text-white text-xs"
          >
            <button
              v-if="item.author"
              type="button"
              data-test="media-tile-author"
              class="flex items-center gap-1.5 min-w-0 hover:underline cursor-pointer text-left"
              @click.stop="emit('viewProfile', item.author)"
            >
              <UserAvatar
                :display-name="item.author.display_name"
                :avatar-color="item.author.avatar_color"
                :avatar-url="item.author.avatar_url"
                size="sm"
              />
              <span class="truncate font-medium">{{ item.author.display_name }}</span>
            </button>
            <span class="text-[11px] text-white/80 shrink-0">{{ formatDateDivider(item.createdAt) }}</span>
          </div>
        </div>
      </div>

      <div v-if="hasMoreHistory" class="flex justify-center pt-2">
        <button
          type="button"
          data-test="load-older-media-btn"
          :disabled="isLoadingHistory"
          class="px-4 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer disabled:opacity-50"
          @click="loadOlder()"
        >
          {{ isLoadingHistory ? 'Loading older media...' : 'Load older media' }}
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run Vitest on `tests/components/chatUi.test.ts` to verify pass**

Run: `npx vitest run tests/components/chatUi.test.ts`  
Expected: PASS

---

### Task 3: Shared Links Subtab Component (`app/components/ChatLinksList.vue` — Issue #34)

**Files:**
- Create: `app/components/ChatLinksList.vue`
- Modify: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `extractLinksFromMessages`, `formatDateDivider` from `~/utils/chat`, `UserAvatar.vue`.
- Produces: `ChatLinksList.vue` accepting `{ messages, hasMoreHistory, isLoadingHistory, loadOlder }` and emitting `jumpToMessage(messageId: string)` and `viewProfile(profile: Profile)`.

- [ ] **Step 1: Write failing component tests for `ChatLinksList.vue` in `tests/components/chatUi.test.ts`**

Add tests verifying:
1. Empty state (`"No links shared yet"`) when no links exist.
2. Rendering of extracted links with domain badge, external link (`target="_blank"` and `rel="noopener noreferrer"`), sender profile trigger (`viewProfile`), and clicking `"Jump to message"` emits `jumpToMessage(messageId)`.

- [ ] **Step 2: Run Vitest on `tests/components/chatUi.test.ts` to verify failure**

Run: `npx vitest run tests/components/chatUi.test.ts`  
Expected: FAIL (`ChatLinksList.vue` does not exist yet).

- [ ] **Step 3: Create `app/components/ChatLinksList.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage, Profile } from '~/types/chat'
import { extractLinksFromMessages, formatDateDivider } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'
import { Link2, ExternalLink, MessageSquare } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    loadOlder?: () => Promise<number>
  }>(),
  {
    hasMoreHistory: false,
    isLoadingHistory: false,
    loadOlder: () => Promise.resolve(0),
  },
)

const emit = defineEmits<{
  (e: 'jumpToMessage', messageId: string): void
  (e: 'viewProfile', profile: Profile): void
}>()

const linkItems = computed(() => extractLinksFromMessages(props.messages))
</script>

<template>
  <div
    data-test="chat-links-list"
    class="flex-1 overflow-y-auto p-4 md:p-6"
  >
    <!-- Empty State -->
    <div
      v-if="linkItems.length === 0"
      data-test="links-empty-state"
      class="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3 text-[var(--ap-text-muted)]"
    >
      <div class="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--ap-glass-border)] flex items-center justify-center">
        <Link2 class="w-6 h-6 opacity-60" />
      </div>
      <div>
        <p class="text-sm font-semibold text-[var(--ap-text-primary)]">No links shared yet</p>
        <p class="text-xs text-[var(--ap-text-secondary)] mt-0.5">Web links shared in messages will be collected here.</p>
      </div>
      <button
        v-if="hasMoreHistory"
        type="button"
        data-test="load-older-links-btn"
        :disabled="isLoadingHistory"
        class="mt-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer disabled:opacity-50"
        @click="loadOlder()"
      >
        {{ isLoadingHistory ? 'Loading history...' : 'Load older messages' }}
      </button>
    </div>

    <!-- Links List -->
    <div v-else class="max-w-3xl mx-auto space-y-2.5">
      <div
        v-for="item in linkItems"
        :key="item.id"
        data-test="link-list-item"
        class="p-3.5 rounded-xl border border-[var(--ap-glass-border)] bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span
              data-test="link-domain-badge"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
            >
              <Link2 class="w-3 h-3" />
              {{ item.domain }}
            </span>

            <button
              v-if="item.author"
              type="button"
              data-test="link-item-author"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] cursor-pointer"
              @click="emit('viewProfile', item.author)"
            >
              <UserAvatar
                :display-name="item.author.display_name"
                :avatar-color="item.author.avatar_color"
                :avatar-url="item.author.avatar_url"
                size="sm"
              />
              <span class="font-medium">{{ item.author.display_name }}</span>
            </button>

            <span class="text-[11px] text-[var(--ap-text-muted)]">
              {{ formatDateDivider(item.createdAt) }}
            </span>
          </div>

          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            data-test="link-external-anchor"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            <span>{{ item.url }}</span>
            <ExternalLink class="w-3.5 h-3.5 shrink-0" />
          </a>
        </div>

        <button
          type="button"
          data-test="jump-to-link-message"
          class="self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer"
          @click="emit('jumpToMessage', item.messageId)"
        >
          <MessageSquare class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span>Jump to message</span>
        </button>
      </div>

      <div v-if="hasMoreHistory" class="flex justify-center pt-2">
        <button
          type="button"
          data-test="load-older-links-btn"
          :disabled="isLoadingHistory"
          class="px-4 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer disabled:opacity-50"
          @click="loadOlder()"
        >
          {{ isLoadingHistory ? 'Loading older links...' : 'Load older links' }}
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run Vitest on `tests/components/chatUi.test.ts` to verify pass**

Run: `npx vitest run tests/components/chatUi.test.ts`  
Expected: PASS

---

### Task 4: Wire Subtabs (`Messages` | `Media` | `Links`) & Confetti Burst in `app/pages/index.vue`

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `ChatMediaGallery.vue`, `ChatLinksList.vue`, `extractMediaFromMessages`, `extractLinksFromMessages`, `shouldTriggerConfetti` from `~/utils/chat`.
- Produces:
  - Stage sub-header (`[data-test="stage-subtabs"]`) with `[data-test="subtab-messages"]`, `[data-test="subtab-media"]`, `[data-test="subtab-links"]`
  - Jump-to-message tab switch + scroll (`handleJumpToMessageFromTab`)
  - Confetti overlay (`[data-test="confetti-overlay"]`) triggered on outgoing or incoming realtime messages matching `shouldTriggerConfetti`.

- [ ] **Step 1: Write failing integration tests in `tests/components/indexPage.test.ts`**

Add tests in `tests/components/indexPage.test.ts` verifying:
1. Subtabs (`Messages`, `Media`, `Links`) render when an active conversation is selected, switch between `MessageViewport`, `ChatMediaGallery`, and `ChatLinksList`, and `"Jump to message"` in `ChatLinksList` switches back to `Messages`.
2. Sending a message with `congratulation`, `rõ ràng`, `ok`, or `cool` triggers `[data-test="confetti-overlay"]`.
3. Receiving a new incoming message in the active conversation with `rõ ràng` triggers `[data-test="confetti-overlay"]`.

- [ ] **Step 2: Run Vitest on `tests/components/indexPage.test.ts` to verify failure**

Run: `npx vitest run tests/components/indexPage.test.ts`  
Expected: FAIL (`subtab-media`, `subtab-links`, `confetti-overlay` not found).

- [ ] **Step 3: Implement subtab navigation and confetti burst in `app/pages/index.vue`**

In `app/pages/index.vue`:
1. Import `computed`, `watch`, `nextTick` from `'vue'`, `ChatMediaGallery`, `ChatLinksList`, and `{ extractMediaFromMessages, extractLinksFromMessages, shouldTriggerConfetti }` from `'~/utils/chat'`.
2. Add `activeStageTab = ref<'messages' | 'media' | 'links'>('messages')`, reset to `'messages'` in `handleSelectConversation`.
3. Add `mediaCount = computed(() => extractMediaFromMessages(messages.value).length)` and `linksCount = computed(() => extractLinksFromMessages(messages.value).length)`.
4. Add `isConfettiActive = ref(false)` and `triggerConfetti()` with a 2500ms timeout cleanup.
5. Call `if (shouldTriggerConfetti(content)) triggerConfetti()` in `handleSendMessage` (and `if (caption && shouldTriggerConfetti(caption)) triggerConfetti()` in `handleSendImages`).
6. Watch `messages` for newly arrived realtime messages in the active conversation (ignoring initial history load or history prepends) and call `triggerConfetti()` if `!newest.deleted_at && shouldTriggerConfetti(newest.content)`.
7. Render the sub-header bar (`Messages` | `Media` | `Links`), conditionally render `MessageViewport`, `ChatMediaGallery`, or `ChatLinksList`, and render the CSS/SVG confetti overlay when `isConfettiActive` is true.

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`  
Expected: All test suites PASS.
