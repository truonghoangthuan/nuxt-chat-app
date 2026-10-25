<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Profile } from '~/types/chat'
import { AVATAR_PALETTE, isValidDisplayName, isValidAvatarColor, isValidAvatarUrl } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'
import Input from '~/components/ui/Input.vue'
import Button from '~/components/ui/Button.vue'

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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    @click.self="handleClose"
  >
    <div class="w-full max-w-md rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl shadow-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-[16px] font-semibold text-white/95 tracking-tight">
          Profile Settings
        </h3>
        <button
          type="button"
          class="w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-lg font-bold flex items-center justify-center cursor-pointer transition-colors"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <div v-if="error" class="mb-4 p-3 rounded-xl text-xs bg-rose-500/10 border border-rose-500/25 text-rose-400 backdrop-blur-md">
        {{ error }}
      </div>

      <form class="space-y-4" @submit.prevent="handleSave">
        <!-- Live Preview -->
        <div class="flex items-center gap-3.5 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
          <UserAvatar
            :display-name="displayName || 'Friend'"
            :avatar-color="avatarColor"
            :avatar-url="avatarUrl"
            :show-online="true"
            size="lg"
          />
          <div class="min-w-0">
            <div class="text-[14px] font-semibold text-white/95 truncate">
              {{ displayName.trim() || 'Friend' }}
            </div>
            <div class="text-xs text-white/40">
              Live preview
            </div>
          </div>
        </div>

        <!-- Account Details (Read-only) -->
        <div class="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-xs backdrop-blur-md">
          <div>
            <span class="text-white/40 font-medium block mb-0.5">Account Email</span>
            <div data-test="profile-email" class="text-white/90 font-semibold flex items-center justify-between">
              <span>{{ profile?.email || 'No email registered' }}</span>
              <span v-if="profile?.email" class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">Verified</span>
            </div>
          </div>
          <div class="pt-1.5 border-t border-white/5 flex items-center justify-between text-[11px]">
            <div class="flex items-center gap-1.5">
              <span class="text-white/40">User ID: </span>
              <span data-test="profile-user-id" class="font-mono text-white/70 select-all">{{ profile?.id || '—' }}</span>
              <button
                v-if="profile?.id"
                type="button"
                data-test="copy-user-id-btn"
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/8 hover:bg-white/15 text-white/80 border border-white/10 cursor-pointer transition-colors"
                @click="copyUserId"
              >
                {{ copiedId ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <div v-if="profile?.created_at" data-test="profile-created-at" class="text-white/40 font-mono">
              Joined {{ new Date(profile.created_at).toLocaleDateString() }}
            </div>
          </div>
        </div>

        <!-- Display Name -->
        <div>
          <label class="block text-xs font-semibold text-white/70 mb-1.5">
            Display Name
          </label>
          <Input
            id="display-name"
            v-model="displayName"
            type="text"
            required
            maxlength="40"
            placeholder="Your display name"
            class="h-10 rounded-xl border-white/10 bg-white/8 text-white placeholder:text-white/40 focus-visible:border-blue-500/50"
          />
        </div>

        <!-- Avatar image URL -->
        <div>
          <label for="avatar-url" class="block text-xs font-semibold text-white/70 mb-1.5">Avatar image URL</label>
          <input
            id="avatar-url"
            v-model="avatarUrl"
            data-test="avatar-url"
            type="url"
            maxlength="2048"
            placeholder="https://example.com/avatar.jpg"
            class="w-full h-10 px-3.5 text-xs rounded-xl border border-white/10 bg-white/8 text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50 transition-colors"
          />
          <p class="mt-1 text-[11px] text-white/40">Optional. Leave blank to use your initials.</p>
          <p v-if="avatarUrl && !isValidAvatarUrl(avatarUrl)" class="mt-1 text-xs text-rose-400">Enter a valid HTTP or HTTPS URL.</p>
        </div>

        <!-- Avatar Color Swatches -->
        <div>
          <label class="block text-xs font-semibold text-white/70 mb-2">
            Avatar Color
          </label>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="color in AVATAR_PALETTE"
              :key="color"
              type="button"
              :data-test="`color-swatch-${color}`"
              class="h-8 rounded-xl transition-all flex items-center justify-center text-white text-xs font-bold shadow-xs cursor-pointer"
              :class="avatarColor === color ? 'ring-2 ring-white scale-[1.04] shadow-md' : 'opacity-85 hover:opacity-100 hover:scale-[1.02]'"
              :style="{ backgroundColor: color }"
              @click="avatarColor = color"
            >
              <span v-if="avatarColor === color">✓</span>
            </button>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" class="rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-4 py-2" @click="handleClose">
            Cancel
          </Button>
          <Button
            type="submit"
            :disabled="!isValid || isSubmitting"
            class="rounded-full bg-blue-500 font-semibold text-white hover:bg-blue-600 focus-visible:ring-blue-500 disabled:opacity-40 px-5 py-2 shadow-md shadow-blue-500/30 transition-all active:scale-95"
          >
            {{ isSubmitting ? 'Saving…' : 'Save changes' }}
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>
