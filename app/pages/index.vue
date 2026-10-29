<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { ChatMessage, EncryptedImageMetadata, Profile, YouTubeSearchResult } from '~/types/chat'
import { useChatRoom } from '~/composables/useChatRoom'
import { useAuthProfile } from '~/composables/useAuthProfile'
import { useTheme } from '~/composables/useTheme'
import { useMusicPlayer } from '~/composables/useMusicPlayer'
import ChatSidebar from '~/components/ChatSidebar.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import MessageComposer from '~/components/MessageComposer.vue'
import ChatMediaGallery from '~/components/ChatMediaGallery.vue'
import ChatLinksList from '~/components/ChatLinksList.vue'
import ContactsModal from '~/components/ContactsModal.vue'
import CreateGroupModal from '~/components/CreateGroupModal.vue'
import GroupInfoModal from '~/components/GroupInfoModal.vue'
import ProfileSettingsModal from '~/components/ProfileSettingsModal.vue'
import ImageViewerModal from '~/components/ImageViewerModal.vue'
import UserProfileModal from '~/components/UserProfileModal.vue'
import NotificationToastContainer from '~/components/NotificationToastContainer.vue'
import NotificationPermissionBanner from '~/components/NotificationPermissionBanner.vue'
import UserAvatar from '~/components/UserAvatar.vue'
import MessageSearchBar from '~/components/MessageSearchBar.vue'
import ChatBackgroundModal from '~/components/ChatBackgroundModal.vue'
import ConfettiDictionaryModal from '~/components/ConfettiDictionaryModal.vue'
import ConfettiOverlay from '~/components/ConfettiOverlay.vue'
import MusicPlayerBar from '~/components/MusicPlayerBar.vue'
import MusicQueuePanel from '~/components/MusicQueuePanel.vue'
import YouTubeSearchModal from '~/components/YouTubeSearchModal.vue'
import ChangelogModal from '~/components/ChangelogModal.vue'
import RightUtilityPanel from '~/components/RightUtilityPanel.vue'
import { Menu, Users, Info, Search, Image as ImageIcon, MessageSquare, Link2, Settings, Sun, Moon, Plus, Sparkles, Music } from '@lucide/vue'
import { useE2ee } from '~/composables/useE2ee'
import { usePwaInstall } from '~/composables/usePwaInstall'
import {
  extractMediaFromMessages,
  extractLinksFromMessages,
  extractMusicHistory,
  isSystemPayload,
  parseSystemPayload,
} from '~/utils/chat'
import { getConfettiEnabled, setConfettiEnabled, matchesConfettiDictionary } from '~/utils/confetti'
import { isImagePayload, parseImagePayload } from '~/utils/image'
import { playBuzzSound } from '~/utils/sound'

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
  updateChatBackground,
  removeChatBackground,
  updateConfettiWords,
  addConfettiWord,
  removeConfettiWord,
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
  activeConversationReads,
  allProfiles,
  knownProfiles,
  onlineFriends,
  typingLabel,
  connectionStatus,
  reconnectCountdownSec,
  initializeChat,
  sendMessage,
  sendBuzz,
  sendImages,
  retryMessage,
  dismissMessage,
  editMessage,
  deleteMessage,
  togglePinMessage,
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
  onMusicSync,
  broadcastMusicSync,
  sendMusicPlaySystemMessage,
} = useChatRoom()

const { currentProfile, updateProfile, signOut } = useAuthProfile()
const { isDark, toggleTheme, uiTheme, initTheme } = useTheme()
const {
  canInstall: canInstallPwa,
  init: initPwaInstall,
  cleanup: cleanupPwaInstall,
  promptInstall: promptInstallPwa,
} = usePwaInstall()
const {
  status: e2eeStatus,
  error: e2eeError,
  isUnlocking: e2eeIsUnlocking,
  initializeE2ee,
  clearE2eeSession,
} = useE2ee()

const isMobileSidebarOpen = ref(false)
const isContactsModalOpen = ref(false)
const isCreateGroupModalOpen = ref(false)
const isGroupInfoModalOpen = ref(false)
const isChatBackgroundModalOpen = ref(false)
const isConfettiDictionaryModalOpen = ref(false)
const isProfileSettingsModalOpen = ref(false)
const isChangelogModalOpen = ref(false)
const isUserProfileModalOpen = ref(false)
const selectedUserProfile = ref<Profile | null>(null)

const isMusicSearchModalOpen = ref(false)
const isMusicQueueOpen = ref(false)
const isUtilityPanelOpen = ref(false)
const audioPlayerRef = ref<HTMLAudioElement | null>(null)

const musicHistory = computed(() => {
  return extractMusicHistory(messages.value, 50)
})

function handleSendQuickReaction(emoji: string) {
  const sentMsgs = messages.value.filter(m => m.status === 'sent' && !m.deleted_at)
  if (sentMsgs.length > 0) {
    const latest = sentMsgs[sentMsgs.length - 1]
    toggleReaction(latest.id, emoji)
  } else {
    handleSendMessage(emoji)
  }
}

function handleAudioTimeUpdate() {
  if (audioPlayerRef.value) {
    musicCurrentTimeSec.value = Math.floor(audioPlayerRef.value.currentTime || 0)
  }
  updateMediaSessionPositionState()
}

function handleAudioMetadata() {
  if (audioPlayerRef.value && Number.isFinite(audioPlayerRef.value.duration) && audioPlayerRef.value.duration > 0) {
    musicDurationSec.value = Math.floor(audioPlayerRef.value.duration)
  }
  updateMediaSessionPositionState()
}

function handleAudioEnded() {
  musicHandleTrackEnded()
}

