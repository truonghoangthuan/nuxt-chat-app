<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Sparkles, Plus, X } from '@lucide/vue'
import type { Conversation } from '~/types/chat'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    conversation: Conversation | null
  }>(),
  {
    isOpen: false,
    conversation: null,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'addWord', word: string): void
  (e: 'removeWord', word: string): void
}>()

const newWord = ref('')
const inputError = ref<string | null>(null)

const words = computed(() => props.conversation?.confetti_words || [])

function handleAdd() {
  const trimmed = newWord.value.trim()
  if (!trimmed) {
    inputError.value = 'Please enter a word or phrase.'
    return
  }
  inputError.value = null
  emit('addWord', trimmed)
  newWord.value = ''
}

function handleClose() {
  newWord.value = ''
  inputError.value = null
  emit('close')
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

watch(
  () => props.isOpen,
  (open) => {
    newWord.value = ''
    inputError.value = null
    if (typeof window !== 'undefined') {
      if (open) {
        window.addEventListener('keydown', onKeyDown)
      } else {
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})
</script>

<template>
  <div
    v-if="isOpen && conversation"
    data-test="confetti-dictionary-backdrop"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    @click.self="handleClose"
  >
    <div
      data-test="confetti-dictionary-modal"
      class="w-full max-w-md rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
    >
      <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Sparkles class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-[15px] font-semibold text-white/95 tracking-tight">
              Confetti Dictionary
            </h3>
            <p class="text-xs text-white/45">
              Messages containing these words trigger celebration effects
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-lg font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <div class="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scroll">
        <form data-test="confetti-word-form" class="flex gap-2" @submit.prevent="handleAdd">
          <input
            v-model="newWord"
            data-test="confetti-word-input"
            type="text"
            maxlength="80"
            placeholder="Add word or phrase (comma-separated)..."
            class="flex-1 min-w-0 px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/8 text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-amber-500/50"
          />
          <button
            type="submit"
            data-test="confetti-word-add-btn"
            class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </form>

        <p v-if="inputError" data-test="confetti-word-error" class="text-xs text-rose-400 font-medium">
          {{ inputError }}
        </p>

        <div v-if="words.length === 0" data-test="confetti-words-empty" class="py-6 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
          <p class="text-xs text-white/50">
            No trigger words yet. Add words above so messages celebrate automatically!
          </p>
        </div>

        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="word in words"
            :key="word"
            data-test="confetti-word-chip"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-200"
          >
            <span>{{ word }}</span>
            <button
              type="button"
              data-test="confetti-word-remove-btn"
              :aria-label="`Remove ${word}`"
              class="w-4 h-4 rounded-full hover:bg-white/15 flex items-center justify-center text-amber-200/70 hover:text-white cursor-pointer transition-colors"
              @click="emit('removeWord', word)"
            >
              <X class="w-3 h-3" />
            </button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
