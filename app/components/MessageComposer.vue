<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { Send, X, Plus, Zap } from '@lucide/vue'
import Button from '~/components/ui/Button.vue'
import type { ChatMessage, Profile } from '~/types/chat'
import { shouldSendOnKeydown, extractActiveMentionQuery, applyMentionAutocomplete } from '~/utils/chat'
import { validateImageFiles, isImagePayload, parseImagePayload, formatImageMessageSummary } from '~/utils/image'
import UserAvatar from '~/components/UserAvatar.vue'
import { useTheme } from '~/composables/useTheme'

const { uiTheme } = useTheme()

const props = withDefaults(
  defineProps<{
    conversationId?: string
    channelSlug: string
    isDm?: boolean
    typingLabel?: string
    disabled?: boolean
    replyingTo?: ChatMessage | null
    mentionCandidates?: Profile[]
  }>(),
  {
    conversationId: '',
    isDm: false,
    typingLabel: '',
    disabled: false,
    replyingTo: null,
    mentionCandidates: () => [],
  },
)

const emit = defineEmits<{
  (e: 'send', content: string): void
  (e: 'sendImages', files: File[], caption?: string): void
  (e: 'typing'): void
  (e: 'cancelReply'): void
  (e: 'buzz'): void
}>()

const drafts = ref<Record<string, string>>({})
const conversationKey = computed(() => props.conversationId || props.channelSlug || 'default')
const content = ref(drafts.value[conversationKey.value] || '')

watch(conversationKey, (newKey, oldKey) => {
  if (oldKey) {
    drafts.value[oldKey] = content.value
  }
  content.value = drafts.value[newKey] || ''
  clearPendingAttachments()
  cursorIndex.value = content.value.length
  dismissedMentionStartIndex.value = null
  selectedMentionIndex.value = 0
  nextTick(() => {
    autoResize()
  })
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const cursorIndex = ref(0)
const selectedMentionIndex = ref(0)
const dismissedMentionStartIndex = ref<number | null>(null)

const validationError = ref('')
const pendingAttachments = ref<Array<{ file: File; url: string }>>([])

watch(
  () => props.replyingTo,
  (val) => {
    if (val) {
      nextTick(() => {
        textareaRef.value?.focus()
      })
    }
  },
)

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
  drafts.value[conversationKey.value] = content.value
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
  drafts.value[conversationKey.value] = content.value
  emit('typing')
}

function handleKeydown(event: KeyboardEvent) {
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
    const captionText = content.value.trim() || undefined
    clearPendingAttachments()
    content.value = ''
    drafts.value[conversationKey.value] = ''
    cursorIndex.value = 0
    selectedMentionIndex.value = 0
    nextTick(() => {
      autoResize()
    })
    emit('sendImages', filesToSend, captionText)
    return
  }

  const trimmed = content.value.trim()
  if (!trimmed) return

  emit('send', trimmed)
  content.value = ''
  drafts.value[conversationKey.value] = ''
  cursorIndex.value = 0
  selectedMentionIndex.value = 0
  nextTick(() => {
    autoResize()
  })
}

const buzzCooldownRemaining = ref(0)
let buzzTimer: any = null

function handleBuzz() {
  if (props.disabled || buzzCooldownRemaining.value > 0) return
  emit('buzz')
  buzzCooldownRemaining.value = 5
  if (buzzTimer) clearInterval(buzzTimer)
  buzzTimer = setInterval(() => {
    buzzCooldownRemaining.value -= 1
    if (buzzCooldownRemaining.value <= 0) {
      clearInterval(buzzTimer)
      buzzTimer = null
    }
  }, 1000)
}

onUnmounted(() => {
  clearPendingAttachments()
  if (buzzTimer) clearInterval(buzzTimer)
})
</script>