function handleAudioError() {
  musicHandlePlaybackError()
}

function onPlayerAction(action: 'play' | 'pause' | 'seek' | 'load', payload?: any) {
  if (typeof window === 'undefined') return
  const audio = audioPlayerRef.value
  if (!audio) return

  try {
    if (action === 'load' && payload?.videoId) {
      const titleParam = payload.title ? `&title=${encodeURIComponent(payload.title)}` : ''
      audio.src = `/api/youtube/stream?v=${encodeURIComponent(payload.videoId)}${titleParam}`
      audio.currentTime = payload.startSeconds || 0
      audio.volume = Math.max(0, Math.min(1, musicVolume.value / 100))
      audio.muted = !!musicIsMuted.value
      if (payload.autoplay !== false) {
        audio.play()?.catch(() => {
          musicAutoplayBlocked.value = true
        })
      }
    } else if (action === 'play') {
      audio.play()?.catch(() => {
        musicAutoplayBlocked.value = true
      })
    } else if (action === 'pause') {
      audio.pause()
    } else if (action === 'seek' && typeof payload === 'number') {
      audio.currentTime = payload
    }
  } catch {
    // Ignore playback exception
  }
}

const musicPlayer = useMusicPlayer({
  onBroadcast: (event) => {
    if (typeof broadcastMusicSync === 'function') {
      broadcastMusicSync(event)
    }
  },
  getCurrentUserId: () => currentProfile.value?.id,
  getCurrentUserName: () => currentProfile.value?.display_name,
  onPlayerAction,
  onTrackStarted: (track, convId) => {
    if (typeof sendMusicPlaySystemMessage === 'function') {
      sendMusicPlaySystemMessage(track, convId)
    }
  },
})

const {
  currentTrack: musicCurrentTrack,
  currentTimeSec: musicCurrentTimeSec,
  durationSec: musicDurationSec,
  volume: musicVolume,
  isMuted: musicIsMuted,
  autoplayBlocked: musicAutoplayBlocked,
  queue: musicQueue,
  playTrack: musicPlayTrack,
  enqueue: musicEnqueue,
  removeFromQueue: musicRemoveFromQueue,
  moveInQueue: musicMoveInQueue,
  clearQueue: musicClearQueue,
  skipToNext: musicSkipToNext,
  handleTrackEnded: musicHandleTrackEnded,
  togglePlayPause: musicTogglePlayPause,
  seekTo: musicSeekTo,
  stopPlayback: musicStopPlayback,
  setVolume: musicSetVolume,
  toggleMute: musicToggleMute,
  unblockAutoplay: musicUnblockAutoplay,
  handlePlaybackError: musicHandlePlaybackError,
  applyRemoteSyncEvent: musicApplyRemoteSyncEvent,
} = musicPlayer

watch(musicVolume, (newVol) => {
  if (audioPlayerRef.value) {
    audioPlayerRef.value.volume = Math.max(0, Math.min(1, newVol / 100))
  }
})

watch(musicIsMuted, (muted) => {
  if (audioPlayerRef.value) {
    audioPlayerRef.value.muted = muted
  }
})

function getMediaSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null
  return navigator.mediaSession
}

function updateMediaSessionMetadata() {
  const mediaSession = getMediaSession()
  if (!mediaSession) return
  const track = musicCurrentTrack.value
  if (!track) {
    mediaSession.metadata = null
    mediaSession.playbackState = 'none'
    return
  }
  try {
    mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.channelTitle || track.startedBy || '',
      artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '480x360', type: 'image/jpeg' }] : [],
    })
  } catch {
    // Browser may not support MediaMetadata despite exposing mediaSession
  }
  mediaSession.playbackState = track.isPlaying ? 'playing' : 'paused'
}

function updateMediaSessionPositionState() {
  const mediaSession = getMediaSession()
  if (!mediaSession?.setPositionState) return
  if (!musicCurrentTrack.value || !Number.isFinite(musicDurationSec.value) || musicDurationSec.value <= 0) return
  try {
    mediaSession.setPositionState({
      duration: musicDurationSec.value,
      playbackRate: 1,
      position: Math.min(musicCurrentTimeSec.value, musicDurationSec.value),
    })
  } catch {
    // Browser may reject position state while src is still loading
  }
}

function handleMediaSessionPlay() {
  if (musicCurrentTrack.value && !musicCurrentTrack.value.isPlaying) musicTogglePlayPause()
}

function handleMediaSessionPause() {
  if (musicCurrentTrack.value?.isPlaying) musicTogglePlayPause()
}

function handleMediaSessionNextTrack() {
  musicSkipToNext()
}

function handleMediaSessionSeekTo(details: MediaSessionActionDetails) {
  if (typeof details.seekTime === 'number') musicSeekTo(details.seekTime)
}

function setMediaSessionActionHandler(
  mediaSession: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
) {
  try {
    mediaSession.setActionHandler(action, handler)
  } catch {
    // Individual actions may be unsupported even when Media Session is available.
  }
}

function setupMediaSessionHandlers() {
  const mediaSession = getMediaSession()
  if (!mediaSession) return
  setMediaSessionActionHandler(mediaSession, 'play', handleMediaSessionPlay)
  setMediaSessionActionHandler(mediaSession, 'pause', handleMediaSessionPause)
  setMediaSessionActionHandler(mediaSession, 'nexttrack', handleMediaSessionNextTrack)
  setMediaSessionActionHandler(mediaSession, 'seekto', handleMediaSessionSeekTo)
}

