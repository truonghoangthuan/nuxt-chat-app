<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Profile } from '~/types/chat'
import { AVATAR_PALETTE, isValidDisplayName, isValidAvatarColor, isValidAvatarUrl, validateImageFile } from '~/utils/chat'
import { getConfettiEnabled, setConfettiEnabled } from '~/utils/confetti'
import { useTheme, type AppUiTheme } from '~/composables/useTheme'
import UserAvatar from '~/components/UserAvatar.vue'
import Input from '~/components/ui/Input.vue'
import Button from '~/components/ui/Button.vue'
import { Sun, Moon, Laptop, Code2, MessageCircle, Upload, EyeOff, RotateCcw, Image, Code, Table, Trash2, X, Check, Copy } from '@lucide/vue'
import { useStealthMode, formatShortcutFromEvent, type StealthCoverMode } from '~/composables/useStealthMode'

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
      bankQrUrl?: string | null
      confettiEnabled: boolean
      onSuccess: () => void
      onError: (message: string) => void
    }
  ): void
}>()

const displayName = ref(props.profile?.display_name || '')
const avatarColor = ref<string>(props.profile?.avatar_color || AVATAR_PALETTE[0])
const avatarUrl = ref(props.profile?.avatar_url || '')
const bankQrPreviewUrl = ref<string | null>(props.profile?.bank_qr_url || null)
const selectedBankQrFile = ref<File | null>(null)
const bankQrFileInput = ref<HTMLInputElement | null>(null)
const isQrRemoved = ref(false)
const qrUploadError = ref<string | null>(null)
const confettiEnabled = ref(getConfettiEnabled())
const error = ref<string | null>(null)
const isSubmitting = ref(false)
const copiedId = ref(false)

const {
  config: stealthConfig,
  customImageUrl: stealthImageUrl,
  updateStealthConfig,
  setCustomCoverImage,
  removeCustomCoverImage,
} = useStealthMode()

const isRecordingShortcut = ref(false)
const stealthImageFileInput = ref<HTMLInputElement | null>(null)
const stealthImageError = ref<string | null>(null)

function startRecordingShortcut() {
  isRecordingShortcut.value = true
}

function stopRecordingShortcut() {
  isRecordingShortcut.value = false
}

function handleShortcutKeydown(e: KeyboardEvent) {
  if (!isRecordingShortcut.value) return
  if (e.key === 'Escape') {
    isRecordingShortcut.value = false
    return
  }
  const formatted = formatShortcutFromEvent(e)
  if (formatted) {
    updateStealthConfig({ shortcut: formatted })
    isRecordingShortcut.value = false
  }
}

function resetStealthShortcut() {
  updateStealthConfig({ shortcut: 'Ctrl+H' })
}

function setStealthMode(mode: StealthCoverMode) {
  updateStealthConfig({ mode })
}

function triggerStealthImageUpload() {
  stealthImageFileInput.value?.click()
}

function onStealthImageSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const validation = validateImageFile(file)
  if (!validation.valid) {
    stealthImageError.value = validation.error || 'Invalid image file.'
    target.value = ''
    return
  }

  stealthImageError.value = null
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      const saved = setCustomCoverImage(reader.result)
      if (!saved) {
        stealthImageError.value = 'Image exceeds browser storage quota. Please use a smaller image.'
        return
      }
      updateStealthConfig({ mode: 'image' })
    }
  }
  reader.readAsDataURL(file)
  target.value = ''
}

function handleRemoveStealthImage() {
  removeCustomCoverImage()
  if (stealthConfig.value.mode === 'image') {
    updateStealthConfig({ mode: 'code' })
  }
}

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

function triggerBankQrFileInput() {
  bankQrFileInput.value?.click()
}

function onBankQrFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const validation = validateImageFile(file)
  if (!validation.valid) {
    qrUploadError.value = validation.error || 'Invalid image file.'
    target.value = ''
    return
  }

  qrUploadError.value = null
  selectedBankQrFile.value = file
  isQrRemoved.value = false
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    bankQrPreviewUrl.value = URL.createObjectURL(file)
  }
  target.value = ''
}

