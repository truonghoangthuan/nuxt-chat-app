<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { ChatMessage, EncryptedImageMetadata } from '~/types/chat'
import { useChatRoom } from '~/composables/useChatRoom'
import { useAuthProfile } from '~/composables/useAuthProfile'
import { useTheme } from '~/composables/useTheme'
import ChatSidebar from '~/components/ChatSidebar.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import MessageComposer from '~/components/MessageComposer.vue'
import ContactsModal from '~/components/ContactsModal.vue'
import CreateGroupModal from '~/components/CreateGroupModal.vue'
import GroupInfoModal from '~/components/GroupInfoModal.vue'
import ProfileSettingsModal from '~/components/ProfileSettingsModal.vue'
import ImageViewerModal from '~/components/ImageViewerModal.vue'
import NotificationToastContainer from '~/components/NotificationToastContainer.vue'
import NotificationPermissionBanner from '~/components/NotificationPermissionBanner.vue'
import UserAvatar from '~/components/UserAvatar.vue'
import { Menu, Users, Info } from '@lucide/vue'
import E2eeGate from '~/components/E2eeGate.vue'
import { useE2ee } from '~/composables/useE2ee'

const {
  conversations,
  activeConversationId,
  activeConversation,
  contacts,
  findUserByEmail,
  addContact,
  removeContact,
  openOrCreateDirectChat,
  createGroup,
  addMemberToGroup,
  leaveGroup,
  updateGroupTitle,
  selectConversation,

  // Transitional aliases for channels and legacy components
  channels,
  publicChannels,
  dmChannels,
  activeChannelId,
  activeChannel,
  selectChannel,
  createChannel,
  openOrCreateDm,

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
  sendMessage,
  sendImages,
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
  soundEnabled,
  desktopEnabled,
  notificationPermission,
  notificationToasts,
  toggleSound,
  toggleDesktop,
  requestNotificationPermission,
  dismissNotificationToast,
  addNotificationToast,
} = useChatRoom()

const { currentProfile, updateProfile, signOut } = useAuthProfile()
const { isDark, toggleTheme } = useTheme()
const {
  status: e2eeStatus,
  error: e2eeError,
  isUnlocking: e2eeIsUnlocking,
  initializeE2ee,
  unlockWithPhrase,
  clearE2eeSession,
} = useE2ee()

const isMobileSidebarOpen = ref(false)
const isContactsModalOpen = ref(false)
const isCreateGroupModalOpen = ref(false)
const isGroupInfoModalOpen = ref(false)
const isProfileSettingsModalOpen = ref(false)
const replyingTo = ref<ChatMessage | null>(null)
const isLightboxOpen = ref(false)
const lightboxImages = ref<EncryptedImageMetadata[]>([])
const lightboxInitialIndex = ref(0)

function handleOpenLightbox(payload: { images: EncryptedImageMetadata[]; initialIndex: number }) {
  lightboxImages.value = payload.images
  lightboxInitialIndex.value = payload.initialIndex
  isLightboxOpen.value = true
}

async function handleSelectConversation(conversationId: string) {
  replyingTo.value = null
  isMobileSidebarOpen.value = false
  await selectConversation(conversationId)
}

async function handleStartDirectChat(userId: string) {
  replyingTo.value = null
  isMobileSidebarOpen.value = false
  await openOrCreateDirectChat(userId)
  isContactsModalOpen.value = false
}

async function handleToggleNotifications() {
  if (notificationPermission.value === 'default') {
    await requestNotificationPermission()
  } else {
    const next = !(soundEnabled.value || desktopEnabled.value)
    if (soundEnabled.value !== next) toggleSound()
    if (desktopEnabled.value !== next) toggleDesktop()
  }
}

async function handleCreateGroup(payload: {
  title: string
  memberUserIds: string[]
  invitedEmails?: string[]
}) {
  const memberIds = [...payload.memberUserIds]
  if (payload.invitedEmails && payload.invitedEmails.length > 0) {
    for (const email of payload.invitedEmails) {
      const user = await findUserByEmail(email)
      if (user && !memberIds.includes(user.id)) {
        memberIds.push(user.id)
      }
    }
  }
  await createGroup(payload.title, memberIds)
  isCreateGroupModalOpen.value = false
}

