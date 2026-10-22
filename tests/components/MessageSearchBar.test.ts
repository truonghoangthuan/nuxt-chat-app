import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageSearchBar from '~/components/MessageSearchBar.vue'
import type { ChatMessage } from '~/types/chat'

describe('MessageSearchBar', () => {
  const sampleMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      client_id: 'c-1',
      conversation_id: 'conv-1',
      user_id: 'u-1',
      content: 'Apples are delicious fruits',
      created_at: '2026-10-22T10:00:00Z',
      status: 'sent',
    },
    {
      id: 'msg-2',
      client_id: 'c-2',
      conversation_id: 'conv-1',
      user_id: 'u-2',
      content: 'Oranges and apples in a basket',
      created_at: '2026-10-22T10:01:00Z',
      status: 'sent',
    },
  ]

  it('renders input and updates counter as user types', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: '',
      },
    })

    const input = wrapper.find('[data-test="search-input"]')
    expect(input.exists()).toBe(true)

    await input.setValue('apples')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['apples'])

    await wrapper.setProps({ modelValue: 'apples' })
    const counter = wrapper.find('[data-test="search-count"]')
    expect(counter.text()).toContain('1 of 2')
  })

  it('cycles through results with next and prev buttons', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: 'apples',
      },
    })

    const nextBtn = wrapper.find('[data-test="search-next-btn"]')
    await nextBtn.trigger('click')

    expect(wrapper.emitted('jump')?.[0]).toEqual(['msg-2'])

    const prevBtn = wrapper.find('[data-test="search-prev-btn"]')
    await prevBtn.trigger('click')
    expect(wrapper.emitted('jump')?.[1]).toEqual(['msg-1'])
  })

  it('emits close on close button click and escape key', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: 'apples',
      },
    })

    const closeBtn = wrapper.find('[data-test="search-close-btn"]')
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()

    const input = wrapper.find('[data-test="search-input"]')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')?.length).toBe(2)
  })
})
