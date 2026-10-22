import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageActionsMenu from '~/components/MessageActionsMenu.vue'
import { REACTION_EMOJIS } from '~/utils/chat'

const message = {
  id: 'm-1',
  channel_id: 'ch-1',
  user_id: 'u-1',
  content: 'A mobile-friendly message',
  created_at: '2026-10-19T12:00:00Z',
  status: 'sent' as const,
  author: { id: 'u-1', display_name: 'Alice', avatar_color: '#4f46e5' },
}

describe('MessageActionsMenu', () => {
  it('does not overlap message bubble with absolute positioning', () => {
    const wrapper = mount(MessageActionsMenu, {
      props: { message, currentUserId: 'u-1' },
    })

    const rootClasses = wrapper.classes()
    expect(rootClasses).not.toContain('absolute')
    expect(rootClasses).toContain('relative')
    expect(rootClasses).toContain('md:hidden')
    expect(rootClasses).toContain('shrink-0')
  })

  it('offers reactions and message actions through a compact touch menu', async () => {
    const wrapper = mount(MessageActionsMenu, {
      props: { message, currentUserId: 'u-1' },
    })

    expect(wrapper.find('[data-test="mobile-action-menu"]').exists()).toBe(false)
    await wrapper.find('[data-test="open-mobile-actions"]').trigger('click')
    expect(wrapper.find('[data-test="mobile-action-menu"]').exists()).toBe(true)

    await wrapper.find('[data-test="mobile-reaction"]').trigger('click')
    expect(wrapper.emitted('toggleReaction')?.[0]).toEqual([
      { messageId: 'm-1', emoji: REACTION_EMOJIS[0] },
    ])
    expect(wrapper.find('[data-test="mobile-action-menu"]').exists()).toBe(false)

    await wrapper.find('[data-test="open-mobile-actions"]').trigger('click')
    await wrapper.find('[data-test="mobile-reply"]').trigger('click')
    expect(wrapper.emitted('reply')?.[0]).toEqual([message])

    await wrapper.find('[data-test="open-mobile-actions"]').trigger('click')
    await wrapper.find('[data-test="mobile-edit"]').trigger('click')
    expect(wrapper.emitted('edit')?.[0]).toEqual([message])

    await wrapper.find('[data-test="open-mobile-actions"]').trigger('click')
    await wrapper.find('[data-test="mobile-delete"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]).toEqual(['m-1'])
  })

  it('renders Pin/Unpin button and emits togglePin when clicked', async () => {
    const wrapper = mount(MessageActionsMenu, {
      props: { message, currentUserId: 'u-1' },
    })

    await wrapper.find('[data-test="open-mobile-actions"]').trigger('click')
    const pinBtn = wrapper.find('[data-test="mobile-pin"]')
    expect(pinBtn.exists()).toBe(true)
    expect(pinBtn.text()).toBe('Pin')

    await pinBtn.trigger('click')
    expect(wrapper.emitted('togglePin')?.[0]).toEqual(['m-1'])
  })
})
