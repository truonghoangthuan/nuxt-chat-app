import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageComposer from '~/components/MessageComposer.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import CreateChannelModal from '~/components/CreateChannelModal.vue'

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
})

