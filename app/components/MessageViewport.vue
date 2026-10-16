<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    currentUserId?: string
    loadOlder: () => Promise<number>
  }>(),
  {
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

watch(
  () => props.messages.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      const newest = props.messages[props.messages.length - 1]
      const isMine = newest && newest.user_id === props.currentUserId

      if (isMine || isNearBottom.value) {
        scrollToBottom(true)
      } else {
        unreadNewCount.value += (newLen - oldLen)
      }
    }
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
      <div
        v-for="msg in messages"
        :key="msg.client_id || msg.id"
        class="flex items-start gap-3 group"
      >
        <UserAvatar
          :display-name="msg.author?.display_name || 'Friend'"
          :avatar-color="msg.author?.avatar_color"
          size="md"
        />

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="text-sm font-semibold text-slate-900 dark:text-white">
              {{ msg.author?.display_name || 'Friend' }}
            </span>
            <span class="text-xs text-slate-400 dark:text-slate-500">
              {{ formatTime(msg.created_at) }}
            </span>

            <!-- Status Indicator -->
            <span
              v-if="msg.status === 'sending'"
              class="text-xs text-slate-400 italic flex items-center gap-1"
            >
              Sending...
            </span>

            <span
              v-else-if="msg.status === 'failed'"
              class="text-xs text-rose-500 font-medium flex items-center gap-1.5"
            >
              Failed to send
              <button
                type="button"
                :data-test="`retry-${msg.client_id}`"
                class="underline hover:text-rose-600 font-semibold cursor-pointer ml-1"
                @click="emit('retry', msg.client_id)"
              >
                Retry
              </button>
              <button
                type="button"
                :data-test="`dismiss-${msg.client_id}`"
                class="underline hover:text-rose-600 cursor-pointer ml-1 text-slate-400"
                @click="emit('dismiss', msg.client_id)"
              >
                Dismiss
              </button>
            </span>
          </div>

          <div
            class="text-sm text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap break-words leading-relaxed"
            :class="{ 'opacity-60': msg.status === 'sending', 'text-rose-400': msg.status === 'failed' }"
          >
            {{ msg.content }}
          </div>
        </div>
      </div>
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
