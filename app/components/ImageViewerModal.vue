<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { EncryptedImageMetadata } from '~/types/chat'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'
import { useE2ee } from '~/composables/useE2ee'

const props = withDefaults(
  defineProps<{
    open: boolean
    images: EncryptedImageMetadata[]
    initialIndex?: number
    channelId?: string | null
    e2eeKey?: CryptoKey | null
    supabaseClient?: any
  }>(),
  {
    initialIndex: 0,
    channelId: '',
    e2eeKey: undefined,
    supabaseClient: undefined,
  },
)

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const currentIndex = ref(props.initialIndex ?? 0)
const resolvedUrls = ref<Record<string, string>>({})
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

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

const activeImage = computed<EncryptedImageMetadata | null>(() => {
  if (!props.images || props.images.length === 0) return null
  const idx = Math.max(0, Math.min(currentIndex.value, props.images.length - 1))
  return props.images[idx] || null
})

const activeImageUrl = computed<string | null>(() => {
  if (!activeImage.value) return null
  return resolvedUrls.value[activeImage.value.path] || null
})

async function loadActiveImage() {
  errorMessage.value = null
  const img = activeImage.value
  if (!img || !img.path) return

  if (img.path.startsWith('blob:')) {
    resolvedUrls.value = { ...resolvedUrls.value, [img.path]: img.path }
    return
  }

  const cached = cache.getCachedUrl(img.path)
  if (cached) {
    resolvedUrls.value = { ...resolvedUrls.value, [img.path]: cached }
    return
  }

  const key = resolveKey()
  if (!key) {
    errorMessage.value = 'Failed to decrypt or load image.'
    return
  }

  const supabase = resolveSupabase()
  isLoading.value = true

  try {
    const url = await cache.getOrFetchImage(
      img.path,
      img.mimeType,
      props.channelId || '',
      key,
      supabase,
    )
    resolvedUrls.value = { ...resolvedUrls.value, [img.path]: url }
  } catch {
    errorMessage.value = 'Failed to decrypt or load image.'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => [props.open, props.initialIndex, props.images],
  ([isOpen, idx]) => {
    if (isOpen) {
      errorMessage.value = null
      const targetIndex = Number(idx) || 0
      currentIndex.value = Math.max(0, Math.min(targetIndex, (props.images?.length || 1) - 1))
      loadActiveImage()
    }
  },
  { immediate: true },
)

watch(currentIndex, () => {
  if (props.open) {
    errorMessage.value = null
    loadActiveImage()
  }
})

function goToPrev() {
  if (!props.images || props.images.length <= 1) return
  errorMessage.value = null
  currentIndex.value = (currentIndex.value - 1 + props.images.length) % props.images.length
}

function goToNext() {
  if (!props.images || props.images.length <= 1) return
  errorMessage.value = null
  currentIndex.value = (currentIndex.value + 1) % props.images.length
}

function handleClose() {
  emit('update:open', false)
}

function handleDownload() {
  const img = activeImage.value
  if (!img) return
  const url = activeImageUrl.value
  if (!url) return

  const ext = img.mimeType === 'image/png' ? 'png'
    : img.mimeType === 'image/webp' ? 'webp'
    : img.mimeType === 'image/gif' ? 'gif'
    : 'jpg'
  const filename = `image-${currentIndex.value + 1}.${ext}`

  if (typeof document !== 'undefined') {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    goToPrev()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    goToNext()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    handleClose()
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <div
    v-if="open"
    data-test="lightbox-modal"
    class="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm select-none"
    role="dialog"
    aria-modal="true"
    @click.self="handleClose"
  >
    <!-- Header: Counter & Actions -->
    <header class="flex items-center justify-between px-4 py-3 sm:px-6 text-white/90 shrink-0 z-10 bg-gradient-to-b from-black/60 to-transparent">
      <div
        data-test="lightbox-counter"
        class="text-sm font-medium tracking-wide"
      >
        {{ currentIndex + 1 }} / {{ images.length }}
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          data-test="lightbox-download"
          :disabled="!activeImageUrl"
          class="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Download image"
          @click="handleDownload"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        <button
          type="button"
          data-test="lightbox-close"
          class="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Close (Escape)"
          @click="handleClose"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Center Stage -->
    <div
      class="relative flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden"
      @click.self="handleClose"
    >
      <!-- Previous chevron button -->
      <button
        v-if="images.length > 1"
        type="button"
        data-test="lightbox-prev"
        class="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-md z-10 focus:outline-none focus:ring-2 focus:ring-white/40"
        title="Previous (Left arrow)"
        @click.stop="goToPrev"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <!-- Next chevron button -->
      <button
        v-if="images.length > 1"
        type="button"
        data-test="lightbox-next"
        class="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/80 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-md z-10 focus:outline-none focus:ring-2 focus:ring-white/40"
        title="Next (Right arrow)"
        @click.stop="goToNext"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <!-- Decryption/Load Error -->
      <div
        v-if="errorMessage"
        data-test="lightbox-error"
        class="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-neutral-900/80 border border-neutral-700/60 max-w-sm text-center text-rose-300"
      >
        <div class="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p class="text-sm font-medium">{{ errorMessage }}</p>
      </div>

      <!-- Loading skeleton/spinner -->
      <div
        v-else-if="isLoading || !activeImageUrl"
        data-test="lightbox-loading"
        class="flex flex-col items-center justify-center gap-3 text-white/70"
      >
        <div class="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
        <span class="text-xs font-medium tracking-wide">Decrypting image...</span>
      </div>

      <!-- Active image -->
      <img
        v-else
        data-test="lightbox-image"
        :src="activeImageUrl"
        :alt="`Image ${currentIndex + 1} of ${images.length}`"
        class="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-all select-none"
      >
    </div>
  </div>
</template>
