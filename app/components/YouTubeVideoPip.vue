<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { MusicPlaybackState } from '~/types/chat'
import { Play, Pause, X, Maximize2, Minimize2, GripHorizontal, Volume2, VolumeX } from '@lucide/vue'
import { formatDurationSeconds } from '~/utils/youtube'

const props = withDefaults(
  defineProps<{
    track: MusicPlaybackState | null
    currentTimeSec: number
    durationSec: number
    isMuted?: boolean
    isOpen?: boolean
  }>(),
  {
    isMuted: false,
    isOpen: true,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-play'): void
  (e: 'seek', seconds: number): void
  (e: 'toggle-mute'): void
}>()

const isExpanded = ref(false)
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = { x: 0, y: 0 }
const initialPos = { x: 0, y: 0 }

const formattedCurrentTime = computed(() => formatDurationSeconds(props.currentTimeSec))
const formattedDuration = computed(() => formatDurationSeconds(props.durationSec || props.currentTimeSec))

function handlePointerDown(e: PointerEvent) {
  isDragging.value = true
  dragStart.x = e.clientX
  dragStart.y = e.clientY
  initialPos.x = position.value.x
  initialPos.y = position.value.y
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

function handlePointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  position.value = {
    x: initialPos.x + dx,
    y: initialPos.y + dy,
  }
}

function handlePointerUp() {
  isDragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
})

function handleSeekInput(e: Event) {
  const target = e.target as HTMLInputElement
  const sec = Number(target.value)
  if (!Number.isNaN(sec)) {
    emit('seek', sec)
  }
}
</script>

<template>
  <div
    v-show="track && isOpen"
    data-test="video-pip-container"
    class="fixed z-30 flex flex-col bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden transition-all duration-150 select-none"
    :class="isExpanded ? 'w-[440px]' : 'w-80'"
    :style="{
      right: '24px',
      bottom: '72px',
      transform: `translate(${position.x}px, ${position.y}px)`,
    }"
  >
    <!-- Draggable Header -->
    <div
      class="h-8 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700/60 flex items-center justify-between px-2.5 cursor-grab active:cursor-grabbing text-slate-200"
      @pointerdown="handlePointerDown"
    >
      <div class="flex items-center gap-1.5 min-w-0 mr-2">
        <GripHorizontal class="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span class="text-[11px] font-medium truncate" :title="track?.title || ''">
          {{ track?.title || '' }}
        </span>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          data-test="video-pip-expand"
          class="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
          :title="isExpanded ? 'Shrink' : 'Expand'"
          @click.stop="isExpanded = !isExpanded"
        >
          <Minimize2 v-if="isExpanded" class="w-3 h-3" />
          <Maximize2 v-else class="w-3 h-3" />
        </button>

        <button
          type="button"
          data-test="video-pip-close"
          class="p-1 rounded hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition"
          title="Close video (return to audio-only)"
          @click.stop="emit('close')"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Video Surface Slot -->
    <div class="relative w-full aspect-video bg-black group overflow-hidden">
      <slot />

      <!-- Hover Playback Controls Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none"
      >
        <div class="flex items-center gap-2 pointer-events-auto text-white text-[10px]">
          <button
            type="button"
            data-test="video-pip-play-toggle"
            class="p-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition"
            @click="emit('toggle-play')"
          >
            <Pause v-if="track?.isPlaying" class="w-3 h-3 fill-current" />
            <Play v-else class="w-3 h-3 fill-current ml-0.5" />
          </button>

          <input
            type="range"
            min="0"
            :max="durationSec || currentTimeSec || 100"
            :value="currentTimeSec"
            step="1"
            class="flex-1 h-1 bg-white/30 rounded appearance-none cursor-pointer accent-blue-500"
            @input="handleSeekInput"
          />

          <span class="font-mono text-[9px]">{{ formattedCurrentTime }} / {{ formattedDuration }}</span>

          <button
            type="button"
            data-test="video-pip-mute-toggle"
            class="p-1 rounded hover:bg-white/20 transition text-slate-200"
            @click="emit('toggle-mute')"
          >
            <VolumeX v-if="isMuted" class="w-3.5 h-3.5 text-red-400" />
            <Volume2 v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
