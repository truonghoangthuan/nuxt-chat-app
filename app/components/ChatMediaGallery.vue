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
