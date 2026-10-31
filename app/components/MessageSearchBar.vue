<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import { filterMessagesByKeyword } from '~/utils/chat'
import { Search, ChevronUp, ChevronDown, X } from '@lucide/vue'

const props = defineProps<{
  messages: ChatMessage[]
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'jump', messageId: string): void
  (e: 'close'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const currentIndex = ref(0)
const senderId = ref('')

const senders = computed(() => {
  const names = new Map<string, string>()
  for (const message of props.messages) {
    const name = message.author?.display_name?.trim()
    if (name || !names.has(message.user_id)) {
      names.set(message.user_id, name || message.user_id)
    }
  }
  if (senderId.value && !names.has(senderId.value)) {
    names.set(senderId.value, senderId.value)
  }
  return Array.from(names, ([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
})

const results = computed(() =>
  filterMessagesByKeyword(props.messages, props.modelValue)
    .filter((message) => !senderId.value || message.user_id === senderId.value)
)

watch(
  [() => props.modelValue, senderId, () => results.value.map((message) => message.id)],
  ([query, sender, ids], [oldQuery, oldSender, oldIds]) => {
    const previousId = oldIds[currentIndex.value]
    const preservedIndex = query === oldQuery && sender === oldSender
      ? ids.indexOf(previousId)
      : -1
    if (preservedIndex >= 0) {
      currentIndex.value = preservedIndex
      return
    }
    currentIndex.value = query !== oldQuery || sender !== oldSender
      ? 0
      : Math.min(currentIndex.value, Math.max(0, ids.length - 1))
    if (ids.length > 0) {
      emit('jump', ids[currentIndex.value])
    }
  },
)

function jumpNext() {
  if (results.value.length === 0) return
  currentIndex.value = (currentIndex.value + 1) % results.value.length
  emit('jump', results.value[currentIndex.value].id)
}

function jumpPrev() {
  if (results.value.length === 0) return
  currentIndex.value = (currentIndex.value - 1 + results.value.length) % results.value.length
  emit('jump', results.value[currentIndex.value].id)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) {
      jumpPrev()
    } else {
      jumpNext()
    }
  }
}

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<template>
  <div
    data-test="message-search-bar"
    class="flex flex-wrap items-center gap-1.5 min-w-0 px-2 py-1 rounded-xl bg-white/90 dark:bg-white/10 backdrop-blur-xl border border-black/10 dark:border-white/15 shadow-sm text-xs"
    @keydown.esc="emit('close')"
  >
    <Search class="w-3.5 h-3.5 text-[var(--ap-text-muted)] shrink-0 ml-1" />
    <input
      ref="inputRef"
      :value="modelValue"
      type="text"
      placeholder="Search messages..."
      aria-label="Search loaded messages"
      data-test="search-input"
      class="w-24 min-w-0 flex-1 bg-transparent text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 text-xs"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown="handleKeydown"
    />

    <span
      v-if="modelValue.trim()"
      data-test="search-count"
      role="status"
      aria-live="polite"
      class="text-[11px] font-mono text-[var(--ap-text-muted)] shrink-0 px-1"
    >
      {{ results.length > 0 ? `${currentIndex + 1} of ${results.length}` : 'No results' }}
    </span>

    <button
      type="button"
      data-test="search-prev-btn"
      title="Previous result (Shift+Enter)"
      aria-label="Previous result (Shift+Enter)"
      :disabled="results.length <= 1"
      class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] disabled:opacity-30 cursor-pointer"
      @click="jumpPrev"
    >
      <ChevronUp class="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      data-test="search-next-btn"
      title="Next result (Enter)"
      aria-label="Next result (Enter)"
      :disabled="results.length <= 1"
      class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] disabled:opacity-30 cursor-pointer"
      @click="jumpNext"
    >
      <ChevronDown class="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      data-test="search-close-btn"
      title="Close search (Esc)"
      aria-label="Close search (Esc)"
      class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] cursor-pointer"
      @click="emit('close')"
    >
      <X class="w-3.5 h-3.5" />
    </button>
    <div class="flex basis-full items-center gap-2 min-w-0 border-t border-black/5 dark:border-white/10 pt-1">
      <select
        v-model="senderId"
        data-test="search-sender"
        aria-label="Filter by sender"
        class="min-w-0 w-32 max-w-full rounded-md bg-[var(--ap-stage)] text-[var(--ap-text-primary)] px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <option value="">All senders</option>
        <option v-for="sender in senders" :key="sender.id" :value="sender.id">{{ sender.name }}</option>
      </select>
      <span class="text-[10px] text-[var(--ap-text-muted)]">Loaded messages only</span>
    </div>
  </div>
</template>
