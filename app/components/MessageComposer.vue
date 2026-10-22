<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { Send, X, Plus } from '@lucide/vue'
import { Button } from '~/components/ui/button'
import type { ChatMessage, Profile } from '~/types/chat'
import { shouldSendOnKeydown, extractActiveMentionQuery, applyMentionAutocomplete } from '~/utils/chat'
import { validateImageFiles, isImagePayload, parseImagePayload, formatImageMessageSummary } from '~/utils/image'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    channelSlug: string
    isDm?: boolean
    typingLabel?: string
    disabled?: boolean
    replyingTo?: ChatMessage | null
    mentionCandidates?: Profile[]
  }>(),
  {
    isDm: false,
    typingLabel: '',
    disabled: false,
    replyingTo: null,
    mentionCandidates: () => [],
  },
)

const emit = defineEmits<{
  (e: 'send', content: string): void
  (e: 'sendImages', files: File[]): void
  (e: 'typing'): void
  (e: 'cancelReply'): void
}>()

const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const cursorIndex = ref(0)
const selectedMentionIndex = ref(0)
const dismissedMentionStartIndex = ref<number | null>(null)

const validationError = ref('')
const pendingAttachments = ref<Array<{ file: File; url: string }>>([])

const activeMention = computed(() => {
  const current = extractActiveMentionQuery(content.value, cursorIndex.value)
  if (!current) return null
  if (dismissedMentionStartIndex.value !== null && current.startIndex === dismissedMentionStartIndex.value) {
    return null
  }
  return current
})

const filteredMentions = computed(() => {
  if (!activeMention.value) return []
  const q = activeMention.value.query.toLowerCase()
  return (props.mentionCandidates || [])
    .filter(p => p.display_name.toLowerCase().includes(q))
    .slice(0, 6)
})

function revokeUrl(url: string) {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' && url) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }
}

function clearPendingAttachments() {
  for (const item of pendingAttachments.value) {
    revokeUrl(item.url)
  }
  pendingAttachments.value = []
  validationError.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function removeAttachment(index: number) {
  const item = pendingAttachments.value[index]
  if (item) {
    revokeUrl(item.url)
    pendingAttachments.value.splice(index, 1)
  }
  if (pendingAttachments.value.length === 0) {
    validationError.value = ''
  } else {
    const val = validateImageFiles(pendingAttachments.value.map(a => a.file))
    validationError.value = val.valid ? '' : (val.error || '')
  }
}

function triggerFileInput() {
  if (props.disabled) return
  fileInputRef.value?.click()
}

function queueFiles(files: FileList | File[]) {
  const incoming = Array.from(files)
  if (incoming.length === 0) return

  const combined = [...pendingAttachments.value.map(a => a.file), ...incoming]
  const result = validateImageFiles(combined)
  if (!result.valid) {
    validationError.value = result.error || 'Invalid images'
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
    return
  }

  validationError.value = ''
  content.value = ''

  for (const file of incoming) {
    const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : ''
    pendingAttachments.value.push({ file, url })
  }

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target?.files?.length) {
    queueFiles(target.files)
  }
}

