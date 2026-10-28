<script setup lang="ts">
import { ref } from 'vue'
import type { MusicPlaybackState, MusicQueueItem, YouTubeSearchResult } from '~/types/chat'
import type { MusicHistoryEntry } from '~/utils/chat'
import { getYouTubeThumbnailProxyUrl, formatDurationSeconds } from '~/utils/youtube'
import {
  ListMusic,
  History,
  Trash2,
  Play,
  ListPlus,
  ListStart,
  ChevronUp,
  ChevronDown,
  X,
  GripVertical,
  Music,
} from '@lucide/vue'

const props = defineProps<{
  open: boolean
  queue: MusicQueueItem[]
  history: MusicHistoryEntry[]
  currentTrack?: MusicPlaybackState | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'remove', id: string): void
  (e: 'move', id: string, toIndex: number): void
  (e: 'clear'): void
  (e: 'play-now', track: YouTubeSearchResult): void
  (e: 'queue-track', track: YouTubeSearchResult, position: 'end' | 'next'): void
}>()

const activeTab = ref<'queue' | 'history'>('queue')
const draggedIndex = ref<number | null>(null)

function handleDragStart(e: DragEvent, index: number) {
  draggedIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
}

function handleDrop(e: DragEvent, dropIndex: number) {
  e.preventDefault()
  if (draggedIndex.value !== null && draggedIndex.value !== dropIndex) {
    const item = props.queue[draggedIndex.value]
    if (item) {
      emit('move', item.id, dropIndex)
    }
  }
  draggedIndex.value = null
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
</script>

<template>
  <div
    v-if="open"
    data-test="music-queue-panel"
    class="w-full bg-[var(--ap-stage)]/95 backdrop-blur-md border-b border-[var(--ap-glass-border)] shadow-xl z-20 transition-all select-none"
  >
    <!-- Header with Tabs and Actions -->
    <div class="px-4 py-2 border-b border-[var(--ap-glass-border)] flex items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-1.5">
        <!-- Queue Tab -->
        <button
          type="button"
          data-test="tab-queue"
          class="px-3 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5"
          :class="
            activeTab === 'queue'
              ? 'bg-blue-500 text-white shadow-xs'
              : 'text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          "
          @click="activeTab = 'queue'"
        >
          <ListMusic class="w-3.5 h-3.5" />
          <span>Queue</span>
          <span
            v-if="queue.length > 0"
            class="px-1.5 py-0.2 rounded-full text-[9px] font-bold"
            :class="activeTab === 'queue' ? 'bg-white text-blue-600' : 'bg-black/10 dark:bg-white/15 text-[var(--ap-text-primary)]'"
          >
            {{ queue.length }}
          </span>
        </button>

        <!-- History Tab -->
        <button
          type="button"
          data-test="tab-history"
          class="px-3 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5"
          :class="
            activeTab === 'history'
              ? 'bg-blue-500 text-white shadow-xs'
              : 'text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
          "
          @click="activeTab = 'history'"
        >
          <History class="w-3.5 h-3.5" />
          <span>History</span>
          <span
            v-if="history.length > 0"
            class="px-1.5 py-0.2 rounded-full text-[9px] font-bold"
            :class="activeTab === 'history' ? 'bg-white text-blue-600' : 'bg-black/10 dark:bg-white/15 text-[var(--ap-text-primary)]'"
          >
            {{ history.length }}
          </span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <!-- Clear Queue Button (only on Queue tab) -->
        <button
          v-if="activeTab === 'queue' && queue.length > 0"
          type="button"
          data-test="queue-clear"
          class="px-2 py-0.5 rounded-md text-[11px] font-medium text-red-500 hover:bg-red-500/10 transition cursor-pointer flex items-center gap-1"
          title="Clear all songs from queue"
          @click="emit('clear')"
        >
          <Trash2 class="w-3 h-3" />
          <span>Clear</span>
        </button>

        <!-- Close Panel Button -->
        <button
          type="button"
          data-test="close-panel-btn"
          class="p-1 rounded-md text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
          title="Close panel"
          @click="emit('close')"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Panel Content Area -->
    <div class="max-h-72 overflow-y-auto p-3 space-y-1.5">
      <!-- Queue Tab Content -->
      <template v-if="activeTab === 'queue'">
        <div
          v-if="queue.length === 0"
          data-test="queue-empty"
          class="py-8 text-center text-xs text-[var(--ap-text-muted)] flex flex-col items-center justify-center gap-1.5"
        >
          <ListMusic class="w-6 h-6 opacity-30" />
          <span>Queue is empty. Search YouTube and choose "Queue" to line up tracks.</span>
        </div>

        <div
          v-for="(item, index) in queue"
          :key="item.id"
          data-test="queue-item"
          draggable="true"
          class="group flex items-center gap-2.5 p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-transparent hover:border-[var(--ap-glass-border)] transition"
          @dragstart="handleDragStart($event, index)"
          @dragover="handleDragOver"
          @drop="handleDrop($event, index)"
        >
          <!-- Drag handle -->
          <div class="text-[var(--ap-text-muted)] cursor-grab active:cursor-grabbing p-1 rounded hover:text-[var(--ap-text-primary)] shrink-0">
            <GripVertical class="w-3.5 h-3.5" />
          </div>

          <!-- Thumbnail -->
          <div class="relative w-12 h-8 rounded-lg overflow-hidden shrink-0 bg-black/20 flex items-center justify-center">
            <img
              v-if="item.thumbnail"
              :src="getYouTubeThumbnailProxyUrl(item.videoId, item.thumbnail)"
              :alt="item.title"
              class="w-full h-full object-cover"
            />
            <Music v-else class="w-3.5 h-3.5 text-blue-500" />
          </div>

          <!-- Title & Added By -->
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-semibold text-[var(--ap-text-primary)] truncate" :title="item.title">
              {{ item.title }}
            </h4>
            <div class="text-[10px] text-[var(--ap-text-secondary)] flex items-center gap-1.5 truncate">
              <span class="truncate">{{ item.channelTitle }}</span>
              <span class="opacity-40">•</span>
              <span class="text-[var(--ap-text-muted)] shrink-0">Added by {{ item.addedBy }}</span>
            </div>
          </div>

          <!-- Action buttons: Move up/down, Play now, Remove -->
          <div class="flex items-center gap-1 shrink-0">
            <!-- Move up button -->
            <button
              type="button"
              data-test="queue-move-up"
              :disabled="index === 0"
              class="p-1 rounded text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] disabled:opacity-20 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              title="Move up"
              @click="emit('move', item.id, Math.max(0, index - 1))"
            >
              <ChevronUp class="w-3.5 h-3.5" />
            </button>

            <!-- Move down button -->
            <button
              type="button"
              data-test="queue-move-down"
              :disabled="index === queue.length - 1"
              class="p-1 rounded text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] disabled:opacity-20 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              title="Move down"
              @click="emit('move', item.id, Math.min(queue.length - 1, index + 1))"
            >
              <ChevronDown class="w-3.5 h-3.5" />
            </button>

            <!-- Play now button -->
            <button
              type="button"
              data-test="queue-play-now"
              class="p-1 rounded text-blue-500 hover:bg-blue-500/10 transition cursor-pointer"
              title="Play immediately"
              @click="emit('play-now', item)"
            >
              <Play class="w-3.5 h-3.5 fill-current" />
            </button>

            <!-- Remove button -->
            <button
              type="button"
              data-test="queue-remove"
              class="p-1 rounded text-red-500 hover:bg-red-500/10 transition cursor-pointer"
              title="Remove from queue"
              @click="emit('remove', item.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </template>

      <!-- History Tab Content -->
      <template v-else>
        <div
          v-if="history.length === 0"
          data-test="history-empty"
          class="py-8 text-center text-xs text-[var(--ap-text-muted)] flex flex-col items-center justify-center gap-1.5"
        >
          <History class="w-6 h-6 opacity-30" />
          <span>No song history recorded in this room yet.</span>
        </div>

        <div
          v-for="item in history"
          :key="item.messageId"
          data-test="history-item"
          class="flex items-center gap-2.5 p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-transparent hover:border-[var(--ap-glass-border)] transition text-xs"
        >
          <!-- Thumbnail / Music Icon -->
          <div class="relative w-10 h-8 rounded-lg overflow-hidden shrink-0 bg-black/20 flex items-center justify-center">
            <img
              v-if="item.track?.thumbnail"
              :src="getYouTubeThumbnailProxyUrl(item.track.videoId, item.track.thumbnail)"
              :alt="item.title"
              class="w-full h-full object-cover"
            />
            <Music v-else class="w-3.5 h-3.5 text-blue-500" />
          </div>

          <!-- Track & Actor Details -->
          <div class="min-w-0 flex-1">
            <h4 class="font-semibold text-[var(--ap-text-primary)] truncate" :title="item.title">
              {{ item.title }}
            </h4>
            <div class="text-[10px] text-[var(--ap-text-secondary)] flex items-center gap-1.5 truncate">
              <span v-if="item.track?.channelTitle" class="truncate">{{ item.track.channelTitle }}</span>
              <span v-if="item.track?.channelTitle" class="opacity-40">•</span>
              <span class="text-[var(--ap-text-muted)] shrink-0">Played by {{ item.actorName }}</span>
              <span v-if="item.createdAt" class="text-[var(--ap-text-muted)] shrink-0">• {{ formatRelativeTime(item.createdAt) }}</span>
            </div>
          </div>

          <!-- History Actions: Play now / Play next / Add queue -->
          <div class="flex items-center gap-1 shrink-0">
            <template v-if="item.track">
              <button
                type="button"
                data-test="history-play-now"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-blue-500 text-white hover:bg-blue-600 transition cursor-pointer shadow-xs"
                title="Play now"
                @click="emit('play-now', item.track!)"
              >
                <Play class="w-3 h-3 fill-current" />
                <span class="hidden sm:inline">Play</span>
              </button>
              <button
                type="button"
                data-test="history-add-next"
                class="p-1 rounded text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                title="Play next"
                @click="emit('queue-track', item.track!, 'next')"
              >
                <ListStart class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-test="history-add-queue"
                class="p-1 rounded text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                title="Add to queue"
                @click="emit('queue-track', item.track!, 'end')"
              >
                <ListPlus class="w-3.5 h-3.5" />
              </button>
            </template>

            <!-- Disabled replay button for old legacy items -->
            <button
              v-else
              type="button"
              data-test="history-play-now"
              disabled
              class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/5 dark:bg-white/5 text-[var(--ap-text-muted)] opacity-60 cursor-not-allowed"
              title="Old entry — no video info"
            >
              Title only
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
