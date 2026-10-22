<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { EncryptedImageMetadata } from '~/types/chat'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'
import { useE2ee } from '~/composables/useE2ee'

const props = withDefaults(
  defineProps<{
    images: EncryptedImageMetadata[]
    channelId?: string | null
    isSending?: boolean
    e2eeKey?: CryptoKey | null
    supabaseClient?: any
  }>(),
  {
    channelId: '',
    isSending: false,
    e2eeKey: undefined,
    supabaseClient: undefined,
  },
)

const emit = defineEmits<{
  (e: 'selectImage', payload: { images: EncryptedImageMetadata[]; initialIndex: number }): void
}>()

const resolvedUrls = ref<Record<string, string>>({})
const loadingPaths = ref<Record<string, boolean>>({})

const cache = useImageAttachmentCache()

function resolveKey(): CryptoKey | null {
  if (props.e2eeKey !== undefined) return props.e2eeKey
  try {
    const e2ee = useE2ee()
    return e2ee.key.value
  } catch {
    return null
  }
}

function resolveSupabase(): any {
  if (props.supabaseClient !== undefined) return props.supabaseClient
  try {
    if (typeof useSupabaseClient !== 'undefined') {
      return useSupabaseClient()
    }
  } catch {
    return undefined
  }
  return undefined
}

async function loadImage(image: EncryptedImageMetadata) {
  if (!image || !image.path) return

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
  if (!key) {
    return
  }

  const supabase = resolveSupabase()
  loadingPaths.value = { ...loadingPaths.value, [image.path]: true }

  try {
    const url = await cache.getOrFetchImage(
      image.path,
      image.mimeType,
      props.channelId || '',
      key,
      supabase,
    )
    resolvedUrls.value = { ...resolvedUrls.value, [image.path]: url }
  } catch {
    // Graceful fallback on decrypt or network error
  } finally {
    const next = { ...loadingPaths.value }
    delete next[image.path]
    loadingPaths.value = next
  }
}

function loadAllImages() {
  for (const img of props.images) {
    loadImage(img)
  }
}

watch(
  [() => props.images, () => props.channelId, () => props.e2eeKey],
  () => {
    loadAllImages()
  },
  { immediate: true, deep: true },
)

const displayedImages = computed(() => {
  if (props.images.length <= 4) {
    return props.images
  }
  return props.images.slice(0, 4)
})

const gridContainerClass = computed(() => {
  if (props.images.length === 2) {
    return 'grid-cols-2 h-48 md:h-56'
  }
  return 'grid-cols-2 grid-rows-2 h-64 md:h-72'
})

function getTileClass(idx: number): string {
  if (props.images.length === 3 && idx === 0) {
    return 'row-span-2'
  }
  return ''
}
</script>

<template>
  <div class="mt-1 select-none">
    <!-- Single Image Layout -->
    <div
      v-if="images.length === 1"
      data-test="single-image-container"
      class="relative max-h-96 max-w-md rounded-[10px] border border-[var(--om-border)] overflow-hidden cursor-pointer group bg-[var(--om-card)]"
      :class="{ 'opacity-70': isSending }"
    >
      <div
        data-test="image-grid-tile"
        class="w-full h-full relative"
        @click="emit('selectImage', { images, initialIndex: 0 })"
      >
        <template v-if="resolvedUrls[images[0].path]">
          <img
            :src="resolvedUrls[images[0].path]"
            :alt="images[0].path"
            class="max-h-96 w-auto max-w-full rounded-[10px] object-contain transition-transform duration-200 group-hover:scale-[1.01]"
          />
        </template>
        <div
          v-else
          data-test="image-skeleton"
          class="animate-pulse bg-[var(--om-input-bg)] w-64 h-48 rounded-[10px] flex items-center justify-center text-[var(--om-text-muted)]"
        >
          <svg class="size-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Multi Image Grid Layout (2, 3, 4, 5+ images) -->
    <div
      v-else
      data-test="multi-image-grid"
      class="grid gap-1.5 max-w-md w-full rounded-[10px] border border-[var(--om-border)] overflow-hidden bg-[var(--om-card)] p-0.5"
      :class="[gridContainerClass, { 'opacity-70': isSending }]"
    >
      <div
        v-for="(img, idx) in displayedImages"
        :key="img.path || idx"
        data-test="image-grid-tile"
        class="relative overflow-hidden cursor-pointer group bg-[var(--om-input-bg)] rounded-[8px]"
        :class="getTileClass(idx)"
        @click="emit('selectImage', { images, initialIndex: idx })"
      >
        <template v-if="resolvedUrls[img.path]">
          <img
            :src="resolvedUrls[img.path]"
            :alt="img.path"
            class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        </template>
        <div
          v-else
          data-test="image-skeleton"
          class="animate-pulse bg-[var(--om-input-bg)] w-full h-full min-h-[96px] flex items-center justify-center text-[var(--om-text-muted)]"
        >
          <svg class="size-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>

        <!-- 4th Tile Overflow Badge (+N) -->
        <div
          v-if="idx === 3 && images.length > 4"
          data-test="image-overflow-badge"
          class="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-2xl backdrop-blur-[2px] select-none"
        >
          +{{ images.length - 4 }}
        </div>
      </div>
    </div>
  </div>
</template>
