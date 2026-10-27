<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Profile } from '~/types/chat'
import { AVATAR_PALETTE, isValidDisplayName, isValidAvatarColor, isValidAvatarUrl } from '~/utils/chat'
import { getConfettiEnabled, setConfettiEnabled } from '~/utils/confetti'
import { useTheme, type AppUiTheme } from '~/composables/useTheme'
import UserAvatar from '~/components/UserAvatar.vue'
import Input from '~/components/ui/Input.vue'
import Button from '~/components/ui/Button.vue'
import { Sun, Moon, Laptop, Code2, MessageCircle } from '@lucide/vue'

const props = defineProps<{
  isOpen: boolean
  profile: Profile | null
}>()

const { uiTheme, setUiTheme, isDark, toggleTheme } = useTheme()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'save',
    payload: {
      displayName: string
      avatarColor: string
      avatarUrl: string
      confettiEnabled: boolean
      onSuccess: () => void
      onError: (message: string) => void
    }
  ): void
}>()

const displayName = ref(props.profile?.display_name || '')
const avatarColor = ref<string>(props.profile?.avatar_color || AVATAR_PALETTE[0])
const avatarUrl = ref(props.profile?.avatar_url || '')
const confettiEnabled = ref(getConfettiEnabled())
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
      confettiEnabled.value = getConfettiEnabled()
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

  setConfettiEnabled(confettiEnabled.value)
  isSubmitting.value = true
  emit('save', {
    displayName: displayName.value.trim(),
    avatarColor: avatarColor.value,
    avatarUrl: avatarUrl.value.trim(),
    confettiEnabled: confettiEnabled.value,
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
  <Transition name="modal-fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
      @click.self="handleClose"
    >
      <div class="w-full max-w-md rounded-2xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#161824]/95 backdrop-blur-2xl shadow-2xl p-6 text-[var(--ap-text-primary)]">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-[16px] font-semibold text-[var(--ap-text-primary)] tracking-tight">
            Profile Settings
          </h3>
          <button
            type="button"
            class="w-7 h-7 rounded-full text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 text-lg font-bold flex items-center justify-center cursor-pointer transition-colors"
            @click="handleClose"
          >
            ×
          </button>
        </div>

        <div v-if="error" class="mb-4 p-3 rounded-xl text-xs bg-rose-500/10 border border-rose-500/25 text-rose-500 dark:text-rose-400 backdrop-blur-md">
          {{ error }}
        </div>

        <form class="space-y-4" @submit.prevent="handleSave">
          <!-- Live Preview -->
          <div class="flex items-center gap-3.5 p-3 rounded-2xl bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 backdrop-blur-md">
            <UserAvatar
              :display-name="displayName || 'Friend'"
              :avatar-color="avatarColor"
              :avatar-url="avatarUrl"
              :show-online="true"
              size="lg"
            />
            <div class="min-w-0">
              <div class="text-[14px] font-semibold text-[var(--ap-text-primary)] truncate">
                {{ displayName.trim() || 'Friend' }}
              </div>
              <div class="text-xs text-[var(--ap-text-muted)]">
                Live preview
              </div>
            </div>
          </div>

          <!-- Account Details (Read-only) -->
          <div class="p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-2 text-xs backdrop-blur-md">
            <div>
              <span class="text-[var(--ap-text-muted)] font-medium block mb-0.5">Account Email</span>
              <div data-test="profile-email" class="text-[var(--ap-text-primary)] font-semibold flex items-center justify-between">
                <span>{{ profile?.email || 'No email registered' }}</span>
                <span v-if="profile?.email" class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">Verified</span>
              </div>
            </div>
            <div class="pt-1.5 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[11px]">
              <div class="flex items-center gap-1.5">
                <span class="text-[var(--ap-text-muted)]">User ID: </span>
                <span data-test="profile-user-id" class="font-mono text-[var(--ap-text-secondary)] select-all">{{ profile?.id || '—' }}</span>
                <button
                  v-if="profile?.id"
                  type="button"
                  data-test="copy-user-id-btn"
                  class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--ap-text-secondary)] border border-black/10 dark:border-white/10 cursor-pointer transition-colors"
                  @click="copyUserId"
                >
                  {{ copiedId ? 'Copied!' : 'Copy' }}
                </button>
              </div>
              <div v-if="profile?.created_at" data-test="profile-created-at" class="text-[var(--ap-text-muted)] font-mono">
                Joined {{ new Date(profile.created_at).toLocaleDateString() }}
              </div>
            </div>
          </div>

          <!-- Display Name -->
          <div>
            <label class="block text-xs font-semibold text-[var(--ap-text-secondary)] mb-1.5">
              Display Name
            </label>
            <Input
              id="display-name"
              v-model="displayName"
              type="text"
              required
              maxlength="40"
              placeholder="Your display name"
              class="h-10 rounded-xl border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/8 text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus-visible:border-blue-500/50"
            />
          </div>

          <!-- Avatar image URL -->
          <div>
            <label for="avatar-url" class="block text-xs font-semibold text-[var(--ap-text-secondary)] mb-1.5">Avatar image URL</label>
            <input
              id="avatar-url"
              v-model="avatarUrl"
              data-test="avatar-url"
              type="url"
              maxlength="2048"
              placeholder="https://example.com/avatar.jpg"
              class="w-full h-10 px-3.5 text-xs rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/8 text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus:outline-none focus:bg-black/8 dark:focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50 transition-colors"
            />
            <p class="mt-1 text-[11px] text-[var(--ap-text-muted)]">Optional. Leave blank to use your initials.</p>
            <p v-if="avatarUrl && !isValidAvatarUrl(avatarUrl)" class="mt-1 text-xs text-rose-500 dark:text-rose-400">Enter a valid HTTP or HTTPS URL.</p>
          </div>

          <!-- Avatar Color Swatches -->
          <div>
            <label class="block text-xs font-semibold text-[var(--ap-text-secondary)] mb-2">
              Avatar Color
            </label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="color in AVATAR_PALETTE"
                :key="color"
                type="button"
                :data-test="`color-swatch-${color}`"
                class="h-8 rounded-xl transition-all flex items-center justify-center text-white text-xs font-bold shadow-xs cursor-pointer active:scale-95"
                :class="avatarColor === color ? 'ring-2 ring-blue-500 scale-[1.04] shadow-md' : 'opacity-85 hover:opacity-100 hover:scale-[1.02]'"
                :style="{ backgroundColor: color }"
                @click="avatarColor = color"
              >
                <span v-if="avatarColor === color">✓</span>
              </button>
            </div>
          </div>

          <!-- Application Theme Selector -->
          <div class="space-y-2 p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 backdrop-blur-md">
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <div class="text-xs font-semibold text-[var(--ap-text-primary)]">
                  Application Theme
                </div>
                <div class="text-[11px] text-[var(--ap-text-muted)]">
                  Select visual style and layout personality
                </div>
              </div>
              <button
                type="button"
                data-test="theme-mode-toggle"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] border border-black/10 dark:border-white/10 transition-colors cursor-pointer"
                @click="toggleTheme"
              >
                <Sun v-if="isDark" class="size-3.5 text-amber-500" />
                <Moon v-else class="size-3.5 text-blue-500" />
                <span>{{ isDark ? 'Dark Mode' : 'Light Mode' }}</span>
              </button>
            </div>

            <div class="grid grid-cols-3 gap-2 pt-1">
              <!-- Default (Apple Fluid) -->
              <button
                type="button"
                data-test="theme-option-default"
                class="p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer active:scale-95"
                :class="uiTheme === 'default' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.03] dark:bg-white/5 border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'"
                @click="setUiTheme('default')"
              >
                <div class="flex items-center justify-between w-full mb-1">
                  <Laptop class="size-4" :class="uiTheme === 'default' ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--ap-text-muted)]'" />
                  <span v-if="uiTheme === 'default'" class="text-[10px] text-blue-600 dark:text-blue-400 font-bold">Active</span>
                </div>
                <div>
                  <div class="text-xs font-semibold">Default</div>
                  <div class="text-[10px] text-[var(--ap-text-muted)] leading-tight">Apple Fluid</div>
                </div>
              </button>

              <!-- VSCode -->
              <button
                type="button"
                data-test="theme-option-vscode"
                class="p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer active:scale-95"
                :class="uiTheme === 'vscode' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.03] dark:bg-white/5 border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'"
                @click="setUiTheme('vscode')"
              >
                <div class="flex items-center justify-between w-full mb-1">
                  <Code2 class="size-4" :class="uiTheme === 'vscode' ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--ap-text-muted)]'" />
                  <span v-if="uiTheme === 'vscode'" class="text-[10px] text-blue-600 dark:text-blue-400 font-bold">Active</span>
                </div>
                <div>
                  <div class="text-xs font-semibold font-mono">VSCode</div>
                  <div class="text-[10px] text-[var(--ap-text-muted)] leading-tight">IDE Shell</div>
                </div>
              </button>

              <!-- Yahoo! Messenger -->
              <button
                type="button"
                data-test="theme-option-yahoo"
                class="p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer active:scale-95"
                :class="uiTheme === 'yahoo' ? 'bg-purple-500/15 border-purple-500 text-purple-900 dark:text-white ring-1 ring-purple-500' : 'bg-black/[0.03] dark:bg-white/5 border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'"
                @click="setUiTheme('yahoo')"
              >
                <div class="flex items-center justify-between w-full mb-1">
                  <MessageCircle class="size-4" :class="uiTheme === 'yahoo' ? 'text-purple-500 dark:text-purple-400' : 'text-[var(--ap-text-muted)]'" />
                  <span v-if="uiTheme === 'yahoo'" class="text-[10px] text-purple-600 dark:text-purple-400 font-bold">Active</span>
                </div>
                <div>
                  <div class="text-xs font-semibold">Yahoo!</div>
                  <div class="text-[10px] text-[var(--ap-text-muted)] leading-tight">Classic IM</div>
                </div>
              </button>
            </div>
          </div>

          <!-- Confetti Preference Toggle -->
          <div class="flex items-center justify-between p-3.5 rounded-2xl bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 backdrop-blur-md">
            <div class="space-y-0.5">
              <div class="text-xs font-semibold text-[var(--ap-text-primary)]">
                Celebration Confetti 🎉
              </div>
              <div class="text-[11px] text-[var(--ap-text-muted)]">
                Pop confetti effects when messages celebrate good news
              </div>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="confettiEnabled"
              data-test="confetti-toggle"
              class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
              :class="confettiEnabled ? 'bg-blue-500' : 'bg-black/15 dark:bg-white/15'"
              @click="confettiEnabled = !confettiEnabled"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                :class="confettiEnabled ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" class="rounded-full border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] px-4 py-2" @click="handleClose">
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
  </Transition>
</template>
