import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationToastContainer from '~/components/NotificationToastContainer.vue'
import type { NotificationToastItem } from '~/types/notification'

describe('NotificationToastContainer component', () => {
  const sampleToasts: NotificationToastItem[] = [
    {
      id: 'toast-1',
      conversationId: 'conv-123',
      title: 'Alice',
      snippet: 'Hey! Meet me at 5.',
      avatarColor: '#10b981',
      timestamp: Date.now(),
    },
    {
      id: 'toast-2',
      conversationId: 'conv-456',
      title: 'Bob',
      snippet: 'Check out this document',
      avatarColor: '#3b82f6',
      timestamp: Date.now(),
    },
  ]

  it('renders nothing when toasts array is empty', () => {
    const wrapper = mount(NotificationToastContainer, {
      props: { toasts: [] },
    })
    expect(wrapper.findAll('[data-test="notification-toast"]').length).toBe(0)
  })

  it('renders all active toasts with title and snippet', () => {
    const wrapper = mount(NotificationToastContainer, {
      props: { toasts: sampleToasts },
    })

    const toastEls = wrapper.findAll('[data-test="notification-toast"]')
    expect(toastEls.length).toBe(2)
    expect(toastEls[0].text()).toContain('Alice')
    expect(toastEls[0].text()).toContain('Hey! Meet me at 5.')
    expect(toastEls[1].text()).toContain('Bob')
    expect(toastEls[1].text()).toContain('Check out this document')
  })

  it('emits navigate and dismiss when clicking toast card', async () => {
    const wrapper = mount(NotificationToastContainer, {
      props: { toasts: sampleToasts },
    })

    const firstToast = wrapper.findAll('[data-test="notification-toast"]')[0]
    await firstToast.trigger('click')

    expect(wrapper.emitted('navigate')?.[0]).toEqual(['conv-123'])
    expect(wrapper.emitted('dismiss')?.[0]).toEqual(['toast-1'])
  })

  it('emits dismiss only when clicking close button', async () => {
    const wrapper = mount(NotificationToastContainer, {
      props: { toasts: sampleToasts },
    })

    const closeBtn = wrapper.findAll('[data-test="toast-close-btn"]')[0]
    await closeBtn.trigger('click')

    expect(wrapper.emitted('dismiss')?.[0]).toEqual(['toast-1'])
    expect(wrapper.emitted('navigate')).toBeFalsy()
  })
})
