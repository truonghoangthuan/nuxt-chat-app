<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { Send, X, Paperclip } from '@lucide/vue'
import { Button } from '~/components/ui/button'
import type { ChatMessage, Profile } from '~/types/chat'
import { shouldSendOnKeydown, extractActiveMentionQuery, applyMentionAutocomplete } from '~/utils/chat'
import { validateImageFiles } from '~/utils/image'
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
    queueFiles(files)
  }
}

function handleDrop(event: DragEvent) {
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
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
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
  <div class="px-3 md:px-4 pb-3 md:pb-3.5 pt-1 bg-transparent shrink-0">
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

    <!-- Typing indicator bar -->
    <div class="h-5 mb-1 px-2 flex items-center">
      <span
        v-if="typingLabel"
        class="text-xs text-[var(--fp-text-secondary)] flex items-center gap-2 transition-opacity"
      >
        <span class="inline-flex gap-1">
          <span class="w-1.5 h-1.5 bg-[var(--fp-accent-bright)] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
          <span class="w-1.5 h-1.5 bg-[var(--fp-accent-bright)] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
          <span class="w-1.5 h-1.5 bg-[var(--fp-accent-bright)] rounded-full animate-bounce"></span>
        </span>
        <span>{{ typingLabel }}</span>
      </span>
    </div>

    <!-- @Mention Autocomplete Menu -->
    <div
      v-if="filteredMentions.length > 0"
      data-test="mention-autocomplete"
      class="mb-2 rounded-[12px] border border-[var(--fp-border-strong)] bg-[var(--fp-surface-elevated)] shadow-2xl overflow-hidden"
    >
      <div class="px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-[var(--fp-text-secondary)] border-b border-[var(--fp-border)]">
        Mention a friend
      </div>
      <button
        v-for="(candidate, idx) in filteredMentions"
        :key="candidate.id"
        type="button"
        :data-test="`mention-option-${candidate.id}`"
        class="w-full px-3.5 py-2 flex items-center gap-2.5 text-xs text-left transition-colors cursor-pointer"
        :class="idx === selectedMentionIndex ? 'bg-[var(--fp-active)] text-[var(--fp-text-primary)] font-semibold' : 'text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]'"
        @click="selectMention(candidate)"
      >
        <UserAvatar
          :display-name="candidate.display_name"
          :avatar-color="candidate.avatar_color"
          :avatar-url="candidate.avatar_url"
          size="sm"
        />
        <span>@{{ candidate.display_name }}</span>
      </button>
    </div>

    <!-- Floating Command-Bar Deck -->
    <div
      data-test="composer-deck"
      class="fp-composer-surface rounded-[12px] border border-[var(--fp-border)] focus-within:border-indigo-500/60 transition-colors overflow-hidden"
      @dragover.prevent
      @drop.prevent="handleDrop"
      @keydown="handleDeckKeydown"
    >
      <!-- Replying To Banner -->
      <div
        v-if="replyingTo"
        data-test="reply-banner"
        class="px-3.5 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between gap-2 text-xs"
      >
        <div class="truncate text-[var(--fp-text-secondary)]">
          Replying to <span class="font-semibold text-[var(--fp-accent-bright)]">@{{ replyingTo.author?.display_name || 'Friend' }}</span>:
          <span class="italic ml-1">{{ replyingTo.content }}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-test="cancel-reply"
          class="text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)]"
          aria-label="Cancel reply"
          @click="emit('cancelReply')"
        >
          <X class="size-4" aria-hidden="true" />
        </Button>
      </div>

      <!-- Attachment Error Banner -->
      <div
        v-if="validationError"
        data-test="attachment-error"
        class="px-3.5 py-1.5 text-xs text-rose-500 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between"
      >
        <span>{{ validationError }}</span>
        <button
          type="button"
          class="text-rose-400 hover:text-rose-300 cursor-pointer"
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
        class="px-3 py-2 border-b border-[var(--fp-border)] flex items-center gap-2.5 overflow-x-auto"
      >
        <div
          v-for="(att, idx) in pendingAttachments"
          :key="idx"
          data-test="attachment-preview"
          class="relative group shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-[var(--fp-border)] bg-[var(--fp-hover)]"
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

      <!-- Input Row -->
      <div class="flex items-end gap-2 p-2">
        <!-- Paperclip Button -->
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          :disabled="disabled"
          data-test="attach-image-button"
          class="text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] self-end mb-0.5 shrink-0"
          title="Attach images"
          aria-label="Attach images"
          @click="triggerFileInput"
        >
          <Paperclip class="size-4" aria-hidden="true" />
        </Button>

        <textarea
          ref="textareaRef"
          v-model="content"
          rows="1"
          :disabled="disabled || pendingAttachments.length > 0"
          :placeholder="pendingAttachments.length > 0 ? 'Images attached (text disabled)' : `Message ${isDm ? '@' : '#'}${channelSlug || 'channel'}`"
          class="min-h-9 max-h-40 w-full resize-none border-0 bg-transparent px-2.5 py-1.5 text-[14.5px] text-[var(--fp-text-primary)] shadow-none outline-none placeholder:text-[var(--fp-text-muted)] focus-visible:ring-0 disabled:opacity-60"
          @input="handleInput"
          @click="handleClick"
          @keyup="syncCursor"
          @keydown="handleKeydown"
          @paste="handlePaste"
        />

        <div class="flex items-center gap-2 shrink-0 pb-0.5 pr-0.5">
          <span class="hidden lg:inline-block text-[11px] text-[var(--fp-text-muted)] select-none">
            Enter ↵
          </span>
          <Button
            type="button"
            :disabled="disabled || (!content.trim() && pendingAttachments.length === 0)"
            class="h-9 rounded-lg bg-indigo-600 px-3.5 text-xs font-semibold text-white hover:bg-indigo-700 focus-visible:ring-indigo-500 disabled:opacity-40"
            title="Send message"
            @click="handleSend"
          >
            <span>Send</span>
            <Send class="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
