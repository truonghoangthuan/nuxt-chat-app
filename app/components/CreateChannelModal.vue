<script setup lang="ts">
import { ref, computed } from 'vue'
import { normalizeChannelSlug, isValidChannelSlug } from '~/utils/chat'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'create',
    payload: {
      name: string
      description: string
      onSuccess: () => void
      onError: (message: string) => void
    }
  ): void
}>()

const name = ref('')
const description = ref('')
const error = ref<string | null>(null)
const isSubmitting = ref(false)

const previewSlug = computed(() => normalizeChannelSlug(name.value))
const isValid = computed(() => isValidChannelSlug(previewSlug.value))

function handleClose() {
  if (isSubmitting.value) return
  name.value = ''
  description.value = ''
  error.value = null
  isSubmitting.value = false
  emit('close')
}

function handleCreate() {
  error.value = null
  if (!isValid.value) {
    error.value = 'Channel slug must be between 2 and 32 lowercase alphanumeric characters or hyphens.'
    return
  }

  isSubmitting.value = true
  emit('create', {
    name: name.value.trim(),
    description: description.value.trim(),
    onSuccess: () => {
      isSubmitting.value = false
      handleClose()
    },
    onError: (msg: string) => {
      isSubmitting.value = false
      error.value = msg
    },
  })
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div class="w-full max-w-md fp-stage-surface rounded-[14px] border border-[var(--fp-border)] p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="fp-font-display text-[17px] font-bold text-[var(--fp-text-primary)]">
          Create a channel
        </h3>
        <button
          type="button"
          class="w-7 h-7 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] text-lg font-bold flex items-center justify-center cursor-pointer"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <div v-if="error" class="mb-4 p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/35 text-rose-600 dark:text-rose-300">
        {{ error }}
      </div>

      <form class="space-y-4" @submit.prevent="handleCreate">
        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Channel Name
          </label>
          <input
            v-model="name"
            type="text"
            required
            placeholder="e.g. general, movies, gaming"
            class="w-full px-3 py-2 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] text-[14.5px] focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <p class="text-xs text-[var(--fp-text-secondary)] mt-1.5">
            Slug preview: <code class="text-[var(--fp-accent-bright)] fp-font-mono font-semibold">#{{ previewSlug || 'slug' }}</code>
          </p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Description <span class="text-[var(--fp-text-muted)] font-normal">(optional)</span>
          </label>
          <input
            v-model="description"
            type="text"
            placeholder="What is this channel about?"
            class="w-full px-3 py-2 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] text-[14.5px] focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div class="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-[8px] text-sm border border-[var(--fp-border)] text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors font-medium cursor-pointer"
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="!isValid || isSubmitting"
            class="px-4 py-2 rounded-[8px] text-sm fp-btn-primary font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {{ isSubmitting ? 'Creating...' : 'Create Channel' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
