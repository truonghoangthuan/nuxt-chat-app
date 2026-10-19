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
import StartDmModal from '~/components/StartDmModal.vue'
import UserAvatar from '~/components/UserAvatar.vue'

const {
  channels,
  publicChannels,
  dmChannels,
  activeChannelId,
  activeChannel,
  messages,
  hasMoreHistory,
  isLoadingHistory,
  unreadCounts,
  unreadMentions,
  activeChannelUnreadSince,
  allProfiles,
  knownProfiles,
  onlineFriends,
  typingLabel,
  connectionStatus,
  reconnectCountdownSec,
  initializeChat,
  selectChannel,
  createChannel,
  openOrCreateDm,
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
const isStartDmModalOpen = ref(false)
const startDmError = ref<string | null>(null)
const replyingTo = ref<ChatMessage | null>(null)

async function handleStartDm(userId: string) {
  startDmError.value = null
  replyingTo.value = null
  const result = await openOrCreateDm(userId)
  if (result.error) {
    startDmError.value = result.error
  } else {
    isStartDmModalOpen.value = false
  }
}

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
  <div class="h-screen flex overflow-hidden bg-[var(--fp-void)] md:p-3 md:gap-2.5 transition-colors">
    <!-- Sidebar (Icon Rail + Tree Drawer) -->
    <ChatSidebar
      :channels="publicChannels"
      :dm-channels="dmChannels"
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
      @open-start-dm="isStartDmModalOpen = true"
      @start-dm-with-user="handleStartDm"
      @open-profile-settings="isProfileSettingsModalOpen = true"
      @toggle-theme="toggleTheme"
      @logout="handleLogout"
      @close-mobile="isMobileSidebarOpen = false"
    />

    <!-- Main Floating Inset Chat Stage -->
    <main class="flex-1 flex flex-col min-w-0 h-full overflow-hidden fp-stage-surface md:rounded-[14px] md:border md:border-[var(--fp-border)]">
      <!-- Connection Banner -->
      <ConnectionBanner
        :status="connectionStatus"
        :countdown-sec="reconnectCountdownSec"
        @retry="retryConnectionNow"
      />

      <!-- Active Channel / DM Precision Top Header -->
      <header class="h-[54px] px-4 md:px-5 bg-[var(--fp-stage)]/90 border-b border-[var(--fp-border)] flex items-center justify-between gap-4 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <button
            type="button"
            class="md:hidden p-1.5 rounded-lg text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] cursor-pointer"
            @click="isMobileSidebarOpen = true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div class="min-w-0 flex items-center gap-2.5">
            <template v-if="activeChannel?.is_dm">
              <UserAvatar
                :display-name="activeChannel.peer?.display_name || 'Friend'"
                :avatar-color="activeChannel.peer?.avatar_color"
                :show-online="onlineFriends.some(f => f.id === activeChannel?.peer?.id)"
                size="sm"
              />
              <div class="min-w-0 flex items-center gap-2">
                <h2 class="fp-font-display text-[15px] font-bold text-[var(--fp-text-primary)] flex items-center gap-1 truncate">
                  <span class="text-[var(--fp-accent-bright)] fp-font-mono">@</span>
                  <span class="truncate">{{ activeChannel.peer?.display_name || 'Direct Message' }}</span>
                </h2>
                <span
                  class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                  :class="onlineFriends.some(f => f.id === activeChannel?.peer?.id) ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500' : 'bg-[var(--fp-hover)] border-[var(--fp-border)] text-[var(--fp-text-muted)]'"
                >
                  {{ onlineFriends.some(f => f.id === activeChannel?.peer?.id) ? 'Active now' : 'Offline' }}
                </span>
              </div>
            </template>
            <template v-else>
              <div class="min-w-0 flex items-center gap-2.5">
                <h2 class="fp-font-display text-[15px] font-bold text-[var(--fp-text-primary)] flex items-center gap-1 shrink-0">
                  <span class="text-[var(--fp-accent-bright)] fp-font-mono">#</span>
                  <span>{{ activeChannel?.slug || 'general' }}</span>
                </h2>
                <template v-if="activeChannel?.description">
                  <span class="hidden sm:inline-block w-px h-3.5 bg-[var(--fp-border)] shrink-0"></span>
                  <p class="hidden sm:block text-[13px] text-[var(--fp-text-secondary)] truncate">
                    {{ activeChannel.description }}
                  </p>
                </template>
              </div>
            </template>
          </div>
        </div>

        <!-- Header Right: Online Friends Avatar Stack & Count Pill -->
        <div class="hidden sm:flex items-center gap-2.5 shrink-0">
          <div v-if="onlineFriends.length > 0" class="flex items-center -space-x-1.5">
            <UserAvatar
              v-for="friend in onlineFriends.slice(0, 4)"
              :key="friend.id"
              :display-name="friend.display_name"
              :avatar-color="friend.avatar_color"
              size="sm"
              class="ring-2 ring-[var(--fp-stage)] rounded-[7px]"
            />
          </div>
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--fp-hover)] border border-[var(--fp-border)] text-xs font-medium text-[var(--fp-text-secondary)]">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>{{ onlineFriends.length }} online</span>
          </div>
        </div>
      </header>

      <!-- Message Viewport -->
      <MessageViewport
        :messages="messages"
        :channel-id="activeChannelId"
        :is-dm="Boolean(activeChannel?.is_dm)"
        :peer-name="activeChannel?.peer?.display_name || ''"
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
        :channel-slug="activeChannel?.is_dm ? (activeChannel.peer?.display_name || 'friend') : (activeChannel?.slug || 'general')"
        :is-dm="Boolean(activeChannel?.is_dm)"
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

    <!-- Start DM Modal -->
    <StartDmModal
      :is-open="isStartDmModalOpen"
      :friends="knownProfiles"
      :online-friends="onlineFriends"
      :current-user-id="currentProfile?.id"
      :error-message="startDmError"
      @close="isStartDmModalOpen = false"
      @select-friend="handleStartDm"
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
