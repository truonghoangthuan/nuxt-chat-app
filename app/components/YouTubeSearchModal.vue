<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { YouTubeSearchResult } from '~/types/chat'
import { Search, X, Music, Loader2, Play } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  initialResults?: YouTubeSearchResult[]
  conversationTitle?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', track: YouTubeSearchResult): void
}>()

const searchQuery = ref('')
const isSearching = ref(false)
const searchResults = ref<YouTubeSearchResult[]>(props.initialResults || [])
const searchError = ref<string | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      if (props.initialResults && props.initialResults.length > 0) {
        searchResults.value = props.initialResults
      }
      await nextTick()
      searchInputRef.value?.focus()
    } else {
      searchQuery.value = ''
      searchError.value = null
    }
  },
  { immediate: true },
)

watch(
  () => props.initialResults,
  (newVal) => {
    if (newVal && newVal.length > 0) {
      searchResults.value = newVal
    }
  },
)

async function executeSearch() {
  const q = searchQuery.value.trim()
  if (!q) return

  isSearching.value = true
  searchError.value = null

  try {
    const res = await $fetch<{ items: YouTubeSearchResult[]; error?: string }>('/api/youtube/search', {
      params: { q },
    })
    if (res && Array.isArray(res.items)) {
      searchResults.value = res.items
      if (res.items.length === 0) {
        searchError.value = 'No videos found. Try different keywords.'
      }
    } else if (res?.error) {
      searchError.value = res.error
    }
  } catch (err: any) {
    searchError.value = err?.message || 'Failed to search YouTube.'
  } finally {
    isSearching.value = false
  }
}

function handleSelect(track: YouTubeSearchResult) {
  emit('select', track)
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  } else if (e.key === 'Enter') {
    executeSearch()
  }
}
</script>

<template>
  <div
    v-if="open"
    data-test="youtube-search-modal"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none"
    @keydown="handleKeydown"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-xl bg-[var(--ap-stage)] border border-[var(--ap-glass-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-up"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-[var(--ap-glass-border)] flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center shrink-0">
            <Music class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-[var(--ap-text-primary)] truncate">
              Play Music with Room
            </h3>
            <p class="text-xs text-[var(--ap-text-muted)] truncate">
              {{ conversationTitle ? `Sharing audio in ${conversationTitle}` : 'Search YouTube and play for everyone in sync' }}
            </p>
          </div>
        </div>
        <button
          type="button"
          data-test="close-modal-btn"
          class="p-1.5 rounded-full text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
          @click="emit('close')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Search Input Bar -->
      <div class="p-4 border-b border-[var(--ap-glass-border)] bg-black/5 dark:bg-white/5">
        <form class="flex items-center gap-2" @submit.prevent="executeSearch">
          <div class="relative flex-1">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ap-text-muted)]" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              data-test="youtube-search-input"
              placeholder="Search song, artist, lofi, or paste title..."
              class="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-[#1a1f2c] border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus:outline-hidden focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <button
            type="submit"
            data-test="youtube-search-btn"
            :disabled="isSearching || !searchQuery.trim()"
            class="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
          >
            <Loader2 v-if="isSearching" class="w-3.5 h-3.5 animate-spin" />
            <Search v-else class="w-3.5 h-3.5" />
            <span>Search</span>
          </button>
        </form>
      </div>

      <!-- Search Results List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-2 min-h-[260px] max-h-[500px]">
        <div v-if="isSearching" class="h-48 flex flex-col items-center justify-center gap-2 text-xs text-[var(--ap-text-muted)]">
          <Loader2 class="w-6 h-6 animate-spin text-blue-500" />
          <span>Searching YouTube...</span>
        </div>

        <div v-else-if="searchError" class="h-48 flex items-center justify-center text-xs text-[var(--ap-text-muted)] p-4 text-center">
          {{ searchError }}
        </div>

        <div v-else-if="searchResults.length === 0" class="h-48 flex flex-col items-center justify-center gap-2 text-xs text-[var(--ap-text-muted)] text-center p-4">
          <Music class="w-8 h-8 opacity-30" />
          <span>Search for your favorite songs or artists to start playing.</span>
        </div>

        <div
          v-for="item in searchResults"
          :key="item.videoId"
          data-test="youtube-result-item"
          class="group flex items-center gap-3 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer border border-transparent hover:border-[var(--ap-glass-border)]"
          @click="handleSelect(item)"
        >
          <!-- Thumbnail with hover play overlay -->
          <div class="relative w-20 h-12 rounded-lg overflow-hidden shrink-0 bg-black/20">
            <img :src="item.thumbnail" :alt="item.title" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
              <Play class="w-4 h-4 fill-current ml-0.5" />
            </div>
            <span
              v-if="item.durationText"
              class="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-mono bg-black/75 text-white"
            >
              {{ item.durationText }}
            </span>
          </div>

          <!-- Video Details -->
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-semibold text-[var(--ap-text-primary)] group-hover:text-blue-500 transition line-clamp-2">
              {{ item.title }}
            </h4>
            <p class="text-[11px] text-[var(--ap-text-muted)] truncate mt-0.5">
              {{ item.channelTitle }}
            </p>
          </div>

          <!-- Play button badge -->
          <div class="shrink-0 opacity-0 group-hover:opacity-100 transition">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500 text-white shadow-xs">
              <Play class="w-3 h-3 fill-current" />
              <span>Play</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
