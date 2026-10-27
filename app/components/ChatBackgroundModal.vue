<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { X, Check, Image as ImageIcon, Upload, RotateCcw } from '@lucide/vue'
import type { Conversation } from '~/types/chat'
import {
  CHAT_BACKGROUND_PRESETS,
  resolveChatBackgroundStyle,
  validateBackgroundFile,
} from '~/utils/chat'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    conversation: Conversation | null
    isSubmitting?: boolean
  }>(),
  {
    isOpen: false,
    conversation: null,
    isSubmitting: false,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectPreset', presetValue: string): void
  (e: 'uploadFile', file: File): void
  (e: 'reset'): void
}>()

const selectedBackground = ref<string | null>(props.conversation?.background_url || null)
const uploadError = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => [props.isOpen, props.conversation?.background_url] as const,
  ([open, bg]) => {
    if (open) {
      selectedBackground.value = bg || null
      uploadError.value = null
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown)
      }
    } else {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  },
  { immediate: true },
)

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})

function handleClose() {
  uploadError.value = null
  emit('close')
}

function handleSelectPreset(presetValue: string) {
  selectedBackground.value = presetValue
  emit('selectPreset', presetValue)
}

function handleReset() {
  selectedBackground.value = null
  emit('reset')
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const validation = validateBackgroundFile(file)
  if (!validation.valid) {
    uploadError.value = validation.error || 'Invalid image file.'
    target.value = ''
    return
  }

  uploadError.value = null
  emit('uploadFile', file)
  target.value = ''
}

const activePreviewStyle = computed(() => {
  return resolveChatBackgroundStyle(selectedBackground.value)
})
</script>

<template>
  <Transition name="modal-fade">
    <div
      v-if="isOpen && conversation"
      data-test="chat-background-backdrop"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
      @click.self="handleClose"
    >
      <div
        data-test="chat-background-modal"
        class="w-full max-w-lg rounded-2xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#161824]/95 backdrop-blur-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] text-[var(--ap-text-primary)]"
      >
        <!-- Header -->
        <div class="px-5 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 dark:text-blue-400 flex items-center justify-center">
              <ImageIcon class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-[15px] font-semibold text-[var(--ap-text-primary)]">
                Chat Wallpaper & Aesthetic
              </h3>
              <p class="text-xs text-[var(--ap-text-muted)]">
                Synced across all members in this conversation
              </p>
            </div>
          </div>
          <button
            type="button"
            data-test="close-background-modal-btn"
            aria-label="Close"
            class="w-7 h-7 rounded-full text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 text-lg font-bold flex items-center justify-center cursor-pointer transition-colors"
            @click="handleClose"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 space-y-5 overflow-y-auto flex-1 min-h-0 custom-scroll">
          <!-- Live Preview Stage -->
          <div>
            <label class="block text-xs font-semibold text-[var(--ap-text-secondary)] mb-2">
              Live Preview
            </label>
            <div
              data-test="background-preview-stage"
              class="relative h-32 rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden flex items-center justify-center p-4 bg-[var(--ap-stage)] transition-all duration-300 shadow-inner"
              :style="activePreviewStyle || {}"
            >
              <div
                v-if="activePreviewStyle"
                class="absolute inset-0 bg-white/70 dark:bg-[#0d0f17]/75 backdrop-blur-[1px]"
              />
              <div class="relative z-10 flex flex-col gap-2 w-full max-w-xs">
                <div class="self-start px-3 py-1.5 rounded-2xl rounded-bl-sm bg-black/10 dark:bg-white/10 text-[11px] font-medium text-[var(--ap-text-primary)] backdrop-blur-md">
                  Hey, nice wallpaper! 🎨
                </div>
                <div class="self-end px-3 py-1.5 rounded-2xl rounded-br-sm bg-blue-500 text-[11px] font-medium text-white shadow-xs">
                  Looks great in light and dark mode! ✨
                </div>
              </div>
            </div>
          </div>

          <!-- Presets Gallery -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-semibold text-[var(--ap-text-secondary)]">
                Curated Presets
              </label>
              <button
                v-if="conversation.background_url"
                type="button"
                data-test="reset-background-btn"
                class="inline-flex items-center gap-1.5 text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 transition cursor-pointer active:scale-95"
                @click="handleReset"
              >
                <RotateCcw class="w-3 h-3" />
                Reset to Default
              </button>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <button
                v-for="preset in CHAT_BACKGROUND_PRESETS"
                :key="preset.id"
                type="button"
                :data-test="`preset-item-${preset.id}`"
                class="relative h-16 rounded-xl border transition-all overflow-hidden flex items-end p-2 text-left group cursor-pointer active:scale-95"
                :class="selectedBackground === preset.value ? 'border-blue-500 ring-2 ring-blue-500/40 scale-[1.02]' : 'border-black/10 dark:border-white/10 hover:border-black/25 dark:hover:border-white/25'"
                :style="{ backgroundImage: preset.cssBackground }"
                @click="handleSelectPreset(preset.value)"
              >
                <div class="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
                <div
                  v-if="selectedBackground === preset.value"
                  class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-xs"
                >
                  <Check class="w-3 h-3 stroke-[3]" />
                </div>
                <span class="relative z-10 text-[11px] font-semibold text-white truncate drop-shadow-sm">
                  {{ preset.label }}
                </span>
              </button>
            </div>
          </div>

          <!-- Custom Upload Option -->
          <div>
            <label class="block text-xs font-semibold text-[var(--ap-text-secondary)] mb-2">
              Custom Wallpaper
            </label>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="hidden"
              data-test="upload-background-input"
              @change="onFileSelected"
            />
            <button
              type="button"
              data-test="upload-trigger-btn"
              :disabled="isSubmitting"
              class="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-black/20 dark:border-white/20 hover:border-black/40 dark:hover:border-white/40 bg-black/[0.02] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-medium text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition cursor-pointer disabled:opacity-40 active:scale-98"
              @click="triggerFileInput"
            >
              <Upload class="w-4 h-4 text-[var(--ap-text-muted)]" />
              Upload Image (Max 5MB)
            </button>
            <p v-if="uploadError" data-test="background-error" class="text-xs text-rose-500 dark:text-rose-400 font-medium mt-1.5">
              {{ uploadError }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
