import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageViewport from '~/components/MessageViewport.vue'
import type { ChatMessage } from '~/types/chat'

describe('MessageViewport search highlighting & jump', () => {
  const sampleMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      client_id: 'client-1',
      conversation_id: 'conv-1',
      user_id: 'user-1',
      content: 'Antigravity super secret message',
      created_at: '2026-10-22T10:00:00Z',
      status: 'sent',
    },
    {
      id: 'msg-2',
      client_id: 'client-2',
      conversation_id: 'conv-1',
      user_id: 'user-2',
      content: 'Another regular note here',
      created_at: '2026-10-22T10:01:00Z',
      status: 'sent',
    },
  ]

  it('highlights matching keywords with mark tags when searchQuery prop is provided', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        messages: sampleMessages,
        currentUserId: 'user-1',
        searchQuery: 'secret',
      },
    })

    const marks = wrapper.findAll('mark')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks[0].text()).toBe('secret')
  })

  it('exposes jumpToMessage method which sets highlightedMessageId', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        messages: sampleMessages,
        currentUserId: 'user-1',
      },
      attachTo: document.body,
    })

    const vm = wrapper.vm as any
    expect(typeof vm.jumpToMessage).toBe('function')

    vm.jumpToMessage('msg-1')
    await wrapper.vm.$nextTick()

    const bubble = wrapper.find('[data-message-id="msg-1"] [data-test="message-bubble-msg-1"]')
    expect(bubble.classes()).toContain('ring-2')
    wrapper.unmount()
  })
})
