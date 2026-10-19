<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import { buildMessageTimeline, REACTION_EMOJIS, summarizeReactions, tokenizeMessageMentions } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    channelId?: string | null
    isDm?: boolean
    peerName?: string
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    currentUserId?: string
    currentDisplayName?: string
    lastReadAt?: string | null
    loadOlder: () => Promise<number>
  }>(),
  {
    channelId: null,
    isDm: false,
    peerName: '',
    hasMoreHistory: false,
    isLoadingHistory: false,
    currentUserId: '',
    currentDisplayName: '',
    lastReadAt: null,
  },
)

const emit = defineEmits<{
  (e: 'retry', clientId: string): void
  (e: 'dismiss', clientId: string): void
  (e: 'reply', message: ChatMessage): void
  (e: 'edit', payload: { messageId: string; content: string }): void
  (e: 'delete', messageId: string): void
  (e: 'toggleReaction', payload: { messageId: string; emoji: string }): void
}>()

const viewportRef = ref<HTMLDivElement | null>(null)
const unreadNewCount = ref(0)
const isNearBottom = ref(true)

const editingMessageId = ref<string | null>(null)
const editingContent = ref('')

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

const timelineItems = computed(() =>
  buildMessageTimeline(props.messages, new Date(), {
    lastReadAt: props.lastReadAt,
    currentUserId: props.currentUserId,
    currentDisplayName: props.currentDisplayName,
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

function scrollToBottom(smooth = false) {
  nextTick(() => {
    const el = viewportRef.value
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    })
    unreadNewCount.value = 0
    isNearBottom.value = true
  })
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
  () => props.channelId,
  () => {
    unreadNewCount.value = 0
    isNearBottom.value = true
    const newest = props.messages[props.messages.length - 1]
    prevNewestId.value = newest ? (newest.client_id || newest.id) : null
    scrollToBottom(false)
  },
)

onMounted(() => {
  scrollToBottom(false)
})
</script>

<template>
  <div class="relative flex-1 flex flex-col min-h-0 bg-transparent">
    <!-- Messages Scroll Container -->
    <div
      ref="viewportRef"
      class="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-2.5"
      @scroll="handleScroll"
    >
      <!-- History Loader -->
      <div v-if="hasMoreHistory" class="text-center py-2">
        <button
          type="button"
          :disabled="isLoadingHistory"
          class="px-3.5 py-1.5 text-xs font-semibold text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] bg-[var(--fp-stage-subtle)] rounded-full border border-[var(--fp-border)] shadow-[var(--fp-specular)] hover:bg-[var(--fp-hover)] disabled:opacity-50 transition-colors cursor-pointer"
          @click="handleLoadOlder"
        >
          <span v-if="isLoadingHistory">Loading older messages...</span>
          <span v-else>↑ Load older messages</span>
        </button>
      </div>

      <!-- Empty Channel / DM Placeholder -->
      <div v-if="messages.length === 0" data-test="empty-channel-placeholder" class="h-full flex flex-col items-center justify-center text-center py-16">
        <div class="fp-font-display w-12 h-12 rounded-[14px] bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-[var(--fp-accent-bright)] mb-3.5 text-xl font-extrabold shadow-[var(--fp-specular)]">
          {{ isDm ? '@' : '#' }}
        </div>
        <p class="fp-font-display text-[15px] text-[var(--fp-text-primary)] font-semibold">
          {{ isDm ? `This is the start of your direct message history with ${peerName ? '@' + peerName : 'your friend'}` : 'This is the start of this channel' }}
        </p>
        <p class="text-xs text-[var(--fp-text-secondary)] mt-1">Send a message below to start the conversation!</p>
      </div>

      <!-- Messages List -->
      <template
        v-for="item in timelineItems"
        :key="item.message.client_id || item.message.id"
      >
        <!-- Date Divider -->
        <div
          v-if="item.showDateDivider"
          data-test="date-divider"
          class="flex items-center gap-3 my-3.5"
        >
          <div class="flex-1 h-px bg-[var(--fp-border)]"></div>
          <span class="px-3 py-0.5 rounded-full text-[11px] font-semibold text-[var(--fp-text-secondary)] bg-[var(--fp-stage-subtle)] border border-[var(--fp-border)]">
            {{ item.dateLabel }}
          </span>
          <div class="flex-1 h-px bg-[var(--fp-border)]"></div>
        </div>

        <!-- Unread Messages Divider -->
        <div
          v-if="item.showUnreadDivider"
          data-test="unread-divider"
          class="flex items-center gap-3 my-3"
        >
          <div class="flex-1 h-px bg-rose-500/50"></div>
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide text-rose-600 dark:text-rose-300 bg-rose-500/15 border border-rose-500/35">
            New messages
          </span>
          <div class="flex-1 h-px bg-rose-500/50"></div>
        </div>

        <!-- Compact Message Row (same author within 5m on same day) -->
        <div
          v-if="item.isCompact"
          :data-test="item.isMentioningMe ? `mention-row-${item.message.id}` : 'compact-message'"
          class="relative flex items-start gap-3 group -mt-1.5 py-1 hover:bg-[var(--fp-hover)] rounded-[10px] px-2.5 -mx-1.5 transition-colors"
          :class="item.isMentioningMe ? 'bg-amber-500/10 border-l-2 border-amber-500 pl-3' : ''"
        >
          <div class="w-9 shrink-0 text-right pr-1 select-none pt-0.5">
            <span class="text-[11px] text-[var(--fp-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
              {{ formatTime(item.message.created_at) }}
            </span>
          </div>

          <div class="flex-1 min-w-0">
            <!-- Deleted Tombstone -->
            <p
              v-if="item.message.deleted_at"
              :data-test="`deleted-tombstone-${item.message.id}`"
              class="text-xs italic text-[var(--fp-text-muted)] px-2.5 py-1 rounded-md bg-[var(--fp-hover)] border border-dashed border-[var(--fp-border)] inline-block mt-0.5"
            >
              This message was deleted
            </p>

            <!-- Undecryptable Placeholder -->
            <p
              v-else-if="item.message.encryption === 'undecryptable'"
              :data-test="`undecryptable-${item.message.id}`"
              class="text-xs italic text-[var(--fp-text-muted)] px-2.5 py-1 rounded-md bg-[var(--fp-hover)] border border-dashed border-[var(--fp-border)] inline-block mt-0.5"
            >
              🔒 Unable to decrypt this message
            </p>

            <!-- Inline Edit Box -->
            <div v-else-if="editingMessageId === item.message.id" class="mt-1 space-y-2">
              <input
                v-model="editingContent"
                type="text"
                :data-test="`edit-input-${item.message.id}`"
                class="w-full px-3 py-1.5 text-sm rounded-lg border border-indigo-500 bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] focus:outline-none"
                @keydown.enter.prevent="saveEdit(item.message.id)"
                @keydown.esc.prevent="cancelEdit"
              />
              <div class="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  :data-test="`save-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded-md fp-btn-primary font-semibold cursor-pointer"
                  @click="saveEdit(item.message.id)"
                >
                  Save
                </button>
                <button
                  type="button"
                  :data-test="`cancel-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] cursor-pointer"
                  @click="cancelEdit"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Message content + edited badge -->
            <div
              v-else
              class="text-[14.5px] text-[var(--fp-text-primary)] whitespace-pre-wrap break-words leading-[1.52]"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              <template
                v-for="(seg, sIdx) in tokenizeMessageMentions(item.message.content, currentDisplayName)"
                :key="sIdx"
              >
                <span
                  v-if="seg.isMention"
                  data-test="mention-token"
                  class="px-1.5 py-0.5 rounded-[5px] text-[13.5px] font-semibold"
                  :class="seg.isMe ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-indigo-500/18 text-[var(--fp-accent-bright)] border border-indigo-500/30'"
                >{{ seg.text }}</span>
                <span v-else>{{ seg.text }}</span>
              </template>
              <span
                v-if="item.message.edited_at && !item.message.deleted_at"
                :data-test="`edited-badge-${item.message.id}`"
                class="ml-1 text-[11px] text-[var(--fp-text-muted)] italic"
              >
                (edited)
              </span>
              <span
                v-if="item.message.encryption === 'legacy' && !item.message.deleted_at"
                :data-test="`legacy-badge-${item.message.id}`"
                class="ml-1.5 text-[11px] px-1.5 py-0.5 rounded text-[var(--fp-text-muted)] bg-[var(--fp-hover)] border border-[var(--fp-border)]"
              >
                Legacy · unencrypted
              </span>
            </div>

            <div v-if="item.message.status !== 'sent'" class="mt-1 flex items-center gap-2">
              <span
                v-if="item.message.status === 'sending'"
                class="text-xs text-[var(--fp-text-secondary)] italic"
              >
                Sending...
              </span>
              <span
                v-else-if="item.message.status === 'failed'"
                class="text-xs text-rose-500 font-medium inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/25"
              >
                Failed to send
                <button
                  type="button"
                  :data-test="`retry-${item.message.client_id}`"
                  class="underline hover:text-rose-400 font-semibold cursor-pointer ml-1"
                  @click="emit('retry', item.message.client_id)"
                >
                  Retry
                </button>
                <button
                  type="button"
                  :data-test="`dismiss-${item.message.client_id}`"
                  class="underline hover:text-rose-400 cursor-pointer ml-1 text-[var(--fp-text-secondary)]"
                  @click="emit('dismiss', item.message.client_id)"
                >
                  Dismiss
                </button>
              </span>
            </div>

            <!-- Reaction Pills -->
            <div
              v-if="!item.message.deleted_at && summarizeReactions(item.message.reactions, currentUserId).length > 0"
              class="mt-1.5 flex items-center flex-wrap gap-1.5"
            >
              <button
                v-for="summary in summarizeReactions(item.message.reactions, currentUserId)"
                :key="summary.emoji"
                type="button"
                :data-test="`reaction-pill-${item.message.id}-${summary.emoji}`"
                class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-all cursor-pointer"
                :class="summary.reactedByMe ? 'bg-indigo-500/20 border-indigo-500/50 text-[var(--fp-text-primary)] font-semibold' : 'bg-[var(--fp-hover)] border-[var(--fp-border)] text-[var(--fp-text-secondary)] hover:border-[var(--fp-border-strong)] hover:text-[var(--fp-text-primary)]'"
                @click="emit('toggleReaction', { messageId: item.message.id, emoji: summary.emoji })"
              >
                <span>{{ summary.emoji }}</span>
                <span>{{ summary.count }}</span>
              </button>
            </div>
          </div>

          <!-- Hover Action Toolbar -->
          <div
            v-if="item.message.status === 'sent' && !item.message.deleted_at"
            class="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-[var(--fp-surface-elevated)] border border-[var(--fp-border)] rounded-[8px] px-1.5 py-0.5 shadow-lg shrink-0 self-start"
          >
            <button
              v-for="emoji in REACTION_EMOJIS"
              :key="emoji"
              type="button"
              :data-test="`react-${item.message.id}-${emoji}`"
              class="p-1 text-xs hover:bg-[var(--fp-hover)] rounded transition-transform hover:scale-110 cursor-pointer"
              :title="`React ${emoji}`"
              @click="emit('toggleReaction', { messageId: item.message.id, emoji })"
            >
              {{ emoji }}
            </button>
            <button
              type="button"
              :data-test="`reply-${item.message.id}`"
              class="px-1.5 py-0.5 text-[11px] font-medium text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] rounded hover:bg-[var(--fp-hover)] cursor-pointer"
              @click="emit('reply', item.message)"
            >
              Reply
            </button>
            <template v-if="item.message.user_id === currentUserId">
              <button
                v-if="item.message.encryption !== 'undecryptable'"
                type="button"
                :data-test="`edit-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] rounded hover:bg-[var(--fp-hover)] cursor-pointer"
                @click="startEdit(item.message)"
              >
                Edit
              </button>
              <button
                type="button"
                :data-test="`delete-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-rose-500 hover:text-rose-400 rounded hover:bg-rose-500/10 cursor-pointer"
                @click="emit('delete', item.message.id)"
              >
                Delete
              </button>
            </template>
          </div>
        </div>

        <!-- Full Message Row -->
        <div
          v-else
          :data-test="item.isMentioningMe ? `mention-row-${item.message.id}` : 'full-message'"
          class="relative flex items-start gap-3 group hover:bg-[var(--fp-hover)] rounded-[10px] px-2.5 py-2 -mx-1.5 transition-colors"
          :class="item.isMentioningMe ? 'bg-amber-500/10 border-l-2 border-amber-500 pl-3' : ''"
        >
          <UserAvatar
            :display-name="item.message.author?.display_name || 'Friend'"
            :avatar-color="item.message.author?.avatar_color"
            :avatar-url="item.message.author?.avatar_url"
            size="md"
          />

          <div class="flex-1 min-w-0">
            <!-- Quoted Reply Preview -->
            <div
              v-if="item.message.reply_to_id"
              :data-test="`reply-quote-${item.message.id}`"
              class="mb-1.5 px-2.5 py-1 rounded-r-md bg-indigo-500/10 border-l-2 border-indigo-500 text-xs text-[var(--fp-text-secondary)] flex items-center gap-1.5 truncate"
            >
              <span class="font-semibold text-[var(--fp-accent-bright)]">
                @{{ item.message.reply_to?.author?.display_name || 'Friend' }}
              </span>
              <span class="truncate italic">
                {{ item.message.reply_to?.deleted_at ? 'Original message was deleted' : (item.message.reply_to?.encryption === 'undecryptable' ? '🔒 Unable to decrypt this message' : (item.message.reply_to?.content || 'Message')) }}
              </span>
            </div>

            <div class="flex items-baseline gap-2">
              <span class="fp-font-display text-[14px] font-semibold text-[var(--fp-text-primary)]">
                {{ item.message.author?.display_name || 'Friend' }}
              </span>
              <span class="text-xs text-[var(--fp-text-secondary)]">
                {{ formatTime(item.message.created_at) }}
              </span>
              <span
                v-if="item.message.encryption === 'legacy' && !item.message.deleted_at"
                :data-test="`legacy-badge-${item.message.id}`"
                class="text-[11px] px-1.5 py-0.5 rounded text-[var(--fp-text-muted)] bg-[var(--fp-hover)] border border-[var(--fp-border)]"
              >
                Legacy · unencrypted
              </span>

              <span
                v-if="item.message.status === 'sending'"
                class="text-xs text-[var(--fp-text-secondary)] italic flex items-center gap-1"
              >
                Sending...
              </span>

              <span
                v-else-if="item.message.status === 'failed'"
                class="text-xs text-rose-500 font-medium inline-flex items-center gap-2 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/25"
              >
                Failed to send
                <button
                  type="button"
                  :data-test="`retry-${item.message.client_id}`"
                  class="underline hover:text-rose-400 font-semibold cursor-pointer ml-1"
                  @click="emit('retry', item.message.client_id)"
                >
                  Retry
                </button>
                <button
                  type="button"
                  :data-test="`dismiss-${item.message.client_id}`"
                  class="underline hover:text-rose-400 cursor-pointer ml-1 text-[var(--fp-text-secondary)]"
                  @click="emit('dismiss', item.message.client_id)"
                >
                  Dismiss
                </button>
              </span>
            </div>

            <!-- Deleted Tombstone -->
            <p
              v-if="item.message.deleted_at"
              :data-test="`deleted-tombstone-${item.message.id}`"
              class="text-xs italic text-[var(--fp-text-muted)] px-2.5 py-1 rounded-md bg-[var(--fp-hover)] border border-dashed border-[var(--fp-border)] inline-block mt-1"
            >
              This message was deleted
            </p>

            <!-- Undecryptable Placeholder -->
            <p
              v-else-if="item.message.encryption === 'undecryptable'"
              :data-test="`undecryptable-${item.message.id}`"
              class="text-xs italic text-[var(--fp-text-muted)] px-2.5 py-1 rounded-md bg-[var(--fp-hover)] border border-dashed border-[var(--fp-border)] inline-block mt-1"
            >
              🔒 Unable to decrypt this message
            </p>

            <!-- Inline Edit Box -->
            <div v-else-if="editingMessageId === item.message.id" class="mt-1.5 space-y-2">
              <input
                v-model="editingContent"
                type="text"
                :data-test="`edit-input-${item.message.id}`"
                class="w-full px-3 py-1.5 text-sm rounded-lg border border-indigo-500 bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] focus:outline-none"
                @keydown.enter.prevent="saveEdit(item.message.id)"
                @keydown.esc.prevent="cancelEdit"
              />
              <div class="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  :data-test="`save-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded-md fp-btn-primary font-semibold cursor-pointer"
                  @click="saveEdit(item.message.id)"
                >
                  Save
                </button>
                <button
                  type="button"
                  :data-test="`cancel-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] cursor-pointer"
                  @click="cancelEdit"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Message content + edited badge -->
            <div
              v-else
              class="text-[14.5px] text-[var(--fp-text-primary)] mt-0.5 whitespace-pre-wrap break-words leading-[1.52]"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              <template
                v-for="(seg, sIdx) in tokenizeMessageMentions(item.message.content, currentDisplayName)"
                :key="sIdx"
              >
                <span
                  v-if="seg.isMention"
                  data-test="mention-token"
                  class="px-1.5 py-0.5 rounded-[5px] text-[13.5px] font-semibold"
                  :class="seg.isMe ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30' : 'bg-indigo-500/18 text-[var(--fp-accent-bright)] border border-indigo-500/30'"
                >{{ seg.text }}</span>
                <span v-else>{{ seg.text }}</span>
              </template>
              <span
                v-if="item.message.edited_at && !item.message.deleted_at"
                :data-test="`edited-badge-${item.message.id}`"
                class="ml-1 text-[11px] text-[var(--fp-text-muted)] italic"
              >
                (edited)
              </span>
            </div>

            <!-- Reaction Pills -->
            <div
              v-if="!item.message.deleted_at && summarizeReactions(item.message.reactions, currentUserId).length > 0"
              class="mt-1.5 flex items-center flex-wrap gap-1.5"
            >
              <button
                v-for="summary in summarizeReactions(item.message.reactions, currentUserId)"
                :key="summary.emoji"
                type="button"
                :data-test="`reaction-pill-${item.message.id}-${summary.emoji}`"
                class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-all cursor-pointer"
                :class="summary.reactedByMe ? 'bg-indigo-500/20 border-indigo-500/50 text-[var(--fp-text-primary)] font-semibold' : 'bg-[var(--fp-hover)] border-[var(--fp-border)] text-[var(--fp-text-secondary)] hover:border-[var(--fp-border-strong)] hover:text-[var(--fp-text-primary)]'"
                @click="emit('toggleReaction', { messageId: item.message.id, emoji: summary.emoji })"
              >
                <span>{{ summary.emoji }}</span>
                <span>{{ summary.count }}</span>
              </button>
            </div>
          </div>

          <!-- Hover Action Toolbar -->
          <div
            v-if="item.message.status === 'sent' && !item.message.deleted_at"
            class="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-[var(--fp-surface-elevated)] border border-[var(--fp-border)] rounded-[8px] px-1.5 py-0.5 shadow-lg shrink-0 self-start"
          >
            <button
              v-for="emoji in REACTION_EMOJIS"
              :key="emoji"
              type="button"
              :data-test="`react-${item.message.id}-${emoji}`"
              class="p-1 text-xs hover:bg-[var(--fp-hover)] rounded transition-transform hover:scale-110 cursor-pointer"
              :title="`React ${emoji}`"
              @click="emit('toggleReaction', { messageId: item.message.id, emoji })"
            >
              {{ emoji }}
            </button>
            <button
              type="button"
              :data-test="`reply-${item.message.id}`"
              class="px-1.5 py-0.5 text-[11px] font-medium text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] rounded hover:bg-[var(--fp-hover)] cursor-pointer"
              @click="emit('reply', item.message)"
            >
              Reply
            </button>
            <template v-if="item.message.user_id === currentUserId">
              <button
                v-if="item.message.encryption !== 'undecryptable'"
                type="button"
                :data-test="`edit-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] rounded hover:bg-[var(--fp-hover)] cursor-pointer"
                @click="startEdit(item.message)"
              >
                Edit
              </button>
              <button
                type="button"
                :data-test="`delete-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-rose-500 hover:text-rose-400 rounded hover:bg-rose-500/10 cursor-pointer"
                @click="emit('delete', item.message.id)"
              >
                Delete
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- Floating "New Messages" Pill -->
    <button
      v-if="unreadNewCount > 0"
      type="button"
      class="absolute bottom-3 right-6 z-10 px-4 py-1.5 rounded-full fp-btn-primary text-xs font-semibold shadow-lg transition-transform animate-bounce flex items-center gap-1.5 cursor-pointer"
      @click="scrollToBottom(true)"
    >
      <span>↓ {{ unreadNewCount }} new message{{ unreadNewCount > 1 ? 's' : '' }}</span>
    </button>
  </div>
</template>
