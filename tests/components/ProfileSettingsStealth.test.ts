import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfileSettingsModal from '~/components/ProfileSettingsModal.vue'
import { useStealthMode } from '~/composables/useStealthMode'

describe('ProfileSettingsModal — Stealth Mode settings', () => {
  beforeEach(() => {
    localStorage.clear()
    const { updateStealthConfig, removeCustomCoverImage } = useStealthMode()
    updateStealthConfig({ shortcut: 'Ctrl+H', mode: 'code', imageFit: 'cover', cloakTitle: 'Workspace — Notes' })
    removeCustomCoverImage()
  })

  it('records a new shortcut when recording mode is active and key combo is pressed', async () => {
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: { id: 'u1', display_name: 'Alice', avatar_color: '#3b82f6' },
      },
    })

    const recordBtn = wrapper.find('[data-test="stealth-shortcut-btn"]')
    expect(recordBtn.exists()).toBe(true)
    expect(recordBtn.text()).toContain('Ctrl+H')

    await recordBtn.trigger('click')
    await recordBtn.trigger('keydown', { key: 'k', ctrlKey: true, shiftKey: true })

    const { config } = useStealthMode()
    expect(config.value.shortcut).toBe('Ctrl+Shift+K')
    expect(recordBtn.text()).toContain('Ctrl+Shift+K')
  })

  it('switches stealth cover mode between image, code, and sheet', async () => {
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: { id: 'u1', display_name: 'Alice', avatar_color: '#3b82f6' },
      },
    })

    await wrapper.find('[data-test="stealth-mode-sheet"]').trigger('click')
    const { config } = useStealthMode()
    expect(config.value.mode).toBe('sheet')
  })

  it('resets shortcut to default Ctrl+H on reset click', async () => {
    const { updateStealthConfig } = useStealthMode()
    updateStealthConfig({ shortcut: 'Alt+Shift+Z' })

    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: { id: 'u1', display_name: 'Alice', avatar_color: '#3b82f6' },
      },
    })

    const resetBtn = wrapper.find('[data-test="stealth-shortcut-reset"]')
    expect(resetBtn.exists()).toBe(true)
    await resetBtn.trigger('click')

    const { config } = useStealthMode()
    expect(config.value.shortcut).toBe('Ctrl+H')
  })

  it('displays error message when custom cover image upload exceeds storage quota', async () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: { id: 'u1', display_name: 'Alice', avatar_color: '#3b82f6' },
      },
    })

    const input = wrapper.find<HTMLInputElement>('[data-test="stealth-image-input"]')
    const file = new File(['image-bytes'], 'cover.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

    await input.trigger('change')
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('quota')
    setItemSpy.mockRestore()
  })

  it('updates decoy tab title (cloakTitle) when input changes', async () => {
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: { id: 'u1', display_name: 'Alice', avatar_color: '#3b82f6' },
      },
    })

    const titleInput = wrapper.find<HTMLInputElement>('[data-test="stealth-cloak-title-input"]')
    expect(titleInput.exists()).toBe(true)
    expect(titleInput.element.value).toBe('Workspace — Notes')

    await titleInput.setValue('Budget Spreadsheet 2026')
    const { config } = useStealthMode()
    expect(config.value.cloakTitle).toBe('Budget Spreadsheet 2026')
  })
})