<template>
  <div class="relative z-10 p-4 bg-transparent shrink-0">
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
          class="text-xs text-[var(--ap-text-muted)] flex items-center gap-2 transition-opacity"
        >
          <span class="inline-flex gap-1">
            <span class="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span class="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span class="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full animate-bounce"></span>
          </span>
          <span>{{ typingLabel }}</span>
        </span>
      </div>

      <!-- @Mention Autocomplete Menu -->
      <div
        v-if="filteredMentions.length > 0"
        data-test="mention-autocomplete"
        class="mb-2 rounded-2xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#161824]/90 backdrop-blur-2xl shadow-2xl p-1 overflow-hidden"
      >
        <div class="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ap-text-muted)] border-b border-black/5 dark:border-white/5">
          Mention a friend
        </div>
        <button
          v-for="(candidate, idx) in filteredMentions"
          :key="candidate.id"
          type="button"
          :data-test="`mention-option-${candidate.id}`"
          class="w-full px-3 py-2 flex items-center gap-2.5 text-xs text-left rounded-xl transition-colors cursor-pointer"
          :class="idx === selectedMentionIndex ? 'bg-blue-600/15 dark:bg-blue-600/30 text-blue-900 dark:text-white font-medium' : 'text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--ap-text-primary)]'"
          @click="selectMention(candidate)"
        >
          <UserAvatar
            :display-name="candidate.display_name"
            :avatar-color="candidate.avatar_color"
            :avatar-url="candidate.avatar_url"
            size="sm"
          />
          <span class="font-medium text-[var(--ap-text-primary)]">@{{ candidate.display_name }}</span>
        </button>
      </div>

      <!-- Replying To Banner (Frosted Pill) -->
      <div
        v-if="replyingTo"
        data-test="reply-banner"
        class="mb-2 px-4 py-1.5 rounded-full bg-black/5 dark:bg-white/8 border border-black/10 dark:border-white/10 backdrop-blur-md flex items-center justify-between gap-2 text-xs"
      >
        <div class="truncate text-[var(--ap-text-secondary)]">
          Replying to <span class="font-semibold text-blue-600 dark:text-blue-300 font-mono">@{{ replyingTo.author?.display_name || 'Friend' }}</span>:
          <span class="italic ml-1 text-[var(--ap-text-primary)]">{{ isImagePayload(replyingTo.content) ? formatImageMessageSummary(parseImagePayload(replyingTo.content)?.images.length || 1) : replyingTo.content }}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-test="cancel-reply"
          class="text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] rounded-full size-6 cursor-pointer"
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
        class="mb-2 px-4 py-1.5 rounded-full text-xs text-rose-600 dark:text-rose-300 bg-rose-500/15 border border-rose-500/25 backdrop-blur-md flex items-center justify-between"
      >
        <span>{{ validationError }}</span>
        <button
          type="button"
          class="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 cursor-pointer"
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
        class="mb-2 p-2 rounded-2xl bg-black/5 dark:bg-white/8 border border-black/10 dark:border-white/10 backdrop-blur-md flex items-center gap-2.5 overflow-x-auto custom-scroll"
      >
        <div
          v-for="(att, idx) in pendingAttachments"
          :key="idx"
          data-test="attachment-preview"
          class="relative group shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/10 dark:bg-black/40"
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

      <!-- VSCode Terminal Header -->
      <div
        v-if="uiTheme === 'vscode'"
        data-test="vscode-terminal-header"
        class="mb-1 px-3 py-1 bg-[#252526] border-b border-[#3c3c3c] flex items-center justify-between text-[11px] font-mono text-[#858585] select-none rounded-t"
      >
        <div class="flex items-center gap-4">
          <span class="hover:text-white cursor-pointer">PROBLEMS</span>
          <span class="hover:text-white cursor-pointer">OUTPUT</span>
          <span class="text-white border-b border-[#007acc] pb-0.5 font-bold cursor-pointer">TERMINAL</span>
        </div>
        <div class="flex items-center gap-2">
          <span>bash</span>
        </div>
      </div>

      <!-- Yahoo Composer Toolbar -->
      <div
        v-if="uiTheme === 'yahoo'"
        data-test="yahoo-composer-toolbar"
        class="mb-1.5 px-2 py-1 bg-[#ece7f2] dark:bg-[#1b1029] border border-[#b5a8c9] dark:border-[#3b235a] rounded-[3px] flex items-center justify-between text-xs font-sans select-none"
      >
        <div class="flex items-center gap-2 text-[#4a3b5c] dark:text-[#d8b4fe]">
          <span class="px-1.5 py-0.5 bg-white dark:bg-[#251838] border border-[#b5a8c9] dark:border-[#3b235a] rounded text-[11px] font-medium">Tahoma 10pt</span>
          <span class="text-sm cursor-pointer" title="Emoticons">😊</span>
          <button
            type="button"
            data-test="yahoo-buzz-btn"
            :disabled="disabled"
            class="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-bold rounded text-[10px] uppercase shadow-xs cursor-pointer active:scale-95 disabled:opacity-40"
            @click="emit('send', '🔊 BUZZ!!!')"
          >
            BUZZ!
          </button>
        </div>
      </div>

      <!-- Apple Floating Frosted Pill Dock -->
      <div
        data-test="composer-deck"
        class="relative bg-black/[0.04] dark:bg-white/8 hover:bg-black/[0.06] dark:hover:bg-white/10 backdrop-blur-2xl border border-black/[0.08] dark:border-white/15 shadow-xl p-1.5 flex items-center gap-2 transition-all focus-within:bg-black/[0.06] dark:focus-within:bg-white/12 focus-within:ring-2 focus-within:ring-blue-500/40"
        :class="uiTheme === 'vscode' ? 'rounded-none border-x-0 border-b-0 border-t border-[#3c3c3c]' : (uiTheme === 'yahoo' ? 'rounded-[3px] border-[#b5a8c9] dark:border-[#3b235a]' : 'rounded-full')"
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
          class="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] flex items-center justify-center transition-all shrink-0 cursor-pointer disabled:opacity-40"
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
          :disabled="disabled"
          :placeholder="pendingAttachments.length > 0 ? 'Add a caption...' : `Message ${isDm ? '@' : '#'}${channelSlug || 'channel'}`"
          class="flex-1 bg-transparent border-0 text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] text-[13.5px] leading-relaxed py-1 px-1 resize-none focus:outline-none focus:ring-0 custom-scroll max-h-32 disabled:opacity-60"
          @input="handleInput"
          @click="handleClick"
          @keyup="syncCursor"
          @keydown="handleKeydown"
          @paste="handlePaste"
        />

        <!-- Buzz Button -->
        <button
          type="button"
          :disabled="disabled || buzzCooldownRemaining > 0"
          data-test="buzz-button"
          class="w-8 h-8 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center justify-center transition-all active:scale-90 shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          :title="buzzCooldownRemaining > 0 ? `Buzz cooldown (${buzzCooldownRemaining}s)` : 'Buzz the chat!'"
          aria-label="Buzz the chat"
          @click="handleBuzz"
        >
          <span v-if="buzzCooldownRemaining > 0" class="text-[11px] font-bold font-mono">
            {{ buzzCooldownRemaining }}
          </span>
          <Zap v-else class="size-3.5 fill-current" aria-hidden="true" />
        </button>

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
