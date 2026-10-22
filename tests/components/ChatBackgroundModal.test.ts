import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatBackgroundModal from '~/components/ChatBackgroundModal.vue'

describe('ChatBackgroundModal.vue', () => {
  const mockConversation = {
    id: 'conv-1',
    type: 'group',
    title: 'Designers',
    background_url: 'preset:aurora',
  }

  it('renders presets and indicates currently active preset', () => {
    const wrapper = mount(ChatBackgroundModal, {
      props: {
        isOpen: true,
        conversation: mockConversation as any,
      },
    })
    expect(wrapper.find('[data-test="preset-item-aurora"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="preset-item-sunset"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="reset-background-btn"]').exists()).toBe(true)
  })

  it('emits selectPreset when clicking a preset card', async () => {
    const wrapper = mount(ChatBackgroundModal, {
      props: {
        isOpen: true,
        conversation: mockConversation as any,
      },
    })
    await wrapper.find('[data-test="preset-item-sunset"]').trigger('click')
    expect(wrapper.emitted('selectPreset')).toEqual([['preset:sunset']])
  })

  it('emits reset when clicking reset button', async () => {
    const wrapper = mount(ChatBackgroundModal, {
      props: {
        isOpen: true,
        conversation: mockConversation as any,
      },
    })
    await wrapper.find('[data-test="reset-background-btn"]').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  it('emits close on close button and escape key', async () => {
    const wrapper = mount(ChatBackgroundModal, {
      props: {
        isOpen: true,
        conversation: mockConversation as any,
      },
      attachTo: document.body,
    })
    await wrapper.find('[data-test="close-background-modal-btn"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(2)

    wrapper.unmount()
  })
})
