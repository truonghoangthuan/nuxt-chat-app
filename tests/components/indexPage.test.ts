import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import type { Conversation, Contact, Profile } from '~/types/chat'

const mockChatRoomState = {
  conversations: ref<Conversation[]>([]),
  activeConversationId: ref<string | null>(null),
  activeConversation: ref<Conversation | null>(null),
  contacts: ref<Contact[]>([]),
  findUserByEmail: vi.fn(),
  addContact: vi.fn(),
  removeContact: vi.fn(),
  openOrCreateDirectChat: vi.fn(),
  createGroup: vi.fn(),
  addMemberToGroup: vi.fn(),
  leaveGroup: vi.fn(),
  updateGroupTitle: vi.fn().mockResolvedValue({ error: null }),
  updateChatBackground: vi.fn().mockResolvedValue({ error: null }),
  removeChatBackground: vi.fn().mockResolvedValue({ error: null }),
  selectConversation: vi.fn(),

  channels: ref([]),
  publicChannels: ref([]),
  dmChannels: ref([]),
  activeChannelId: ref(null),
  activeChannel: ref(null),
  selectChannel: vi.fn(),
  createChannel: vi.fn(),
  openOrCreateDm: vi.fn(),

  messages: ref([]),
  hasMoreHistory: ref(false),
  isLoadingHistory: ref(false),
  unreadCounts: ref<Record<string, number>>({}),
  unreadMentions: ref<Record<string, number>>({}),
  activeChannelUnreadSince: ref(null),
  activeConversationReads: ref<Record<string, string>>({}),
  allProfiles: ref<Profile[]>([]),
  knownProfiles: ref<Profile[]>([]),
  onlineFriends: ref<Profile[]>([]),
  typingLabel: ref(''),
  connectionStatus: ref<'connected' | 'reconnecting' | 'disconnected'>('connected'),
  reconnectCountdownSec: ref(0),
  initializeChat: vi.fn(),
  sendMessage: vi.fn(),
  sendBuzz: vi.fn().mockResolvedValue(undefined),
  sendImages: vi.fn(),
  retryMessage: vi.fn(),
  dismissMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  togglePinMessage: vi.fn(),
  toggleReaction: vi.fn(),
  loadOlderMessages: vi.fn(),
  notifyTyping: vi.fn(),
  retryConnectionNow: vi.fn(),
  syncOwnProfile: vi.fn(),
  cleanupChat: vi.fn(),
  soundEnabled: ref(true),
  desktopEnabled: ref(true),
  notificationPermission: ref('default'),
  notificationToasts: ref([]),
  toggleSound: vi.fn(),
  toggleDesktop: vi.fn(),
  requestNotificationPermission: vi.fn(),
  dismissNotificationToast: vi.fn(),
  addNotificationToast: vi.fn(),
  onMusicSync: vi.fn(),
  broadcastMusicSync: vi.fn(),
  sendMusicPlaySystemMessage: vi.fn(),
  sendMusicActionSystemMessage: vi.fn(),
}

const mockAuthProfileState = {
  currentProfile: ref<Profile | null>({
    id: 'u-self',
    display_name: 'Self User',
    avatar_color: '#3b82f6',
  }),
  updateProfile: vi.fn().mockImplementation(async (displayName, avatarColor, avatarUrl) => ({
    error: null,
    profile: {
      id: 'u-self',
      display_name: displayName,
      avatar_color: avatarColor,
      avatar_url: avatarUrl,
    },
  })),
  signOut: vi.fn(),
}

const mockE2eeState = {
  status: ref<'unconfigured' | 'locked' | 'unlocked' | 'loading'>('unlocked'),
  error: ref<string | null>(null),
  isUnlocking: ref(false),
  initializeE2ee: vi.fn().mockResolvedValue('unlocked'),
  unlockWithPhrase: vi.fn().mockResolvedValue(true),
  clearE2eeSession: vi.fn(),
}

vi.mock('~/composables/useChatRoom', () => ({
  useChatRoom: () => mockChatRoomState,
}))

vi.mock('~/composables/useAuthProfile', () => ({
  useAuthProfile: () => mockAuthProfileState,
}))

vi.mock('~/composables/useTheme', () => ({
  useTheme: () => ({
    isDark: ref(true),
    uiTheme: ref('default'),
    toggleTheme: vi.fn(),
    initTheme: vi.fn(),
    setUiTheme: vi.fn(),
  }),
}))