function handlePaste(event: ClipboardEvent) {
  const cd = event.clipboardData
  if (!cd) return

  let files: File[] = []
  if (cd.files && cd.files.length > 0) {
    files = Array.from(cd.files)
  } else if (cd.items && cd.items.length > 0) {
    for (let i = 0; i < cd.items.length; i++) {
      const item = cd.items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }

  if (files.length > 0) {
    event.preventDefault()
    event.stopPropagation()
    queueFiles(files)
  }
}

function handleDrop(event: DragEvent) {
  if (props.disabled) return
  const dt = event.dataTransfer
  if (!dt?.files?.length) return
  queueFiles(dt.files)
}

function syncCursor() {
  const el = textareaRef.value
  cursorIndex.value = el?.selectionStart ?? content.value.length
  const current = extractActiveMentionQuery(content.value, cursorIndex.value)
  if (!current || (dismissedMentionStartIndex.value !== null && current.startIndex !== dismissedMentionStartIndex.value)) {
    dismissedMentionStartIndex.value = null
  }
}

function selectMention(profile: Profile) {
  if (!activeMention.value) return
  const prefix = content.value.slice(0, activeMention.value.startIndex)
  const insertedToken = `@${profile.display_name} `
  const newCaretPos = prefix.length + insertedToken.length

  content.value = applyMentionAutocomplete(
    content.value,
    activeMention.value,
    profile.display_name,
  )
  cursorIndex.value = newCaretPos
  selectedMentionIndex.value = 0
  dismissedMentionStartIndex.value = null
  nextTick(() => {
    const el = textareaRef.value
    if (el) {
      el.focus()
      el.setSelectionRange(newCaretPos, newCaretPos)
    }
    autoResize()
  })
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 128)}px`
}

function handleClick() {
  dismissedMentionStartIndex.value = null
  syncCursor()
}

function handleInput() {
  dismissedMentionStartIndex.value = null
  syncCursor()
  selectedMentionIndex.value = 0
  autoResize()
  emit('typing')
}

function handleKeydown(event: KeyboardEvent) {
  if (pendingAttachments.value.length > 0) {
    if (shouldSendOnKeydown(event)) {
      event.preventDefault()
      handleSend()
    }
    return
  }

  if (filteredMentions.value.length > 0) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (activeMention.value) {
        dismissedMentionStartIndex.value = activeMention.value.startIndex
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedMentionIndex.value = (selectedMentionIndex.value + 1) % filteredMentions.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedMentionIndex.value = (selectedMentionIndex.value - 1 + filteredMentions.value.length) % filteredMentions.value.length
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const chosen = filteredMentions.value[selectedMentionIndex.value] || filteredMentions.value[0]
      if (chosen) {
        selectMention(chosen)
      }
      return
    }
  }

  if (shouldSendOnKeydown(event)) {
    event.preventDefault()
    handleSend()
  }
}

function handleDeckKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.tagName === 'BUTTON') return
  if (pendingAttachments.value.length > 0 && shouldSendOnKeydown(event)) {
    event.preventDefault()
    handleSend()
  }
}

function handleSend() {
  if (props.disabled) return

  if (pendingAttachments.value.length > 0) {
    const filesToSend = pendingAttachments.value.map(a => a.file)
    clearPendingAttachments()
    emit('sendImages', filesToSend)
    return
  }

  const trimmed = content.value.trim()
  if (!trimmed) return

  emit('send', trimmed)
  content.value = ''
  cursorIndex.value = 0
  selectedMentionIndex.value = 0
  nextTick(() => {
    autoResize()
  })
}

onUnmounted(() => {
  clearPendingAttachments()
})
</script>

<template>
  <div class="p-4 bg-transparent shrink-0">
    <!-- Hidden file input for images -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/png,image/jpeg,image/webp,image/gif"
      class="hidden"
      data-test="file-input"
      @change="handleFileChange"
    />

    <div class="max-w-[65ch] mx-auto w-full relative">
      <!-- Typing Indicator -->
      <div class="h-5 mb-1 px-3 flex items-center">
        <span
          v-if="typingLabel"
          class="text-xs text-white/70 flex items-center gap-2 transition-opacity"
        >
          <span class="inline-flex gap-1">
            <span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
          </span>
          <span>{{ typingLabel }}</span>
        </span>
      </div>

      <!-- @Mention Autocomplete Menu -->
      <div
        v-if="filteredMentions.length > 0"
        data-test="mention-autocomplete"
        class="mb-2 rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl shadow-2xl p-1 overflow-hidden"
      >
        <div class="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 border-b border-white/5">
          Mention a friend
        </div>
        <button
          v-for="(candidate, idx) in filteredMentions"
          :key="candidate.id"
          type="button"
          :data-test="`mention-option-${candidate.id}`"
          class="w-full px-3 py-2 flex items-center gap-2.5 text-xs text-left rounded-xl transition-colors cursor-pointer"
          :class="idx === selectedMentionIndex ? 'bg-blue-600/30 text-white font-medium' : 'text-white/80 hover:bg-white/5 hover:text-white'"
          @click="selectMention(candidate)"
        >
          <UserAvatar
            :display-name="candidate.display_name"
            :avatar-color="candidate.avatar_color"
            :avatar-url="candidate.avatar_url"
            size="sm"
          />
          <span class="font-medium text-white/90">@{{ candidate.display_name }}</span>
        </button>
      </div>

      <!-- Replying To Banner (Frosted Pill) -->
      <div
        v-if="replyingTo"
        data-test="reply-banner"
        class="mb-2 px-4 py-1.5 rounded-full bg-white/8 border border-white/10 backdrop-blur-md flex items-center justify-between gap-2 text-xs"
      >
        <div class="truncate text-white/70">
          Replying to <span class="font-semibold text-blue-300 font-mono">@{{ replyingTo.author?.display_name || 'Friend' }}</span>:
          <span class="italic ml-1 text-white/90">{{ isImagePayload(replyingTo.content) ? formatImageMessageSummary(parseImagePayload(replyingTo.content)?.images.length || 1) : replyingTo.content }}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-test="cancel-reply"
          class="text-white/60 hover:text-white rounded-full size-6 cursor-pointer"
          aria-label="Cancel reply"
          @click="emit('cancelReply')"
        >
          <X class="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      <!-- Attachment Error Banner -->
      <div
        v-if="validationError"
        data-test="attachment-error"
        class="mb-2 px-4 py-1.5 rounded-full text-xs text-rose-300 bg-rose-500/15 border border-rose-500/25 backdrop-blur-md flex items-center justify-between"
      >
        <span>{{ validationError }}</span>
        <button
          type="button"
          class="text-rose-400 hover:text-rose-200 cursor-pointer"
          aria-label="Dismiss error"
          @click="validationError = ''"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <!-- Attachment Preview Tray -->
      <div
        v-if="pendingAttachments.length > 0"
        data-test="attachment-tray"
        class="mb-2 p-2 rounded-2xl bg-white/8 border border-white/10 backdrop-blur-md flex items-center gap-2.5 overflow-x-auto custom-scroll"
      >
        <div
          v-for="(att, idx) in pendingAttachments"
          :key="idx"
          data-test="attachment-preview"
          class="relative group shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-white/10 bg-black/40"
        >
          <img
            :src="att.url"
            :alt="att.file.name"
            class="w-full h-full object-cover"
          />
          <button
            type="button"
            data-test="remove-attachment"
            class="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:bg-black transition-colors cursor-pointer"
            :aria-label="`Remove ${att.file.name}`"
            @click="removeAttachment(idx)"
          >
            <X class="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Apple Floating Frosted Pill Dock -->
      <div
        data-test="composer-deck"
        class="relative rounded-full bg-white/8 hover:bg-white/10 backdrop-blur-2xl border border-white/15 shadow-2xl p-1.5 flex items-center gap-2 transition-all focus-within:bg-white/12 focus-within:ring-2 focus-within:ring-blue-500/40"
        @dragover.prevent
        @drop.prevent="handleDrop"
        @keydown="handleDeckKeydown"
        @paste="handlePaste"
      >
        <!-- Plus / Attachment Button -->
        <button
          type="button"
          :disabled="disabled"
          data-test="attach-image-button"
          class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all shrink-0 cursor-pointer disabled:opacity-40"
          title="Attach images"
          aria-label="Attach images"
          @click="triggerFileInput"
        >
          <Plus class="size-4" aria-hidden="true" />
        </button>

        <!-- Auto-resizing Textarea -->
        <textarea
          ref="textareaRef"
          v-model="content"
          rows="1"
          :disabled="disabled || pendingAttachments.length > 0"
          :placeholder="pendingAttachments.length > 0 ? 'Images attached (text disabled)' : `Message ${isDm ? '@' : '#'}${channelSlug || 'channel'}`"
          class="flex-1 bg-transparent border-0 text-white placeholder-white/40 text-[13.5px] leading-relaxed py-1 px-1 resize-none focus:outline-none focus:ring-0 custom-scroll max-h-32 disabled:opacity-60"
          @input="handleInput"
          @click="handleClick"
          @keyup="syncCursor"
          @keydown="handleKeydown"
          @paste="handlePaste"
        />

        <!-- Send Button -->
        <button
          type="button"
          :disabled="disabled || (!content.trim() && pendingAttachments.length === 0)"
          class="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/30 transition-all active:scale-90 shrink-0 cursor-pointer disabled:opacity-40"
          title="Send message"
          aria-label="Send message"
          @click="handleSend"
        >
          <Send class="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
