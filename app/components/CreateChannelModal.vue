<script setup lang="ts">
import { ref, computed } from 'vue'
import { normalizeChannelSlug, isValidChannelSlug } from '~/utils/chat'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create', payload: { name: string; description: string }): void
}>()

const name = ref('')
const description = ref('')
const error = ref<string | null>(null)

const previewSlug = computed(() => normalizeChannelSlug(name.value))
const isValid = computed(() => isValidChannelSlug(previewSlug.value))

function handleClose() {
  name.value = ''
  description.value = ''
  error.value = null
  emit('close')
}

function handleCreate() {
  error.value = null
  if (!isValid.value) {
    error.value = 'Channel slug must be between 2 and 32 lowercase alphanumeric characters or hyphens.'
    return
  }

  emit('create', {
    name: name.value.trim(),
    description: description.value.trim(),
  })
  handleClose()
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white">
          Create a channel
        </h3>
        <button
          type="button"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <div v-if="error" class="mb-4 p-3 rounded-lg text-xs bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300">
        {{ error }}
      </div>

      <form class="space-y-4" @submit.prevent="handleCreate">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Channel Name
          </label>
          <input
            v-model="name"
            type="text"
            required
            placeholder="e.g. general, movies, gaming"
            class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <p class="text-xs text-slate-500 mt-1">
            Slug preview: <code class="text-sky-600 dark:text-sky-400 font-mono">#{{ previewSlug || 'slug' }}</code>
          </p>
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Description <span class="text-slate-400 font-normal lowercase">(optional)</span>
          </label>
          <input
            v-model="description"
            type="text"
            placeholder="What is this channel about?"
            class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium"
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="!isValid"
            class="px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Create Channel
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
