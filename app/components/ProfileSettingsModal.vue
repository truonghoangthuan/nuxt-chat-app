<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Profile } from '~/types/chat'
import { AVATAR_PALETTE, isValidDisplayName, isValidAvatarColor, isValidAvatarUrl } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'

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
      avatarUrl: string
      onSuccess: () => void
      onError: (message: string) => void
    }
  ): void
}>()

const displayName = ref(props.profile?.display_name || '')
const avatarColor = ref<string>(props.profile?.avatar_color || AVATAR_PALETTE[0])
const avatarUrl = ref(props.profile?.avatar_url || '')
const error = ref<string | null>(null)
const isSubmitting = ref(false)
const copiedId = ref(false)

async function copyUserId() {
  if (!props.profile?.id) return
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(props.profile.id)
      copiedId.value = true
      setTimeout(() => { copiedId.value = false }, 2000)
    } catch {
      // ignore
    }
  }
}

watch(
  () => [props.isOpen, props.profile] as const,
  ([open, prof]) => {
    if (open && prof) {
      displayName.value = prof.display_name
      avatarColor.value = prof.avatar_color || AVATAR_PALETTE[0]
      avatarUrl.value = prof.avatar_url || ''
      error.value = null
      isSubmitting.value = false
    }
  },
  { immediate: true },
)

const isValid = computed(() => {
  return isValidDisplayName(displayName.value) && isValidAvatarColor(avatarColor.value) && isValidAvatarUrl(avatarUrl.value)
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
    avatarUrl: avatarUrl.value.trim(),
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
            :avatar-url="avatarUrl"
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

        <!-- Account Details (Read-only) -->
        <div class="p-3 rounded-[10px] bg-[var(--fp-stage-subtle)] border border-[var(--fp-border)] space-y-2 text-xs">
          <div>
            <span class="text-[var(--fp-text-muted)] font-medium block mb-0.5">Account Email</span>
            <div data-test="profile-email" class="text-[var(--fp-text-primary)] font-semibold flex items-center justify-between">
              <span>{{ profile?.email || 'No email registered' }}</span>
              <span v-if="profile?.email" class="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">Verified</span>
            </div>
          </div>
          <div class="pt-1.5 border-t border-[var(--fp-border)] flex items-center justify-between text-[11px]">
            <div class="flex items-center gap-1.5">
              <span class="text-[var(--fp-text-muted)]">User ID: </span>
              <span data-test="profile-user-id" class="font-mono text-[var(--fp-text-secondary)] select-all">{{ profile?.id || '—' }}</span>
              <button
                v-if="profile?.id"
                type="button"
                data-test="copy-user-id-btn"
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--fp-surface)] hover:bg-[var(--fp-hover)] text-[var(--fp-text-secondary)] border border-[var(--fp-border)] cursor-pointer transition-colors"
                @click="copyUserId"
              >
                {{ copiedId ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <div v-if="profile?.created_at" data-test="profile-created-at" class="text-[var(--fp-text-muted)]">
              Joined {{ new Date(profile.created_at).toLocaleDateString() }}
            </div>
          </div>
        </div>

        <!-- Display Name -->
        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Display Name
          </label>
          <Input
            id="display-name"
            v-model="displayName"
            type="text"
            required
            maxlength="40"
            placeholder="Your display name"
            class="h-10 rounded-lg border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder:text-[var(--fp-text-muted)] focus-visible:border-indigo-500 focus-visible:ring-indigo-500/25"
          />
        </div>

        <!-- Avatar Color Swatches -->
        <div>
          <label for="avatar-url" class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">Avatar image URL</label>
          <input
            id="avatar-url"
            v-model="avatarUrl"
            data-test="avatar-url"
            type="url"
            maxlength="2048"
            placeholder="https://example.com/avatar.jpg"
            class="w-full px-3 py-2 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] text-[14.5px] focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <p class="mt-1 text-[11px] text-[var(--fp-text-muted)]">Optional. Leave blank to use your initials.</p>
          <p v-if="avatarUrl && !isValidAvatarUrl(avatarUrl)" class="mt-1 text-xs text-rose-500">Enter a valid HTTP or HTTPS URL.</p>
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
          <Button type="button" variant="outline" class="rounded-lg border-[var(--fp-border)] text-[var(--fp-text-secondary)]" @click="handleClose">
            Cancel
          </Button>
          <Button
            type="submit"
            :disabled="!isValid || isSubmitting"
            class="rounded-lg bg-indigo-600 font-semibold text-white hover:bg-indigo-700 focus-visible:ring-indigo-500 disabled:opacity-40"
          >
            {{ isSubmitting ? 'Saving…' : 'Save changes' }}
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>
