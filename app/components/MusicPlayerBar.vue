<script setup lang="ts">
import { computed } from 'vue'
import type { MusicPlaybackState } from '~/types/chat'
import { formatDurationSeconds } from '~/utils/youtube'
import { Play, Pause, Square, Volume2, VolumeX, Music, Volume1 } from '@lucide/vue'

const props = defineProps<{
  track: MusicPlaybackState | null
  currentTimeSec: number
  durationSec: number
  isMuted?: boolean
  autoplayBlocked?: boolean
  conversationName?: string
}>()

const emit = defineEmits<{
  (e: 'toggle-play'): void
  (e: 'seek', seconds: number): void
  (e: 'toggle-mute'): void
  (e: 'stop'): void
  (e: 'unblock-autoplay'): void
  (e: 'open-search'): void
}>()

const formattedCurrentTime = computed(() => formatDurationSeconds(props.currentTimeSec))
const formattedDuration = computed(() => formatDurationSeconds(props.durationSec || props.currentTimeSec))

const progressPercent = computed(() => {
  if (!props.durationSec || props.durationSec <= 0) return 0
  return Math.min(100, Math.max(0, (props.currentTimeSec / props.durationSec) * 100))
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
    v-if="track"
    data-test="music-player-bar"
    class="w-full bg-[var(--ap-stage)]/90 backdrop-blur-md border-b border-[var(--ap-glass-border)] px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0 select-none z-10 transition-all"
  >
    <!-- Left: Track info & Thumbnail -->
    <div class="flex items-center gap-3 min-w-0 max-w-[40%] sm:max-w-[45%]">
      <div class="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-black/10 dark:bg-white/10 flex items-center justify-center border border-[var(--ap-glass-border)]">
        <img
          v-if="track.thumbnail"
          :src="track.thumbnail"
          :alt="track.title"
          class="w-full h-full object-cover"
        />
        <Music v-else class="w-4 h-4 text-blue-500" />
        <span
          v-if="track.isPlaying && !autoplayBlocked"
          class="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]"
        />
      </div>

      <div class="min-w-0 flex flex-col justify-center">
        <div class="flex items-center gap-1.5">
          <span class="font-semibold text-[var(--ap-text-primary)] truncate" :title="track.title">
            {{ track.title }}
          </span>
          <span
            v-if="conversationName"
            class="hidden md:inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-black/5 dark:bg-white/10 text-[var(--ap-text-muted)] truncate"
          >
            {{ conversationName }}
          </span>
        </div>
        <div class="text-[11px] text-[var(--ap-text-secondary)] truncate flex items-center gap-1">
          <span class="truncate">{{ track.channelTitle }}</span>
          <span class="opacity-40">•</span>
          <span class="text-[var(--ap-text-muted)] shrink-0">Played by {{ track.startedBy }}</span>
        </div>
      </div>
    </div>

    <!-- Center: Playback Controls & Progress Bar -->
    <div class="flex-1 flex flex-col items-center justify-center max-w-md px-2 min-w-0">
      <div class="flex items-center gap-2">
        <!-- Autoplay Blocked Banner / Tune In Button -->
        <button
          v-if="autoplayBlocked"
          type="button"
          data-test="music-unblock-btn"
          class="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/30 hover:bg-amber-500/30 transition flex items-center gap-1 cursor-pointer"
          title="Click to tune in to the room audio"
          @click="emit('unblock-autoplay')"
        >
          <Volume1 class="w-3.5 h-3.5" />
          <span>Tune In</span>
        </button>

        <!-- Play / Pause Button -->
        <button
          v-else
          type="button"
          data-test="music-toggle-play"
          class="p-1.5 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition cursor-pointer shadow-xs"
          :title="track.isPlaying ? 'Pause' : 'Play'"
          @click="emit('toggle-play')"
        >
          <Pause v-if="track.isPlaying" class="w-3.5 h-3.5 fill-current" />
          <Play v-else class="w-3.5 h-3.5 fill-current ml-0.5" />
        </button>

        <!-- Stop Button -->
        <button
          type="button"
          data-test="music-stop-btn"
          class="p-1.5 rounded-full text-[var(--ap-text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
          title="Stop playback"
          @click="emit('stop')"
        >
          <Square class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Scrubber Timeline -->
      <div class="w-full flex items-center gap-2 text-[10px] text-[var(--ap-text-muted)] font-mono mt-0.5">
        <span class="w-8 text-right shrink-0">{{ formattedCurrentTime }}</span>
        <div class="relative flex-1 flex items-center h-4">
          <input
            type="range"
            min="0"
            :max="durationSec || currentTimeSec || 100"
            :value="currentTimeSec"
            step="1"
            class="w-full h-1 bg-black/10 dark:bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
            @input="handleSeekInput"
          />
        </div>
        <span class="w-8 shrink-0">{{ formattedDuration }}</span>
      </div>
    </div>

    <!-- Right: Volume & New Song button -->
    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        class="p-1.5 rounded-full text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
        :title="isMuted ? 'Unmute' : 'Mute'"
        @click="emit('toggle-mute')"
      >
        <VolumeX v-if="isMuted" class="w-4 h-4 text-red-500" />
        <Volume2 v-else class="w-4 h-4" />
      </button>

      <button
        type="button"
        class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-500/20 border border-blue-500/20 transition cursor-pointer text-[11px]"
        title="Search another YouTube track"
        @click="emit('open-search')"
      >
        <Music class="w-3 h-3" />
        <span>Change</span>
      </button>
    </div>
  </div>
</template>
