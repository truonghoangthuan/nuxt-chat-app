<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { ChatMessage, Profile } from '~/types/chat'
import { shouldSendOnKeydown, extractActiveMentionQuery, applyMentionAutocomplete } from '~/utils/chat'
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
  (e: 'typing'): void
  (e: 'cancelReply'): void
}>()

const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const cursorIndex = ref(0)
const selectedMentionIndex = ref(0)
const dismissedMentionStartIndex = ref<number | null>(null)

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

function handleSend() {
  const trimmed = content.value.trim()
  if (!trimmed || props.disabled) return

  emit('send', trimmed)
  content.value = ''
  cursorIndex.value = 0
  selectedMentionIndex.value = 0
  nextTick(() => {
    autoResize()
  })
}
</script>

<template>
  <div class="px-3 md:px-4 pb-3 md:pb-3.5 pt-1 bg-transparent shrink-0">
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
    <div class="fp-composer-surface rounded-[12px] border border-[var(--fp-border)] focus-within:border-indigo-500/60 transition-colors overflow-hidden">
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
        <button
          type="button"
          data-test="cancel-reply"
          class="text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] font-bold px-1.5 cursor-pointer"
          @click="emit('cancelReply')"
        >
          ×
        </button>
      </div>

      <!-- Input Row -->
      <div class="flex items-end gap-2 p-2">
        <textarea
          ref="textareaRef"
          v-model="content"
          rows="1"
          :disabled="disabled"
          :placeholder="`Message ${isDm ? '@' : '#'}${channelSlug || 'channel'} (Enter to send, Shift+Enter for newline)`"
          class="w-full resize-none bg-transparent px-2.5 py-1.5 text-[14.5px] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none max-h-40 overflow-y-auto leading-relaxed"
          @input="handleInput"
          @click="handleClick"
          @keyup="syncCursor"
          @keydown="handleKeydown"
        ></textarea>

        <div class="flex items-center gap-2 shrink-0 pb-0.5 pr-0.5">
          <span class="hidden lg:inline-block text-[11px] text-[var(--fp-text-muted)] select-none">
            Enter ↵
          </span>
          <button
            type="button"
            :disabled="!content.trim() || disabled"
            class="px-3.5 py-1.5 rounded-[8px] fp-btn-primary text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
            title="Send message"
            @click="handleSend"
          >
            <span>Send</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
