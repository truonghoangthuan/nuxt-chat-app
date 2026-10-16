import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageComposer from '~/components/MessageComposer.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'

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
})