function teardownMediaSessionHandlers() {
  const mediaSession = getMediaSession()
  if (!mediaSession) return
  setMediaSessionActionHandler(mediaSession, 'play', null)
  setMediaSessionActionHandler(mediaSession, 'pause', null)
  setMediaSessionActionHandler(mediaSession, 'nexttrack', null)
  setMediaSessionActionHandler(mediaSession, 'seekto', null)
  mediaSession.metadata = null
  mediaSession.playbackState = 'none'
}

watch(musicCurrentTrack, updateMediaSessionMetadata, { immediate: true, deep: false })

async function handleSelectMusicTrack(track: YouTubeSearchResult) {
  if (!activeConversationId.value) return
  musicPlayTrack(track, activeConversationId.value)
}

function handleQueueMusicTrack(track: YouTubeSearchResult, position: 'end' | 'next') {
  if (!activeConversationId.value) return
  musicEnqueue(track, activeConversationId.value, position)
}

function handleViewProfile(profile: Profile) {
  selectedUserProfile.value = profile
  isUserProfileModalOpen.value = true
}
const replyingTo = ref<ChatMessage | null>(null)
const isLightboxOpen = ref(false)
const lightboxImages = ref<EncryptedImageMetadata[]>([])
const lightboxInitialIndex = ref(0)

const activeStageTab = ref<'messages' | 'media' | 'links'>('messages')
const mediaCount = computed(() => extractMediaFromMessages(messages.value).length)
const linksCount = computed(() => extractLinksFromMessages(messages.value).length)

const isConfettiActive = ref(false)
const confettiBurstKey = ref(0)
const confettiEnabled = ref(getConfettiEnabled())

function triggerConfetti() {
  if (!confettiEnabled.value) return
  confettiBurstKey.value++
  isConfettiActive.value = true
}

const isBuzzShaking = ref(false)
let buzzShakeTimer: any = null

function triggerBuzzShake() {
  playBuzzSound()
  isBuzzShaking.value = true
  if (buzzShakeTimer) clearTimeout(buzzShakeTimer)
  buzzShakeTimer = setTimeout(() => {
    isBuzzShaking.value = false
    buzzShakeTimer = null
  }, 650)
}

async function handleSendBuzz() {
  triggerBuzzShake()
  await sendBuzz()
}

const activeConversationMembers = computed<Profile[]>(() => {
  const members = activeConversation.value?.members
  if (members && members.length > 0) {
    return members.map(m => m.profile).filter((p): p is Profile => Boolean(p))
  }
  if (activeConversation.value?.peer) {
    const arr: Profile[] = [activeConversation.value.peer]
    if (currentProfile.value) arr.push(currentProfile.value)
    return arr
  }
  return knownProfiles.value || []
})

function handleOpenLightbox(payload: { images: EncryptedImageMetadata[]; initialIndex: number }) {
  lightboxImages.value = payload.images
  lightboxInitialIndex.value = payload.initialIndex
  isLightboxOpen.value = true
}

async function handleSelectConversation(conversationId: string) {
  replyingTo.value = null
  activeStageTab.value = 'messages'
  isMobileSidebarOpen.value = false
  handleCloseSearch()
  await selectConversation(conversationId)
}

async function handleJumpToMessageFromTab(messageId: string) {
  activeStageTab.value = 'messages'
  await nextTick()
  messageViewportRef.value?.jumpToMessage(messageId)
}

const isSearchOpen = ref(false)
const searchQuery = ref('')
const messageViewportRef = ref<{ jumpToMessage: (id: string) => void } | null>(null)

function handleToggleSearch() {
  isSearchOpen.value = !isSearchOpen.value
  if (!isSearchOpen.value) {
    searchQuery.value = ''
  }
}

function handleCloseSearch() {
  isSearchOpen.value = false
  searchQuery.value = ''
}

function handleJumpSearchResult(messageId: string) {
  messageViewportRef.value?.jumpToMessage(messageId)
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    isSearchOpen.value = true
  } else if (e.key === 'Escape' && isSearchOpen.value) {
    handleCloseSearch()
  }
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
    try {
      await addMemberToGroup(activeConversationId.value, email)
    } catch (err: any) {
      if (addNotificationToast) {
        addNotificationToast({
          conversationId: activeConversationId.value || '',
          title: 'Failed to add member',
          snippet: err?.message || 'Could not add member to group.',
        })
      }
    }
  }
}

async function handleLeaveGroup(conversationId: string) {
  try {
    await leaveGroup(conversationId)
    isGroupInfoModalOpen.value = false
  } catch (err: any) {
    if (addNotificationToast) {
      addNotificationToast({
        conversationId,
        title: 'Failed to leave group',
        snippet: err?.message || 'Could not leave group.',
      })
    }
  }
}

async function handleUpdateGroupTitle(newTitle: string) {
  if (activeConversationId.value) {
    const res = await updateGroupTitle(activeConversationId.value, newTitle)
    if (res?.error && addNotificationToast) {
      addNotificationToast({
        conversationId: activeConversationId.value,
        title: 'Failed to update group name',
        snippet: res.error,
      })
    }
  }
}

async function handleSelectBackgroundPreset(presetValue: string) {
  if (!activeConversationId.value) return
  const res = await updateChatBackground(activeConversationId.value, presetValue)
  if (res?.error && addNotificationToast) {
    addNotificationToast({
      conversationId: activeConversationId.value,
      title: 'Failed to update background',
      snippet: res.error,
    })
  }
}

async function handleUploadBackgroundFile(file: File) {
  if (!activeConversationId.value) return
  const res = await updateChatBackground(activeConversationId.value, file)
  if (res?.error && addNotificationToast) {
    addNotificationToast({
      conversationId: activeConversationId.value,
      title: 'Failed to upload background',
      snippet: res.error,
    })
  }
}

