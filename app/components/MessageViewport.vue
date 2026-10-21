<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage, EncryptedImageMetadata } from '~/types/chat'
import { buildMessageTimeline, REACTION_EMOJIS, summarizeReactions, tokenizeMessageMentions } from '~/utils/chat'
import { isImagePayload, parseImagePayload, formatImageMessageSummary } from '~/utils/image'
import UserAvatar from '~/components/UserAvatar.vue'
import MessageActionsMenu from '~/components/MessageActionsMenu.vue'
import MessageImageGrid from '~/components/MessageImageGrid.vue'

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

const effectiveConversationId = computed(() => props.conversationId ?? props.channelId ?? null)

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
  effectiveConversationId,
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
      class="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-1"
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
          {{ !isGroupComputed ? '@' : '#' }}
        </div>
        <p class="fp-font-display text-[15px] text-[var(--fp-text-primary)] font-semibold">
          {{ !isGroupComputed ? `This is the start of your direct message history with ${peerName ? '@' + peerName : 'your friend'}` : 'This is the start of this channel' }}
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

        <!-- Message Row (Flex Container) -->
        <div
          :id="`message-${item.message.id}`"
          :data-message-id="item.message.id"
          :data-test="item.isMentioningMe ? `mention-row-${item.message.id}` : (item.isCompact ? 'compact-message' : 'full-message')"
          class="relative flex w-full group py-0.5 transition-colors"
          :class="[
            item.isSender ? 'justify-end' : 'justify-start items-end gap-2',
            item.isMentioningMe ? 'bg-amber-500/10 border-l-2 border-amber-500 pl-2 rounded-lg' : '',
            item.isFirstInGroup && !item.showDateDivider && !item.showUnreadDivider ? 'mt-2' : 'mt-0.5',
          ]"
        >
          <!-- Recipient Avatar (rendered at the bottom of the cluster, or spacer to preserve alignment) -->
          <template v-if="!item.isSender">
            <div v-if="item.isLastInGroup" class="shrink-0 mb-0.5">
              <UserAvatar
                :display-name="item.message.author?.display_name || 'Friend'"
                :avatar-color="item.message.author?.avatar_color"
                :avatar-url="item.message.author?.avatar_url"
                size="md"
              />
            </div>
            <div v-else class="w-9 shrink-0" aria-hidden="true"></div>
          </template>

          <!-- Hover Action Toolbar (Desktop) -->
          <div
            v-if="item.message.status === 'sent' && !item.message.deleted_at"
            class="hidden md:flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity items-center gap-0.5 bg-[var(--fp-surface-elevated)] border border-[var(--fp-border)] rounded-[8px] px-1.5 py-0.5 shadow-lg shrink-0 self-center"
            :class="item.isSender ? 'order-first mr-1.5' : 'order-last ml-1.5'"
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
                v-if="item.message.encryption !== 'undecryptable' && !isImagePayload(item.message.content)"
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

          <!-- Mobile Actions Dropdown Menu -->
          <MessageActionsMenu
            v-if="item.message.status === 'sent' && !item.message.deleted_at"
            :message="item.message"
            :current-user-id="currentUserId"
            :class="item.isSender ? 'order-first mr-1.5' : 'order-last ml-1.5'"
            @toggle-reaction="emit('toggleReaction', $event)"
            @reply="emit('reply', $event)"
            @edit="startEdit"
            @delete="emit('delete', $event)"
          />

          <!-- Message Column (Header + Bubble + Delivery States + Reactions) -->
          <div
            class="flex flex-col min-w-0 max-w-[85%] sm:max-w-[75%] md:max-w-[70%]"
            :class="item.isSender ? 'items-end' : 'items-start'"
          >
            <!-- Group Sender Header -->
            <div
              v-if="item.showSenderHeader"
              :data-test="`sender-header-${item.message.id}`"
              class="text-[12px] font-semibold mb-1 ml-1 truncate max-w-full"
              :style="{ color: item.message.author?.avatar_color || 'var(--fp-accent-bright)' }"
            >
              {{ item.message.author?.display_name || 'Friend' }}
            </div>

            <!-- Bubble Container -->
            <div
              :data-test="`message-bubble-${item.message.id}`"
              class="relative px-3.5 py-2 text-[14.5px] leading-[1.45] shadow-sm break-words"
              :class="[
                item.isSender
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl rounded-br-sm'
                  : 'bg-[var(--fp-surface-elevated)] border border-[var(--fp-border)] text-[var(--fp-text-primary)] rounded-2xl rounded-bl-sm',
                item.message.status === 'sending' ? 'opacity-85' : '',
                item.message.status === 'failed' ? 'border-rose-500/50' : '',
              ]"
            >
              <!-- Quoted Reply Preview -->
              <div
                v-if="item.message.reply_to_id"
                :data-test="`reply-quote-${item.message.id}`"
                class="mb-1.5 px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 truncate max-w-full"
                :class="item.isSender ? 'bg-white/15 border-l-2 border-white/70 text-white/90' : 'bg-indigo-500/10 border-l-2 border-indigo-500 text-[var(--fp-text-secondary)]'"
              >
                <span class="font-semibold shrink-0" :class="item.isSender ? 'text-white' : 'text-[var(--fp-accent-bright)]'">
                  @{{ item.message.reply_to?.author?.display_name || 'Friend' }}
                </span>
                <span class="truncate italic">
                  {{ item.message.reply_to?.deleted_at ? 'Original message was deleted' : (item.message.reply_to?.encryption === 'undecryptable' ? '🔒 Unable to decrypt this message' : (isImagePayload(item.message.reply_to?.content) ? formatImageMessageSummary(parseImagePayload(item.message.reply_to?.content)?.images.length || 1) : (item.message.reply_to?.content || 'Message'))) }}
                </span>
              </div>

              <!-- Deleted Tombstone -->
              <p
                v-if="item.message.deleted_at"
                :data-test="`deleted-tombstone-${item.message.id}`"
                class="text-xs italic px-2 py-0.5 rounded border border-dashed inline-block"
                :class="item.isSender ? 'bg-white/10 border-white/30 text-white/80' : 'bg-[var(--fp-hover)] border-[var(--fp-border)] text-[var(--fp-text-muted)]'"
              >
                This message was deleted
              </p>

              <!-- Undecryptable Placeholder -->
              <p
                v-else-if="item.message.encryption === 'undecryptable'"
                :data-test="`undecryptable-${item.message.id}`"
                class="text-xs italic px-2 py-0.5 rounded border border-dashed inline-block"
                :class="item.isSender ? 'bg-white/10 border-white/30 text-white/80' : 'bg-[var(--fp-hover)] border-[var(--fp-border)] text-[var(--fp-text-muted)]'"
              >
                🔒 Unable to decrypt this message
              </p>

              <!-- Inline Edit Box -->
              <div v-else-if="editingMessageId === item.message.id" class="my-1 space-y-2 min-w-[200px]">
                <input
                  v-model="editingContent"
                  type="text"
                  :data-test="`edit-input-${item.message.id}`"
                  class="w-full px-3 py-1.5 text-sm rounded-lg border border-indigo-400 bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] focus:outline-none"
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
                    class="px-2.5 py-1 rounded-md cursor-pointer"
                    :class="item.isSender ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)]'"
                    @click="cancelEdit"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <!-- Image Grid -->
              <MessageImageGrid
                v-else-if="isImagePayload(item.message.content) && parseImagePayload(item.message.content)"
                :images="parseImagePayload(item.message.content)!.images"
                :channel-id="effectiveConversationId"
                :is-sending="item.message.status === 'sending'"
                @select-image="emit('selectImage', $event)"
              />

              <!-- Text Message Content -->
              <div v-else class="whitespace-pre-wrap break-words">
                <template
                  v-for="(seg, sIdx) in tokenizeMessageMentions(item.message.content, currentDisplayName)"
                  :key="sIdx"
                >
                  <span
                    v-if="seg.isMention"
                    data-test="mention-token"
                    class="px-1.5 py-0.5 rounded-[5px] text-[13.5px] font-semibold"
                    :class="[
                      item.isSender
                        ? 'bg-white/20 text-white border border-white/30'
                        : (seg.isMe
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                            : 'bg-indigo-500/18 text-[var(--fp-accent-bright)] border border-indigo-500/30')
                    ]"
                  >{{ seg.text }}</span>
                  <span v-else>{{ seg.text }}</span>
                </template>
                <span
                  v-if="item.message.edited_at && !item.message.deleted_at"
                  :data-test="`edited-badge-${item.message.id}`"
                  class="ml-1 text-[11px] italic"
                  :class="item.isSender ? 'text-white/75' : 'text-[var(--fp-text-muted)]'"
                >
                  (edited)
                </span>
                <span
                  v-if="item.message.encryption === 'legacy' && !item.message.deleted_at"
                  :data-test="`legacy-badge-${item.message.id}`"
                  class="ml-1.5 text-[11px] px-1.5 py-0.5 rounded"
                  :class="item.isSender ? 'text-white/80 bg-white/15 border border-white/25' : 'text-[var(--fp-text-muted)] bg-[var(--fp-hover)] border border-[var(--fp-border)]'"
                >
                  Legacy · unencrypted
                </span>
              </div>

              <!-- Time & Delivery Status inside Bubble -->
              <div
                class="mt-1 flex items-center justify-end gap-1.5 text-[11px] select-none"
                :class="item.isSender ? 'text-white/75' : 'text-[var(--fp-text-muted)]'"
              >
                <span>{{ formatTime(item.message.created_at) }}</span>

                <!-- Delivery indicator for sender -->
                <template v-if="item.isSender">
                  <span
                    v-if="item.message.status === 'sending'"
                    :data-test="`delivery-indicator-${item.message.id}`"
                    class="inline-flex items-center gap-1 italic text-white/85"
                  >
                    <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Sending...</span>
                  </span>
                  <span
                    v-else-if="item.message.status === 'sent'"
                    :data-test="`delivery-indicator-${item.message.id}`"
                    class="font-bold text-white tracking-tighter"
                    title="Sent"
                  >
                    ✓✓
                  </span>
                </template>
              </div>
            </div>

            <!-- Failed Delivery / Retry Actions below bubble -->
            <div
              v-if="item.message.status === 'failed'"
              :data-test="`delivery-indicator-${item.message.id}`"
              class="mt-1 flex items-center gap-1.5 text-xs text-rose-500 font-medium px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/25"
            >
              <span>Failed to send</span>
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
                class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-all cursor-pointer shadow-sm"
                :class="summary.reactedByMe ? 'bg-indigo-500/20 border-indigo-500/50 text-[var(--fp-text-primary)] font-semibold' : 'bg-[var(--fp-surface-elevated)] border-[var(--fp-border)] text-[var(--fp-text-secondary)] hover:border-[var(--fp-border-strong)] hover:text-[var(--fp-text-primary)]'"
                @click="emit('toggleReaction', { messageId: item.message.id, emoji: summary.emoji })"
              >
                <span>{{ summary.emoji }}</span>
                <span>{{ summary.count }}</span>
              </button>
            </div>
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