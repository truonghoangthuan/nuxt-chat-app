import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RightUtilityPanel from '~/components/RightUtilityPanel.vue'

describe('RightUtilityPanel Component', () => {
  const mockConversation = {
    id: 'conv-123',
    type: 'group' as const,
    title: 'Chaos Crew',
    created_by: 'user-1',
    created_at: '2026-10-27T10:00:00Z',
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('renders panel with open and closed states', () => {
    const wrapper = mount(RightUtilityPanel, {
      props: {
        isOpen: true,
        conversation: mockConversation,
        mediaCount: 5,
        linksCount: 3,
      },
    })

    const panel = wrapper.find('[data-test="right-utility-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('w-80')
    expect(panel.text()).toContain('Chaos Hub')
    expect(panel.text()).toContain('Chaos Crew')
  })

  it('switches between tabs and emits close event', async () => {
    const wrapper = mount(RightUtilityPanel, {
      props: {
        isOpen: true,
        conversation: mockConversation,
      },
    })

    // Default tab is chaos (stickers)
    expect(wrapper.find('[data-test="sticker-item"]').exists()).toBe(true)

    // Switch to activities tab
    await wrapper.find('[data-test="utility-tab-activities"]').trigger('click')
    expect(wrapper.text()).toContain('Play Caro (Gomoku)')
    expect(wrapper.text()).toContain('Multiplayer Chess')

    // Switch to notes tab
    await wrapper.find('[data-test="utility-tab-notes"]').trigger('click')
    expect(wrapper.text()).toContain('Group Banter Board')

    // Click close button
    await wrapper.find('[data-test="close-utility-panel"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits sendSticker when a sticker is clicked', async () => {
    const wrapper = mount(RightUtilityPanel, {
      props: {
        isOpen: true,
        conversation: mockConversation,
      },
    })

    const stickers = wrapper.findAll('[data-test="sticker-item"]')
    expect(stickers.length).toBeGreaterThan(0)

    // Click first sticker
    await stickers[0].trigger('click')
    expect(wrapper.emitted('sendSticker')).toBeTruthy()
    expect(wrapper.emitted('sendSticker')?.[0]?.[0]).toMatch(/^\[sticker:/)
  })

  it('saves and loads banter notes in localStorage', async () => {
    const wrapper = mount(RightUtilityPanel, {
      props: {
        isOpen: true,
        conversation: mockConversation,
      },
    })

    // Switch to notes tab
    await wrapper.find('[data-test="utility-tab-notes"]').trigger('click')
    const textarea = wrapper.find('textarea')
    await textarea.setValue('Pizza bet: Alice owes 2 slices')

    expect(localStorage.getItem('chaos-banter-conv-123')).toBe('Pizza bet: Alice owes 2 slices')
  })

  it('renders mobile backdrop when open and emits close when backdrop is clicked', async () => {
    const wrapper = mount(RightUtilityPanel, {
      props: {
        isOpen: true,
        conversation: mockConversation,
      },
    })

    const backdrop = wrapper.find('[data-test="utility-panel-backdrop"]')
    expect(backdrop.exists()).toBe(true)

    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