async function handleResetBackground() {
  if (!activeConversationId.value) return
  const res = await removeChatBackground(activeConversationId.value)
  if (res?.error && addNotificationToast) {
    addNotificationToast({
      conversationId: activeConversationId.value,
      title: 'Failed to reset background',
      snippet: res.error,
    })
  }
}

async function handleAddConfettiWord(word: string) {
  if (!activeConversationId.value) return
  const res = await addConfettiWord(activeConversationId.value, word)
  if (res?.error && addNotificationToast) {
    addNotificationToast({
      conversationId: activeConversationId.value,
      title: 'Failed to update confetti dictionary',
      snippet: res.error,
    })
  }
}

async function handleRemoveConfettiWord(word: string) {
  if (!activeConversationId.value) return
  const res = await removeConfettiWord(activeConversationId.value, word)
  if (res?.error && addNotificationToast) {
    addNotificationToast({
      conversationId: activeConversationId.value,
      title: 'Failed to update confetti dictionary',
      snippet: res.error,
    })
  }
}

async function handleLogout() {
  clearE2eeSession()
  await signOut()
  await navigateTo('/login')
}

async function handleSendMessage(content: string) {
  const replyId = replyingTo.value?.id || null
  replyingTo.value = null
  isMobileSidebarOpen.value = false
  if (matchesConfettiDictionary(content, activeConversation.value?.confetti_words)) {
    triggerConfetti()
  }
  await sendMessage(content, replyId)
}

async function handleSendImages(files: File[], caption?: string) {
  replyingTo.value = null
  isMobileSidebarOpen.value = false
  if (matchesConfettiDictionary(caption, activeConversation.value?.confetti_words)) {
    triggerConfetti()
  }
  await sendImages(files, caption)
}

let prevConfettiMessageId: string | null = null
let hasLoadedHistoryForConv = false

watch(
  () => activeConversationId.value,
  () => {
    prevConfettiMessageId = null
    hasLoadedHistoryForConv = false
  },
)

watch(
  () => isLoadingHistory.value,
  (loading) => {
    if (!loading) {
      hasLoadedHistoryForConv = true
      if (messages.value.length > 0) {
        const last = messages.value[messages.value.length - 1]
        prevConfettiMessageId = last.client_id || last.id
      }
    }
  },
  { immediate: true },
)

watch(
  () => {
    const len = messages.value.length
    if (len === 0) return ''
    const newest = messages.value[len - 1]
    return `${len}:${newest.client_id || newest.id}`
  },
  () => {
    const newMessages = messages.value
    if (!newMessages || newMessages.length === 0) {
      prevConfettiMessageId = null
      return
    }
    const newest = newMessages[newMessages.length - 1]
    const newestId = newest.client_id || newest.id

    if (isLoadingHistory.value || !hasLoadedHistoryForConv) {
      prevConfettiMessageId = newestId
      return
    }

    if (newestId !== prevConfettiMessageId) {
      prevConfettiMessageId = newestId
      if (isSystemPayload(newest.content)) {
        const sys = parseSystemPayload(newest.content)
        if (sys?.event === 'buzz') {
          triggerBuzzShake()
        }
      } else if (newest.user_id !== currentProfile.value?.id && !newest.deleted_at && newest.encryption !== 'undecryptable') {
        const msgText = isImagePayload(newest.content)
          ? parseImagePayload(newest.content)?.caption
          : newest.content
        if (matchesConfettiDictionary(msgText, activeConversation.value?.confetti_words)) {
          triggerConfetti()
        }
      }
    }
  },
  { flush: 'sync' },
)

async function handleSaveProfile(payload: {
  displayName: string
  avatarColor: string
  avatarUrl: string
  confettiEnabled?: boolean
  onSuccess?: () => void
  onError?: (message: string) => void
}) {
  if (typeof payload.confettiEnabled === 'boolean') {
    confettiEnabled.value = payload.confettiEnabled
    setConfettiEnabled(payload.confettiEnabled)
  }
  const result = await updateProfile(payload.displayName, payload.avatarColor, payload.avatarUrl)
  if (result.error || !result.profile) {
    payload.onError?.(result.error || 'Failed to update profile')
  } else {
    await syncOwnProfile(result.profile)
    payload.onSuccess?.()
    isProfileSettingsModalOpen.value = false
  }
}

function handleSwMessage(event: MessageEvent) {
  if (event.data?.type === 'NAVIGATE_CONVERSATION' && event.data.conversationId) {
    handleSelectConversation(event.data.conversationId)
  }
}

let unsubMusicSync: (() => void) | null = null

onMounted(async () => {
  initTheme?.()
  initPwaInstall()

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleGlobalKeydown)
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSwMessage)
  }

  setupMediaSessionHandlers()

  if (typeof onMusicSync === 'function') {
    unsubMusicSync = onMusicSync((event) => {
      musicApplyRemoteSyncEvent(event)
    })
  }

  await initializeE2ee()
  await initializeChat()
})

onUnmounted(() => {
  cleanupPwaInstall()
  teardownMediaSessionHandlers()
  if (unsubMusicSync) {
    unsubMusicSync()
    unsubMusicSync = null
  }
  if (audioPlayerRef.value) {
    try {
      audioPlayerRef.value.pause()
      audioPlayerRef.value.src = ''
    } catch {}
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleGlobalKeydown)
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('message', handleSwMessage)
  }
  cleanupChat()
})
</script>