async function handleAddMember(email: string) {
  if (activeConversationId.value) {
    await addMemberToGroup(activeConversationId.value, email)
  }
}

async function handleLeaveGroup(conversationId: string) {
  await leaveGroup(conversationId)
  isGroupInfoModalOpen.value = false
}

async function handleUpdateGroupTitle(newTitle: string) {
  if (activeConversationId.value) {
    const res = await updateGroupTitle(activeConversationId.value, newTitle)
    if (res?.error && addNotificationToast) {
      addNotificationToast({
        title: 'Failed to update group name',
        body: res.error,
      })
    }
  }
}

async function handleLogout() {
  clearE2eeSession()
  await signOut()
  await navigateTo('/login')
}

async function handleUnlock(phrase: string) {
  const success = await unlockWithPhrase(phrase)
  if (success) {
    await initializeChat()
  }
}

async function handleRetryConfig() {
  const status = await initializeE2ee()
  if (status === 'unlocked') {
    await initializeChat()
  }
}

async function handleSendMessage(content: string) {
  const replyId = replyingTo.value?.id || null
  replyingTo.value = null
  isMobileSidebarOpen.value = false
  await sendMessage(content, replyId)
}

async function handleSendImages(files: File[]) {
  replyingTo.value = null
  isMobileSidebarOpen.value = false
  await sendImages(files)
}

async function handleSaveProfile(payload: {
  displayName: string
  avatarColor: string
  avatarUrl: string
  onSuccess?: () => void
  onError?: (message: string) => void
}) {
  const result = await updateProfile(payload.displayName, payload.avatarColor, payload.avatarUrl)
  if (result.error || !result.profile) {
    payload.onError?.(result.error || 'Failed to update profile')
  } else {
    await syncOwnProfile(result.profile)
    payload.onSuccess?.()
    isProfileSettingsModalOpen.value = false
  }
}

onMounted(async () => {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NAVIGATE_CONVERSATION' && event.data.conversationId) {
        handleSelectConversation(event.data.conversationId)
      }
    })
  }

  const status = await initializeE2ee()
  if (status === 'unlocked') {
    await initializeChat()
  }
})

onUnmounted(() => {
  cleanupChat()
})
</script>

