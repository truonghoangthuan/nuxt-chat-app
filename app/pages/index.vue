<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import { useChatRoom } from '~/composables/useChatRoom'
import { useAuthProfile } from '~/composables/useAuthProfile'
import { useTheme } from '~/composables/useTheme'
import ChatSidebar from '~/components/ChatSidebar.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import MessageComposer from '~/components/MessageComposer.vue'
import CreateChannelModal from '~/components/CreateChannelModal.vue'
import ProfileSettingsModal from '~/components/ProfileSettingsModal.vue'

const {
  channels,
  activeChannelId,
  activeChannel,
  messages,
  hasMoreHistory,
  isLoadingHistory,
  unreadCounts,
  unreadMentions,
  activeChannelUnreadSince,
  knownProfiles,
  onlineFriends,
  typingLabel,
  connectionStatus,
  reconnectCountdownSec,
  initializeChat,
  selectChannel,
  createChannel,
  sendMessage,
  retryMessage,
  dismissMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  loadOlderMessages,
  notifyTyping,
  retryConnectionNow,
  syncOwnProfile,
  cleanupChat,
} = useChatRoom()

const { currentProfile, updateProfile, signOut } = useAuthProfile()
const { isDark, toggleTheme } = useTheme()

const isMobileSidebarOpen = ref(false)
const isCreateChannelModalOpen = ref(false)
const isProfileSettingsModalOpen = ref(false)
const replyingTo = ref<ChatMessage | null>(null)

async function handleLogout() {
  await signOut()
  await navigateTo('/login')
}

async function handleSelectChannel(channelId: string) {
  replyingTo.value = null
  await selectChannel(channelId)
}

async function handleSendMessage(content: string) {
  const replyId = replyingTo.value?.id || null
  replyingTo.value = null
  await sendMessage(content, replyId)
}

async function handleSaveProfile(payload: {
  displayName: string
  avatarColor: string
  onSuccess?: () => void
  onError?: (message: string) => void
}) {
  const result = await updateProfile(payload.displayName, payload.avatarColor)
  if (result.error || !result.profile) {
    payload.onError?.(result.error || 'Failed to update profile')
  } else {
    await syncOwnProfile(result.profile)
    payload.onSuccess?.()
    isProfileSettingsModalOpen.value = false
  }
}

async function handleCreateChannel(payload: {
  name: string
  description: string
  onSuccess?: () => void
  onError?: (message: string) => void
}) {
  const result = await createChannel(payload.name, payload.description)
  if (result.error) {
    payload.onError?.(result.error)
  } else {
    payload.onSuccess?.()
    isCreateChannelModalOpen.value = false
  }
}

onMounted(async () => {
  await initializeChat()
})

onUnmounted(() => {
  cleanupChat()
})
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-slate-100 dark:bg-slate-900 font-sans transition-colors">
    <!-- Sidebar -->
    <ChatSidebar
      :channels="channels"
      :active-channel-id="activeChannelId"
      :unread-counts="unreadCounts"
      :unread-mentions="unreadMentions"
      :online-friends="onlineFriends"
      :current-user="currentProfile"
      :is-dark="isDark"
      :connection-status="connectionStatus"
      :is-open-mobile="isMobileSidebarOpen"
      @select-channel="handleSelectChannel"
      @open-create-channel="isCreateChannelModalOpen = true"
      @open-profile-settings="isProfileSettingsModalOpen = true"
      @toggle-theme="toggleTheme"
      @logout="handleLogout"
      @close-mobile="isMobileSidebarOpen = false"
    />

    <!-- Main Chat Column -->
    <main class="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <!-- Connection Banner -->
      <ConnectionBanner
        :status="connectionStatus"
        :countdown-sec="reconnectCountdownSec"
        @retry="retryConnectionNow"
      />

      <!-- Active Channel Top Header -->
      <header class="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 shadow-sm">
        <div class="flex items-center gap-3 min-w-0">
          <button
            type="button"
            class="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="isMobileSidebarOpen = true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div class="min-w-0">
            <h2 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
              <span class="text-slate-400 font-mono">#</span>
              <span class="truncate">{{ activeChannel?.slug || 'general' }}</span>
            </h2>
            <p v-if="activeChannel?.description" class="text-xs text-slate-500 dark:text-slate-400 truncate">
              {{ activeChannel.description }}
            </p>
          </div>
        </div>
      </header>

      <!-- Message Viewport -->
      <MessageViewport
        :messages="messages"
        :channel-id="activeChannelId"
        :has-more-history="hasMoreHistory"
        :is-loading-history="isLoadingHistory"
        :current-user-id="currentProfile?.id"
        :current-display-name="currentProfile?.display_name"
        :last-read-at="activeChannelUnreadSince"
        :load-older="loadOlderMessages"
        @retry="retryMessage"
        @dismiss="dismissMessage"
        @reply="replyingTo = $event"
        @edit="editMessage($event.messageId, $event.content)"
        @delete="deleteMessage($event)"
        @toggle-reaction="toggleReaction($event.messageId, $event.emoji)"
      />

      <!-- Message Composer -->
      <MessageComposer
        :channel-slug="activeChannel?.slug || 'general'"
        :typing-label="typingLabel"
        :disabled="connectionStatus !== 'connected'"
        :replying-to="replyingTo"
        :mention-candidates="knownProfiles"
        @send="handleSendMessage"
        @typing="notifyTyping"
        @cancel-reply="replyingTo = null"
      />
    </main>

    <!-- Create Channel Modal -->
    <CreateChannelModal
      :is-open="isCreateChannelModalOpen"
      @close="isCreateChannelModalOpen = false"
      @create="handleCreateChannel"
    />

    <!-- Profile Settings Modal -->
    <ProfileSettingsModal
      :is-open="isProfileSettingsModalOpen"
      :profile="currentProfile"
      @close="isProfileSettingsModalOpen = false"
      @save="handleSaveProfile"
    />
  </div>
</template>