<template>
  <div
    class="chat-workspace h-dvh flex overflow-hidden bg-[var(--ap-canvas)] transition-colors animate-page-enter"
    :class="uiTheme === 'vscode' ? 'p-0 pb-6 gap-0' : (uiTheme === 'yahoo' ? 'p-2 md:p-2.5 md:gap-2.5' : 'p-2 md:p-3 md:gap-3')"
  >
    <!-- In-App Notification Toasts -->
    <NotificationToastContainer
      :toasts="notificationToasts || []"
      @navigate="handleSelectConversation"
      @dismiss="dismissNotificationToast || (() => {})"
    />

    <!-- VSCode Activity Bar (48px) -->
    <div
      v-if="uiTheme === 'vscode'"
      data-test="vscode-activity-bar"
      class="w-12 shrink-0 bg-[#333333] hidden md:flex flex-col items-center py-2 justify-between border-r border-[#252526] z-30 select-none"
    >
      <div class="flex flex-col items-center gap-4 w-full text-[#858585]">
        <button
          type="button"
          class="w-full h-10 flex items-center justify-center text-white border-l-2 border-white hover:text-white transition-colors cursor-pointer"
          title="Explorer"
        >
          <MessageSquare class="size-5" />
        </button>
        <button
          type="button"
          class="w-full h-10 flex items-center justify-center hover:text-white transition-colors cursor-pointer"
          title="Search (Cmd+F)"
          @click="handleToggleSearch"
        >
          <Search class="size-5" />
        </button>
        <button
          type="button"
          class="w-full h-10 flex items-center justify-center hover:text-white transition-colors cursor-pointer"
          title="Contacts"
          @click="isContactsModalOpen = true"
        >
          <Users class="size-5" />
        </button>
        <button
          type="button"
          class="w-full h-10 flex items-center justify-center hover:text-white transition-colors cursor-pointer"
          title="New Group"
          @click="isCreateGroupModalOpen = true"
        >
          <Plus class="size-5" />
        </button>
      </div>
      <div class="flex flex-col items-center gap-3 w-full text-[#858585]">
        <button
          type="button"
          class="w-full h-10 flex items-center justify-center hover:text-white transition-colors cursor-pointer"
          title="Toggle Theme"
          @click="toggleTheme"
        >
          <Sun v-if="isDark" class="size-5" />
          <Moon v-else class="size-5" />
        </button>
        <button
          type="button"
          class="w-full h-10 flex items-center justify-center hover:text-white transition-colors cursor-pointer"
          title="Settings"
          @click="isProfileSettingsModalOpen = true"
        >
          <Settings class="size-5" />
        </button>
      </div>
    </div>

    <!-- Sidebar (Unified 260px Apple Messages Sidebar) -->
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
      :can-install-pwa="canInstallPwa"
      @install-pwa="promptInstallPwa"
      @toggle-notifications="handleToggleNotifications"
      @select-conversation="handleSelectConversation"
      @select-channel="handleSelectConversation"
      @open-contacts="isContactsModalOpen = true"
      @open-new-chat="isContactsModalOpen = true"
      @open-start-dm="isContactsModalOpen = true"
      @open-create-group="isCreateGroupModalOpen = true"
      @start-dm-with-user="handleStartDirectChat"
      @open-profile-settings="isProfileSettingsModalOpen = true"
      @open-changelog="isChangelogModalOpen = true"
      @toggle-theme="toggleTheme"
      @logout="handleLogout"
      @close-mobile="isMobileSidebarOpen = false"
    />

    <main
      data-test="chat-stage-main"
      class="flex-1 flex flex-col min-w-0 h-full bg-[var(--ap-stage)] backdrop-blur-2xl rounded-2xl border border-[var(--ap-glass-border)] shadow-xl overflow-hidden transition-transform"
      :class="{ 'animate-buzz-shake': isBuzzShaking }"
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

        <!-- VSCode Editor Tab Bar & Breadcrumbs -->
        <div
          v-if="uiTheme === 'vscode'"
          data-test="vscode-tab-bar"
          class="h-9 bg-[#ececec] dark:bg-[#252526] border-b border-[#e5e5e5] dark:border-[#1e1e1e] flex items-center justify-between px-2 text-xs font-mono select-none shrink-0"
        >
          <div class="flex items-center h-full">
            <div class="h-full px-3 flex items-center gap-2 bg-white dark:bg-[#1e1e1e] border-t-2 border-[#007acc] text-[#333333] dark:text-white font-medium">
              <span class="text-blue-500 font-bold text-[11px]">{{ activeConversation?.type === 'direct' ? 'TS' : 'MD' }}</span>
              <span>{{ activeConversation?.type === 'direct' ? `${activeConversation.peer?.display_name || 'chat'}.ts` : `${activeConversation?.title || 'general'}.md` }}</span>
              <span class="text-[10px] opacity-40 ml-1">×</span>
            </div>
          </div>
          <div class="text-[11px] text-[#858585] hidden sm:flex items-center gap-1 font-mono">
            <span>workspace</span>
            <span>&gt;</span>
            <span>chats</span>
            <span>&gt;</span>
            <span class="text-white/80">{{ activeConversation?.title || activeConversation?.peer?.display_name || 'chat' }}</span>
          </div>
        </div>

        <!-- Yahoo Stage Titlebar -->
        <div
          v-else-if="uiTheme === 'yahoo'"
          data-test="yahoo-stage-titlebar"
          class="h-7 px-3 bg-gradient-to-r from-[#500095] to-[#7b0099] flex items-center justify-between text-white font-sans text-xs font-bold shrink-0 shadow-xs"
        >
          <div class="flex items-center gap-2">
            <span class="text-[#ffcc00] font-black">Y!</span>
            <span>Instant Message - {{ activeConversation?.peer?.display_name || activeConversation?.title || 'Chat' }}</span>
          </div>
          <div class="flex items-center gap-2 text-[10px] text-white/80 font-normal">
            <span>{{ connectionStatus === 'connected' ? 'Connected' : 'Offline' }}</span>
          </div>
        </div>

        <!-- Frosted Stage Header (56px) -->
        <header class="chat-stage-header h-14 px-4 md:px-6 border-b border-[var(--ap-glass-border)] flex items-center justify-between gap-4 shrink-0 bg-[var(--ap-stage)] backdrop-blur-md">
          <div class="flex items-center gap-3 min-w-0">
            <button
              type="button"
              class="md:hidden p-1.5 rounded-full text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Open mobile navigation"
              @click="isMobileSidebarOpen = true"
            >
              <Menu class="w-5 h-5 text-[var(--ap-text-secondary)]" />
            </button>

            <div class="min-w-0 flex items-center gap-2.5">
              <!-- Direct Conversation -->
              <template v-if="activeConversation?.type === 'direct'">
                <div
                  data-test="direct-header-profile-trigger"
                  class="min-w-0 flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
                  @click="activeConversation?.peer && handleViewProfile(activeConversation.peer)"
                >
                  <UserAvatar
                    :display-name="activeConversation.peer?.display_name || 'Friend'"
                    :avatar-color="activeConversation.peer?.avatar_color"
                    :avatar-url="activeConversation.peer?.avatar_url"
                    :show-online="onlineFriends.some(f => f.id === activeConversation?.peer?.id)"
                    :shape="uiTheme === 'telegram' ? 'circle' : 'squircle'"
                    size="sm"
                  />
                  <div class="min-w-0 flex items-center gap-2">
                    <h2 class="text-[14px] font-semibold text-[var(--ap-text-primary)] flex items-center gap-1 truncate">
                      <span class="text-blue-500 dark:text-blue-400 font-mono">@</span>
                      <span class="truncate">{{ activeConversation.peer?.display_name || 'Direct Message' }}</span>
                    </h2>
                    <span
                      class="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors"
                      :class="onlineFriends.some(f => f.id === activeConversation?.peer?.id) ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-[var(--ap-text-muted)]'"
                    >
                      <span
                        class="w-1.5 h-1.5 rounded-full inline-block"
                        :class="onlineFriends.some(f => f.id === activeConversation?.peer?.id) ? 'bg-emerald-500 shadow-[0_0_6px_#34c759]' : 'bg-black/30 dark:bg-white/30'"
                      ></span>
                      {{ onlineFriends.some(f => f.id === activeConversation?.peer?.id) ? 'Active now' : 'Offline' }}
                    </span>
                  </div>
                </div>
              </template>

              <!-- Group Conversation -->
              <template v-else-if="activeConversation?.type === 'group'">
                <div class="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Users class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex items-center gap-2">
                  <button
                    type="button"
                    data-test="group-header-info-trigger"
                    class="text-left flex items-center gap-2 hover:opacity-80 transition cursor-pointer truncate"
                    @click="isGroupInfoModalOpen = true"
                  >
                    <h2 class="text-[14px] font-semibold text-[var(--ap-text-primary)] truncate">
                      {{ activeConversation?.title || 'Group Chat' }}
                    </h2>
                    <span class="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)]">
                      {{ activeConversation?.members?.length || 0 }} members
                    </span>
                  </button>
                </div>
              </template>

              <template v-else>
                <h2 class="text-[14px] font-semibold text-[var(--ap-text-muted)]">
                  Select a conversation
                </h2>
              </template>
            </div>
          </div>

          <!-- Header Right: Search, Group Info & Online Friends Avatar Stack -->
          <div class="flex items-center gap-2.5 shrink-0">
            <!-- Background Customization Trigger -->
            <button
              v-if="activeConversation || activeChannel"
              type="button"
              data-test="open-chat-background-btn"
              title="Customize chat wallpaper"
              class="p-1.5 rounded-full bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-all active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Customize chat wallpaper"
              @click="isChatBackgroundModalOpen = true"
            >
              <ImageIcon class="w-4 h-4 text-blue-500 dark:text-blue-400" />
            </button>

            <!-- Confetti Dictionary Trigger -->
            <button
              v-if="activeConversation || activeChannel"
              type="button"
              data-test="open-confetti-dictionary-btn"
              title="Confetti trigger dictionary"
              class="p-1.5 rounded-full bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-all active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Confetti trigger dictionary"
              @click="isConfettiDictionaryModalOpen = true"
            >
              <Sparkles class="w-4 h-4 text-amber-500 dark:text-amber-400" />
            </button>

            <!-- YouTube Music Room Player Trigger -->
            <button
              v-if="activeConversation || activeChannel"
              type="button"
              data-test="open-music-search-btn"
              title="Play YouTube music with room"
              class="p-1.5 rounded-full bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-all active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Play YouTube music with room"
              @click="isMusicSearchModalOpen = true"
            >
              <Music class="w-4 h-4 text-purple-500 dark:text-purple-400" />
            </button>

            <!-- Search Bar or Toggle Button -->
            <MessageSearchBar
              v-if="isSearchOpen"
              :messages="messages"
              v-model="searchQuery"
              @jump="handleJumpSearchResult"
              @close="handleCloseSearch"
            />
            <button
              v-else
              type="button"
              data-test="open-search-btn"
              title="Search messages (Cmd+F)"
              class="p-1.5 rounded-full bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-all active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              @click="handleToggleSearch"
            >
              <Search class="w-4 h-4" />
            </button>

            <!-- Beautiful Chaos Utility Panel Trigger -->
            <button
              v-if="activeConversation || activeChannel"
              type="button"
              data-test="toggle-utility-panel"
              title="Toggle Chaos & Utility Panel"
              class="p-1.5 rounded-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 text-purple-600 dark:text-purple-300 transition-all active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
              aria-label="Toggle Chaos & Utility Panel"
              @click="isUtilityPanelOpen = !isUtilityPanelOpen"
            >
              <Sparkles class="w-4 h-4" />
            </button>

            <button
              v-if="activeConversation?.type === 'group'"
              type="button"
              data-test="open-group-info"
              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-black/10 dark:border-white/10 text-xs font-medium text-[var(--ap-text-primary)] transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              aria-label="Group Info & Settings"
              @click="isGroupInfoModalOpen = true"
            >
              <Info class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
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
                class="ring-2 ring-white dark:ring-[#10121a] rounded-full"
              />
            </div>
            <div class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-medium text-[var(--ap-text-secondary)]">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#34c759]"></span>
              <span>{{ onlineFriends.length }} online</span>
            </div>
          </div>
        </header>

        <!-- Persistent Music Player Bar -->
        <MusicPlayerBar
          :track="musicCurrentTrack"
          :current-time-sec="musicCurrentTimeSec"
          :duration-sec="musicDurationSec"
          :is-muted="musicIsMuted"
          :autoplay-blocked="musicAutoplayBlocked"
          :queue-count="musicQueue.length"
          :is-queue-open="isMusicQueueOpen"
          :conversation-name="musicCurrentTrack?.conversationId !== activeConversationId ? (conversations.find(c => c.id === musicCurrentTrack?.conversationId)?.title || conversations.find(c => c.id === musicCurrentTrack?.conversationId)?.peer?.display_name || undefined) : undefined"
          @toggle-play="musicTogglePlayPause"
          @seek="musicSeekTo"
          @toggle-mute="musicToggleMute"
          @stop="musicStopPlayback(true)"
          @unblock-autoplay="musicUnblockAutoplay"
          @open-search="isMusicSearchModalOpen = true"
          @skip="musicSkipToNext"
          @toggle-queue="isMusicQueueOpen = !isMusicQueueOpen"
        />

        <!-- Music Queue & History Collapsible Panel -->
        <MusicQueuePanel
          v-if="isMusicQueueOpen && musicCurrentTrack"
          :open="isMusicQueueOpen"
          :queue="musicQueue"
          :history="musicHistory"
          :current-track="musicCurrentTrack"
          @close="isMusicQueueOpen = false"
          @remove="musicRemoveFromQueue"
          @move="musicMoveInQueue"
          @clear="musicClearQueue"
          @play-now="handleSelectMusicTrack"
          @queue-track="handleQueueMusicTrack"
        />

        <!-- Stage Subtabs Navigation (Messages | Media | Links) -->
        <div
          v-if="activeConversation || activeChannel"
          data-test="stage-subtabs"
          class="h-10 px-4 md:px-6 border-b border-[var(--ap-glass-border)] flex items-center gap-1.5 shrink-0 bg-black/[0.02] dark:bg-white/[0.02]"
        >
          <button
            type="button"
            data-test="subtab-messages"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            :class="activeStageTab === 'messages' ? 'bg-black/10 dark:bg-white/12 text-[var(--ap-text-primary)] shadow-sm' : 'text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'"
            @click="activeStageTab = 'messages'"
          >
            <MessageSquare class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>Messages</span>
          </button>

          <button
            type="button"
            data-test="subtab-media"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            :class="activeStageTab === 'media' ? 'bg-black/10 dark:bg-white/12 text-[var(--ap-text-primary)] shadow-sm' : 'text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'"
            @click="activeStageTab = 'media'"
          >
            <ImageIcon class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>Media</span>
            <span
              v-if="mediaCount > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/10 dark:bg-white/10 text-[var(--ap-text-secondary)]"
            >
              {{ mediaCount }}
            </span>
          </button>

          <button
            type="button"
            data-test="subtab-links"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            :class="activeStageTab === 'links' ? 'bg-black/10 dark:bg-white/12 text-[var(--ap-text-primary)] shadow-sm' : 'text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'"
            @click="activeStageTab = 'links'"
          >
            <Link2 class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>Links</span>
            <span
              v-if="linksCount > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/10 dark:bg-white/10 text-[var(--ap-text-secondary)]"
            >
              {{ linksCount }}
            </span>
          </button>
        </div>

        <!-- Message Viewport -->
        <MessageViewport
          v-if="activeStageTab === 'messages'"
          ref="messageViewportRef"
          :messages="messages"
          :search-query="searchQuery"
          :background-url="activeConversation?.background_url || activeChannel?.background_url"
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
          :read-receipts="activeConversationReads"
          :members="activeConversationMembers"
          :load-older="loadOlderMessages"
          @retry="retryMessage"
          @dismiss="dismissMessage"
          @reply="replyingTo = $event"
          @edit="editMessage($event.messageId, $event.content)"
          @delete="deleteMessage($event)"
          @toggle-reaction="toggleReaction($event.messageId, $event.emoji)"
          @select-image="handleOpenLightbox"
          @toggle-pin="togglePinMessage"
          @view-profile="handleViewProfile"
        >
          <!-- Message Composer -->
          <MessageComposer
            :conversation-id="activeConversationId || activeChannelId"
            :channel-slug="activeConversation?.type === 'direct' ? (activeConversation.peer?.display_name || 'friend') : (activeConversation?.title || activeChannel?.slug || 'chat')"
            :is-dm="activeConversation?.type === 'direct' || Boolean(activeChannel?.is_dm)"
            :typing-label="typingLabel"
            :disabled="connectionStatus !== 'connected'"
            :replying-to="replyingTo"
            :mention-candidates="knownProfiles"
            @send="handleSendMessage"
            @buzz="handleSendBuzz"
            @typing="notifyTyping"
            @cancel-reply="replyingTo = null"
            @send-images="handleSendImages"
            @toggle-stickers="isUtilityPanelOpen = !isUtilityPanelOpen"
          />
        </MessageViewport>

        <!-- Media Subtab Gallery -->
        <ChatMediaGallery
          v-else-if="activeStageTab === 'media'"
          :messages="messages"
          :channel-id="activeConversationId || activeChannelId"
          :has-more-history="hasMoreHistory"
          :is-loading-history="isLoadingHistory"
          :load-older="loadOlderMessages"
          @select-image="handleOpenLightbox"
          @view-profile="handleViewProfile"
        />

        <!-- Shared Links Subtab -->
        <ChatLinksList
          v-else-if="activeStageTab === 'links'"
          :messages="messages"
          :has-more-history="hasMoreHistory"
          :is-loading-history="isLoadingHistory"
          :load-older="loadOlderMessages"
          @jump-to-message="handleJumpToMessageFromTab"
          @view-profile="handleViewProfile"
        />
      </main>

      <!-- Right Utility Panel (Collapsible Beautiful Chaos Hub) -->
      <RightUtilityPanel
        :is-open="isUtilityPanelOpen"
        :conversation="activeConversation"
        :media-count="mediaCount"
        :links-count="linksCount"
        @close="isUtilityPanelOpen = false"
        @send-sticker="handleSendMessage"
        @send-reaction="handleSendQuickReaction"
        @switch-tab="activeStageTab = $event"
        @open-background="isChatBackgroundModalOpen = true"
        @open-confetti="isConfettiDictionaryModalOpen = true"
        @open-group-info="isGroupInfoModalOpen = true"
      />

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
        @view-profile="handleViewProfile"
        @open-background="isChatBackgroundModalOpen = true"
        @open-confetti-dictionary="isConfettiDictionaryModalOpen = true"
      />

      <!-- Chat Background Modal -->
      <ChatBackgroundModal
        :is-open="isChatBackgroundModalOpen"
        :conversation="activeConversation"
        @close="isChatBackgroundModalOpen = false"
        @select-preset="handleSelectBackgroundPreset"
        @upload-file="handleUploadBackgroundFile"
        @reset="handleResetBackground"
      />

      <!-- Confetti Dictionary Modal -->
      <ConfettiDictionaryModal
        :is-open="isConfettiDictionaryModalOpen"
        :conversation="activeConversation"
        @close="isConfettiDictionaryModalOpen = false"
        @add-word="handleAddConfettiWord"
        @remove-word="handleRemoveConfettiWord"
      />

      <!-- Profile Settings Modal -->
      <ProfileSettingsModal
        :is-open="isProfileSettingsModalOpen"
        :profile="currentProfile"
        @close="isProfileSettingsModalOpen = false"
        @save="handleSaveProfile"
      />

      <!-- Changelog / What's New Modal -->
      <ChangelogModal
        :is-open="isChangelogModalOpen"
        @close="isChangelogModalOpen = false"
      />

      <!-- User Profile View Modal -->
      <UserProfileModal
        :is-open="isUserProfileModalOpen"
        :profile="selectedUserProfile"
        :is-online="onlineFriends.some(f => f.id === selectedUserProfile?.id)"
        :is-current-user="selectedUserProfile?.id === currentProfile?.id"
        @close="isUserProfileModalOpen = false"
        @start-dm="handleStartDirectChat"
      />

      <!-- Image Lightbox Viewer Modal -->
      <ImageViewerModal
        :open="isLightboxOpen"
        :images="lightboxImages"
        :initial-index="lightboxInitialIndex"
        :channel-id="activeConversationId || activeChannelId || ''"
        @update:open="isLightboxOpen = $event"
      />

      <!-- Confetti Burst Overlay (Raycast-Style Dual Cannon) -->
      <ConfettiOverlay
        :active="isConfettiActive"
        :burst-key="confettiBurstKey"
        @complete="isConfettiActive = false"
      />

      <!-- Native HTML5 audio element for persistent room playback (server-proxied to bypass corporate network restrictions) -->
      <audio
        id="youtube-hidden-player"
        ref="audioPlayerRef"
        preload="auto"
        class="hidden pointer-events-none w-0 h-0 opacity-0 overflow-hidden"
        aria-hidden="true"
        @timeupdate="handleAudioTimeUpdate"
        @loadedmetadata="handleAudioMetadata"
        @durationchange="handleAudioMetadata"
        @play="musicAutoplayBlocked = false"
        @ended="handleAudioEnded"
        @error="handleAudioError"
      ></audio>

      <!-- YouTube Music Search Modal -->
      <YouTubeSearchModal
        :open="isMusicSearchModalOpen"
        :conversation-title="activeConversation?.title || activeConversation?.peer?.display_name || undefined"
        @close="isMusicSearchModalOpen = false"
        @select="handleSelectMusicTrack"
        @queue="handleQueueMusicTrack"
      />

    <!-- VSCode Status Bar -->
    <footer
      v-if="uiTheme === 'vscode'"
      data-test="vscode-status-bar"
      class="fixed bottom-0 inset-x-0 h-6 bg-[#007acc] text-white text-[11px] font-mono flex items-center justify-between px-3 z-30 select-none"
    >
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1">
          <span class="font-bold">main*</span>
          <span>·</span>
          <span>{{ connectionStatus === 'connected' ? 'Live' : 'Sync' }}</span>
        </span>
        <span class="hidden sm:inline">🔒 E2EE AES-GCM-256</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="hidden sm:inline">UTF-8</span>
        <span>TypeScript Vue</span>
      </div>
    </footer>
  </div>
</template>
