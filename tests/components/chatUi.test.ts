import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageComposer from '~/components/MessageComposer.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
import UserAvatar from '~/components/UserAvatar.vue'
import E2eeGate from '~/components/E2eeGate.vue'
import { isValidAvatarUrl } from '~/utils/chat'
import type { Conversation, Profile } from '~/types/chat'

describe('Chat UI components', () => {
  it('accepts only optional HTTP(S) avatar URLs', () => {
    expect(isValidAvatarUrl('')).toBe(true)
    expect(isValidAvatarUrl('https://example.com/avatar.png')).toBe(true)
    expect(isValidAvatarUrl('javascript:alert(1)')).toBe(false)
    expect(isValidAvatarUrl('not a url')).toBe(false)
  })

  it('UserAvatar renders an image URL while retaining the initials fallback', () => {
    const wrapper = mount(UserAvatar, {
      props: { displayName: 'Alice', avatarUrl: 'https://example.com/avatar.png' },
    })
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/avatar.png')
    expect(wrapper.text()).toContain('AL')
  })

  it('MessageComposer emits send on Enter, newline on Shift+Enter, and renders typingLabel', async () => {
    const wrapper = mount(MessageComposer, {
      props: { channelSlug: 'general', typingLabel: 'Alice is typing...' },
    })
    expect(wrapper.text()).toContain('Alice is typing...')
    expect(wrapper.find('textarea').attributes('placeholder')).toBe('Message #general')

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
    await wrapper.find('[data-test="avatar-url"]').setValue('https://example.com/alice.png')

    const roseSwatch = wrapper.find('[data-test="color-swatch-#e11d48"]')
    await roseSwatch.trigger('click')

    await wrapper.find('form').trigger('submit')

    const saveEvents = wrapper.emitted('save')
    expect(saveEvents).toBeTruthy()
    const payload = saveEvents?.[0][0] as {
      displayName: string
      avatarColor: string
      avatarUrl: string
      onSuccess: () => void
    }
    expect(payload.displayName).toBe('Alice Wonderland')
    expect(payload.avatarColor).toBe('#e11d48')
    expect(payload.avatarUrl).toBe('https://example.com/alice.png')

    payload.onSuccess()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('ProfileSettingsModal displays user email, user id, and created date', async () => {
    const ProfileSettingsModal = (await import('~/components/ProfileSettingsModal.vue')).default
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: {
          id: 'u-12345',
          email: 'alice@example.com',
          display_name: 'Alice',
          avatar_color: '#0284c7',
          created_at: '2026-01-15T10:00:00Z',
        },
      },
    })

    const emailEl = wrapper.find('[data-test="profile-email"]')
    expect(emailEl.exists()).toBe(true)
    expect(emailEl.text()).toContain('alice@example.com')

    const idEl = wrapper.find('[data-test="profile-user-id"]')
    expect(idEl.exists()).toBe(true)
    expect(idEl.text()).toContain('u-12345')

    const dateEl = wrapper.find('[data-test="profile-created-at"]')
    expect(dateEl.exists()).toBe(true)

    const copyBtn = wrapper.find('[data-test="copy-user-id-btn"]')
    expect(copyBtn.exists()).toBe(true)
    expect(copyBtn.text()).toContain('Copy')
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

  it('MessageComposer focuses textarea when replyingTo is set', async () => {
    const wrapper = mount(MessageComposer, {
      attachTo: document.body,
      props: {
        channelSlug: 'general',
        replyingTo: null,
      },
    })
    const textarea = wrapper.find('textarea')
    const focusSpy = vi.spyOn(textarea.element, 'focus')

    await wrapper.setProps({
      replyingTo: {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Original message',
        created_at: '2026-10-18T10:00:00Z',
        status: 'sent',
      },
    })
    await wrapper.vm.$nextTick()

    expect(focusSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('renders scroll-to-bottom button when scrolled up even with 0 unread messages', async () => {
    vi.useFakeTimers()
    const wrapper = mount(MessageViewport, {
      attachTo: document.body,
      props: {
        conversationId: 'c-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-1',
            client_id: 'c-1',
            channel_id: 'c-1',
            user_id: 'u-2',
            content: 'Hello world',
            created_at: '2026-10-18T10:00:00Z',
            status: 'sent',
          },
        ],
      },
    })

    // Flush initial open timers
    vi.runAllTimers()
    await wrapper.vm.$nextTick()

    const scrollContainer = wrapper.find('.custom-scroll')
    let currentScrollTop = 100
    Object.defineProperty(scrollContainer.element, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(scrollContainer.element, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(scrollContainer.element, 'scrollTop', {
      get() { return currentScrollTop },
      set(v) { currentScrollTop = v },
      configurable: true,
    })

    currentScrollTop = 100
    await scrollContainer.trigger('scroll')
    await wrapper.vm.$nextTick()

    const btn = wrapper.find('[data-test="scroll-to-bottom"]')
    expect(btn.exists()).toBe(true)

    // Trigger scroll back to near bottom
    currentScrollTop = 550
    await scrollContainer.trigger('scroll')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="scroll-to-bottom"]').exists()).toBe(false)
    wrapper.unmount()
    vi.useRealTimers()
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

  it('MessageComposer dismisses @mention autocomplete when pressing Escape and restores it on input, click, or moving away', async () => {
    const wrapper = mount(MessageComposer, {
      props: {
        channelSlug: 'general',
        mentionCandidates: [
          { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
          { id: 'u-bob', display_name: 'Bob', avatar_color: '#10b981' },
        ],
      },
    })

    const textarea = wrapper.find('textarea')
    ;(textarea.element as HTMLTextAreaElement).value = '@al and @bo'
    ;(textarea.element as HTMLTextAreaElement).selectionStart = 3
    await textarea.trigger('input')

    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mention-autocomplete"]').text()).toContain('Alice')

    // Escape dismisses current mention autocomplete
    await textarea.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(false)

    // Arrowing within the dismissed mention keeps it dismissed
    ;(textarea.element as HTMLTextAreaElement).selectionStart = 2
    await textarea.trigger('keyup')
    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(false)

    // Moving cursor to another mention (@bo) re-enables autocomplete for that mention
    ;(textarea.element as HTMLTextAreaElement).selectionStart = 11
    await textarea.trigger('keyup')
    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mention-autocomplete"]').text()).toContain('Bob')

    // Dismiss @bo
    await textarea.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(false)

    // Typing a character re-enables autocomplete
    ;(textarea.element as HTMLTextAreaElement).value = '@al and @bob'
    ;(textarea.element as HTMLTextAreaElement).selectionStart = 12
    await textarea.trigger('input')
    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(true)

    // Dismiss again
    await textarea.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(false)

    // Clicking textarea re-enables autocomplete
    await textarea.trigger('click')
    expect(wrapper.find('[data-test="mention-autocomplete"]').exists()).toBe(true)
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

  it('MessageViewport renders clickable links with target=_blank and rel=noopener', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-link',
            client_id: 'c-link',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Visit https://nuxt.com today',
            created_at: '2026-10-22T10:00:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const link = wrapper.find('[data-test="link-token"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('https://nuxt.com')
    expect(link.attributes('href')).toBe('https://nuxt.com')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.attributes('rel')).toContain('noreferrer')
  })

  it('MessageViewport renders inline code with styled badge', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-code',
            client_id: 'c-code',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Check `npm run test` command',
            created_at: '2026-10-22T10:00:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const code = wrapper.find('[data-test="code-token"]')
    expect(code.exists()).toBe(true)
    expect(code.text()).toBe('npm run test')
    expect(code.classes()).toContain('font-mono')
  })

  it('MessageViewport desktop toolbar renders pin button and emits togglePin', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-pinned-item',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Pinned note',
            created_at: '2026-10-22T10:00:00Z',
            status: 'sent',
            pinned_at: '2026-10-22T10:05:00Z',
            author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const pinBtn = wrapper.find('[data-test="pin-m-pinned-item"]')
    expect(pinBtn.exists()).toBe(true)
    await pinBtn.trigger('click')
    expect(wrapper.emitted('togglePin')?.[0]).toEqual(['m-pinned-item'])
  })

  it('MessageViewport renders pinned message banner when pinned messages exist', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-pin-banner',
            client_id: 'c-pin',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Important announcement for all',
            created_at: '2026-10-22T10:00:00Z',
            pinned_at: '2026-10-22T10:05:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const banner = wrapper.find('[data-test="pinned-messages-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('Important announcement for all')
    expect(banner.text()).toContain('Bob')

    // Clicking banner triggers scroll/jump
    await banner.find('[data-test="jump-pinned-message"]').trigger('click')

    // Unpin button inside banner emits togglePin
    const unpinBtn = banner.find('[data-test="unpin-banner-btn"]')
    expect(unpinBtn.exists()).toBe(true)
    await unpinBtn.trigger('click')
    expect(wrapper.emitted('togglePin')?.[0]).toEqual(['m-pin-banner'])
  })

  it('MessageViewport does not show deleted messages in pinned banner', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-pin-deleted',
            client_id: 'c-pin-del',
            channel_id: 'ch-1',
            user_id: 'u-2',
            content: 'Deleted note',
            created_at: '2026-10-22T10:00:00Z',
            pinned_at: '2026-10-22T10:05:00Z',
            deleted_at: '2026-10-22T10:10:00Z',
            status: 'sent',
            author: { id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    expect(wrapper.find('[data-test="pinned-messages-banner"]').exists()).toBe(false)
  })

  it('MessageViewport normalizes pinned banner counter when switching active pin and unpinning', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        currentUserId: 'u-1',
        messages: [
          {
            id: 'm-pin-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Pin one',
            created_at: '2026-10-22T10:00:00Z',
            pinned_at: '2026-10-22T10:01:00Z',
            status: 'sent',
            author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
          },
          {
            id: 'm-pin-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Pin two',
            created_at: '2026-10-22T10:02:00Z',
            pinned_at: '2026-10-22T10:03:00Z',
            status: 'sent',
            author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    const banner = wrapper.find('[data-test="pinned-messages-banner"]')
    expect(banner.text()).toContain('(1 of 2)')

    // Click next pinned
    await banner.find('button[aria-label="Next pinned message"]').trigger('click')
    expect(banner.text()).toContain('(2 of 2)')

    // Now props messages updates: pin-2 was unpinned
    await wrapper.setProps({
      messages: [
        {
          id: 'm-pin-1',
          client_id: 'c-1',
          channel_id: 'ch-1',
          user_id: 'u-1',
          content: 'Pin one',
          created_at: '2026-10-22T10:00:00Z',
          pinned_at: '2026-10-22T10:01:00Z',
          status: 'sent',
          author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
        },
      ],
    })

    // Banner counter must not show (2 of 1) or out of bounds
    expect(banner.text()).not.toContain('(2 of 1)')
    // Since only 1 pinned remains, counter badge is hidden
    expect(banner.find('span.text-[10px]').exists()).toBe(false)
  })

  describe('Direct Messages UI in ChatSidebar (Sub-Project 4)', () => {
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

      expect(sidebar.find('[data-test="open-contacts"]').exists()).toBe(true)
      expect(sidebar.find('[data-test="open-start-dm"]').exists()).toBe(true)
      expect(sidebar.find('[data-test="open-create-group"]').exists()).toBe(true)
      expect(sidebar.find('[data-test="toggle-notifications-btn"]').exists()).toBe(true)
      expect(sidebar.find('[data-test="open-profile-settings"]').exists()).toBe(true)
      expect(sidebar.find('[data-test="conversation-search-input"]').exists()).toBe(true)
      expect(sidebar.find('aside[aria-label="Channel and Friends Directory"]').exists()).toBe(true)
      expect(sidebar.text()).toContain('Live')

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

    it('ChatSidebar renders notification toggle button and emits toggleNotifications', async () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          channels: [],
          dmChannels: [],
          activeChannelId: null,
          unreadCounts: {},
          onlineFriends: [],
          currentUser: null,
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
          notificationsEnabled: true,
        },
      })

      const btn = wrapper.find('[data-test="toggle-notifications-btn"]')
      expect(btn.exists()).toBe(true)
      expect(btn.attributes('title')).toBe('Mute notifications')
      expect(wrapper.find('[data-test="notifications-pending-badge"]').exists()).toBe(true)

      await btn.trigger('click')
      expect(wrapper.emitted('toggleNotifications')).toBeTruthy()

      await wrapper.setProps({ notificationPermission: 'granted' })
      expect(wrapper.find('[data-test="notifications-pending-badge"]').exists()).toBe(false)

      await wrapper.setProps({ notificationsEnabled: false })
      expect(wrapper.find('[data-test="toggle-notifications-btn"]').attributes('title')).toBe('Enable notifications')
    })

    it('E2eeGate renders locked passphrase form, emits unlock, and shows unconfigured state', async () => {
      const wrapper = mount(E2eeGate, {
        props: {
          status: 'locked',
          error: 'Incorrect secret phrase.',
          isUnlocking: false,
        },
      })

      expect(wrapper.text()).toContain('Incorrect secret phrase.')
      const input = wrapper.find('[data-test="e2ee-phrase-input"]')
      await input.setValue('my shared secret phrase')
      await wrapper.find('form').trigger('submit')
      expect(wrapper.emitted('unlock')?.[0]).toEqual(['my shared secret phrase'])

      await wrapper.setProps({ status: 'unconfigured', error: null })
      expect(wrapper.text()).toContain('Encryption not configured')
      await wrapper.find('[data-test="e2ee-retry-config"]').trigger('click')
      expect(wrapper.emitted('retryConfig')).toBeTruthy()
    })

    it('MessageViewport renders legacy badge, undecryptable placeholder, and hides Edit on undecryptable messages', () => {
      const wrapper = mount(MessageViewport, {
        props: {
          channelId: 'ch-1',
          currentUserId: 'u-1',
          loadOlder: vi.fn().mockResolvedValue(0),
          messages: [
            {
              id: 'm-leg',
              client_id: 'c-leg',
              channel_id: 'ch-1',
              user_id: 'u-1',
              content: 'Plaintext before E2EE',
              encryption: 'legacy',
              created_at: '2026-10-19T10:00:00Z',
              status: 'sent',
              author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
            },
            {
              id: 'm-bad',
              client_id: 'c-bad',
              channel_id: 'ch-1',
              user_id: 'u-1',
              content: '',
              encryption: 'undecryptable',
              created_at: '2026-10-19T10:10:00Z',
              status: 'sent',
              author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
              reply_to_id: 'm-parent-bad',
              reply_to: {
                id: 'm-parent-bad',
                user_id: 'u-2',
                content: '',
                encryption: 'undecryptable',
              },
            },
          ],
        },
      })

      expect(wrapper.find('[data-test="legacy-badge-m-leg"]').text()).toContain('Legacy · unencrypted')
      expect(wrapper.find('[data-test="edit-m-leg"]').exists()).toBe(true)

      expect(wrapper.find('[data-test="undecryptable-m-bad"]').text()).toContain('🔒 Unable to decrypt this message')
      expect(wrapper.find('[data-test="reply-quote-m-bad"]').text()).toContain('🔒 Unable to decrypt this message')
      expect(wrapper.find('[data-test="edit-m-bad"]').exists()).toBe(false)
    })
  })

  describe('MessageComposer conversation draft persistence', () => {
    it('persists and restores drafts across conversation switches', async () => {
      const wrapper = mount(MessageComposer, {
        props: { conversationId: 'conv-1', channelSlug: 'chat-1' },
      })
      const textarea = wrapper.find('textarea')

      // Type draft in conv-1
      await textarea.setValue('Draft for conversation 1')
      expect(textarea.element.value).toBe('Draft for conversation 1')

      // Switch to conv-2
      await wrapper.setProps({ conversationId: 'conv-2', channelSlug: 'chat-2' })
      expect(textarea.element.value).toBe('')

      // Type draft in conv-2
      await textarea.setValue('Draft for conversation 2')
      expect(textarea.element.value).toBe('Draft for conversation 2')

      // Switch back to conv-1
      await wrapper.setProps({ conversationId: 'conv-1', channelSlug: 'chat-1' })
      expect(textarea.element.value).toBe('Draft for conversation 1')

      // Switch back to conv-2
      await wrapper.setProps({ conversationId: 'conv-2', channelSlug: 'chat-2' })
      expect(textarea.element.value).toBe('Draft for conversation 2')
    })

    it('clears conversation draft when message is sent', async () => {
      const wrapper = mount(MessageComposer, {
        props: { conversationId: 'conv-send', channelSlug: 'chat-send' },
      })
      const textarea = wrapper.find('textarea')
      await textarea.setValue('Will send this')
      await wrapper.find('button[title="Send message"]').trigger('click')

      expect(wrapper.emitted('send')).toBeTruthy()
      expect(textarea.element.value).toBe('')

      // Switch away and back
      await wrapper.setProps({ conversationId: 'conv-other', channelSlug: 'other' })
      await wrapper.setProps({ conversationId: 'conv-send', channelSlug: 'chat-send' })
      expect(textarea.element.value).toBe('')
    })
  })

  describe('MessageComposer image attachment UI', () => {
    it('handles file selection, keeps text input enabled with caption placeholder, and emits sendImages with caption', async () => {
      const wrapper = mount(MessageComposer, {
        props: { channelSlug: 'general' },
      })

      const textarea = wrapper.find('textarea')
      await textarea.setValue('My photo caption')

      const fileInput = wrapper.find('input[type="file"]')
      expect(fileInput.exists()).toBe(true)
      expect(fileInput.attributes('accept')).toContain('image/png')
      expect(fileInput.attributes('multiple')).toBeDefined()

      const attachBtn = wrapper.find('[data-test="attach-image-button"]')
      expect(attachBtn.exists()).toBe(true)

      const file = new File(['image-data'], 'photo.png', { type: 'image/png' })
      Object.defineProperty(fileInput.element, 'files', {
        value: [file],
        writable: true,
      })
      await fileInput.trigger('change')

      expect(wrapper.find('[data-test="attachment-tray"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-test="attachment-preview"]').length).toBe(1)

      expect(textarea.element.value).toBe('My photo caption')
      expect(textarea.attributes('disabled')).toBeUndefined()
      expect(textarea.attributes('placeholder')).toBe('Add a caption...')

      await wrapper.find('button[title="Send message"]').trigger('click')
      expect(wrapper.emitted('sendImages')).toBeTruthy()
      expect(wrapper.emitted('sendImages')?.[0]?.[0]).toHaveLength(1)
      expect(wrapper.emitted('sendImages')?.[0]?.[0]?.[0].name).toBe('photo.png')
      expect(wrapper.emitted('sendImages')?.[0]?.[1]).toBe('My photo caption')

      expect(wrapper.find('[data-test="attachment-tray"]').exists()).toBe(false)
      expect(textarea.element.value).toBe('')
      expect(textarea.attributes('disabled')).toBeUndefined()
    })

    it('removes attachment and restores input state when all attachments removed', async () => {
      const wrapper = mount(MessageComposer, {
        props: { channelSlug: 'general' },
      })

      const fileInput = wrapper.find('input[type="file"]')
      const file1 = new File(['data1'], 'photo1.jpg', { type: 'image/jpeg' })
      const file2 = new File(['data2'], 'photo2.jpg', { type: 'image/jpeg' })
      Object.defineProperty(fileInput.element, 'files', {
        value: [file1, file2],
        writable: true,
      })
      await fileInput.trigger('change')

      expect(wrapper.findAll('[data-test="attachment-preview"]').length).toBe(2)

      const removeButtons = wrapper.findAll('[data-test="remove-attachment"]')
      await removeButtons[0].trigger('click')
      expect(wrapper.findAll('[data-test="attachment-preview"]').length).toBe(1)
      expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()

      await wrapper.find('[data-test="remove-attachment"]').trigger('click')
      expect(wrapper.find('[data-test="attachment-tray"]').exists()).toBe(false)
      expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('textarea').attributes('placeholder')).toBe('Message #general')
    })

    it('displays validation error for invalid file type or too many files', async () => {
      const wrapper = mount(MessageComposer, {
        props: { channelSlug: 'general' },
      })

      const fileInput = wrapper.find('input[type="file"]')
      const badFile = new File(['pdf-data'], 'doc.pdf', { type: 'application/pdf' })
      Object.defineProperty(fileInput.element, 'files', {
        value: [badFile],
        writable: true,
      })
      await fileInput.trigger('change')

      expect(wrapper.find('[data-test="attachment-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="attachment-error"]').text()).toMatch(/supported image type/i)
      expect(wrapper.find('[data-test="attachment-tray"]').exists()).toBe(false)
    })

    it('handles image paste and drag-and-drop on composer', async () => {
      const wrapper = mount(MessageComposer, {
        props: { channelSlug: 'general' },
      })

      const textarea = wrapper.find('textarea')
      const pasteFile = new File(['pasted'], 'paste.png', { type: 'image/png' })
      await textarea.trigger('paste', {
        clipboardData: {
          files: [pasteFile],
        },
      })

      expect(wrapper.findAll('[data-test="attachment-preview"]').length).toBe(1)
      expect(wrapper.find('textarea').attributes('disabled')).toBeUndefined()

      await wrapper.find('[data-test="remove-attachment"]').trigger('click')

      const dropFile = new File(['dropped'], 'drop.webp', { type: 'image/webp' })
      await wrapper.find('[data-test="composer-deck"]').trigger('drop', {
        dataTransfer: {
          files: [dropFile],
        },
      })

      expect(wrapper.findAll('[data-test="attachment-preview"]').length).toBe(1)

      // Verify paste on deck container works while textarea is disabled
      const pasteFile2 = new File(['pasted2'], 'paste2.png', { type: 'image/png' })
      await wrapper.find('[data-test="composer-deck"]').trigger('paste', {
        clipboardData: {
          files: [pasteFile2],
        },
      })
      expect(wrapper.findAll('[data-test="attachment-preview"]').length).toBe(2)

      // Enter keydown on interactive button inside deck does not hijack send
      const removeBtn = wrapper.find('[data-test="remove-attachment"]')
      await removeBtn.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('sendImages')).toBeFalsy()

      // Drop when disabled is ignored
      const disabledWrapper = mount(MessageComposer, {
        props: { channelSlug: 'general', disabled: true },
      })
      await disabledWrapper.find('[data-test="composer-deck"]').trigger('drop', {
        dataTransfer: {
          files: [dropFile],
        },
      })
      expect(disabledWrapper.find('[data-test="attachment-tray"]').exists()).toBe(false)
    })
  })

  describe('Conversational Bubble Viewport (Task 7)', () => {
    it('renders sender messages with justify-end, accent bubble class, and delivery indicators', () => {
      const wrapper = mount(MessageViewport, {
        props: {
          conversationId: 'c-1',
          isGroup: true,
          currentUserId: 'u-alice',
          messages: [
            {
              id: 'm-sender-sent',
              client_id: 'c-1',
              channel_id: 'c-1',
              user_id: 'u-alice',
              content: 'Hello from sender',
              created_at: '2026-10-18T10:00:00Z',
              status: 'sent',
              author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
            },
            {
              id: 'm-sender-sending',
              client_id: 'c-2',
              channel_id: 'c-1',
              user_id: 'u-alice',
              content: 'Sending message',
              created_at: '2026-10-18T10:01:00Z',
              status: 'sending',
              author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
            },
          ],
        },
      })

      const sentRow = wrapper.find('[data-message-id="m-sender-sent"]')
      expect(sentRow.classes()).toContain('justify-end')
      const sentBubble = wrapper.find('[data-test="message-bubble-m-sender-sent"]')
      expect(sentBubble.classes()).toContain('bg-indigo-600')
      const deliverySent = wrapper.find('[data-test="delivery-indicator-m-sender-sent"]')
      expect(deliverySent.text()).toContain('✓✓')

      const sendingRow = wrapper.find('[data-message-id="m-sender-sending"]')
      expect(sendingRow.classes()).toContain('justify-end')
      expect(wrapper.text()).toContain('Sending...')
    })

    it('renders recipient messages with justify-start, avatar, and sender display name in group chats', () => {
      const wrapper = mount(MessageViewport, {
        props: {
          conversationId: 'c-1',
          isGroup: true,
          currentUserId: 'u-alice',
          messages: [
            {
              id: 'm-bob-1',
              client_id: 'c-1',
              channel_id: 'c-1',
              user_id: 'u-bob',
              content: 'First from Bob',
              created_at: '2026-10-18T10:00:00Z',
              status: 'sent',
              author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
            },
            {
              id: 'm-bob-2',
              client_id: 'c-2',
              channel_id: 'c-1',
              user_id: 'u-bob',
              content: 'Second from Bob',
              created_at: '2026-10-18T10:01:00Z',
              status: 'sent',
              author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
            },
          ],
        },
      })

      const bobRow1 = wrapper.find('[data-message-id="m-bob-1"]')
      expect(bobRow1.classes()).toContain('justify-start')
      const bobBubble1 = wrapper.find('[data-test="message-bubble-m-bob-1"]')
      expect(bobBubble1.classes()).not.toContain('bg-indigo-600')

      // First in cluster shows sender header in group chat
      const senderHeader = wrapper.find('[data-test="sender-header-m-bob-1"]')
      expect(senderHeader.exists()).toBe(true)
      expect(senderHeader.text()).toContain('Bob')

      // Second message does NOT show sender header (clustered)
      expect(wrapper.find('[data-test="sender-header-m-bob-2"]').exists()).toBe(false)

      // Avatar renders at bottom of cluster (on m-bob-2, which is last in group)
      expect(bobRow1.findComponent(UserAvatar).exists()).toBe(false)
      const bobRow2 = wrapper.find('[data-message-id="m-bob-2"]')
      expect(bobRow2.findComponent(UserAvatar).exists()).toBe(true)
    })

    it('omits sender header for recipient in direct message (isGroup: false / isDm: true)', () => {
      const wrapper = mount(MessageViewport, {
        props: {
          conversationId: 'dm-1',
          isDm: true,
          peerName: 'Bob',
          currentUserId: 'u-alice',
          messages: [
            {
              id: 'm-bob-1',
              client_id: 'c-1',
              channel_id: 'dm-1',
              user_id: 'u-bob',
              content: 'Direct message from Bob',
              created_at: '2026-10-18T10:00:00Z',
              status: 'sent',
              author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
            },
          ],
        },
      })

      expect(wrapper.find('[data-test="sender-header-m-bob-1"]').exists()).toBe(false)
    })
  })

  describe('Unified Conversation Sidebar (Task 8)', () => {
    const mockCurrentUser: Profile = {
      id: 'u-me',
      email: 'me@example.com',
      display_name: 'Me',
      avatar_color: '#0284c7',
    }

    const mockPeerBob: Profile = {
      id: 'u-bob',
      email: 'bob@example.com',
      display_name: 'Bob',
      avatar_color: '#7c3aed',
    }

    const mockConversations: Conversation[] = [
      {
        id: 'conv-direct-1',
        type: 'direct',
        title: null,
        created_by: 'u-me',
        created_at: '2026-10-21T01:00:00Z',
        peer: mockPeerBob,
        members: [
          { conversation_id: 'conv-direct-1', user_id: 'u-me', role: 'owner', joined_at: '' },
          { conversation_id: 'conv-direct-1', user_id: 'u-bob', role: 'member', joined_at: '', profile: mockPeerBob },
        ],
      },
      {
        id: 'conv-group-1',
        type: 'group',
        title: 'Project Phoenix',
        created_by: 'u-me',
        created_at: '2026-10-21T00:00:00Z',
        members: [
          { conversation_id: 'conv-group-1', user_id: 'u-me', role: 'owner', joined_at: '' },
          { conversation_id: 'conv-group-1', user_id: 'u-bob', role: 'member', joined_at: '' },
          { conversation_id: 'conv-group-1', user_id: 'u-charlie', role: 'member', joined_at: '' },
        ],
      },
    ]

    it('renders unified conversation list with direct chats and group chats, online status, and unread badges', () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          conversations: mockConversations,
          activeConversationId: 'conv-direct-1',
          unreadCounts: { 'conv-group-1': 5 },
          unreadMentions: { 'conv-group-1': 2 },
          onlineFriends: [mockPeerBob],
          currentUser: mockCurrentUser,
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      // 1. Direct chat item
      const directItem = wrapper.find('[data-test="conversation-item-conv-direct-1"]')
      expect(directItem.exists()).toBe(true)
      expect(directItem.text()).toContain('Bob')
      // Live online indicator for direct peer
      const peerAvatar = directItem.findComponent(UserAvatar)
      expect(peerAvatar.exists()).toBe(true)
      expect(peerAvatar.props('showOnline')).toBe(true)
      // Timestamp rendered in conversation item
      const directTime = directItem.find('[data-test="conversation-time-conv-direct-1"]')
      expect(directTime.exists()).toBe(true)
      expect(directTime.classes()).toContain('text-[11px]')
      expect(directTime.classes()).toContain('text-[var(--fp-text-muted)]')
      expect(directTime.text().length).toBeGreaterThan(0)

      // 2. Group chat item
      const groupItem = wrapper.find('[data-test="conversation-item-conv-group-1"]')
      expect(groupItem.exists()).toBe(true)
      expect(groupItem.text()).toContain('Project Phoenix')
      expect(groupItem.text()).toContain('3 members')

      // 3. Unread count and mention badges
      expect(groupItem.text()).toContain('5')
      const mentionBadge = wrapper.find('[data-test="mention-badge-conv-group-1"]')
      expect(mentionBadge.exists()).toBe(true)
      expect(mentionBadge.text()).toContain('@')
    })

    it('filters conversations when typing in the search bar and clears on escape', async () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          conversations: mockConversations,
          activeConversationId: null,
          unreadCounts: {},
          onlineFriends: [],
          currentUser: mockCurrentUser,
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      const searchInput = wrapper.find('[data-test="conversation-search-input"]')
      expect(searchInput.exists()).toBe(true)

      // Filter by group title
      await searchInput.setValue('phoenix')
      expect(wrapper.find('[data-test="conversation-item-conv-group-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="conversation-item-conv-direct-1"]').exists()).toBe(false)

      // Filter by direct peer name
      await searchInput.setValue('bob')
      expect(wrapper.find('[data-test="conversation-item-conv-direct-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="conversation-item-conv-group-1"]').exists()).toBe(false)

      // Clear search with Escape
      await searchInput.trigger('keydown', { key: 'Escape' })
      expect(wrapper.find('[data-test="conversation-item-conv-direct-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="conversation-item-conv-group-1"]').exists()).toBe(true)
    })

    it('emits openContacts and openCreateGroup when respective action buttons are clicked', async () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          conversations: mockConversations,
          activeConversationId: null,
          unreadCounts: {},
          onlineFriends: [],
          currentUser: mockCurrentUser,
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      // Rail contacts button
      const railContactsBtn = wrapper.find('[data-test="open-contacts"]')
      expect(railContactsBtn.exists()).toBe(true)
      await railContactsBtn.trigger('click')
      expect(wrapper.emitted('openContacts')).toBeTruthy()

      // Rail create group button
      const railCreateGroupBtn = wrapper.find('[data-test="open-create-group"]')
      expect(railCreateGroupBtn.exists()).toBe(true)
      await railCreateGroupBtn.trigger('click')
      expect(wrapper.emitted('openCreateGroup')).toBeTruthy()
      expect(wrapper.emitted('openCreateChannel')).toBeTruthy()

      // Selecting a conversation emits selectConversation and selectChannel
      await wrapper.find('[data-test="conversation-item-conv-group-1"]').trigger('click')
      expect(wrapper.emitted('selectConversation')?.[0]).toEqual(['conv-group-1'])
      expect(wrapper.emitted('selectChannel')?.[0]).toEqual(['conv-group-1'])
    })

    it('renders formatted timestamp, soft-deleted last message subtitle, and sorts active conversations first', () => {
      const convActiveRecent: Conversation = {
        id: 'conv-recent',
        type: 'direct',
        title: null,
        created_by: 'u-me',
        created_at: '2026-10-21T01:00:00Z',
        lastMessage: {
          id: 'm-rec',
          client_id: 'c-rec',
          conversation_id: 'conv-recent',
          user_id: 'u-bob',
          content: 'Hey there',
          created_at: '2026-10-21T01:30:00Z',
          status: 'sent',
        },
        peer: mockPeerBob,
      }

      const convDeletedLast: Conversation = {
        id: 'conv-deleted',
        type: 'direct',
        title: null,
        created_by: 'u-me',
        created_at: '2026-10-21T00:30:00Z',
        lastMessage: {
          id: 'm-del',
          client_id: 'c-del',
          conversation_id: 'conv-deleted',
          user_id: 'u-bob',
          content: 'Deleted secret message',
          deleted_at: '2026-10-21T01:15:00Z',
          created_at: '2026-10-21T01:15:00Z',
          status: 'sent',
        },
        peer: mockPeerBob,
      }

      const convNoActivity: Conversation = {
        id: 'conv-no-act',
        type: 'group',
        title: 'Empty Lounge',
        created_by: 'u-me',
      }

      const wrapper = mount(ChatSidebar, {
        props: {
          // Provide in arbitrary order: no-activity first, then deleted, then recent
          conversations: [convNoActivity, convDeletedLast, convActiveRecent],
          activeConversationId: null,
          unreadCounts: {},
          onlineFriends: [],
          currentUser: mockCurrentUser,
          isDark: true,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      // 1. Soft-deleted message renders "This message was deleted"
      const deletedItem = wrapper.find('[data-test="conversation-item-conv-deleted"]')
      expect(deletedItem.exists()).toBe(true)
      expect(deletedItem.text()).toContain('This message was deleted')
      expect(deletedItem.text()).not.toContain('Deleted secret message')

      // 2. Timestamp rendered on recent item
      const recentTime = wrapper.find('[data-test="conversation-time-conv-recent"]')
      expect(recentTime.exists()).toBe(true)
      expect(recentTime.text().length).toBeGreaterThan(0)

      // 3. Sort ordering: conv-recent (01:30) > conv-deleted (01:15) > conv-no-act (0)
      const allItems = wrapper.findAll('[data-test^="conversation-item-"]')
      expect(allItems.length).toBe(3)
      expect(allItems[0].attributes('data-test')).toBe('conversation-item-conv-recent')
      expect(allItems[1].attributes('data-test')).toBe('conversation-item-conv-deleted')
      expect(allItems[2].attributes('data-test')).toBe('conversation-item-conv-no-act')
    })

    it('ChatSidebar does not render macOS window traffic light dots', () => {
      const wrapper = mount(ChatSidebar, {
        props: {
          conversations: [],
          activeConversationId: null,
          unreadCounts: {},
          onlineFriends: [],
          currentUser: mockCurrentUser,
          isDark: false,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      expect(wrapper.html()).not.toContain('#ff5f56')
      expect(wrapper.html()).not.toContain('#ffbd2e')
    })

    it('ChatSidebar light mode items use theme tokens instead of hardcoded white text', () => {
      const conv: Conversation = {
        id: 'conv-light',
        type: 'group',
        title: 'Team Chat',
        created_by: 'u-1',
        created_at: '2026-10-18T10:00:00Z',
      }
      const wrapper = mount(ChatSidebar, {
        props: {
          conversations: [conv],
          activeConversationId: null,
          unreadCounts: {},
          onlineFriends: [],
          currentUser: mockCurrentUser,
          isDark: false,
          connectionStatus: 'connected',
          isOpenMobile: false,
        },
      })

      const item = wrapper.find('[data-test="conversation-item-conv-light"]')
      expect(item.exists()).toBe(true)
      expect(item.html()).not.toContain('text-white/95')
      expect(item.html()).toContain('var(--ap-text-primary)')
    })
  })
})


