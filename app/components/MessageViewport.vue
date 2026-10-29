<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { ChatMessage, EncryptedImageMetadata, Profile } from '~/types/chat'
import {
  buildMessageTimeline,
  REACTION_EMOJIS,
  summarizeReactions,
  formatReactionAuthors,
  tokenizeMessageMentions,
  highlightTextSegments,
  resolveChatBackgroundStyle,
  computeSeenByMessageId,
  isSystemPayload,
  parseSystemPayload,
  formatSystemMessageText,
} from '~/utils/chat'
import { isImagePayload, parseImagePayload, formatImageMessageSummary } from '~/utils/image'
import UserAvatar from '~/components/UserAvatar.vue'
import MessageImageGrid from '~/components/MessageImageGrid.vue'
import { Pin, ChevronLeft, ChevronRight, X, ChevronDown } from '@lucide/vue'
import { useTheme } from '~/composables/useTheme'

const { uiTheme } = useTheme()

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    conversationId?: string | null
    channelId?: string | null
    isDm?: boolean
    isGroup?: boolean
    peerName?: string
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    currentUserId?: string
    currentDisplayName?: string
    lastReadAt?: string | null
    loadOlder?: () => Promise<number>
    searchQuery?: string
    backgroundUrl?: string | null
    readReceipts?: Record<string, string>
    members?: Profile[]
  }>(),
  {
    conversationId: null,
    channelId: null,
    isDm: false,
    isGroup: undefined,
    peerName: '',
    hasMoreHistory: false,
    isLoadingHistory: false,
    currentUserId: '',
    currentDisplayName: '',
    lastReadAt: null,
    loadOlder: () => Promise.resolve(0),
    searchQuery: '',
    backgroundUrl: null,
    readReceipts: () => ({}),
    members: () => [],
  },
)

const emit = defineEmits<{
  (e: 'retry', clientId: string): void
  (e: 'dismiss', clientId: string): void
  (e: 'reply', message: ChatMessage): void
  (e: 'edit', payload: { messageId: string; content: string }): void
  (e: 'delete', messageId: string): void
  (e: 'toggleReaction', payload: { messageId: string; emoji: string }): void
  (e: 'selectImage', payload: { images: EncryptedImageMetadata[]; initialIndex: number }): void
  (e: 'togglePin', messageId: string): void
  (e: 'viewProfile', profile: Profile): void
}>()

const viewportRef = ref<HTMLDivElement | null>(null)
const unreadNewCount = ref(0)
const isNearBottom = ref(true)
const pendingScrollOnOpen = ref(true)

const editingMessageId = ref<string | null>(null)
const editingContent = ref('')
const copiedCodeMessageId = ref<string | null>(null)
const activePinnedIndex = ref(0)
const highlightedMessageId = ref<string | null>(null)

const seenByMap = computed(() =>
  computeSeenByMessageId({
    messages: props.messages,
    readsByUser: props.readReceipts,
    profiles: props.members || [],
    currentUserId: props.currentUserId,
  }),
)

const pinnedMessages = computed(() =>
  props.messages
    .filter(m => Boolean(m.pinned_at) && !m.deleted_at)
    .sort((a, b) => {
      const tA = a.pinned_at ? Date.parse(a.pinned_at) : 0
      const tB = b.pinned_at ? Date.parse(b.pinned_at) : 0
      return tB - tA
    }),
)

const currentPinnedIndex = computed(() =>
  pinnedMessages.value.length > 0
    ? ((activePinnedIndex.value % pinnedMessages.value.length) + pinnedMessages.value.length) % pinnedMessages.value.length
    : 0,
)

const currentPinnedMessage = computed(() => {
  if (pinnedMessages.value.length === 0) return null
  return pinnedMessages.value[currentPinnedIndex.value] || null
})

