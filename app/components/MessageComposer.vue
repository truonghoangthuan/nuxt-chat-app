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

const activeMention = computed(() => {
  return extractActiveMentionQuery(content.value, cursorIndex.value)
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
}

function selectMention(profile: Profile) {
  if (!activeMention.value) return
  content.value = applyMentionAutocomplete(
    content.value,
    activeMention.value,
    profile.display_name,
  )
  cursorIndex.value = content.value.length
  selectedMentionIndex.value = 0
  nextTick(() => {
    textareaRef.value?.focus()
    autoResize()
  })
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

function handleInput() {
  syncCursor()
  selectedMentionIndex.value = 0
  autoResize()
  emit('typing')
}

function handleKeydown(event: KeyboardEvent) {
  if (filteredMentions.value.length > 0) {
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
  <div class="p-3 md:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
    <!-- Replying To Banner -->
    <div
      v-if="replyingTo"
      data-test="reply-banner"
      class="mb-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border-l-2 border-sky-500 flex items-center justify-between gap-2 text-xs"
    >
      <div class="truncate text-slate-600 dark:text-slate-300">
        Replying to <span class="font-semibold text-slate-900 dark:text-white">@{{ replyingTo.author?.display_name || 'Friend' }}</span>:
        <span class="italic ml-1">{{ replyingTo.content }}</span>
      </div>
      <button
        type="button"
        data-test="cancel-reply"
        class="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold px-1 cursor-pointer"
        @click="emit('cancelReply')"
      >
        ×
      </button>
    </div>

    <!-- Typing indicator bar -->
    <div class="h-5 mb-1 px-1 flex items-center">
      <span
        v-if="typingLabel"
        class="text-xs italic text-slate-500 dark:text-slate-400 flex items-center gap-1.5 transition-opacity"
      >
        <span class="inline-flex gap-0.5">
          <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
          <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
          <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
        </span>
        {{ typingLabel }}
      </span>
    </div>

    <!-- @Mention Autocomplete Menu -->
    <div
      v-if="filteredMentions.length > 0"
      data-test="mention-autocomplete"
      class="mb-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden"
    >
      <div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700/60">
        Mention a friend
      </div>
      <button
        v-for="(candidate, idx) in filteredMentions"
        :key="candidate.id"
        type="button"
        :data-test="`mention-option-${candidate.id}`"
        class="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-left transition-colors cursor-pointer"
        :class="idx === selectedMentionIndex ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'"
        @click="selectMention(candidate)"
      >
        <UserAvatar
          :display-name="candidate.display_name"
          :avatar-color="candidate.avatar_color"
          size="sm"
        />
        <span>@{{ candidate.display_name }}</span>
      </button>
    </div>

    <!-- Input box -->
    <div class="relative flex items-end rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 focus-within:ring-2 focus-within:ring-sky-500 focus-within:border-sky-500 transition-all p-1.5">
      <textarea
        ref="textareaRef"
        v-model="content"
        rows="1"
        :disabled="disabled"
        :placeholder="`Message ${isDm ? '@' : '#'}${channelSlug || 'channel'} (Enter to send, Shift+Enter for newline)`"
        class="w-full resize-none bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none max-h-40 overflow-y-auto"
        @input="handleInput"
        @click="syncCursor"
        @keyup="syncCursor"
        @keydown="handleKeydown"
      ></textarea>

      <button
        type="button"
        :disabled="!content.trim() || disabled"
        class="mb-1 mr-1 p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:hover:bg-sky-600 disabled:cursor-not-allowed transition-colors shrink-0 shadow-sm"
        title="Send message"
        @click="handleSend"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
        </svg>
      </button>
    </div>
  </div>
</template>
