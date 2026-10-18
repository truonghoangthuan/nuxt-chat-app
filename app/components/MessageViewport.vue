<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import { buildMessageTimeline } from '~/utils/chat'
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
}>()

const viewportRef = ref<HTMLDivElement | null>(null)
const unreadNewCount = ref(0)
const isNearBottom = ref(true)

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
          class="flex items-start gap-3 group -mt-2.5 py-0.5 hover:bg-slate-100/60 dark:hover:bg-slate-900/50 rounded-lg px-1 -mx-1 transition-colors"
        >
          <div class="w-9 shrink-0 text-right pr-1 select-none">
            <span class="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {{ formatTime(item.message.created_at) }}
            </span>
          </div>

          <div class="flex-1 min-w-0">
            <div
              class="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              {{ item.message.content }}
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
          </div>
        </div>

        <!-- Full Message Row -->
        <div
          v-else
          data-test="full-message"
          class="flex items-start gap-3 group hover:bg-slate-100/60 dark:hover:bg-slate-900/50 rounded-lg p-1 -mx-1 transition-colors"
        >
          <UserAvatar
            :display-name="item.message.author?.display_name || 'Friend'"
            :avatar-color="item.message.author?.avatar_color"
            size="md"
          />

          <div class="flex-1 min-w-0">
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

            <div
              class="text-sm text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap break-words leading-relaxed"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              {{ item.message.content }}
            </div>
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
