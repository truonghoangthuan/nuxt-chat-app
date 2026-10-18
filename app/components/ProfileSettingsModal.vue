<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Profile } from '~/types/chat'
import { AVATAR_PALETTE, isValidDisplayName, isValidAvatarColor } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = defineProps<{
  isOpen: boolean
  profile: Profile | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'save',
    payload: {
      displayName: string
      avatarColor: string
      onSuccess: () => void
      onError: (message: string) => void
    }
  ): void
}>()

const displayName = ref(props.profile?.display_name || '')
const avatarColor = ref<string>(props.profile?.avatar_color || AVATAR_PALETTE[0])
const error = ref<string | null>(null)
const isSubmitting = ref(false)

watch(
  () => [props.isOpen, props.profile] as const,
  ([open, prof]) => {
    if (open && prof) {
      displayName.value = prof.display_name
      avatarColor.value = prof.avatar_color || AVATAR_PALETTE[0]
      error.value = null
      isSubmitting.value = false
    }
  },
  { immediate: true },
)

const isValid = computed(() => {
  return isValidDisplayName(displayName.value) && isValidAvatarColor(avatarColor.value)
})

function handleClose() {
  if (isSubmitting.value) return
  error.value = null
  isSubmitting.value = false
  emit('close')
}

function handleSave() {
  error.value = null
  if (!isValid.value) {
    error.value = 'Display name must be 1–40 characters and use a valid palette color.'
    return
  }

  isSubmitting.value = true
  emit('save', {
    displayName: displayName.value.trim(),
    avatarColor: avatarColor.value,
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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white">
          Profile Settings
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

      <form class="space-y-5" @submit.prevent="handleSave">
        <!-- Live Preview -->
        <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
          <UserAvatar
            :display-name="displayName || 'Friend'"
            :avatar-color="avatarColor"
            :show-online="true"
            size="lg"
          />
          <div class="min-w-0">
            <div class="text-sm font-bold text-slate-900 dark:text-white truncate">
              {{ displayName.trim() || 'Friend' }}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              Live preview
            </div>
          </div>
        </div>

        <!-- Display Name -->
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Display Name
          </label>
          <input
            v-model="displayName"
            type="text"
            required
            maxlength="40"
            placeholder="Your display name"
            class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <!-- Avatar Color Swatches -->
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
            Avatar Color
          </label>
          <div class="flex items-center gap-2.5 flex-wrap">
            <button
              v-for="color in AVATAR_PALETTE"
              :key="color"
              type="button"
              :data-test="`color-swatch-${color}`"
              class="w-8 h-8 rounded-full transition-transform flex items-center justify-center text-white text-xs font-bold"
              :class="avatarColor === color ? 'ring-2 ring-offset-2 ring-sky-500 dark:ring-offset-slate-800 scale-110' : 'opacity-80 hover:opacity-100 hover:scale-105'"
              :style="{ backgroundColor: color }"
              @click="avatarColor = color"
            >
              <span v-if="avatarColor === color">✓</span>
            </button>
          </div>
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
            :disabled="!isValid || isSubmitting"
            class="px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {{ isSubmitting ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
