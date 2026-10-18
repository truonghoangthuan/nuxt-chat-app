<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import { buildMessageTimeline, REACTION_EMOJIS, summarizeReactions } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    channelId?: string | null
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    currentUserId?: string
    loadOlder: () => Promise<number>
  }>(),
  {
    channelId: null,
    hasMoreHistory: false,
    isLoadingHistory: false,
    currentUserId: '',
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

const timelineItems = computed(() => buildMessageTimeline(props.messages))

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
  <div class="relative flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950">
    <!-- Messages Scroll Container -->
    <div
      ref="viewportRef"
      class="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      @scroll="handleScroll"
    >
      <!-- History Loader -->
      <div v-if="hasMoreHistory" class="text-center py-2">
        <button
          type="button"
          :disabled="isLoadingHistory"
          class="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          @click="handleLoadOlder"
        >
          <span v-if="isLoadingHistory">Loading older messages...</span>
          <span v-else>↑ Load older messages</span>
        </button>
      </div>

      <!-- Empty Channel Placeholder -->
      <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center text-center py-16">
        <div class="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3 text-lg font-bold">
          #
        </div>
        <p class="text-slate-700 dark:text-slate-300 font-medium">This is the start of this channel</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Send a message below to start the conversation!</p>
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
          class="flex items-center gap-3 my-4"
        >
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
          <span class="px-3 py-0.5 rounded-full text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            {{ item.dateLabel }}
          </span>
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
        </div>

        <!-- Compact Message Row (same author within 5m on same day) -->
        <div
          v-if="item.isCompact"
          data-test="compact-message"
          class="relative flex items-start gap-3 group -mt-2.5 py-0.5 hover:bg-slate-100/60 dark:hover:bg-slate-900/50 rounded-lg px-1 -mx-1 transition-colors"
        >
          <div class="w-9 shrink-0 text-right pr-1 select-none">
            <span class="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {{ formatTime(item.message.created_at) }}
            </span>
          </div>

          <div class="flex-1 min-w-0">
            <!-- Deleted Tombstone -->
            <p
              v-if="item.message.deleted_at"
              :data-test="`deleted-tombstone-${item.message.id}`"
              class="text-sm italic text-slate-400 dark:text-slate-500 mt-0.5"
            >
              This message was deleted
            </p>

            <!-- Inline Edit Box -->
            <div v-else-if="editingMessageId === item.message.id" class="mt-1 space-y-1.5">
              <input
                v-model="editingContent"
                type="text"
                :data-test="`edit-input-${item.message.id}`"
                class="w-full px-2.5 py-1.5 text-sm rounded-lg border border-sky-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                @keydown.enter.prevent="saveEdit(item.message.id)"
                @keydown.esc.prevent="cancelEdit"
              />
              <div class="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  :data-test="`save-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded bg-sky-600 text-white font-medium hover:bg-sky-500"
                  @click="saveEdit(item.message.id)"
                >
                  Save
                </button>
                <button
                  type="button"
                  :data-test="`cancel-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  @click="cancelEdit"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Message content + edited badge -->
            <div
              v-else
              class="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              {{ item.message.content }}
              <span
                v-if="item.message.edited_at && !item.message.deleted_at"
                :data-test="`edited-badge-${item.message.id}`"
                class="ml-1 text-[11px] text-slate-400 italic"
              >
                (edited)
              </span>
            </div>

            <div v-if="item.message.status !== 'sent'" class="mt-0.5 flex items-center gap-2">
              <span
                v-if="item.message.status === 'sending'"
                class="text-xs text-slate-400 italic"
              >
                Sending...
              </span>
              <span
                v-else-if="item.message.status === 'failed'"
                class="text-xs text-rose-500 font-medium flex items-center gap-1.5"
              >
                Failed to send
                <button
                  type="button"
                  :data-test="`retry-${item.message.client_id}`"
                  class="underline hover:text-rose-600 font-semibold cursor-pointer ml-1"
                  @click="emit('retry', item.message.client_id)"
                >
                  Retry
                </button>
                <button
                  type="button"
                  :data-test="`dismiss-${item.message.client_id}`"
                  class="underline hover:text-rose-600 cursor-pointer ml-1 text-slate-400"
                  @click="emit('dismiss', item.message.client_id)"
                >
                  Dismiss
                </button>
              </span>
            </div>

            <!-- Reaction Pills -->
            <div
              v-if="!item.message.deleted_at && summarizeReactions(item.message.reactions, currentUserId).length > 0"
              class="mt-1.5 flex items-center flex-wrap gap-1"
            >
              <button
                v-for="summary in summarizeReactions(item.message.reactions, currentUserId)"
                :key="summary.emoji"
                type="button"
                :data-test="`reaction-pill-${item.message.id}-${summary.emoji}`"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors cursor-pointer"
                :class="summary.reactedByMe ? 'bg-sky-500/15 border-sky-500/50 text-sky-600 dark:text-sky-300 font-semibold' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
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
            class="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 shadow-sm shrink-0 self-start"
          >
            <button
              v-for="emoji in REACTION_EMOJIS"
              :key="emoji"
              type="button"
              :data-test="`react-${item.message.id}-${emoji}`"
              class="p-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-transform hover:scale-110 cursor-pointer"
              :title="`React ${emoji}`"
              @click="emit('toggleReaction', { messageId: item.message.id, emoji })"
            >
              {{ emoji }}
            </button>
            <button
              type="button"
              :data-test="`reply-${item.message.id}`"
              class="px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              @click="emit('reply', item.message)"
            >
              Reply
            </button>
            <template v-if="item.message.user_id === currentUserId">
              <button
                type="button"
                :data-test="`edit-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                @click="startEdit(item.message)"
              >
                Edit
              </button>
              <button
                type="button"
                :data-test="`delete-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-rose-500 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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
          data-test="full-message"
          class="relative flex items-start gap-3 group hover:bg-slate-100/60 dark:hover:bg-slate-900/50 rounded-lg p-1 -mx-1 transition-colors"
        >
          <UserAvatar
            :display-name="item.message.author?.display_name || 'Friend'"
            :avatar-color="item.message.author?.avatar_color"
            size="md"
          />

          <div class="flex-1 min-w-0">
            <!-- Quoted Reply Preview -->
            <div
              v-if="item.message.reply_to_id"
              :data-test="`reply-quote-${item.message.id}`"
              class="mb-1 pl-2.5 border-l-2 border-sky-500 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate"
            >
              <span class="font-semibold text-slate-700 dark:text-slate-300">
                @{{ item.message.reply_to?.author?.display_name || 'Friend' }}
              </span>
              <span class="truncate italic">
                {{ item.message.reply_to?.deleted_at ? 'Original message was deleted' : (item.message.reply_to?.content || 'Message') }}
              </span>
            </div>

            <div class="flex items-baseline gap-2">
              <span class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ item.message.author?.display_name || 'Friend' }}
              </span>
              <span class="text-xs text-slate-400 dark:text-slate-500">
                {{ formatTime(item.message.created_at) }}
              </span>

              <span
                v-if="item.message.status === 'sending'"
                class="text-xs text-slate-400 italic flex items-center gap-1"
              >
                Sending...
              </span>

              <span
                v-else-if="item.message.status === 'failed'"
                class="text-xs text-rose-500 font-medium flex items-center gap-1.5"
              >
                Failed to send
                <button
                  type="button"
                  :data-test="`retry-${item.message.client_id}`"
                  class="underline hover:text-rose-600 font-semibold cursor-pointer ml-1"
                  @click="emit('retry', item.message.client_id)"
                >
                  Retry
                </button>
                <button
                  type="button"
                  :data-test="`dismiss-${item.message.client_id}`"
                  class="underline hover:text-rose-600 cursor-pointer ml-1 text-slate-400"
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
              class="text-sm italic text-slate-400 dark:text-slate-500 mt-0.5"
            >
              This message was deleted
            </p>

            <!-- Inline Edit Box -->
            <div v-else-if="editingMessageId === item.message.id" class="mt-1 space-y-1.5">
              <input
                v-model="editingContent"
                type="text"
                :data-test="`edit-input-${item.message.id}`"
                class="w-full px-2.5 py-1.5 text-sm rounded-lg border border-sky-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                @keydown.enter.prevent="saveEdit(item.message.id)"
                @keydown.esc.prevent="cancelEdit"
              />
              <div class="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  :data-test="`save-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded bg-sky-600 text-white font-medium hover:bg-sky-500"
                  @click="saveEdit(item.message.id)"
                >
                  Save
                </button>
                <button
                  type="button"
                  :data-test="`cancel-edit-${item.message.id}`"
                  class="px-2.5 py-1 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  @click="cancelEdit"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Message content + edited badge -->
            <div
              v-else
              class="text-sm text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap break-words leading-relaxed"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              {{ item.message.content }}
              <span
                v-if="item.message.edited_at && !item.message.deleted_at"
                :data-test="`edited-badge-${item.message.id}`"
                class="ml-1 text-[11px] text-slate-400 italic"
              >
                (edited)
              </span>
            </div>

            <!-- Reaction Pills -->
            <div
              v-if="!item.message.deleted_at && summarizeReactions(item.message.reactions, currentUserId).length > 0"
              class="mt-1.5 flex items-center flex-wrap gap-1"
            >
              <button
                v-for="summary in summarizeReactions(item.message.reactions, currentUserId)"
                :key="summary.emoji"
                type="button"
                :data-test="`reaction-pill-${item.message.id}-${summary.emoji}`"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors cursor-pointer"
                :class="summary.reactedByMe ? 'bg-sky-500/15 border-sky-500/50 text-sky-600 dark:text-sky-300 font-semibold' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
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
            class="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 shadow-sm shrink-0 self-start"
          >
            <button
              v-for="emoji in REACTION_EMOJIS"
              :key="emoji"
              type="button"
              :data-test="`react-${item.message.id}-${emoji}`"
              class="p-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-transform hover:scale-110 cursor-pointer"
              :title="`React ${emoji}`"
              @click="emit('toggleReaction', { messageId: item.message.id, emoji })"
            >
              {{ emoji }}
            </button>
            <button
              type="button"
              :data-test="`reply-${item.message.id}`"
              class="px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              @click="emit('reply', item.message)"
            >
              Reply
            </button>
            <template v-if="item.message.user_id === currentUserId">
              <button
                type="button"
                :data-test="`edit-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                @click="startEdit(item.message)"
              >
                Edit
              </button>
              <button
                type="button"
                :data-test="`delete-${item.message.id}`"
                class="px-1.5 py-0.5 text-[11px] font-medium text-rose-500 hover:text-rose-600 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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
      class="absolute bottom-3 right-6 z-10 px-3.5 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg transition-transform animate-bounce flex items-center gap-1.5"
      @click="scrollToBottom(true)"
    >
      <span>↓ {{ unreadNewCount }} new message{{ unreadNewCount > 1 ? 's' : '' }}</span>
    </button>
  </div>
</template>
