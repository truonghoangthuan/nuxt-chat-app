<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { EncryptedImageMetadata } from '~/types/chat'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'

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
const zoom = ref(1)
const panRef = ref<HTMLElement | null>(null)
let zoomRevision = 0
let loadRevision = 0

function setZoom(value: number) {
  if (!canZoom.value) return
  const previous = zoom.value
  const next = Math.max(1, Math.min(4, value))
  const pan = panRef.value
  const left = pan ? (pan.scrollLeft + pan.clientWidth / 2) * next / previous - pan.clientWidth / 2 : 0
  const top = pan ? (pan.scrollTop + pan.clientHeight / 2) * next / previous - pan.clientHeight / 2 : 0
  const revision = ++zoomRevision
  zoom.value = next
  nextTick(() => {
    if (revision !== zoomRevision || !pan || pan !== panRef.value) return
    pan.scrollLeft = next === 1 ? 0 : Math.max(0, left)
    pan.scrollTop = next === 1 ? 0 : Math.max(0, top)
  })
}

function resetZoom() {
  zoom.value = 1
  const revision = ++zoomRevision
  nextTick(() => {
    if (revision !== zoomRevision || !panRef.value) return
    panRef.value.scrollLeft = 0
    panRef.value.scrollTop = 0
  })
}

watch(
  () => [props.open, props.channelId, props.images, props.initialIndex, currentIndex.value],
  resetZoom,
)

const cache = useImageAttachmentCache()

const activeImage = computed<EncryptedImageMetadata | null>(() => {
  if (!props.images || props.images.length === 0) return null
  const idx = Math.max(0, Math.min(currentIndex.value, props.images.length - 1))
  return props.images[idx] || null
})

const activeImageUrl = computed<string | null>(() => {
  if (!activeImage.value) return null
  return resolvedUrls.value[activeImage.value.path] || null
})

const canZoom = computed(() => Boolean(activeImageUrl.value) && !isLoading.value && !errorMessage.value)

async function loadActiveImage() {
  const revision = ++loadRevision
  errorMessage.value = null
  isLoading.value = false
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

  isLoading.value = true

  try {
    const url = await cache.getOrFetchImage(
      img.path,
      img.mimeType,
      props.channelId || '',
      props.e2eeKey,
      props.supabaseClient,
    )
    if (revision !== loadRevision) return
    resolvedUrls.value = { ...resolvedUrls.value, [img.path]: url }
  } catch {
    if (revision === loadRevision) errorMessage.value = 'Failed to decrypt or load image.'
  } finally {
    if (revision === loadRevision) isLoading.value = false
  }
}

watch(
  () => [props.open, props.initialIndex, props.images, props.channelId],
  ([isOpen, idx]) => {
    if (isOpen) {
      errorMessage.value = null
      const targetIndex = Number(idx) || 0
      currentIndex.value = Math.max(0, Math.min(targetIndex, (props.images?.length || 1) - 1))
      loadActiveImage()
    } else {
      ++loadRevision
      isLoading.value = false
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
  if (!props.open || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
  const target = e.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
  if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0') {
    if (!canZoom.value) return
    e.preventDefault()
    setZoom(e.key === '0' ? 1 : zoom.value + (e.key === '-' ? -0.5 : 0.5))
    return
  }
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
  ++loadRevision
  ++zoomRevision
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <div
    v-if="open"
    data-test="lightbox-modal"
    class="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-2xl select-none"
    role="dialog"
    aria-modal="true"
    aria-label="Image viewer"
    @click.self="handleClose"
  >
    <!-- Header: Counter & Actions -->
    <header class="flex items-center justify-between px-4 py-3 sm:px-6 text-white/90 shrink-0 z-10 bg-gradient-to-b from-black/60 to-transparent">
      <div
        data-test="lightbox-counter"
        class="text-xs font-mono font-medium tracking-wide text-white/70 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10"
      >
        {{ currentIndex + 1 }} / {{ images.length }}
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          data-test="lightbox-download"
          :disabled="!activeImageUrl"
          class="w-9 h-9 rounded-full text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Download image"
          @click="handleDownload"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        <button
          type="button"
          data-test="lightbox-close"
          class="w-9 h-9 rounded-full text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 flex items-center justify-center transition-colors cursor-pointer"
          title="Close (Escape)"
          @click="handleClose"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        class="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-xl border border-white/15 z-10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xl"
        aria-label="Previous image"
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
        class="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-xl border border-white/15 z-10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xl"
        aria-label="Next image"
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
        class="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-neutral-900/90 border border-white/10 max-w-sm text-center text-rose-300 backdrop-blur-2xl shadow-2xl"
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
        <div class="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span class="text-xs font-mono font-medium tracking-wide">Decrypting image...</span>
      </div>

      <!-- Native scrolling keeps every edge of the enlarged image reachable. -->
      <div
        v-else
        ref="panRef"
        data-test="lightbox-pan"
        class="absolute inset-4 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-blue-400"
        tabindex="0"
        aria-label="Image preview. Scroll to pan when zoomed."
      >
        <div
          data-test="lightbox-zoom-content"
          class="flex items-center justify-center"
          :style="{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }"
        >
          <img
            data-test="lightbox-image"
            :src="activeImageUrl"
            :alt="`Image ${currentIndex + 1} of ${images.length}`"
            class="w-full h-full object-contain select-none"
            draggable="false"
          >
        </div>
      </div>
    </div>

    <footer class="flex items-center justify-center gap-2 px-4 py-3 shrink-0 text-white bg-black/40">
      <button
        type="button"
        data-test="lightbox-zoom-out"
        :disabled="!canZoom || zoom <= 1"
        class="size-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-blue-400"
        aria-label="Zoom out"
        title="Zoom out (-)"
        @click="setZoom(zoom - 0.5)"
      >−</button>
      <output data-test="lightbox-zoom-level" class="w-16 text-center text-sm tabular-nums" aria-live="polite" aria-label="Zoom relative to fitted size">{{ zoom * 100 }}%</output>
      <button
        type="button"
        data-test="lightbox-zoom-in"
        :disabled="!canZoom || zoom >= 4"
        class="size-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-blue-400"
        aria-label="Zoom in"
        title="Zoom in (+)"
        @click="setZoom(zoom + 0.5)"
      >+</button>
      <button
        type="button"
        data-test="lightbox-fit"
        :disabled="!canZoom"
        class="h-10 px-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 text-sm focus-visible:outline-2 focus-visible:outline-blue-400"
        aria-label="Fit image"
        title="Fit image (0)"
        @click="setZoom(1)"
      >Fit</button>
    </footer>
  </div>
</template>
