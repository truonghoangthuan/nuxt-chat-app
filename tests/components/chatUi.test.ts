import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageComposer from '~/components/MessageComposer.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import CreateChannelModal from '~/components/CreateChannelModal.vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
import StartDmModal from '~/components/StartDmModal.vue'
import UserAvatar from '~/components/UserAvatar.vue'

describe('Chat UI components', () => {
  it('MessageComposer emits send on Enter, newline on Shift+Enter, and renders typingLabel', async () => {
    const wrapper = mount(MessageComposer, {
      props: { channelSlug: 'general', typingLabel: 'Alice is typing...' },
    })
    expect(wrapper.text()).toContain('Alice is typing...')

    const textarea = wrapper.find('textarea')
    await textarea.setValue('Hello world')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('send')).toBeFalsy()

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })
    expect(wrapper.emitted('send')?.[0]).toEqual(['Hello world'])
  })

  it('ConnectionBanner shows countdown when reconnecting and emits retry when clicked', async () => {
    const wrapper = mount(ConnectionBanner, {
      props: { status: 'reconnecting', countdownSec: 4 },
    })
    expect(wrapper.text()).toContain('4s')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
  })

  it('MessageViewport renders optimistic Sending and Failed states with Retry and Dismiss buttons', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-1',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'c-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Pending msg',
            created_at: '2026-10-16T12:00:00Z',
            status: 'sending',
            author: { id: 'u-1', display_name: 'You', avatar_color: '#059669' },
          },
          {
            id: 'c-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Failed msg',
            created_at: '2026-10-16T12:01:00Z',
            status: 'failed',
            author: { id: 'u-1', display_name: 'You', avatar_color: '#059669' },
          },
        ],
      },
    })
    expect(wrapper.text()).toContain('Sending...')
    expect(wrapper.text()).toContain('Failed to send')

    await wrapper.find('[data-test="retry-c-2"]').trigger('click')
    expect(wrapper.emitted('retry')?.[0]).toEqual(['c-2'])

    await wrapper.find('[data-test="dismiss-c-2"]').trigger('click')
    expect(wrapper.emitted('dismiss')?.[0]).toEqual(['c-2'])
  })

  it('MessageViewport does not increment unreadNewCount when older messages are prepended', async () => {
    const initialMessage = {
      id: 'm-2',
      client_id: 'c-2',
      channel_id: 'ch-1',
      user_id: 'u-other',
      content: 'Current message',
      created_at: '2026-10-16T12:00:00Z',
      status: 'sent' as const,
      author: { id: 'u-other', display_name: 'Other', avatar_color: '#0284c7' },
    }
    const wrapper = mount(MessageViewport, {
      props: {
        hasMoreHistory: true,
        isLoadingHistory: false,
        currentUserId: 'u-1',
        loadOlder: vi.fn().mockResolvedValue(1),
        messages: [initialMessage],
      },
    })
    expect(wrapper.find('button.animate-bounce').exists()).toBe(false)

    // Prepending an older message while isLoadingHistory is set
    const olderMessage = {
      id: 'm-1',
      client_id: 'c-1',
      channel_id: 'ch-1',
      user_id: 'u-other',
      content: 'Older message from history',
      created_at: '2026-10-16T11:59:00Z',
      status: 'sent' as const,
      author: { id: 'u-other', display_name: 'Other', avatar_color: '#0284c7' },
    }
    await wrapper.setProps({
      isLoadingHistory: true,
      messages: [olderMessage, initialMessage],
    })
    expect(wrapper.find('button.animate-bounce').exists()).toBe(false)
  })

  it('CreateChannelModal displays server error inline without closing and closes on success', async () => {
    const wrapper = mount(CreateChannelModal, {
      props: { isOpen: true },
    })

    const input = wrapper.find('input[type="text"]')
    await input.setValue('duplicate-slug')
    await wrapper.find('form').trigger('submit')

    const createEvents = wrapper.emitted('create')
    expect(createEvents).toBeTruthy()
    const payload = createEvents?.[0][0] as {
      name: string
      onError: (msg: string) => void
      onSuccess: () => void
    }
    expect(payload.name).toBe('duplicate-slug')

    // Simulate backend error
    payload.onError('Channel slug duplicate-slug already exists.')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Channel slug duplicate-slug already exists.')
    expect(wrapper.emitted('close')).toBeFalsy()

    // Simulate subsequent success
    payload.onSuccess()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('MessageViewport groups consecutive same-author messages within 5m and resets unread pill on channel switch', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-me',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'm-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-alice',
            content: 'First line',
            created_at: '2026-10-18T10:00:00.000Z',
            status: 'sent',
            author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
          },
          {
            id: 'm-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-alice',
            content: 'Second line 1 min later',
            created_at: '2026-10-18T10:01:00.000Z',
            status: 'sent',
            author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    expect(wrapper.findAll('[data-test="date-divider"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="compact-message"]')).toHaveLength(1)

    // Switch channelId -> should not show unread pill
    await wrapper.setProps({
      channelId: 'ch-2',
      messages: [
        {
          id: 'm-99',
          client_id: 'c-99',
          channel_id: 'ch-2',
          user_id: 'u-bob',
          content: 'Welcome to random',
          created_at: '2026-10-18T11:00:00.000Z',
          status: 'sent',
          author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
        },
      ],
    })
    expect(wrapper.find('button.animate-bounce').exists()).toBe(false)
  })

  it('ProfileSettingsModal allows editing display name and selecting an avatar color', async () => {
    const ProfileSettingsModal = (await import('~/components/ProfileSettingsModal.vue')).default
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: {
          id: 'u-1',
          display_name: 'Alice',
          avatar_color: '#0284c7',
        },
      },
    })

    const input = wrapper.find('input[type="text"]')
    await input.setValue('Alice Wonderland')

    const roseSwatch = wrapper.find('[data-test="color-swatch-#e11d48"]')
    await roseSwatch.trigger('click')

    await wrapper.find('form').trigger('submit')

    const saveEvents = wrapper.emitted('save')
    expect(saveEvents).toBeTruthy()
    const payload = saveEvents?.[0][0] as {
      displayName: string
      avatarColor: string
      onSuccess: () => void
    }
    expect(payload.displayName).toBe('Alice Wonderland')
    expect(payload.avatarColor).toBe('#e11d48')

    payload.onSuccess()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('MessageViewport supports inline editing, soft-delete tombstones, quote-reply headers, and reaction pills', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-alice',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'm-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-alice',
            content: 'Editable message',
            created_at: '2026-10-18T10:00:00Z',
            edited_at: '2026-10-18T10:01:00Z',
            status: 'sent',
            author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
            reactions: [
              { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-alice', emoji: '👍' },
            ],
          },
          {
            id: 'm-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Deleted message',
            created_at: '2026-10-18T10:02:00Z',
            deleted_at: '2026-10-18T10:03:00Z',
            status: 'sent',
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
          {
            id: 'm-3',
            client_id: 'c-3',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Reply message',
            created_at: '2026-10-18T10:04:00Z',
            status: 'sent',
            reply_to_id: 'm-1',
            reply_to: {
              id: 'm-1',
              user_id: 'u-alice',
              content: 'Editable message',
              author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
            },
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
        ],
      },
    })

    // 1. Edited badge & reaction pill
    expect(wrapper.find('[data-test="edited-badge-m-1"]').exists()).toBe(true)
    const reactionPill = wrapper.find('[data-test="reaction-pill-m-1-👍"]')
    expect(reactionPill.exists()).toBe(true)
    expect(reactionPill.text()).toContain('1')
    await reactionPill.trigger('click')
    expect(wrapper.emitted('toggleReaction')?.[0]).toEqual([{ messageId: 'm-1', emoji: '👍' }])

    // 2. Deleted tombstone hides original content
    expect(wrapper.find('[data-test="deleted-tombstone-m-2"]').text()).toContain('This message was deleted')
    expect(wrapper.text()).not.toContain('Deleted message')

    // 3. Quoted reply preview
    expect(wrapper.find('[data-test="reply-quote-m-3"]').text()).toContain('Editable message')

    // 4. Inline edit flow for own message (m-1)
    await wrapper.find('[data-test="edit-m-1"]').trigger('click')
    const editInput = wrapper.find('[data-test="edit-input-m-1"]')
    await editInput.setValue('Updated message text')
    await wrapper.find('[data-test="save-edit-m-1"]').trigger('click')
    expect(wrapper.emitted('edit')?.[0]).toEqual([
      { messageId: 'm-1', content: 'Updated message text' },
    ])

    // 5. Delete button for own message (m-1)
    await wrapper.find('[data-test="delete-m-1"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]).toEqual(['m-1'])
  })

  it('MessageComposer displays replyingTo banner and emits cancelReply when dismissed', async () => {
    const wrapper = mount(MessageComposer, {
      props: {
        channelSlug: 'general',
        replyingTo: {
          id: 'm-1',
          client_id: 'c-1',
          channel_id: 'ch-1',
          user_id: 'u-alice',
          content: 'Original message to quote',
          created_at: '2026-10-18T10:00:00Z',
          status: 'sent',
          author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
        },
      },
    })

    const banner = wrapper.find('[data-test="reply-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Alice')
    expect(banner.text()).toContain('Original message to quote')

    await wrapper.find('[data-test="cancel-reply"]').trigger('click')
    expect(wrapper.emitted('cancelReply')).toBeTruthy()
  })

  it('ChatSidebar renders @ mention badge alongside unread count when unreadMentions > 0', () => {
    const wrapper = mount(ChatSidebar, {
      props: {
        channels: [
          { id: 'ch-1', slug: 'general', description: null, created_by: null, created_at: '2026-10-16T00:00:00Z' },
        ],
        activeChannelId: null,
        unreadCounts: { 'ch-1': 3 },
        unreadMentions: { 'ch-1': 1 },
        onlineFriends: [],
        currentUser: null,
        isDark: true,
        connectionStatus: 'connected',
        isOpenMobile: false,
      },
    })

    const mentionBadge = wrapper.find('[data-test="mention-badge-ch-1"]')
    expect(mentionBadge.exists()).toBe(true)
    expect(mentionBadge.text()).toContain('@')
  })

  it('MessageComposer shows @mention autocomplete popup when typing @ and inserts selected display name', async () => {
    const wrapper = mount(MessageComposer, {
      props: {
        channelSlug: 'general',
        mentionCandidates: [
          { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
          { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
        ],
      },
    })

    const textarea = wrapper.find('textarea')
    ;(textarea.element as HTMLTextAreaElement).value = 'Hello @al'
    ;(textarea.element as HTMLTextAreaElement).selectionStart = 9
    await textarea.trigger('input')

    const popup = wrapper.find('[data-test="mention-autocomplete"]')
    expect(popup.exists()).toBe(true)
    expect(popup.text()).toContain('Alice')

    await wrapper.find('[data-test="mention-option-u-alice"]').trigger('click')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Hello @Alice ')
  })

  it('MessageViewport renders New messages unread divider and highlights @mentions for current user', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-alice',
        currentDisplayName: 'Alice',
        lastReadAt: '2026-10-18T10:00:30.000Z',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'm-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Older read message',
            created_at: '2026-10-18T10:00:00.000Z',
            status: 'sent',
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
          {
            id: 'm-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-bob',
            content: 'Hey @Alice welcome back!',
            created_at: '2026-10-18T10:01:00.000Z',
            status: 'sent',
            author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
          },
        ],
      },
    })

    expect(wrapper.find('[data-test="unread-divider"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mention-row-m-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mention-token"]').text()).toBe('@Alice')
  })

  describe('Direct Messages UI in ChatSidebar and StartDmModal (Sub-Project 4)', () => {
    it('ChatSidebar renders dmChannels with peer name and emits startDmWithUser when clicking an online friend', async () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          channels: [
            { id: 'c1', slug: 'general', description: 'General', created_by: null, created_at: '' },
          ],
          dmChannels: [
            {
              id: 'dm-1',
              slug: 'dm:u1:u2',
              description: null,
              created_by: 'u1',
              created_at: '',
              is_dm: true,
              dm_user_a: 'u1',
              dm_user_b: 'u2',
              peer: { id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' },
            },
          ],
          activeChannelId: 'c1',
          unreadCounts: { 'dm-1': 3 },
          unreadMentions: {},
          onlineFriends: [
            { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
            { id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' },
          ],
          currentUser: { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      const dmBtn = wrapper.find('[data-test="dm-channel-dm-1"]')
      expect(dmBtn.exists()).toBe(true)
      expect(dmBtn.text()).toContain('Bob')
      expect(dmBtn.text()).toContain('3')

      const onlineFriendBtn = wrapper.find('[data-test="online-friend-u2"]')
      expect(onlineFriendBtn.exists()).toBe(true)
      await onlineFriendBtn.trigger('click')
      expect(wrapper.emitted('startDmWithUser')?.[0]).toEqual(['u2'])
    })

    it('StartDmModal filters friends by search query and emits selectFriend on click', async () => {
      const wrapper = mount(StartDmModal, {
        props: {
          isOpen: true,
          friends: [
            { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
            { id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' },
            { id: 'u3', display_name: 'Charlie', avatar_color: '#059669' },
          ],
          onlineFriends: [{ id: 'u2', display_name: 'Bob', avatar_color: '#7c3aed' }],
          currentUserId: 'u1',
          errorMessage: 'Unable to start DM',
        },
      })

      // Self (Alice) should not be listed
      expect(wrapper.find('[data-test="start-dm-friend-u1"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="start-dm-friend-u2"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="start-dm-friend-u3"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Unable to start DM')

      const searchInput = wrapper.find('[data-test="dm-search-input"]')
      await searchInput.setValue('char')

      expect(wrapper.find('[data-test="start-dm-friend-u2"]').exists()).toBe(false)
      const charlieBtn = wrapper.find('[data-test="start-dm-friend-u3"]')
      expect(charlieBtn.exists()).toBe(true)

      // Enter key triggers selection of the first matching friend
      await searchInput.trigger('keydown.enter')
      expect(wrapper.emitted('selectFriend')?.[0]).toEqual(['u3'])

      // Escape key emits close
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('ChatSidebar displays empty state for DMs and prevents clicking on own user row', async () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          channels: [],
          dmChannels: [],
          activeChannelId: null,
          unreadCounts: {},
          unreadMentions: {},
          onlineFriends: [
            { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
          ],
          currentUser: { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      expect(wrapper.text()).toContain('No conversations yet')

      // Clicking own online friend row does NOT emit startDmWithUser
      const ownRow = wrapper.find('[data-test="online-friend-u1"]')
      expect(ownRow.exists()).toBe(true)
      await ownRow.trigger('click')
      expect(wrapper.emitted('startDmWithUser')).toBeUndefined()

      // Clicking + New emits openStartDm
      const newDmBtn = wrapper.find('[data-test="open-start-dm"]')
      expect(newDmBtn.exists()).toBe(true)
      await newDmBtn.trigger('click')
      expect(wrapper.emitted('openStartDm')).toBeTruthy()
    })

    it('MessageViewport renders DM-specific @ icon and peer name when isDm is true', () => {
      const wrapper = mount(MessageViewport, {
        props: {
          messages: [],
          isDm: true,
          peerName: 'Bob',
          loadOlder: vi.fn().mockResolvedValue(0),
        },
      })

      const empty = wrapper.find('[data-test="empty-channel-placeholder"]')
      expect(empty.exists()).toBe(true)
      expect(empty.text()).toContain('@')
      expect(empty.text()).toContain('This is the start of your direct message history with @Bob')
    })

    it('StartDmModal close button has aria-label Close', () => {
      const wrapper = mount(StartDmModal, {
        props: { isOpen: true, friends: [] },
      })
      const closeBtn = wrapper.find('button[aria-label="Close"]')
      expect(closeBtn.exists()).toBe(true)
      expect(closeBtn.text()).toBe('×')
      wrapper.unmount()
    })

    it('ChatSidebar disables button for self in online friends', () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          channels: [],
          activeChannelId: null,
          unreadCounts: {},
          onlineFriends: [{ id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' }],
          currentUser: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
          isDark: false,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })
      const selfBtn = wrapper.find('[data-test="online-friend-u-1"]')
      expect(selfBtn.attributes('disabled')).toBeDefined()
    })

    it('MessageComposer sets selectionRange right after mention token when selected', async () => {
      const wrapper = mount(MessageComposer, {
        props: {
          channelSlug: 'general',
          mentionCandidates: [{ id: 'u-bob', display_name: 'Bob', avatar_color: '#0284c7' }],
        },
      })
      const textarea = wrapper.find('textarea')
      const el = textarea.element as HTMLTextAreaElement
      el.value = 'Hello @Bo there'
      el.selectionStart = 9
      el.selectionEnd = 9
      await textarea.trigger('input')

      await wrapper.find('[data-test="mention-option-u-bob"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(el.value).toBe('Hello @Bob  there')
      expect(el.selectionStart).toBe(11)
    })

    it('ChatSidebar renders Direction 2 Precision Rail, telemetry badge, and UserAvatar supports lg size', () => {
      const sidebar = mount(ChatSidebar, {
        props: {
          channels: [{ id: 'c1', slug: 'general', description: 'General', created_by: 'u1', created_at: '' }],
          dmChannels: [],
          activeChannelId: 'c1',
          unreadCounts: {},
          unreadMentions: {},
          onlineFriends: [{ id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' }],
          currentUser: { id: 'u1', display_name: 'Alice', avatar_color: '#0284c7' },
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      expect(sidebar.find('nav[aria-label="Precision Rail"]').exists()).toBe(true)
      expect(sidebar.find('aside[aria-label="Channel and Friends Directory"]').exists()).toBe(true)
      expect(sidebar.text()).toContain('14ms')

      const lgAvatar = mount(UserAvatar, {
        props: {
          displayName: 'Alice Wonderland',
          avatarColor: '#4f46e5',
          showOnline: true,
          size: 'lg',
        },
      })
      expect(lgAvatar.text()).toBe('AW')
      expect(lgAvatar.html()).toContain('w-11 h-11')
    })
  })
})