vi.mock('~/composables/useE2ee', () => ({
  useE2ee: () => mockE2eeState,
}))

import IndexPage from '~/pages/index.vue'
import ContactsModal from '~/components/ContactsModal.vue'
import CreateGroupModal from '~/components/CreateGroupModal.vue'
import GroupInfoModal from '~/components/GroupInfoModal.vue'

describe('IndexPage (app/pages/index.vue)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockE2eeState.status.value = 'unlocked'
    mockChatRoomState.conversations.value = []
    mockChatRoomState.activeConversationId.value = null
    mockChatRoomState.activeConversation.value = null
    mockChatRoomState.contacts.value = []
    mockChatRoomState.onlineFriends.value = []
  })

  it.each(['play', 'pause', 'nexttrack', 'seekto'])(
    'keeps workspace hydration and cleanup working when Media Session action %s is unsupported',
    async (unsupportedAction) => {
      const errors: unknown[] = []
      const setActionHandler = vi.fn((action: string) => {
        if (action === unsupportedAction) throw new DOMException('Unsupported action', 'NotSupportedError')
      })
      const mediaSession = { setActionHandler, metadata: null, playbackState: 'none' }
      vi.stubGlobal('navigator', { mediaSession })
      const unsubscribe = vi.fn()
      mockChatRoomState.onMusicSync.mockReturnValueOnce(unsubscribe)
      let wrapper: ReturnType<typeof mount> | undefined
      try {
        wrapper = mount(IndexPage, { global: { config: { errorHandler: error => errors.push(error) } } })
        await flushPromises()

        expect(errors).toEqual([])
        for (const action of ['play', 'pause', 'nexttrack', 'seekto']) {
          expect(setActionHandler).toHaveBeenCalledWith(action, expect.any(Function))
        }
        expect(mockChatRoomState.initializeChat).toHaveBeenCalledOnce()

        wrapper.unmount()
        wrapper = undefined
        expect(errors).toEqual([])
        for (const action of ['play', 'pause', 'nexttrack', 'seekto']) {
          expect(setActionHandler).toHaveBeenCalledWith(action, null)
        }
        expect(mediaSession.metadata).toBeNull()
        expect(mediaSession.playbackState).toBe('none')
        expect(unsubscribe).toHaveBeenCalledOnce()
        expect(mockChatRoomState.cleanupChat).toHaveBeenCalledOnce()
      } finally {
        wrapper?.unmount()
        vi.unstubAllGlobals()
      }
    },
  )

  it('mounts workspace and sidebar directly without E2eeGate', async () => {
    mockE2eeState.status.value = 'locked'
    const wrapper = mount(IndexPage)

    expect(wrapper.findComponent({ name: 'E2eeGate' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChatSidebar' }).exists()).toBe(true)
  })

  it('renders direct conversation header with peer name and online status', async () => {
    const peer: Profile = {
      id: 'u-alice',
      display_name: 'Alice',
      avatar_color: '#10b981',
    }
    mockChatRoomState.activeConversationId.value = 'conv-direct-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-direct-1',
      type: 'direct',
      title: null,
      created_by: 'u-self',
      created_at: '2026-10-21T00:00:00Z',
      peer,
    }
    mockChatRoomState.onlineFriends.value = [peer]

    const wrapper = mount(IndexPage)

    expect(wrapper.text()).toContain('@Alice')
    expect(wrapper.text()).toContain('Active now')
  })

  it('renders direct conversation header with Offline when peer is offline', async () => {
    const peer: Profile = {
      id: 'u-bob',
      display_name: 'Bob',
      avatar_color: '#f59e0b',
    }
    mockChatRoomState.activeConversationId.value = 'conv-direct-2'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-direct-2',
      type: 'direct',
      title: null,
      created_by: 'u-self',
      created_at: '2026-10-21T00:00:00Z',
      peer,
    }
    mockChatRoomState.onlineFriends.value = []

    const wrapper = mount(IndexPage)

    expect(wrapper.text()).toContain('@Bob')
    expect(wrapper.text()).toContain('Offline')
  })

  it('renders group conversation header and opens GroupInfoModal on click', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-group-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-group-1',
      type: 'group',
      title: 'Design Guild',
      created_by: 'u-self',
      created_at: '2026-10-21T00:00:00Z',
      members: [
        {
          conversation_id: 'conv-group-1',
          user_id: 'u-self',
          role: 'owner',
          joined_at: '2026-10-21T00:00:00Z',
        },
        {
          conversation_id: 'conv-group-1',
          user_id: 'u-2',
          role: 'member',
          joined_at: '2026-10-21T00:00:00Z',
        },
      ],
    }

    const wrapper = mount(IndexPage)

    expect(wrapper.text()).toContain('Design Guild')
    expect(wrapper.text()).toContain('2 members')

    const groupInfoModal = wrapper.findComponent(GroupInfoModal)
    expect(groupInfoModal.props('isOpen')).toBe(false)

    const infoTrigger = wrapper.find('[data-test="open-group-info"]')
    expect(infoTrigger.exists()).toBe(true)
    await infoTrigger.trigger('click')

    expect(groupInfoModal.props('isOpen')).toBe(true)
  })

  it('opens ContactsModal when openContacts event is emitted from sidebar and selects contact', async () => {
    const wrapper = mount(IndexPage)
    const contactsModal = wrapper.findComponent(ContactsModal)

    expect(contactsModal.props('isOpen')).toBe(false)

    // Trigger open-contacts from ChatSidebar
    const sidebar = wrapper.findComponent({ name: 'ChatSidebar' })
    sidebar.vm.$emit('openContacts')
    await wrapper.vm.$nextTick()

    expect(contactsModal.props('isOpen')).toBe(true)

    // Trigger selectContact
    mockChatRoomState.openOrCreateDirectChat.mockResolvedValue({ id: 'conv-1', type: 'direct' })
    contactsModal.vm.$emit('selectContact', 'u-alice')
    await flushPromises()

    expect(mockChatRoomState.openOrCreateDirectChat).toHaveBeenCalledWith('u-alice')
    expect(contactsModal.props('isOpen')).toBe(false)
  })

  it('opens CreateGroupModal and handles create group', async () => {
    const wrapper = mount(IndexPage)
    const createGroupModal = wrapper.findComponent(CreateGroupModal)

    expect(createGroupModal.props('isOpen')).toBe(false)

    // Trigger open-create-group from ChatSidebar
    const sidebar = wrapper.findComponent({ name: 'ChatSidebar' })
    sidebar.vm.$emit('openCreateGroup')
    await wrapper.vm.$nextTick()

    expect(createGroupModal.props('isOpen')).toBe(true)

    // Trigger create with members
    mockChatRoomState.createGroup.mockResolvedValue({ id: 'conv-new-group' })
    createGroupModal.vm.$emit('create', {
      title: 'Frontend Engineers',
      memberUserIds: ['u-1', 'u-2'],
      invitedEmails: [],
    })
    await flushPromises()

    expect(mockChatRoomState.createGroup).toHaveBeenCalledWith('Frontend Engineers', ['u-1', 'u-2'])
    expect(createGroupModal.props('isOpen')).toBe(false)
  })

  it('wires GroupInfoModal actions: addMember and leave', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-group-9'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-group-9',
      type: 'group',
      title: 'Book Club',
      created_by: 'u-self',
      created_at: '2026-10-21T00:00:00Z',
      members: [],
    }

    const wrapper = mount(IndexPage)
    const groupInfoModal = wrapper.findComponent(GroupInfoModal)

    // Open group info modal
    await wrapper.find('[data-test="open-group-info"]').trigger('click')
    expect(groupInfoModal.props('isOpen')).toBe(true)

    // Test addMember
    mockChatRoomState.addMemberToGroup.mockResolvedValue(undefined)
    groupInfoModal.vm.$emit('addMember', 'new@example.com')
    await flushPromises()

    expect(mockChatRoomState.addMemberToGroup).toHaveBeenCalledWith('conv-group-9', 'new@example.com')

    // Test leave
    mockChatRoomState.leaveGroup.mockResolvedValue(undefined)
    groupInfoModal.vm.$emit('leave', 'conv-group-9')
    await flushPromises()

    expect(mockChatRoomState.leaveGroup).toHaveBeenCalledWith('conv-group-9')
    expect(groupInfoModal.props('isOpen')).toBe(false)
  })

  it('calls updateGroupTitle when GroupInfoModal emits update-title', async () => {
    const wrapper = mount(IndexPage)
    await flushPromises()

    const modal = wrapper.findComponent({ name: 'GroupInfoModal' })
    expect(modal.exists()).toBe(true)

    mockChatRoomState.activeConversationId.value = 'conv-grp-1'
    await modal.vm.$emit('updateTitle', 'Renamed Group')

    expect(mockChatRoomState.updateGroupTitle).toHaveBeenCalledWith('conv-grp-1', 'Renamed Group')
  })

  it('calls addNotificationToast when updateGroupTitle fails', async () => {
    mockChatRoomState.updateGroupTitle.mockResolvedValueOnce({ error: 'Network error' })
    const wrapper = mount(IndexPage)
    await flushPromises()

    const modal = wrapper.findComponent({ name: 'GroupInfoModal' })
    mockChatRoomState.activeConversationId.value = 'conv-grp-1'
    await modal.vm.$emit('updateTitle', 'Fail Group')

    expect(mockChatRoomState.addNotificationToast).toHaveBeenCalledWith({
      conversationId: 'conv-grp-1',
      title: 'Failed to update group name',
      snippet: 'Network error',
    })
  })

  it('renders NotificationPermissionBanner when permission is default and triggers request', async () => {
    mockChatRoomState.notificationPermission.value = 'default'
    const wrapper = mount(IndexPage)

    const banner = wrapper.find('[data-test="notification-permission-banner"]')
    expect(banner.exists()).toBe(true)

    const enableBtn = wrapper.find('[data-test="enable-notifications-banner-btn"]')
    await enableBtn.trigger('click')

    expect(mockChatRoomState.requestNotificationPermission).toHaveBeenCalledTimes(1)
  })

  it('renders chat background button in stage header and opens ChatBackgroundModal', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
    }
    const wrapper = mount(IndexPage)
    const btn = wrapper.find('[data-test="open-chat-background-btn"]')
    expect(btn.exists()).toBe(true)

    await btn.trigger('click')
    const bgModal = wrapper.findComponent({ name: 'ChatBackgroundModal' })
    expect(bgModal.exists()).toBe(true)
    expect(bgModal.props('isOpen')).toBe(true)
  })

  it('mounts MessageComposer inside MessageViewport so conversation background covers the composer dock', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      background_url: 'preset:aurora',
    }
    const wrapper = mount(IndexPage)
    const viewport = wrapper.findComponent({ name: 'MessageViewport' })
    const bgLayer = viewport.find('[data-test="chat-background-layer"]')
    const composerDeck = viewport.find('[data-test="composer-deck"]')

    expect(bgLayer.exists()).toBe(true)
    expect(composerDeck.exists()).toBe(true)
  })

  it('renders stage subtabs (Messages | Media | Links), switches views, and handles jumpToMessage from Links', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
    }
    const wrapper = mount(IndexPage)
    await flushPromises()

    // Subtabs bar exists
    const subtabs = wrapper.find('[data-test="stage-subtabs"]')
    expect(subtabs.exists()).toBe(true)

    const tabMessages = wrapper.find('[data-test="subtab-messages"]')
    const tabMedia = wrapper.find('[data-test="subtab-media"]')
    const tabLinks = wrapper.find('[data-test="subtab-links"]')

    expect(tabMessages.exists()).toBe(true)
    expect(tabMedia.exists()).toBe(true)
    expect(tabLinks.exists()).toBe(true)

    // Initially Messages view is active
    expect(wrapper.findComponent({ name: 'MessageViewport' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ChatMediaGallery' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChatLinksList' }).exists()).toBe(false)

    // Switch to Media tab
    await tabMedia.trigger('click')
    expect(wrapper.findComponent({ name: 'MessageViewport' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ChatMediaGallery' }).exists()).toBe(true)

    // Switch to Links tab
    await tabLinks.trigger('click')
    expect(wrapper.findComponent({ name: 'ChatMediaGallery' }).exists()).toBe(false)
    const linksComp = wrapper.findComponent({ name: 'ChatLinksList' })
    expect(linksComp.exists()).toBe(true)

    // Emitting jumpToMessage from ChatLinksList switches back to Messages tab
    linksComp.vm.$emit('jumpToMessage', 'm-target-1')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'MessageViewport' }).exists()).toBe(true)
  })

  it.each([
    ['text', 'See you tomorrow'],
    ['text', 'Ok'],
    ['image', 'A photo from today'],
    ['image', 'Rõ ràng'],
  ])('celebrates outgoing %s once when content matches dictionary: %s', async (kind, content) => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      confetti_words: ['see you tomorrow', 'ok', 'a photo from today', 'rõ ràng'],
    } as Conversation
    mockChatRoomState.messages.value = []
    mockChatRoomState.isLoadingHistory.value = false
    const wrapper = mount(IndexPage)
    await flushPromises()

    const composer = wrapper.findComponent({ name: 'MessageComposer' })
    const confetti = wrapper.findComponent({ name: 'ConfettiOverlay' })
    const files = [new File(['photo'], 'photo.png', { type: 'image/png' })]

    for (let i = 1; i <= 2; i++) {
      if (kind === 'image') {
        composer.vm.$emit('sendImages', files, content)
      } else {
        composer.vm.$emit('send', content)
      }
      await wrapper.vm.$nextTick()
      expect(confetti.props('burstKey')).toBe(i)
      expect(confetti.props('active')).toBe(true)

      // The local optimistic row and its server confirmation must not burst again.
      const row = {
        id: `local-${i}`, client_id: `client-${i}`,
        conversation_id: 'conv-1', user_id: 'u-self',
        content: kind === 'image'
          ? JSON.stringify({ type: 'images', images: [], caption: content })
          : content,
        created_at: new Date().toISOString(), status: 'sending',
      } as any
      mockChatRoomState.messages.value = [...mockChatRoomState.messages.value, row]
      await wrapper.vm.$nextTick()
      expect(confetti.props('burstKey')).toBe(i)
      mockChatRoomState.messages.value = mockChatRoomState.messages.value.map(
        (message: any) => message.client_id === row.client_id
          ? { ...message, id: `server-${i}`, status: 'sent' } : message,
      )
      await wrapper.vm.$nextTick()
      expect(confetti.props('burstKey')).toBe(i)
    }

    if (kind === 'image') {
      expect(mockChatRoomState.sendImages).toHaveBeenCalledWith(files, content)
    } else {
      expect(mockChatRoomState.sendMessage).toHaveBeenCalledWith(content, null)
    }
    wrapper.unmount()
  })

  it('triggers confetti overlay when sending message matching conversation dictionary', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      confetti_words: ['congratulation', 'ok', 'cool'],
    }
    const wrapper = mount(IndexPage)
    await flushPromises()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)

    // Trigger handleSendMessage with matching content
    const composer = wrapper.findComponent({ name: 'MessageComposer' })
    composer.vm.$emit('send', 'congratulation on your launch!')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="confetti-canvas"]').exists()).toBe(true)
  })

  it('increments burst key and keeps confetti overlay active across rapid consecutive messages', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      confetti_words: ['ok', 'cool'],
    }
    const wrapper = mount(IndexPage)
    await flushPromises()

    const composer = wrapper.findComponent({ name: 'MessageComposer' })
    await composer.vm.$emit('send', 'ok')
    await wrapper.vm.$nextTick()

    const confetti = wrapper.findComponent({ name: 'ConfettiOverlay' })
    expect(confetti.exists()).toBe(true)
    expect(confetti.props('active')).toBe(true)
    expect(confetti.props('burstKey')).toBe(1)

    // Second rapid message
    await composer.vm.$emit('send', 'cool!')
    await wrapper.vm.$nextTick()

    expect(confetti.props('active')).toBe(true)
    expect(confetti.props('burstKey')).toBe(2)
  })

  it('triggers confetti overlay when a new realtime message with rõ ràng arrives in active chat', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      confetti_words: ['rõ ràng'],
    }
    mockChatRoomState.messages.value = []
    const wrapper = mount(IndexPage)
    await flushPromises()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)

    // Simulate new incoming message row arriving
    mockChatRoomState.messages.value = [
      {
        id: 'm-new-1',
        client_id: 'c-new-1',
        conversation_id: 'conv-1',
        user_id: 'u-other',
        content: 'Rõ ràng là rất tuyệt vời!',
        created_at: new Date().toISOString(),
        status: 'sent',
      } as any,
    ]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="confetti-canvas"]').exists()).toBe(true)
  })

  it('does not trigger confetti for messages that do not match conversation dictionary words', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      confetti_words: ['specific-trigger'],
    }
    mockChatRoomState.messages.value = []
    const wrapper = mount(IndexPage)
    await flushPromises()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)

    mockChatRoomState.messages.value = [
      {
        id: 'm-new-regular',
        client_id: 'c-new-regular',
        conversation_id: 'conv-1',
        user_id: 'u-other',
        content: 'Just a regular everyday message with no celebration words',
        created_at: new Date().toISOString(),
        status: 'sent',
      } as any,
    ]
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)
  })

  it('opens ConfettiDictionaryModal from stage header button', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      confetti_words: ['launch'],
    }
    const wrapper = mount(IndexPage)
    await flushPromises()

    const openBtn = wrapper.find('[data-test="open-confetti-dictionary-btn"]')
    expect(openBtn.exists()).toBe(true)

    await openBtn.trigger('click')
    const dictModal = wrapper.findComponent({ name: 'ConfettiDictionaryModal' })
    expect(dictModal.exists()).toBe(true)
    expect(dictModal.props('isOpen')).toBe(true)
  })

  it('opens YouTubeSearchModal from stage header button', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
    }
    const wrapper = mount(IndexPage)
    await flushPromises()

    const openBtn = wrapper.find('[data-test="open-music-search-btn"]')
    expect(openBtn.exists()).toBe(true)

    await openBtn.trigger('click')
    const musicModal = wrapper.findComponent({ name: 'YouTubeSearchModal' })
    expect(musicModal.exists()).toBe(true)
    expect(musicModal.props('open')).toBe(true)
  })

  it('does not trigger confetti overlay when conversation history loads with celebration keywords', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
    }
    mockChatRoomState.messages.value = []
    const wrapper = mount(IndexPage)
    await flushPromises()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)

    // Simulate history query returning initial batch of messages
    mockChatRoomState.isLoadingHistory.value = true
    mockChatRoomState.messages.value = [
      {
        id: 'm-historical-1',
        client_id: 'c-historical-1',
        conversation_id: 'conv-1',
        user_id: 'u-other',
        content: 'Historical message with cool and congratulation',
        created_at: '2026-10-18T10:00:00Z',
        status: 'sent',
      } as any,
    ]
    mockChatRoomState.isLoadingHistory.value = false
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)
  })

  it('does not celebrate conversation switches or paginated history', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.messages.value = []
    mockChatRoomState.isLoadingHistory.value = false
    const wrapper = mount(IndexPage)
    await flushPromises()
    const confetti = wrapper.findComponent({ name: 'ConfettiOverlay' })

    mockChatRoomState.activeConversationId.value = 'conv-2'
    await wrapper.vm.$nextTick()
    mockChatRoomState.isLoadingHistory.value = true
    await wrapper.vm.$nextTick()
    const historical = {
      id: 'history', client_id: 'history-client', conversation_id: 'conv-2',
      user_id: 'u-self', content: 'Ok', status: 'sent',
      created_at: '2026-10-18T10:00:00Z',
    } as any
    mockChatRoomState.messages.value = [historical]
    mockChatRoomState.isLoadingHistory.value = false
    await wrapper.vm.$nextTick()
    expect(confetti.props('burstKey')).toBe(0)

    mockChatRoomState.isLoadingHistory.value = true
    await wrapper.vm.$nextTick()
    mockChatRoomState.messages.value = [
      { ...historical, id: 'older', client_id: 'older-client', user_id: 'u-other', content: 'Rõ ràng' },
      historical,
    ]
    mockChatRoomState.isLoadingHistory.value = false
    await wrapper.vm.$nextTick()
    expect(confetti.props('burstKey')).toBe(0)
    wrapper.unmount()
  })

  it('removes service worker message event listener when unmounted', async () => {
    const addEventListenerSpy = vi.fn()
    const removeEventListenerSpy = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      },
      configurable: true,
      writable: true,
    })

    const wrapper = mount(IndexPage)
    await flushPromises()
    expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))

    wrapper.unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('handles addMember and leaveGroup errors with notification toasts', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-group-9'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-group-9',
      type: 'group',
      title: 'General',
      created_by: 'u-self',
      members: [],
    }
    mockChatRoomState.addMemberToGroup.mockRejectedValueOnce(new Error('User not found'))
    mockChatRoomState.leaveGroup.mockRejectedValueOnce(new Error('Cannot leave group'))

    const wrapper = mount(IndexPage)
    await flushPromises()

    await wrapper.find('[data-test="open-group-info"]').trigger('click')
    const modal = wrapper.findComponent({ name: 'GroupInfoModal' })
    modal.vm.$emit('addMember', 'nonexistent@example.com')
    await flushPromises()

    expect(mockChatRoomState.addNotificationToast).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-group-9',
        title: 'Failed to add member',
        snippet: 'User not found',
      }),
    )

    modal.vm.$emit('leave', 'conv-group-9')
    await flushPromises()

    expect(mockChatRoomState.addNotificationToast).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-group-9',
        title: 'Failed to leave group',
        snippet: 'Cannot leave group',
      }),
    )
  })

  it('does not trigger confetti when confettiEnabled is false in settings', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.messages.value = []
    const wrapper = mount(IndexPage)
    await flushPromises()

    const profileModal = wrapper.findComponent({ name: 'ProfileSettingsModal' })
    profileModal.vm.$emit('save', {
      displayName: 'Self User',
      avatarColor: '#3b82f6',
      avatarUrl: '',
      confettiEnabled: false,
      onSuccess: vi.fn(),
    })
    await flushPromises()

    const composer = wrapper.findComponent({ name: 'MessageComposer' })
    composer.vm.$emit('send', 'Congratulations on the new job!')
    await flushPromises()

    const confetti = wrapper.findComponent({ name: 'ConfettiOverlay' })
    expect(confetti.props('burstKey')).toBe(0)
  })

  it('emits buzz from composer, calls sendBuzz, and activates buzz shake on main', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    const wrapper = mount(IndexPage)
    await flushPromises()

    const composer = wrapper.findComponent({ name: 'MessageComposer' })
    composer.vm.$emit('buzz')
    await flushPromises()

    expect(mockChatRoomState.sendBuzz).toHaveBeenCalled()
    const mainEl = wrapper.find('[data-test="chat-stage-main"]')
    expect(mainEl.classes()).toContain('animate-buzz-shake')
  })

  it('triggers buzz shake animation on incoming realtime buzz message', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.messages.value = []
    mockChatRoomState.isLoadingHistory.value = false
    const wrapper = mount(IndexPage)
    await flushPromises()

    mockChatRoomState.messages.value = [
      {
        id: 'm-buzz-1',
        client_id: 'c-buzz-1',
        conversation_id: 'conv-1',
        user_id: 'u-other',
        content: JSON.stringify({ type: 'system', event: 'buzz', actorName: 'Bob' }),
        created_at: '2026-10-26T12:00:00Z',
        status: 'sent',
      } as any,
    ]
    await wrapper.vm.$nextTick()

    const mainEl = wrapper.find('[data-test="chat-stage-main"]')
    expect(mainEl.classes()).toContain('animate-buzz-shake')
  })

  it('opens ChangelogModal when openChangelog is emitted from ChatSidebar', async () => {
    const wrapper = mount(IndexPage)
    await flushPromises()

    const changelogModal = wrapper.findComponent({ name: 'ChangelogModal' })
    expect(changelogModal.exists()).toBe(true)
    expect(changelogModal.props('isOpen')).toBe(false)

    const sidebar = wrapper.findComponent({ name: 'ChatSidebar' })
    sidebar.vm.$emit('openChangelog')
    await wrapper.vm.$nextTick()

    expect(changelogModal.props('isOpen')).toBe(true)
  })

  it('defers setting currentTime on audio load until metadata loaded', async () => {
    const wrapper = mount(IndexPage)
    await flushPromises()
    const audio = wrapper.find<HTMLAudioElement>('#youtube-hidden-player').element
    // Simulate readyState 0 (HAVE_NOTHING) throwing InvalidStateError on currentTime assignment
    Object.defineProperty(audio, 'readyState', { value: 0, configurable: true })
    let currentTimeAssigned = 0
    Object.defineProperty(audio, 'currentTime', {
      get: () => currentTimeAssigned,
      set: (val: number) => {
        if (audio.readyState === 0) throw new DOMException('The element is not ready', 'InvalidStateError')
        currentTimeAssigned = val
      },
      configurable: true,
    })
    const playSpy = vi.spyOn(audio, 'play').mockResolvedValue(undefined)

    const vm = wrapper.vm as any
    expect(() => {
      vm.onPlayerAction?.('load', { videoId: 'test1234567', startSeconds: 45, autoplay: true })
    }).not.toThrow()
    expect(playSpy).not.toHaveBeenCalled()

    Object.defineProperty(audio, 'readyState', { value: 2, configurable: true })
    Object.defineProperty(audio, 'duration', { value: 180, configurable: true })
    await wrapper.find('#youtube-hidden-player').trigger('loadedmetadata')
    expect(audio.currentTime).toBe(45)
    expect(playSpy).toHaveBeenCalled()
  })
})
