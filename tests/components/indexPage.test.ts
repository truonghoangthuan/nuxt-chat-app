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
  allProfiles: ref<Profile[]>([]),
  knownProfiles: ref<Profile[]>([]),
  onlineFriends: ref<Profile[]>([]),
  typingLabel: ref(''),
  connectionStatus: ref<'connected' | 'reconnecting' | 'disconnected'>('connected'),
  reconnectCountdownSec: ref(0),
  initializeChat: vi.fn(),
  sendMessage: vi.fn(),
  sendImages: vi.fn(),
  retryMessage: vi.fn(),
  dismissMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
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
}

const mockAuthProfileState = {
  currentProfile: ref<Profile | null>({
    id: 'u-self',
    display_name: 'Self User',
    avatar_color: '#3b82f6',
  }),
  updateProfile: vi.fn(),
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
    toggleTheme: vi.fn(),
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

  it('blocks application workspace and sidebar completely behind E2eeGate when locked', async () => {
    mockE2eeState.status.value = 'locked'
    const wrapper = mount(IndexPage)

    expect(wrapper.findComponent({ name: 'E2eeGate' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ChatSidebar' }).exists()).toBe(false)
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

  it('renders NotificationPermissionBanner when permission is default and triggers request', async () => {
    mockChatRoomState.notificationPermission.value = 'default'
    const wrapper = mount(IndexPage)

    const banner = wrapper.find('[data-test="notification-permission-banner"]')
    expect(banner.exists()).toBe(true)

    const enableBtn = wrapper.find('[data-test="enable-notifications-banner-btn"]')
    await enableBtn.trigger('click')

    expect(mockChatRoomState.requestNotificationPermission).toHaveBeenCalledTimes(1)
  })
})
