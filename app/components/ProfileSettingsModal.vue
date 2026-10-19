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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div class="w-full max-w-md fp-stage-surface rounded-[14px] border border-[var(--fp-border)] p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="fp-font-display text-[17px] font-bold text-[var(--fp-text-primary)]">
          Profile Settings
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

      <form class="space-y-5" @submit.prevent="handleSave">
        <!-- Live Preview -->
        <div class="flex items-center gap-3.5 p-3.5 rounded-[12px] bg-[var(--fp-stage-subtle)] border border-[var(--fp-border)]">
          <UserAvatar
            :display-name="displayName || 'Friend'"
            :avatar-color="avatarColor"
            :show-online="true"
            size="lg"
          />
          <div class="min-w-0">
            <div class="fp-font-display text-[15px] font-bold text-[var(--fp-text-primary)] truncate">
              {{ displayName.trim() || 'Friend' }}
            </div>
            <div class="text-xs text-[var(--fp-text-secondary)]">
              Live preview
            </div>
          </div>
        </div>

        <!-- Display Name -->
        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Display Name
          </label>
          <input
            v-model="displayName"
            type="text"
            required
            maxlength="40"
            placeholder="Your display name"
            class="w-full px-3 py-2 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] text-[14.5px] focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <!-- Avatar Color Swatches -->
        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-2">
            Avatar Color
          </label>
          <div class="grid grid-cols-4 gap-2.5">
            <button
              v-for="color in AVATAR_PALETTE"
              :key="color"
              type="button"
              :data-test="`color-swatch-${color}`"
              class="h-9 rounded-[8px] transition-all flex items-center justify-center text-white text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] cursor-pointer"
              :class="avatarColor === color ? 'ring-2 ring-white dark:ring-indigo-300 scale-[1.04] shadow-md' : 'opacity-85 hover:opacity-100 hover:scale-[1.02]'"
              :style="{ backgroundColor: color }"
              @click="avatarColor = color"
            >
              <span v-if="avatarColor === color">✓</span>
            </button>
          </div>
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
            {{ isSubmitting ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