<template>
  <div class="h-dvh flex overflow-hidden bg-[var(--fp-void)] md:p-3 md:gap-2.5 transition-colors">
    <!-- Passphrase / E2EE Entry Gate -->
    <E2eeGate
      v-if="e2eeStatus !== 'unlocked'"
      :status="e2eeStatus"
      :error="e2eeError"
      :is-unlocking="e2eeIsUnlocking"
      @unlock="handleUnlock"
      @retry-config="handleRetryConfig"
      @logout="handleLogout"
    />

    <!-- Main Workspace (only when unlocked) -->
    <template v-else>
      <!-- In-App Notification Toasts -->
    <NotificationToastContainer
      :toasts="notificationToasts || []"
      @navigate="handleSelectConversation"
      @dismiss="dismissNotificationToast || (() => {})"
    />
    <!-- Sidebar (Icon Rail + Conversation List) -->
    <ChatSidebar
      :conversations="conversations"
      :active-conversation-id="activeConversationId"
      :channels="publicChannels"
      :dm-channels="dmChannels"
      :active-channel-id="activeConversationId || activeChannelId"
      :unread-counts="unreadCounts"
      :unread-mentions="unreadMentions"
      :online-friends="onlineFriends"
      :current-user="currentProfile"
      :is-dark="isDark"
      :connection-status="connectionStatus"
      :is-open-mobile="isMobileSidebarOpen"
      :notifications-enabled="soundEnabled || desktopEnabled"
      :notification-permission="notificationPermission"
      @toggle-notifications="handleToggleNotifications"
      @select-conversation="handleSelectConversation"
      @select-channel="handleSelectConversation"
      @open-contacts="isContactsModalOpen = true"
      @open-new-chat="isContactsModalOpen = true"
      @open-start-dm="isContactsModalOpen = true"
      @open-create-group="isCreateGroupModalOpen = true"
      @start-dm-with-user="handleStartDirectChat"
      @open-profile-settings="isProfileSettingsModalOpen = true"
      @toggle-theme="toggleTheme"
      @logout="handleLogout"
      @close-mobile="isMobileSidebarOpen = false"
    />

    <main
      class="flex-1 flex flex-col min-w-0 h-full overflow-hidden fp-stage-surface md:rounded-[14px] md:border md:border-[var(--fp-border)]"
    >
      <!-- Connection Banner -->
      <ConnectionBanner
        :status="connectionStatus"
        :countdown-sec="reconnectCountdownSec"
        @retry="retryConnectionNow"
      />

      <!-- Notification Permission Banner -->
      <NotificationPermissionBanner
        :permission="notificationPermission"
        @request-permission="requestNotificationPermission"
      />

      <!-- Stage Precision Top Header -->
      <header class="h-[54px] px-4 md:px-5 bg-[var(--fp-stage)]/90 border-b border-[var(--fp-border)] flex items-center justify-between gap-4 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <button
            type="button"
            class="md:hidden p-1.5 rounded-lg text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] cursor-pointer"
            aria-label="Open mobile navigation"
            @click="isMobileSidebarOpen = true"
          >
            <Menu class="w-5 h-5 text-[var(--fp-text-secondary)]" />
          </button>

          <div class="min-w-0 flex items-center gap-2.5">
            <!-- Direct Conversation -->
            <template v-if="activeConversation?.type === 'direct'">
              <UserAvatar
                :display-name="activeConversation.peer?.display_name || 'Friend'"
                :avatar-color="activeConversation.peer?.avatar_color"
                :avatar-url="activeConversation.peer?.avatar_url"
                :show-online="onlineFriends.some(f => f.id === activeConversation?.peer?.id)"
                size="sm"
              />
              <div class="min-w-0 flex items-center gap-2">
                <h2 class="fp-font-display text-[15px] font-bold text-[var(--fp-text-primary)] flex items-center gap-1 truncate">
                  <span class="text-[var(--fp-accent-bright)] fp-font-mono">@</span>
                  <span class="truncate">{{ activeConversation.peer?.display_name || 'Direct Message' }}</span>
                </h2>
                <span
                  class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                  :class="onlineFriends.some(f => f.id === activeConversation?.peer?.id) ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500' : 'bg-[var(--fp-hover)] border-[var(--fp-border)] text-[var(--fp-text-muted)]'"
                >
                  {{ onlineFriends.some(f => f.id === activeConversation?.peer?.id) ? 'Active now' : 'Offline' }}
                </span>
              </div>
            </template>

            <!-- Group Conversation -->
            <template v-else-if="activeConversation?.type === 'group'">
              <div class="w-8 h-8 rounded-lg bg-[var(--fp-surface-raised)] border border-[var(--fp-border)] flex items-center justify-center text-[var(--fp-accent-bright)] shrink-0">
                <Users class="w-4 h-4" />
              </div>
              <div class="min-w-0 flex items-center gap-2">
                <button
                  type="button"
                  data-test="group-header-info-trigger"
                  class="text-left flex items-center gap-2 hover:opacity-80 transition cursor-pointer truncate"
                  @click="isGroupInfoModalOpen = true"
                >
                  <h2 class="fp-font-display text-[15px] font-bold text-[var(--fp-text-primary)] truncate">
                    {{ activeConversation?.title || 'Group Chat' }}
                  </h2>
                  <span class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--fp-hover)] border border-[var(--fp-border)] text-[var(--fp-text-muted)]">
                    {{ activeConversation?.members?.length || 0 }} members
                  </span>
                </button>
              </div>
            </template>

            <!-- Fallback: Active Channel (legacy) or Select conversation -->
            <template v-else-if="activeChannel?.is_dm">
              <UserAvatar
                :display-name="activeChannel.peer?.display_name || 'Friend'"
                :avatar-color="activeChannel.peer?.avatar_color"
                :avatar-url="activeChannel.peer?.avatar_url"
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
            <template v-else-if="activeChannel">
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
            <template v-else>
              <h2 class="fp-font-display text-[15px] font-bold text-[var(--fp-text-secondary)]">
                Select a conversation
              </h2>
            </template>
          </div>
        </div>

        <!-- Header Right: Group Info & Online Friends Avatar Stack -->
        <div class="flex items-center gap-2.5 shrink-0">
          <button
            v-if="activeConversation?.type === 'group'"
            type="button"
            data-test="open-group-info"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--fp-hover)] border border-[var(--fp-border)] text-xs font-medium text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:border-[var(--fp-accent-bright)]/40 transition cursor-pointer"
            aria-label="Group Info & Settings"
            @click="isGroupInfoModalOpen = true"
          >
            <Info class="w-3.5 h-3.5 text-[var(--fp-accent-bright)]" />
            <span class="hidden sm:inline">Group Info</span>
          </button>

          <div v-if="onlineFriends.length > 0" class="hidden sm:flex items-center -space-x-1.5">
            <UserAvatar
              v-for="friend in onlineFriends.slice(0, 4)"
              :key="friend.id"
              :display-name="friend.display_name"
              :avatar-color="friend.avatar_color"
              :avatar-url="friend.avatar_url"
              size="sm"
              class="ring-2 ring-[var(--fp-stage)] rounded-[7px]"
            />
          </div>
          <div class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--fp-hover)] border border-[var(--fp-border)] text-xs font-medium text-[var(--fp-text-secondary)]">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>{{ onlineFriends.length }} online</span>
          </div>
        </div>
      </header>

      <!-- Message Viewport -->
      <MessageViewport
        :messages="messages"
        :conversation-id="activeConversationId"
        :channel-id="activeConversationId || activeChannelId"
        :is-dm="activeConversation?.type === 'direct' || Boolean(activeChannel?.is_dm)"
        :is-group="activeConversation?.type === 'group'"
        :peer-name="activeConversation?.type === 'direct' ? (activeConversation.peer?.display_name || 'Friend') : (activeConversation?.title || '')"
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
        @select-image="handleOpenLightbox"
      />

      <!-- Message Composer -->
      <MessageComposer
        :channel-slug="activeConversation?.type === 'direct' ? (activeConversation.peer?.display_name || 'friend') : (activeConversation?.title || activeChannel?.slug || 'chat')"
        :is-dm="activeConversation?.type === 'direct' || Boolean(activeChannel?.is_dm)"
        :typing-label="typingLabel"
        :disabled="connectionStatus !== 'connected'"
        :replying-to="replyingTo"
        :mention-candidates="knownProfiles"
        @send="handleSendMessage"
        @typing="notifyTyping"
        @cancel-reply="replyingTo = null"
        @send-images="handleSendImages"
      />
    </main>

    <!-- Contacts Modal -->
    <ContactsModal
      :is-open="isContactsModalOpen"
      :contacts="contacts"
      :online-user-ids="onlineFriends.map(f => f.id)"
      :current-user-id="currentProfile?.id"
      :find-user-by-email="findUserByEmail"
      @close="isContactsModalOpen = false"
      @select-contact="async (userId) => { await handleStartDirectChat(userId) }"
      @add-contact-by-email="async (email) => { const user = await findUserByEmail(email); if (user) await addContact(user.id) }"
      @remove-contact="removeContact"
    />

    <!-- Create Group Modal -->
    <CreateGroupModal
      :is-open="isCreateGroupModalOpen"
      :contacts="contacts"
      @close="isCreateGroupModalOpen = false"
      @create="handleCreateGroup"
    />

    <!-- Group Info Modal -->
    <GroupInfoModal
      :is-open="isGroupInfoModalOpen"
      :conversation="activeConversation"
      :current-user-id="currentProfile?.id"
      :online-user-ids="onlineFriends.map(f => f.id)"
      @close="isGroupInfoModalOpen = false"
      @add-member="handleAddMember"
      @leave="handleLeaveGroup"
      @update-title="handleUpdateGroupTitle"
    />

    <!-- Profile Settings Modal -->
    <ProfileSettingsModal
      :is-open="isProfileSettingsModalOpen"
      :profile="currentProfile"
      @close="isProfileSettingsModalOpen = false"
      @save="handleSaveProfile"
    />

    <!-- Image Lightbox Viewer Modal -->
    <ImageViewerModal
      :open="isLightboxOpen"
      :images="lightboxImages"
      :initial-index="lightboxInitialIndex"
      :channel-id="activeConversationId || activeChannelId || ''"
      @update:open="isLightboxOpen = $event"
    />
    </template>
  </div>
</template>