function removeBankQr() {
  bankQrPreviewUrl.value = null
  selectedBankQrFile.value = null
  isQrRemoved.value = true
  qrUploadError.value = null
  if (bankQrFileInput.value) {
    bankQrFileInput.value.value = ''
  }
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

watch(
  () => [props.isOpen, props.profile] as const,
  ([open, prof]) => {
    if (open && prof) {
      displayName.value = prof.display_name
      avatarColor.value = prof.avatar_color || AVATAR_PALETTE[0]
      avatarUrl.value = prof.avatar_url || ''
      bankQrPreviewUrl.value = prof.bank_qr_url || null
      selectedBankQrFile.value = null
      isQrRemoved.value = false
      qrUploadError.value = null
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
  qrUploadError.value = null
  isSubmitting.value = false
  emit('close')
}

async function handleSave() {
  error.value = null
  qrUploadError.value = null
  if (!isValid.value) {
    error.value = 'Display name must be 1–40 characters and use a valid palette color.'
    return
  }

  isSubmitting.value = true

  let resolvedBankQrUrl: string | null = props.profile?.bank_qr_url || null

  if (isQrRemoved.value) {
    resolvedBankQrUrl = null
  } else if (selectedBankQrFile.value) {
    try {
      let uploadedPublicUrl: string | null = null
      try {
        if (typeof useSupabaseClient === 'function') {
          const supabase = useSupabaseClient()
          if (supabase?.storage) {
            const file = selectedBankQrFile.value
            const ext = file.name ? file.name.split('.').pop() || 'png' : 'png'
            const filePath = `bank-qr/${props.profile?.id || 'user'}-${Date.now()}.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from('profile-media')
              .upload(filePath, file, { contentType: file.type, upsert: true })

            if (!uploadErr) {
              const { data: pubData } = supabase.storage.from('profile-media').getPublicUrl(filePath)
              if (pubData?.publicUrl) {
                uploadedPublicUrl = pubData.publicUrl
              }
            }
          }
        }
      } catch {
        // Fallback to base64 Data URL
      }

      if (uploadedPublicUrl) {
        resolvedBankQrUrl = uploadedPublicUrl
      } else {
        resolvedBankQrUrl = await readFileAsDataUrl(selectedBankQrFile.value)
      }
    } catch (err: any) {
      isSubmitting.value = false
      error.value = err?.message || 'Failed to process bank QR image.'
      return
    }
  }

  setConfettiEnabled(confettiEnabled.value)
  emit('save', {
    displayName: displayName.value.trim(),
    avatarColor: avatarColor.value,
    avatarUrl: avatarUrl.value.trim(),
    bankQrUrl: resolvedBankQrUrl,
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
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
      @click.self="handleClose"
    >
      <div class="messenger-dialog-surface profile-settings-surface w-full max-w-xl md:max-w-2xl max-h-[88vh] rounded-3xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#141722]/95 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--ap-text-primary)]">
        <!-- Pinned Header -->
        <div class="px-5 sm:px-6 py-3.5 border-b border-black/5 dark:border-white/8 flex items-center justify-between shrink-0">
          <div>
            <h3 class="text-[15px] font-semibold text-[var(--ap-text-primary)] tracking-tight">
              Profile Settings
            </h3>
            <p class="text-[11px] text-[var(--ap-text-muted)]">
              Manage your identity, payment QR, and workspace preferences
            </p>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            class="size-7 rounded-full text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors"
            @click="handleClose"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Form wrapping scrollable body and pinned footer -->
        <form class="flex flex-col flex-1 min-h-0 overflow-hidden" @submit.prevent="handleSave">
          <!-- Scrollable Content Body -->
          <div class="overflow-y-auto flex-1 px-5 sm:px-6 py-4 space-y-4 scrollbar-thin">
            <div v-if="error" class="p-3 rounded-xl text-xs bg-rose-500/10 border border-rose-500/25 text-rose-500 dark:text-rose-400 backdrop-blur-md">
              {{ error }}
            </div>

            <!-- Unified Identity Banner (Live Preview + Account Metadata) -->
            <div
              data-test="profile-identity-banner"
              class="p-3.5 rounded-2xl bg-gradient-to-r from-blue-500/[0.06] via-indigo-500/[0.03] to-transparent dark:from-blue-500/[0.1] dark:via-indigo-500/[0.04] border border-black/8 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div class="flex items-center gap-3.5 min-w-0">
                <UserAvatar
                  :display-name="displayName || 'Friend'"
                  :avatar-color="avatarColor"
                  :avatar-url="avatarUrl"
                  :show-online="true"
                  size="lg"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-[var(--ap-text-primary)] truncate">
                      {{ displayName.trim() || 'Friend' }}
                    </span>
                    <span
                      v-if="profile?.email"
                      class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium leading-none"
                    >
                      Verified
                    </span>
                  </div>
                  <div data-test="profile-email" class="text-xs text-[var(--ap-text-secondary)] truncate mt-0.5">
                    {{ profile?.email || 'No email registered' }}
                  </div>
                </div>
              </div>

              <!-- Account Metadata Chips (Non-wrapping) -->
              <div class="flex flex-wrap sm:flex-col sm:items-end justify-between gap-1.5 shrink-0 text-[11px] pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] border border-black/5 dark:border-white/8">
                  <span class="text-[var(--ap-text-muted)] text-[10px] font-medium">ID</span>
                  <span
                    data-test="profile-user-id"
                    class="font-mono text-[11px] text-[var(--ap-text-secondary)] truncate max-w-[110px] select-all"
                    :title="profile?.id"
                  >{{ profile?.id || '—' }}</span>
                  <button
                    v-if="profile?.id"
                    type="button"
                    data-test="copy-user-id-btn"
                    class="inline-flex items-center gap-1 pl-1.5 border-l border-black/10 dark:border-white/10 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
                    @click="copyUserId"
                  >
                    <Check v-if="copiedId" class="size-3 text-emerald-500" />
                    <Copy v-else class="size-3" />
                    <span>{{ copiedId ? 'Copied!' : 'Copy' }}</span>
                  </button>
                </div>
                <div v-if="profile?.created_at" data-test="profile-created-at" class="text-[10px] text-[var(--ap-text-muted)] font-mono">
                  Joined {{ new Date(profile.created_at).toLocaleDateString() }}
                </div>
              </div>
            </div>

            <!-- Clean 2-Column Workspace Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <!-- Column 1: Profile & Payment Card -->
              <div class="p-4 rounded-2xl bg-black/[0.025] dark:bg-white/[0.03] border border-black/8 dark:border-white/8 space-y-3.5">
                <div class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ap-text-muted)]">
                  Profile Details
                </div>

                <!-- Display Name -->
                <div>
                  <label for="display-name" class="block text-xs font-medium text-[var(--ap-text-secondary)] mb-1">
                    Display Name
                  </label>
                  <Input
                    id="display-name"
                    v-model="displayName"
                    type="text"
                    required
                    maxlength="40"
                    placeholder="Your display name"
                    class="h-9 rounded-xl border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] text-xs text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus-visible:border-blue-500/50"
                  />
                </div>

                <!-- Avatar image URL -->
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label for="avatar-url" class="text-xs font-medium text-[var(--ap-text-secondary)]">Avatar Image URL</label>
                    <span class="text-[10px] text-[var(--ap-text-muted)]">Optional</span>
                  </div>
                  <input
                    id="avatar-url"
                    v-model="avatarUrl"
                    data-test="avatar-url"
                    type="url"
                    maxlength="2048"
                    placeholder="https://example.com/avatar.jpg (blank for initials)"
                    class="w-full h-9 px-3 text-xs rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus:outline-none focus:bg-black/8 dark:focus:bg-white/10 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                  />
                  <p v-if="avatarUrl && !isValidAvatarUrl(avatarUrl)" class="mt-1 text-[11px] text-rose-500 dark:text-rose-400">
                    Enter a valid HTTP or HTTPS URL.
                  </p>
                </div>

                <!-- Avatar Color Swatches (Single Clean Row of Circles) -->
                <div>
                  <label class="block text-xs font-medium text-[var(--ap-text-secondary)] mb-2">
                    Avatar Color
                  </label>
                  <div class="flex items-center justify-between gap-1.5">
                    <button
                      v-for="color in AVATAR_PALETTE"
                      :key="color"
                      type="button"
                      :data-test="`color-swatch-${color}`"
                      class="size-7 rounded-full transition-all flex items-center justify-center text-white text-xs font-bold cursor-pointer active:scale-90"
                      :class="avatarColor === color ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-[#141722] scale-110 shadow-sm' : 'opacity-80 hover:opacity-100 hover:scale-105'"
                      :style="{ backgroundColor: color }"
                      @click="avatarColor = color"
                    >
                      <span v-if="avatarColor === color" class="text-[11px] leading-none">✓</span>
                    </button>
                  </div>
                </div>

                <!-- Bank QR Code Upload & Preview -->
                <div class="pt-2 border-t border-black/5 dark:border-white/6">
                  <label class="block text-xs font-medium text-[var(--ap-text-secondary)] mb-1.5">Bank QR Code</label>
                  <input
                    ref="bankQrFileInput"
                    data-test="bank-qr-file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    class="hidden"
                    @change="onBankQrFileSelected"
                  />

                  <!-- Preview State -->
                  <div
                    v-if="bankQrPreviewUrl"
                    data-test="bank-qr-preview"
                    class="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 flex items-center justify-between gap-2.5"
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="size-11 rounded-lg overflow-hidden bg-white p-1 border border-black/10 shadow-2xs flex items-center justify-center shrink-0">
                        <img
                          :src="bankQrPreviewUrl"
                          alt="Bank QR Code"
                          class="w-full h-full object-contain"
                        />
                      </div>
                      <div class="min-w-0">
                        <div class="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
                          Payment QR Ready
                        </div>
                        <div class="text-[10px] text-[var(--ap-text-muted)] truncate">
                          Visible on your profile card
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-test="bank-qr-upload-btn"
                        class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors cursor-pointer"
                        @click="triggerBankQrFileInput"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        data-test="bank-qr-remove-btn"
                        class="px-2 py-1 rounded-lg text-[11px] font-medium text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        @click="removeBankQr"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <!-- Empty / Upload State -->
                  <div
                    v-else
                    class="p-2.5 rounded-xl border border-dashed border-black/15 dark:border-white/15 bg-black/[0.015] dark:bg-white/[0.02] flex items-center justify-between gap-2 hover:border-blue-500/50 transition-colors cursor-pointer"
                    @click="triggerBankQrFileInput"
                  >
                    <div class="min-w-0">
                      <div class="text-xs font-medium text-[var(--ap-text-secondary)]">
                        No payment QR uploaded
                      </div>
                      <div class="text-[10px] text-[var(--ap-text-muted)] truncate">
                        PNG, JPG or WebP up to 5MB
                      </div>
                    </div>
                    <button
                      type="button"
                      data-test="bank-qr-upload-btn"
                      class="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 transition-colors pointer-events-none"
                    >
                      <Upload class="size-3.5" />
                      <span>Upload</span>
                    </button>
                  </div>

                  <p v-if="qrUploadError" class="mt-1 text-xs text-rose-500 dark:text-rose-400">
                    {{ qrUploadError }}
                  </p>
                </div>
              </div>

              <!-- Column 2: Appearance & Workspace Preferences -->
              <div class="p-4 rounded-2xl bg-black/[0.025] dark:bg-white/[0.03] border border-black/8 dark:border-white/8 space-y-3.5">
                <!-- Application Theme Selector -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-semibold uppercase tracking-wider text-[var(--ap-text-muted)]">
                      Appearance
                    </span>
                    <button
                      type="button"
                      data-test="theme-mode-toggle"
                      class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] border border-black/8 dark:border-white/10 transition-colors cursor-pointer"
                      @click="toggleTheme"
                    >
                      <Sun v-if="isDark" class="size-3 text-amber-500" />
                      <Moon v-else class="size-3 text-blue-500" />
                      <span>{{ isDark ? 'Dark Mode' : 'Light Mode' }}</span>
                    </button>
                  </div>

                  <div class="grid grid-cols-2 gap-1.5">
                    <!-- Default (Apple Fluid) -->
                    <button
                      type="button"
                      data-test="theme-option-default"
                      :aria-pressed="uiTheme === 'default'"
                      class="px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer active:scale-95"
                      :class="uiTheme === 'default' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/8 dark:border-white/8 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/8'"
                      @click="setUiTheme('default')"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <Laptop class="size-3.5 shrink-0" :class="uiTheme === 'default' ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--ap-text-muted)]'" />
                        <div class="min-w-0">
                          <div class="text-xs font-semibold truncate">Default</div>
                          <div class="text-[10px] text-[var(--ap-text-muted)] truncate leading-tight">Apple Fluid</div>
                        </div>
                      </div>
                      <span v-if="uiTheme === 'default'" class="text-[9px] text-blue-600 dark:text-blue-400 font-bold shrink-0">Active</span>
                    </button>

                    <!-- VSCode -->
                    <button
                      type="button"
                      data-test="theme-option-vscode"
                      :aria-pressed="uiTheme === 'vscode'"
                      class="px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer active:scale-95"
                      :class="uiTheme === 'vscode' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/8 dark:border-white/8 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/8'"
                      @click="setUiTheme('vscode')"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <Code2 class="size-3.5 shrink-0" :class="uiTheme === 'vscode' ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--ap-text-muted)]'" />
                        <div class="min-w-0">
                          <div class="text-xs font-semibold font-mono truncate">VSCode</div>
                          <div class="text-[10px] text-[var(--ap-text-muted)] truncate leading-tight">IDE Shell</div>
                        </div>
                      </div>
                      <span v-if="uiTheme === 'vscode'" class="text-[9px] text-blue-600 dark:text-blue-400 font-bold shrink-0">Active</span>
                    </button>

                    <!-- Yahoo! Messenger -->
                    <button
                      type="button"
                      data-test="theme-option-yahoo"
                      :aria-pressed="uiTheme === 'yahoo'"
                      class="px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer active:scale-95"
                      :class="uiTheme === 'yahoo' ? 'bg-purple-500/15 border-purple-500 text-purple-900 dark:text-white ring-1 ring-purple-500' : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/8 dark:border-white/8 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/8'"
                      @click="setUiTheme('yahoo')"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <MessageCircle class="size-3.5 shrink-0" :class="uiTheme === 'yahoo' ? 'text-purple-500 dark:text-purple-400' : 'text-[var(--ap-text-muted)]'" />
                        <div class="min-w-0">
                          <div class="text-xs font-semibold truncate">Yahoo!</div>
                          <div class="text-[10px] text-[var(--ap-text-muted)] truncate leading-tight">Classic IM</div>
                        </div>
                      </div>
                      <span v-if="uiTheme === 'yahoo'" class="text-[9px] text-purple-600 dark:text-purple-400 font-bold shrink-0">Active</span>
                    </button>

                    <!-- Telegram-inspired messenger -->
                    <button
                      type="button"
                      data-test="theme-option-telegram"
                      :aria-pressed="uiTheme === 'telegram'"
                      class="px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer active:scale-95"
                      :class="uiTheme === 'telegram' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/8 dark:border-white/8 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/8'"
                      @click="setUiTheme('telegram')"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <MessageCircle class="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                        <div class="min-w-0">
                          <div class="text-xs font-semibold truncate">Telegram</div>
                          <div class="text-[10px] text-[var(--ap-text-muted)] truncate leading-tight">Messenger</div>
                        </div>
                      </div>
                      <span v-if="uiTheme === 'telegram'" class="text-[9px] text-blue-600 dark:text-blue-400 font-bold shrink-0">Active</span>
                    </button>
                  </div>
                </div>

                <!-- Confetti Preference Toggle -->
                <div class="pt-3 border-t border-black/5 dark:border-white/6 flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-xs font-semibold text-[var(--ap-text-primary)]">
                      Celebration Confetti 🎉
                    </div>
                    <div class="text-[10px] text-[var(--ap-text-muted)] truncate">
                      Pop confetti effects on celebratory messages
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="confettiEnabled"
                    data-test="confetti-toggle"
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    :class="confettiEnabled ? 'bg-blue-500' : 'bg-black/15 dark:bg-white/15'"
                    @click="confettiEnabled = !confettiEnabled"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                      :class="confettiEnabled ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </button>
                </div>

                <!-- Stealth / Boss Key -->
                <div class="pt-3 border-t border-black/5 dark:border-white/6 space-y-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-semibold text-[var(--ap-text-primary)] flex items-center gap-1.5">
                        <EyeOff class="size-3.5 text-blue-500 shrink-0" />
                        <span class="truncate">Stealth Hide (Boss Key)</span>
                      </div>
                      <div class="text-[10px] text-[var(--ap-text-muted)] truncate">
                        Cloak chat behind a decoy screen
                      </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-test="stealth-shortcut-btn"
                        class="px-2 py-1 rounded-lg text-[11px] font-mono font-semibold border transition-all cursor-pointer"
                        :class="isRecordingShortcut ? 'bg-blue-500 text-white border-blue-500 animate-pulse' : 'bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--ap-text-primary)] border-black/10 dark:border-white/10'"
                        @click="startRecordingShortcut"
                        @keydown.stop.prevent="handleShortcutKeydown"
                        @blur="stopRecordingShortcut"
                      >
                        {{ isRecordingShortcut ? 'Press keys...' : stealthConfig.shortcut }}
                      </button>
                      <button
                        type="button"
                        data-test="stealth-shortcut-reset"
                        class="p-1 rounded-lg text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        title="Reset to default (Ctrl+H)"
                        @click="resetStealthShortcut"
                      >
                        <RotateCcw class="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <!-- Segmented Cover Mode Selection -->
                  <div class="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      data-test="stealth-mode-code"
                      class="px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      :class="stealthConfig.mode === 'code' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/8 dark:border-white/8 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/8'"
                      @click="setStealthMode('code')"
                    >
                      <Code class="size-3.5 text-blue-500 shrink-0" />
                      <span class="truncate">Code IDE</span>
                    </button>

                    <button
                      type="button"
                      data-test="stealth-mode-sheet"
                      class="px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      :class="stealthConfig.mode === 'sheet' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/8 dark:border-white/8 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/8'"
                      @click="setStealthMode('sheet')"
                    >
                      <Table class="size-3.5 text-emerald-500 shrink-0" />
                      <span class="truncate">Sheet</span>
                    </button>

                    <button
                      type="button"
                      data-test="stealth-mode-image"
                      class="px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      :class="stealthConfig.mode === 'image' ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-white ring-1 ring-blue-500' : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/8 dark:border-white/8 text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/8'"
                      @click="setStealthMode('image')"
                    >
                      <Image class="size-3.5 text-purple-500 shrink-0" />
                      <span class="truncate">Image</span>
                    </button>
                  </div>

                  <!-- Custom Cover Image Upload -->
                  <div>
                    <input
                      ref="stealthImageFileInput"
                      type="file"
                      data-test="stealth-image-input"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      class="hidden"
                      @change="onStealthImageSelected"
                    />

                    <div v-if="stealthImageUrl" class="flex items-center gap-2.5 p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/8">
                      <img
                        :src="stealthImageUrl"
                        data-test="stealth-image-preview"
                        alt="Custom cover"
                        class="w-11 h-8 object-cover rounded-md border border-black/10 dark:border-white/10 bg-black/5 shrink-0"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="text-[11px] font-medium text-[var(--ap-text-primary)] truncate">
                          Custom Cover Active
                        </div>
                        <div class="text-[10px] text-[var(--ap-text-muted)] truncate">
                          Full screen when cloaked
                        </div>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-test="stealth-image-upload-btn"
                          class="px-2 py-1 rounded-lg text-[11px] font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[var(--ap-text-secondary)] transition-colors cursor-pointer"
                          @click="triggerStealthImageUpload"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          data-test="stealth-image-remove-btn"
                          class="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove custom image"
                          @click="handleRemoveStealthImage"
                        >
                          <Trash2 class="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div v-else class="flex items-center justify-between gap-2 pt-0.5">
                      <span class="text-[10px] text-[var(--ap-text-muted)] truncate">
                        Custom decoy cover image
                      </span>
                      <button
                        type="button"
                        data-test="stealth-image-upload-btn"
                        class="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
                        @click="triggerStealthImageUpload"
                      >
                        <Upload class="size-3" />
                        <span>Upload Image</span>
                      </button>
                    </div>

                    <p v-if="stealthImageError" class="mt-1 text-xs text-rose-500 dark:text-rose-400">
                      {{ stealthImageError }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Pinned Footer (Always accessible) -->
          <div class="px-5 sm:px-6 py-3 border-t border-black/5 dark:border-white/8 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-end gap-2.5 shrink-0 backdrop-blur-md">
            <Button type="button" variant="outline" class="rounded-full border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] px-4 py-1.5 text-xs" @click="handleClose">
              Cancel
            </Button>
            <Button
              type="submit"
              :disabled="!isValid || isSubmitting"
              class="rounded-full bg-blue-500 font-semibold text-white hover:bg-blue-600 focus-visible:ring-blue-500 disabled:opacity-40 px-5 py-1.5 text-xs shadow-md shadow-blue-500/25 transition-all active:scale-95"
            >
              {{ isSubmitting ? 'Saving…' : 'Save changes' }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>
