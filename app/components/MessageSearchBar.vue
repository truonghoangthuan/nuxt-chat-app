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

const results = computed(() =>
  filterMessagesByKeyword(props.messages, props.modelValue)
)

watch(
  () => props.modelValue,
  () => {
    currentIndex.value = 0
    if (results.value.length > 0) {
      emit('jump', results.value[0].id)
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
  if (event.key === 'Escape') {
    emit('close')
    return
  }
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
    class="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/90 dark:bg-white/10 backdrop-blur-xl border border-black/10 dark:border-white/15 shadow-sm text-xs"
  >
    <Search class="w-3.5 h-3.5 text-[var(--ap-text-muted)] shrink-0 ml-1" />
    <input
      ref="inputRef"
      :value="modelValue"
      type="text"
      placeholder="Search messages..."
      data-test="search-input"
      class="w-32 sm:w-48 bg-transparent text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus:outline-none text-xs"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown="handleKeydown"
    />

    <span
      v-if="modelValue.trim()"
      data-test="search-count"
      class="text-[11px] font-mono text-[var(--ap-text-muted)] shrink-0 px-1"
    >
      {{ results.length > 0 ? `${currentIndex + 1} of ${results.length}` : 'No results' }}
    </span>

    <button
      type="button"
      data-test="search-prev-btn"
      title="Previous result (Shift+Enter)"
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
      class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] cursor-pointer"
      @click="emit('close')"
    >
      <X class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
