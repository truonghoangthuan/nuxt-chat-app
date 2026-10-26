import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfettiDictionaryModal from '~/components/ConfettiDictionaryModal.vue'

describe('ConfettiDictionaryModal.vue', () => {
  const mockConversationWithWords = {
    id: 'conv-1',
    type: 'group',
    title: 'General',
    confetti_words: ['congrats', 'party'],
  }

  const mockConversationEmpty = {
    id: 'conv-2',
    type: 'direct',
    title: null,
    confetti_words: [],
  }

  it('renders empty state when conversation has no words', () => {
    const wrapper = mount(ConfettiDictionaryModal, {
      props: {
        isOpen: true,
        conversation: mockConversationEmpty as any,
      },
    })
    expect(wrapper.find('[data-test="confetti-words-empty"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="confetti-word-chip"]')).toHaveLength(0)
  })

  it('renders word chips when conversation has words', () => {
    const wrapper = mount(ConfettiDictionaryModal, {
      props: {
        isOpen: true,
        conversation: mockConversationWithWords as any,
      },
    })
    const chips = wrapper.findAll('[data-test="confetti-word-chip"]')
    expect(chips).toHaveLength(2)
    expect(chips[0].text()).toContain('congrats')
    expect(chips[1].text()).toContain('party')
  })

  it('emits addWord on form submit with trimmed text and clears input', async () => {
    const wrapper = mount(ConfettiDictionaryModal, {
      props: {
        isOpen: true,
        conversation: mockConversationWithWords as any,
      },
    })
    const input = wrapper.find('[data-test="confetti-word-input"]')
    await input.setValue('  awesome  ')
    await wrapper.find('[data-test="confetti-word-form"]').trigger('submit')

    expect(wrapper.emitted('addWord')).toEqual([['awesome']])
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('shows error when submitting empty input', async () => {
    const wrapper = mount(ConfettiDictionaryModal, {
      props: {
        isOpen: true,
        conversation: mockConversationWithWords as any,
      },
    })
    await wrapper.find('[data-test="confetti-word-form"]').trigger('submit')
    expect(wrapper.find('[data-test="confetti-word-error"]').exists()).toBe(true)
    expect(wrapper.emitted('addWord')).toBeUndefined()
  })

  it('emits removeWord when clicking chip remove button', async () => {
    const wrapper = mount(ConfettiDictionaryModal, {
      props: {
        isOpen: true,
        conversation: mockConversationWithWords as any,
      },
    })
    const removeBtns = wrapper.findAll('[data-test="confetti-word-remove-btn"]')
    await removeBtns[0].trigger('click')
    expect(wrapper.emitted('removeWord')).toEqual([['congrats']])
  })

  it('emits close on close button and Escape key', async () => {
    const wrapper = mount(ConfettiDictionaryModal, {
      props: {
        isOpen: true,
        conversation: mockConversationWithWords as any,
      },
      attachTo: document.body,
    })
    await wrapper.find('button[aria-label="Close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(2)

    wrapper.unmount()
  })
})