function jumpToMessage(messageId: string) {
  const el = document.getElementById(`message-${messageId}`) || viewportRef.value?.querySelector(`[data-message-id="${messageId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightedMessageId.value = messageId
    setTimeout(() => {
      if (highlightedMessageId.value === messageId) {
        highlightedMessageId.value = null
      }
    }, 2500)
  }
}

function jumpToPinnedMessage(messageId: string) {
  jumpToMessage(messageId)
}

defineExpose({
  jumpToMessage,
})

function startEdit(msg: ChatMessage) {
  editingMessageId.value = msg.id
  editingContent.value = msg.content
}

function cancelEdit() {
  editingMessageId.value = null
  editingContent.value = ''
}

function saveEdit(messageId: string) {
  const trimmed = editingContent.value.trim()
  if (!trimmed) return
  emit('edit', { messageId, content: trimmed })
  editingMessageId.value = null
  editingContent.value = ''
}

function parseCodeBlock(content: string) {
  const match = content.match(/^```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n?```$/)
  if (match) {
    return {
      isCode: true,
      language: match[1] || 'code',
      code: match[2],
    }
  }
  return { isCode: false, language: '', code: '' }
}

function parseStickerPayload(content?: string) {
  if (!content || typeof content !== 'string') return null
  const match = content.match(/^\[sticker:([a-zA-Z0-9_-]+):([^:]+):([^\]]+)\]$/)
  if (match) {
    return {
      id: match[1],
      label: match[2],
      emoji: match[3],
    }
  }
  return null
}

async function copyCode(code: string, messageId: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(code)
      copiedCodeMessageId.value = messageId
      setTimeout(() => {
        if (copiedCodeMessageId.value === messageId) {
          copiedCodeMessageId.value = null
        }
      }, 2000)
    }
  } catch {
    // Clipboard permission denied fallback
  }
}

const effectiveConversationId = computed(() => props.conversationId ?? props.channelId ?? null)
const backgroundStyle = computed(() => resolveChatBackgroundStyle(props.backgroundUrl))

const memberDisplayNames = computed(() =>
  (props.members || []).map(m => m.display_name).filter(Boolean),
)

const isGroupComputed = computed(() => {
  if (typeof props.isGroup === 'boolean') return props.isGroup
  return !props.isDm
})

const timelineItems = computed(() =>
  buildMessageTimeline(props.messages, new Date(), {
    lastReadAt: props.lastReadAt,
    currentUserId: props.currentUserId,
    currentDisplayName: props.currentDisplayName,
    isGroup: isGroupComputed.value,
    memberDisplayNames: memberDisplayNames.value,
  }),
)

function checkScrollPosition() {
  const el = viewportRef.value
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  isNearBottom.value = distanceFromBottom <= 120
  if (isNearBottom.value) {
    unreadNewCount.value = 0
  }
}

function forceScrollToBottom() {
  const el = viewportRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
  unreadNewCount.value = 0
  isNearBottom.value = true
}

function scheduleScrollToBottom() {
  nextTick(() => {
    forceScrollToBottom()
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        forceScrollToBottom()
      })
    }
    setTimeout(() => {
      if (isNearBottom.value || pendingScrollOnOpen.value) {
        forceScrollToBottom()
      }
    }, 80)
  })
}

function scrollToBottom(smooth = false) {
  nextTick(() => {
    const el = viewportRef.value
    if (!el) return
    if (smooth && !pendingScrollOnOpen.value) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      })
    } else {
      el.scrollTop = el.scrollHeight
    }
    unreadNewCount.value = 0
    isNearBottom.value = true
  })
}

function onViewportImageLoad() {
  if (isNearBottom.value || pendingScrollOnOpen.value) {
    forceScrollToBottom()
  }
}

async function handleLoadOlder() {
  const el = viewportRef.value
  if (!el || props.isLoadingHistory || !props.hasMoreHistory) return

  const prevScrollHeight = el.scrollHeight
  const prevScrollTop = el.scrollTop

  await props.loadOlder()

  await nextTick()
  if (el) {
    el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop
  }
}

function handleScroll() {
  checkScrollPosition()
  if (!isNearBottom.value) {
    pendingScrollOnOpen.value = false
  }
  const el = viewportRef.value
  if (el && el.scrollTop <= 40 && props.hasMoreHistory && !props.isLoadingHistory) {
    handleLoadOlder()
  }
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const prevNewestId = ref<string | null>(
  props.messages.length > 0
    ? (props.messages[props.messages.length - 1].client_id || props.messages[props.messages.length - 1].id)
    : null,
)

watch(
  () => props.messages,
  (newMessages) => {
    if (!newMessages || newMessages.length === 0) {
      prevNewestId.value = null
      return
    }

    const newest = newMessages[newMessages.length - 1]
    const currentNewestId = newest.client_id || newest.id

    // If we just opened this chat, force scroll to bottom!
    if (pendingScrollOnOpen.value) {
      prevNewestId.value = currentNewestId
      scheduleScrollToBottom()
      return
    }

    // Ignore history prepends or same newest message
    if (props.isLoadingHistory || currentNewestId === prevNewestId.value) {
      return
    }

    prevNewestId.value = currentNewestId
    const isMine = newest && newest.user_id === props.currentUserId

    if (isMine || isNearBottom.value) {
      scrollToBottom(true)
    } else {
      unreadNewCount.value += 1
    }
  },
  { deep: false },
)

watch(
  effectiveConversationId,
  () => {
    unreadNewCount.value = 0
    isNearBottom.value = true
    pendingScrollOnOpen.value = true
    prevNewestId.value = null
    activePinnedIndex.value = 0
    scheduleScrollToBottom()
  },
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  scheduleScrollToBottom()
  if (typeof ResizeObserver !== 'undefined' && viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (isNearBottom.value || pendingScrollOnOpen.value) {
        forceScrollToBottom()
      }
    })
    resizeObserver.observe(viewportRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<template>
  <div class="chat-timeline-stage relative flex-1 flex flex-col min-h-0 bg-transparent overflow-hidden" :data-custom-background="backgroundStyle ? 'true' : undefined">
    <!-- Chat Background Layer & Adaptive Contrast Scrim -->
    <div
      v-if="backgroundStyle"
      data-test="chat-background-layer"
      class="absolute inset-0 pointer-events-none transition-all duration-300 z-0"
      :style="backgroundStyle"
    >
      <div
        data-test="chat-background-scrim"
        class="absolute inset-0 bg-white/70 dark:bg-[#0d0f17]/75 backdrop-blur-[1px]"
      />
    </div>

    <div class="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
      <!-- Pinned Messages Banner -->
    <div
      v-if="pinnedMessages.length > 0 && currentPinnedMessage"
      data-test="pinned-messages-banner"
      class="sticky top-0 z-20 mx-4 mt-2 px-3.5 py-2 rounded-2xl bg-white/80 dark:bg-[#1a1d28]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-lg flex items-center justify-between gap-3 text-xs"
    >
      <div
        data-test="jump-pinned-message"
        class="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
        @click="jumpToPinnedMessage(currentPinnedMessage.id)"
      >
        <div class="size-6 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <Pin class="size-3.5 fill-current" />
        </div>
        <div class="min-w-0 flex flex-col">
          <div class="flex items-center gap-1.5 font-semibold text-[var(--ap-text-primary)]">
            <span>Pinned Message</span>
            <span v-if="pinnedMessages.length > 1" class="text-[10px] text-[var(--ap-text-muted)] font-normal">
              ({{ currentPinnedIndex + 1 }} of {{ pinnedMessages.length }})
            </span>
          </div>
          <p class="truncate text-[var(--ap-text-secondary)] text-[11.5px]">
            <span class="font-medium text-[var(--ap-text-primary)]">{{ currentPinnedMessage.author?.display_name || 'Friend' }}:</span>
            {{ isImagePayload(currentPinnedMessage.content) ? 'Shared photos' : currentPinnedMessage.content }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <template v-if="pinnedMessages.length > 1">
          <button
            type="button"
            aria-label="Previous pinned message"
            class="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] cursor-pointer"
            @click.stop="activePinnedIndex = (activePinnedIndex - 1 + pinnedMessages.length) % pinnedMessages.length"
          >
            <ChevronLeft class="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next pinned message"
            class="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] cursor-pointer"
            @click.stop="activePinnedIndex = (activePinnedIndex + 1) % pinnedMessages.length"
          >
            <ChevronRight class="size-3.5" />
          </button>
        </template>

        <button
          type="button"
          data-test="unpin-banner-btn"
          title="Unpin message"
          class="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-muted)] hover:text-rose-500 cursor-pointer transition-colors"
          @click.stop="emit('togglePin', currentPinnedMessage.id)"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Messages Scroll Container with custom-scroll -->
    <div
      ref="viewportRef"
      class="chat-timeline flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3 custom-scroll"
      @scroll="handleScroll"
      @load.capture="onViewportImageLoad"
    >
      <!-- History Loader -->
      <div v-if="hasMoreHistory" class="text-center py-2">
        <button
          type="button"
          data-test="load-older-button"
          :disabled="isLoadingHistory"
          class="px-3.5 py-1.5 text-xs font-semibold text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full border border-black/10 dark:border-white/10 shadow-xs disabled:opacity-50 transition-colors cursor-pointer font-mono backdrop-blur-md"
          @click="handleLoadOlder"
        >
          <span v-if="isLoadingHistory">Loading older messages...</span>
          <span v-else>↑ Load older messages</span>
        </button>
      </div>

      <!-- Beautiful Chaos Empty State with Iridescent Glow & Whimsical Emojis -->
      <div
        v-if="messages.length === 0"
        data-test="empty-channel-placeholder"
        class="h-full flex flex-col items-center justify-center text-center py-16 px-4 select-none"
      >
        <div class="relative mb-5 flex items-center justify-center">
          <!-- Floating playful decorative particles -->
          <span class="absolute -top-3 -left-5 text-xl animate-bounce [animation-delay:-0.2s]">✨</span>
          <span class="absolute -top-2 -right-5 text-xl animate-bounce [animation-delay:-0.4s]">⚡</span>
          <span class="absolute -bottom-2 -left-4 text-lg animate-bounce [animation-delay:-0.6s]">🍿</span>
          <span class="absolute -bottom-2 -right-4 text-lg animate-bounce [animation-delay:-0.8s]">👾</span>

          <div class="w-18 h-18 rounded-3xl bg-gradient-to-tr from-purple-500 via-pink-500 to-indigo-500 p-0.5 shadow-[0_0_35px_rgba(168,85,247,0.4)] animate-pulse">
            <div class="w-full h-full bg-white dark:bg-[#151221] rounded-3xl flex items-center justify-center text-2xl font-bold font-mono text-purple-600 dark:text-purple-300">
              {{ !isGroupComputed ? '@' : '#' }}
            </div>
          </div>
        </div>
        <h3 class="text-base font-bold text-[var(--ap-text-primary)] tracking-tight flex items-center gap-1.5">
          <span>No Messages Yet</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-mono bg-purple-500/15 text-purple-600 dark:text-purple-300 font-semibold border border-purple-500/25">
            Calm Before Chaos
          </span>
        </h3>
        <p class="text-[13px] text-[var(--ap-text-secondary)] font-medium max-w-sm mt-1.5">
          {{ !isGroupComputed ? `This is the start of your direct message history with ${peerName ? '@' + peerName : 'your friend'}` : 'This is the start of this channel' }}
        </p>
        <p class="text-xs text-[var(--ap-text-muted)] mt-1 mb-5 max-w-xs">
          80% functional messaging, 20% delightful nonsense. Be the first to drop a meme, say hello, or start some chaos!
        </p>
      </div>

      <!-- Messages List -->
      <template
        v-for="(item, idx) in timelineItems"
        :key="item.message.client_id || item.message.id"
      >
        <!-- Frosted Date Divider -->
        <div
          v-if="item.showDateDivider"
          data-test="date-divider"
          class="flex items-center gap-3 my-3.5 before:flex-1 before:h-px before:bg-black/10 dark:before:bg-white/5 after:flex-1 after:h-px after:bg-black/10 dark:after:bg-white/5"
        >
          <span class="px-3 py-1 rounded-full text-[11px] font-mono font-medium text-[var(--ap-text-muted)] bg-black/5 dark:bg-white/5 backdrop-blur-md border border-black/10 dark:border-white/5 shadow-xs">
            {{ item.dateLabel }}
          </span>
        </div>

        <!-- Unread Messages Divider -->
        <div
          v-if="item.showUnreadDivider"
          data-test="unread-divider"
          class="flex items-center gap-3 my-3 before:flex-1 before:h-px before:bg-rose-500/30 after:flex-1 after:h-px after:bg-rose-500/30"
        >
          <span class="px-3 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-wide text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 backdrop-blur-md">
            New messages
          </span>
        </div>

        <!-- System Activity Pill (e.g. buzz, rename, background change) -->
        <div
          v-if="item.systemPayload"
          :id="`message-${item.message.id}`"
          :data-message-id="item.message.id"
          :data-test="`system-message-${item.message.id}`"
          class="flex justify-center my-2 w-full"
        >
          <div
            class="px-3.5 py-1 rounded-full text-xs font-medium backdrop-blur-md border shadow-xs inline-flex items-center gap-1.5"
            :class="[
              item.systemPayload.event === 'buzz'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold'
                : 'bg-black/5 dark:bg-white/8 border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)]'
            ]"
          >
            <span>
              {{ formatSystemMessageText(item.systemPayload) }}
            </span>
          </div>
        </div>

        <!-- Message Row (Flex Container) -->
        <div
          v-else
          :id="`message-${item.message.id}`"
          :data-message-id="item.message.id"
          :data-test="item.isMentioningMe ? `mention-row-${item.message.id}` : (item.isCompact ? 'compact-message' : 'full-message')"
          class="relative flex w-full group py-0.5 transition-colors"
          :class="[
            uiTheme === 'vscode' || uiTheme === 'yahoo'
              ? 'justify-start items-start gap-1 font-mono text-xs'
              : (item.isSender ? 'justify-end' : 'justify-start items-end gap-2'),
            item.isMentioningMe ? 'bg-amber-500/10 border-l-2 border-amber-500 dark:border-amber-400 pl-2 rounded-2xl' : '',
            item.isFirstInGroup && !item.showDateDivider && !item.showUnreadDivider ? 'mt-2' : 'mt-0.5',
          ]"
        >
          <!-- VSCode Line Number -->
          <span
            v-if="uiTheme === 'vscode'"
            data-test="vscode-line-number"
            class="w-8 shrink-0 text-right pr-2 font-mono text-[11px] text-[#858585] select-none pt-0.5"
          >{{ idx + 1 }}</span>

          <!-- Yahoo Transcript Author -->
          <span
            v-if="uiTheme === 'yahoo'"
            data-test="yahoo-transcript-author"
            class="font-bold text-xs mr-1 shrink-0 font-sans"
            :class="item.isSender ? 'text-[#0033cc] dark:text-[#60a5fa]' : 'text-[#800080] dark:text-[#c084fc]'"
          >{{ item.message.author?.display_name || 'Friend' }} ({{ formatTime(item.message.created_at) }}):</span>

          <!-- Recipient Avatar (rendered at the bottom of the cluster in default theme) -->
          <template v-if="(uiTheme === 'default' || uiTheme === 'telegram') && !item.isSender">
            <div
              v-if="item.isLastInGroup"
              data-test="recipient-avatar-trigger"
              class="shrink-0 mb-0.5 cursor-pointer hover:opacity-80 transition-opacity"
              @click="item.message.author && emit('viewProfile', item.message.author)"
            >
              <UserAvatar
                :display-name="item.message.author?.display_name || 'Friend'"
                :avatar-color="item.message.author?.avatar_color"
                :avatar-url="item.message.author?.avatar_url"
                :shape="uiTheme === 'telegram' ? 'circle' : 'squircle'"
                size="md"
              />
            </div>
            <div v-else class="w-9 shrink-0" aria-hidden="true"></div>
          </template>

          <!-- Frosted Action Toolbar (Hover on Desktop, Tap/Focus on Touch) -->
          <div
            v-if="item.message.status === 'sent' && !item.message.deleted_at"
            class="absolute -top-3 z-20 flex opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto active:opacity-100 active:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-all duration-150 ease-out translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0 active:translate-y-0 focus-within:translate-y-0 items-center gap-0.5 bg-white/95 dark:bg-[#1a1d28]/95 backdrop-blur-xl border border-black/10 dark:border-white/15 rounded-full px-2 py-0.5 shadow-xl max-w-[calc(100%-0.5rem)] overflow-x-auto"
            :class="item.isSender ? 'right-0' : 'left-11 max-w-[calc(100%-2.75rem)]'"
          >
            <button
              v-for="emoji in REACTION_EMOJIS"
              :key="emoji"
              type="button"
              :data-test="`react-${item.message.id}-${emoji}`"
              class="p-1 text-xs hover:bg-black/5 dark:hover:bg-white/15 rounded-full transition-transform hover:scale-125 cursor-pointer"
              :title="`React ${emoji}`"
              @click="emit('toggleReaction', { messageId: item.message.id, emoji })"
            >
              {{ emoji }}
            </button>
            <button
              type="button"
              :data-test="`pin-${item.message.id}`"
              class="px-2 py-0.5 text-[11px] font-medium text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] rounded-full hover:bg-black/5 dark:hover:bg-white/15 cursor-pointer"
              :title="item.message.pinned_at ? 'Unpin' : 'Pin'"
              @click="emit('togglePin', item.message.id)"
            >
              {{ item.message.pinned_at ? 'Unpin' : 'Pin' }}
            </button>
            <button
              type="button"
              :data-test="`reply-${item.message.id}`"
              class="px-2 py-0.5 text-[11px] font-medium text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] rounded-full hover:bg-black/5 dark:hover:bg-white/15 cursor-pointer"
              @click="emit('reply', item.message)"
            >
              Reply
            </button>
            <template v-if="item.message.user_id === currentUserId">
              <button
                v-if="item.message.encryption !== 'undecryptable' && !item.imagePayload"
                type="button"
                :data-test="`edit-${item.message.id}`"
                class="px-2 py-0.5 text-[11px] font-medium text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] rounded-full hover:bg-black/5 dark:hover:bg-white/15 cursor-pointer"
                @click="startEdit(item.message)"
              >
                Edit
              </button>
              <button
                type="button"
                :data-test="`delete-${item.message.id}`"
                class="px-2 py-0.5 text-[11px] font-medium text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 rounded-full hover:bg-rose-500/10 dark:hover:bg-rose-500/20 cursor-pointer"
                @click="emit('delete', item.message.id)"
              >
                Delete
              </button>
            </template>
          </div>

          <!-- Message Column (Header + Bubble + Delivery States + Reactions) -->
          <div
            class="chat-message-column flex flex-col min-w-0 max-w-[85%] sm:max-w-[75%] md:max-w-[70%]"
            :class="item.isSender ? 'items-end' : 'items-start'"
          >
            <!-- Group Sender Header -->
            <div
              v-if="item.showSenderHeader"
              :data-test="`sender-header-${item.message.id}`"
              class="text-[12px] font-semibold mb-1 ml-1 truncate max-w-full cursor-pointer hover:underline transition"
              :style="{ color: item.message.author?.avatar_color || '#0284c7' }"
              @click="item.message.author && emit('viewProfile', item.message.author)"
            >
              {{ item.message.author?.display_name || 'Friend' }}
            </div>

            <!-- Bubble & External Timestamp Row -->
            <div
              class="flex items-end gap-1.5 max-w-full"
              :class="item.isSender ? 'flex-row justify-end' : 'flex-row justify-start'"
            >
              <!-- Time & Delivery Indicator for Sender (Outside, Left of bubble) -->
              <div
                v-if="item.isSender"
                class="flex items-center gap-1 text-[10.5px] font-mono text-[var(--ap-text-muted)] select-none shrink-0 mb-1"
              >
                <span>{{ formatTime(item.message.created_at) }}</span>
                <span
                  v-if="item.message.status === 'sending'"
                  :data-test="`delivery-indicator-${item.message.id}`"
                  class="inline-flex items-center gap-1 italic text-blue-500 dark:text-blue-400"
                >
                  <svg class="animate-spin h-2.5 w-2.5" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Sending...</span>
                </span>
                <span
                  v-else-if="item.message.status === 'sent'"
                  :data-test="`delivery-indicator-${item.message.id}`"
                  class="font-bold text-blue-500 dark:text-blue-400 tracking-tighter"
                  title="Sent"
                >
                  ✓✓
                </span>
              </div>

              <!-- Message Bubble Container -->
              <div
                :data-test="`message-bubble-${item.message.id}`"
                class="chat-message-bubble relative text-[13.5px] leading-relaxed break-words transition-all"
                :data-direction="item.isSender ? 'outgoing' : 'incoming'"
                :class="[
                  uiTheme === 'vscode'
                    ? 'px-1 py-0.5 text-xs text-[var(--ap-text-primary)] rounded-none shadow-none font-mono'
                    : (uiTheme === 'yahoo'
                        ? 'px-0 py-0 text-xs text-[var(--ap-text-primary)] rounded-none shadow-none font-sans inline'
                        : (item.isSender
                            ? 'px-4 py-2.5 bg-indigo-600 bg-gradient-to-br from-[#8b5cf6] via-[#7c3aed] to-[#6366f1] text-white rounded-[22px] rounded-br-[4px] shadow-md shadow-purple-600/25 border border-purple-400/20'
                            : 'px-4 py-2.5 bg-black/[0.04] dark:bg-white/8 hover:bg-black/[0.06] dark:hover:bg-white/10 backdrop-blur-md border border-black/[0.08] dark:border-purple-500/15 text-[var(--ap-text-primary)] rounded-[22px] rounded-bl-[4px] shadow-xs')),
                  item.message.status === 'sending' ? 'opacity-85' : '',
                  item.message.status === 'failed' ? 'border-rose-500/50' : '',
                  highlightedMessageId === item.message.id ? 'ring-2 ring-blue-500 ring-offset-2' : '',
                ]"
              >
              <!-- Quoted Reply Preview -->
              <div
                v-if="item.message.reply_to_id"
                :data-test="`reply-quote-${item.message.id}`"
                class="chat-reply-quote mb-2 px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 truncate max-w-full backdrop-blur-xs"
                :class="item.isSender ? 'bg-white/15 border-l-2 border-white/70 text-white/90' : 'bg-black/5 dark:bg-white/5 border-l-2 border-blue-500 dark:border-blue-400 text-[var(--ap-text-secondary)]'"
              >
                <span class="font-semibold shrink-0" :class="item.isSender ? 'text-white' : 'text-blue-600 dark:text-blue-300'">
                  @{{ item.message.reply_to?.author?.display_name || 'Friend' }}
                </span>
                <span class="truncate italic">
                  {{ item.message.reply_to?.deleted_at ? 'Original message was deleted' : (item.message.reply_to?.encryption === 'undecryptable' ? '🔒 Unable to decrypt this message' : (isImagePayload(item.message.reply_to?.content) ? formatImageMessageSummary(parseImagePayload(item.message.reply_to?.content)?.images.length || 1) : (parseStickerPayload(item.message.reply_to?.content) ? `[Sticker] ${parseStickerPayload(item.message.reply_to?.content)!.emoji} ${parseStickerPayload(item.message.reply_to?.content)!.label}` : (item.message.reply_to?.content || 'Message')))) }}
                </span>
              </div>

              <!-- Deleted Tombstone -->
              <p
                v-if="item.message.deleted_at"
                :data-test="`deleted-tombstone-${item.message.id}`"
                class="text-xs italic px-2.5 py-1 rounded-xl border border-dashed inline-block"
                :class="item.isSender ? 'bg-white/10 border-white/30 text-white/80' : 'bg-black/5 dark:bg-white/5 border-black/15 dark:border-white/15 text-[var(--ap-text-muted)]'"
              >
                This message was deleted
              </p>

              <!-- Undecryptable Placeholder -->
              <p
                v-else-if="item.message.encryption === 'undecryptable'"
                :data-test="`undecryptable-${item.message.id}`"
                class="text-xs italic px-2.5 py-1 rounded-xl border border-dashed inline-block"
                :class="item.isSender ? 'bg-white/10 border-white/30 text-white/80' : 'bg-black/5 dark:bg-white/5 border-black/15 dark:border-white/15 text-[var(--ap-text-muted)]'"
              >
                🔒 Unable to decrypt this message
              </p>

              <!-- Inline Edit Box -->
              <div v-else-if="editingMessageId === item.message.id" class="my-1 space-y-2 min-w-[200px]">
                <input
                  v-model="editingContent"
                  type="text"
                  :data-test="`edit-input-${item.message.id}`"
                  class="w-full px-3 py-1.5 text-xs rounded-xl border border-blue-400 bg-white/10 text-[var(--ap-text-primary)] focus:outline-none"
                  @keydown.enter.prevent="saveEdit(item.message.id)"
                  @keydown.esc.prevent="cancelEdit"
                />
                <div class="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    :data-test="`save-edit-${item.message.id}`"
                    class="px-3 py-1 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold cursor-pointer shadow-xs"
                    @click="saveEdit(item.message.id)"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    :data-test="`cancel-edit-${item.message.id}`"
                    class="px-3 py-1 rounded-full cursor-pointer text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10"
                    @click="cancelEdit"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <!-- Image Grid -->
              <div
                v-else-if="item.imagePayload"
                class="flex flex-col gap-2"
              >
                <MessageImageGrid
                  :images="item.imagePayload.images"
                  :channel-id="effectiveConversationId"
                  :is-sending="item.message.status === 'sending'"
                  @select-image="emit('selectImage', $event)"
                />
                <div
                  v-if="item.imagePayload.caption"
                  data-test="image-caption"
                  class="whitespace-pre-wrap break-words text-[14px]"
                  :class="item.isSender ? 'text-white' : 'text-[var(--ap-text-primary)]'"
                >
                  <template
                    v-for="(seg, sIdx) in (item.captionMentionSegments || tokenizeMessageMentions(item.imagePayload.caption, currentDisplayName, memberDisplayNames))"
                    :key="sIdx"
                  >
                    <span
                      v-if="seg.isMention"
                      data-test="mention-token"
                      class="px-1.5 py-0.5 rounded-md text-[13px] font-semibold"
                      :class="[
                        item.isSender
                          ? 'bg-white/20 text-white border border-white/30'
                          : (seg.isMe
                              ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/35'
                              : 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border border-blue-500/30')
                      ]"
                    >
                      <span v-if="seg.isMe" data-test="mention-self">{{ seg.text }}</span>
                      <template v-else>{{ seg.text }}</template>
                    </span>
                    <a
                      v-else-if="seg.isLink"
                      :href="seg.href"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-test="link-token"
                      class="underline underline-offset-2 hover:opacity-85 transition-opacity font-medium break-all"
                      :class="item.isSender ? 'text-white' : 'text-blue-600 dark:text-blue-400'"
                      @click.stop
                    >{{ seg.text }}</a>
                    <code
                      v-else-if="seg.isCode"
                      data-test="code-token"
                      class="px-1.5 py-0.5 rounded font-mono text-[12px] border"
                      :class="item.isSender
                        ? 'bg-white/20 border-white/30 text-white'
                        : 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 text-pink-600 dark:text-pink-400'"
                    >{{ seg.text }}</code>
                    <template v-else>
                      <template v-if="searchQuery">
                        <template v-for="(chunk, cIdx) in highlightTextSegments(seg.text, searchQuery)" :key="cIdx">
                          <mark
                            v-if="chunk.isMatch"
                            class="bg-amber-400/40 dark:bg-amber-400/50 text-inherit rounded-xs px-0.5"
                          >{{ chunk.text }}</mark>
                          <span v-else>{{ chunk.text }}</span>
                        </template>
                      </template>
                      <span v-else>{{ seg.text }}</span>
                    </template>
                  </template>
                </div>
              </div>

              <!-- Xcode Dark Code Block -->
              <div
                v-else-if="parseCodeBlock(item.message.content).isCode"
                class="rounded-xl bg-black/80 dark:bg-black/40 border border-black/20 dark:border-white/10 overflow-hidden font-mono text-xs my-1"
              >
                <div class="px-3 py-1.5 bg-white/5 border-b border-white/5 flex items-center justify-between text-white/50 text-[11px]">
                  <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></span>
                    <span class="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></span>
                    <span class="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></span>
                    <span class="ml-1 text-white/70 font-mono">{{ parseCodeBlock(item.message.content).language || 'Code' }}</span>
                  </div>
                  <button
                    type="button"
                    class="hover:text-white transition-colors cursor-pointer text-[10px]"
                    @click="copyCode(parseCodeBlock(item.message.content).code, item.message.id)"
                  >
                    {{ copiedCodeMessageId === item.message.id ? 'Copied!' : 'Copy' }}
                  </button>
                </div>
                <pre class="p-3 overflow-x-auto text-white/90 leading-relaxed font-mono text-[12px]">{{ parseCodeBlock(item.message.content).code }}</pre>
              </div>

              <!-- Expressive Chaos Sticker Message -->
              <div
                v-else-if="parseStickerPayload(item.message.content)"
                data-test="sticker-bubble"
                class="flex flex-col items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 via-pink-500/15 to-indigo-500/20 border border-purple-500/35 shadow-md shadow-purple-500/10 animate-chaos-pop my-1 min-w-[120px] select-none text-center"
              >
                <span class="text-4xl animate-bounce mb-1">{{ parseStickerPayload(item.message.content)!.emoji }}</span>
                <span class="text-xs font-bold tracking-tight text-[var(--ap-text-primary)]">{{ parseStickerPayload(item.message.content)!.label }}</span>
                <span class="text-[9.5px] font-mono px-2 py-0.2 rounded-full bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-500/30 mt-1 font-semibold">Sticker</span>
              </div>

              <!-- Standard Text Message Content -->
              <div v-else class="whitespace-pre-wrap break-words">
                <template
                  v-for="(seg, sIdx) in (item.mentionSegments || tokenizeMessageMentions(item.message.content, currentDisplayName, memberDisplayNames))"
                  :key="sIdx"
                >
                  <span
                    v-if="seg.isMention"
                    data-test="mention-token"
                    class="px-1.5 py-0.5 rounded-md text-[13px] font-semibold"
                    :class="[
                      item.isSender
                        ? 'bg-white/20 text-white border border-white/30'
                        : (seg.isMe
                            ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/35'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border border-blue-500/30')
                    ]"
                  >
                    <span v-if="seg.isMe" data-test="mention-self">{{ seg.text }}</span>
                    <template v-else>{{ seg.text }}</template>
                  </span>
                  <a
                    v-else-if="seg.isLink"
                    :href="seg.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-test="link-token"
                    class="underline underline-offset-2 hover:opacity-85 transition-opacity font-medium break-all"
                    :class="item.isSender ? 'text-white' : 'text-blue-600 dark:text-blue-400'"
                    @click.stop
                  >{{ seg.text }}</a>
                  <code
                    v-else-if="seg.isCode"
                    data-test="code-token"
                    class="px-1.5 py-0.5 rounded font-mono text-[12px] border"
                    :class="item.isSender
                      ? 'bg-white/20 border-white/30 text-white'
                      : 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 text-pink-600 dark:text-pink-400'"
                  >{{ seg.text }}</code>
                  <template v-else>
                    <template v-if="searchQuery">
                      <template v-for="(chunk, cIdx) in highlightTextSegments(seg.text, searchQuery)" :key="cIdx">
                        <mark
                          v-if="chunk.isMatch"
                          class="bg-amber-400/40 dark:bg-amber-400/50 text-inherit rounded-xs px-0.5"
                        >{{ chunk.text }}</mark>
                        <span v-else>{{ chunk.text }}</span>
                      </template>
                    </template>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </template>
                <span
                  v-if="item.message.edited_at && !item.message.deleted_at"
                  :data-test="`edited-badge-${item.message.id}`"
                  class="ml-1 text-[11px] italic"
                  :class="item.isSender ? 'text-white/75' : 'text-[var(--ap-text-muted)]'"
                >
                  (edited)
                </span>
                <span
                  v-if="item.message.encryption === 'legacy' && !item.message.deleted_at"
                  :data-test="`legacy-badge-${item.message.id}`"
                  class="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full"
                  :class="item.isSender ? 'text-white/80 bg-white/15 border border-white/25' : 'text-[var(--ap-text-muted)] bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10'"
                >
                  Legacy · unencrypted
                </span>
              </div>

            </div>

              <!-- Time for Recipient (Outside, Right of bubble) -->
              <div
                v-if="!item.isSender"
                class="text-[10.5px] font-mono text-[var(--ap-text-muted)] select-none shrink-0 mb-1"
              >
                {{ formatTime(item.message.created_at) }}
              </div>
            </div>

            <!-- Failed Delivery / Retry Actions below bubble -->
            <div
              v-if="item.message.status === 'failed'"
              :data-test="`delivery-indicator-${item.message.id}`"
              class="mt-1.5 flex items-center gap-1.5 text-xs text-rose-500 dark:text-rose-400 font-medium px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 backdrop-blur-md"
            >
              <span>Failed to send</span>
              <button
                type="button"
                :data-test="`retry-${item.message.client_id}`"
                class="underline hover:text-rose-600 dark:hover:text-rose-300 font-semibold cursor-pointer ml-1"
                @click="emit('retry', item.message.client_id)"
              >
                Retry
              </button>
              <button
                type="button"
                :data-test="`dismiss-${item.message.client_id}`"
                class="underline hover:text-rose-600 dark:hover:text-rose-300 cursor-pointer ml-1 text-[var(--ap-text-muted)]"
                @click="emit('dismiss', item.message.client_id)"
              >
                Dismiss
              </button>
            </div>

            <!-- Reaction Pills -->
            <div
              v-if="!item.message.deleted_at && summarizeReactions(item.message.reactions, currentUserId).length > 0"
              class="mt-1 flex items-center flex-wrap gap-1.5"
              :class="item.isSender ? 'justify-end' : 'justify-start'"
            >
              <button
                v-for="summary in summarizeReactions(item.message.reactions, currentUserId)"
                :key="summary.emoji"
                type="button"
                :data-test="`reaction-pill-${item.message.id}-${summary.emoji}`"
                :title="`${summary.emoji} reacted by ${formatReactionAuthors(summary.userIds, members, currentUserId)}`"
                class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono border transition-all cursor-pointer shadow-xs backdrop-blur-md"
                :class="summary.reactedByMe ? 'bg-blue-500/20 border-blue-400/50 text-blue-700 dark:text-blue-200 font-semibold' : 'bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border-black/10 dark:border-white/10 text-[var(--ap-text-primary)]'"
                @click="emit('toggleReaction', { messageId: item.message.id, emoji: summary.emoji })"
              >
                <span>{{ summary.emoji }}</span>
                <span>{{ summary.count }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Seen By Badges -->
        <div
          v-if="seenByMap[item.message.id]?.length"
          :data-test="`seen-by-${item.message.id}`"
          class="flex items-center gap-1 mt-0.5 mb-1"
          :class="item.isSender ? 'justify-end pr-1' : 'justify-start pl-11'"
          :title="`Seen by ${seenByMap[item.message.id].map(p => p.display_name).join(', ')}`"
        >
          <div
            v-for="peer in seenByMap[item.message.id]"
            :key="peer.id"
            class="transition-transform hover:scale-110 cursor-pointer"
            :title="`Seen by ${peer.display_name}`"
            @click="emit('viewProfile', peer)"
          >
            <UserAvatar
              :display-name="peer.display_name"
              :avatar-color="peer.avatar_color"
              :avatar-url="peer.avatar_url"
              size="xs"
              shape="circle"
              class="ring-1 ring-black/10 dark:ring-white/20 shadow-xs"
            />
          </div>
        </div>
      </template>
    </div>

      <!-- Floating "Scroll to Bottom" Button / Pill -->
      <button
        v-if="!isNearBottom"
        type="button"
        data-test="scroll-to-bottom"
        class="absolute bottom-3 right-6 z-10 transition-all cursor-pointer backdrop-blur-md shadow-lg"
        :class="unreadNewCount > 0
          ? 'px-3.5 py-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold shadow-md shadow-blue-500/30 hover:scale-105 active:scale-95 flex items-center gap-1.5'
          : 'w-9 h-9 rounded-full bg-white/80 dark:bg-[#1a1d28]/90 hover:bg-white dark:hover:bg-[#1a1d28] border border-black/10 dark:border-white/10 text-[var(--ap-text-primary)] flex items-center justify-center shadow-black/10 hover:scale-105 active:scale-95'"
        :aria-label="unreadNewCount > 0 ? `${unreadNewCount} new messages` : 'Scroll to bottom'"
        @click="scrollToBottom(true)"
      >
        <span v-if="unreadNewCount > 0">↓ {{ unreadNewCount }} new message{{ unreadNewCount > 1 ? 's' : '' }}</span>
        <ChevronDown v-else class="w-4 h-4 text-[var(--ap-text-secondary)]" />
      </button>
    </div>

    <slot />
  </div>
</template>
