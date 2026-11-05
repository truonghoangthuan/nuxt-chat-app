import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StealthOverlay from '~/components/StealthOverlay.vue'

describe('StealthOverlay', () => {
  it('renders nothing when active is false', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: false, mode: 'image', customImageUrl: 'data:image/png;base64,abc' },
    })
    expect(wrapper.find('[data-test="stealth-overlay"]').exists()).toBe(false)
  })

  it('renders fullscreen custom uploaded image when mode is image and customImageUrl is present', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'image', customImageUrl: 'data:image/png;base64,abc', imageFit: 'cover' },
    })
    const img = wrapper.find('[data-test="stealth-custom-image"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,abc')
    expect(img.classes()).toContain('object-cover')
  })

  it('falls back to built-in code editor decoy when mode is image but customImageUrl is null', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'image', customImageUrl: null },
    })
    expect(wrapper.find('[data-test="stealth-custom-image"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stealth-decoy-code"]').exists()).toBe(true)
  })

  it('renders built-in spreadsheet decoy when mode is sheet', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'sheet', customImageUrl: null },
    })
    expect(wrapper.find('[data-test="stealth-decoy-sheet"]').exists()).toBe(true)
  })

  it('does not emit exit on single click anywhere on overlay', async () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'code', customImageUrl: null },
    })
    await wrapper.find('[data-test="stealth-overlay"]').trigger('click')
    expect(wrapper.emitted('exit')).toBeUndefined()
  })

  it('emits exit on triple-clicking the bottom-right secret unlock button', async () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'code', customImageUrl: null },
    })
    const unlockBtn = wrapper.find('[data-test="stealth-corner-unlock"]')
    expect(unlockBtn.exists()).toBe(true)
    await unlockBtn.trigger('click')
    await unlockBtn.trigger('click')
    expect(wrapper.emitted('exit')).toBeUndefined()
    await unlockBtn.trigger('click')
    expect(wrapper.emitted('exit')).toHaveLength(1)
  })

  it('emits exit on triple-clicking corner unlock button in custom image mode', async () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'image', customImageUrl: 'data:image/png;base64,abc' },
    })
    const unlockBtn = wrapper.find('[data-test="stealth-corner-unlock"]')
    expect(unlockBtn.exists()).toBe(true)
    await unlockBtn.trigger('click')
    await unlockBtn.trigger('click')
    expect(wrapper.emitted('exit')).toBeUndefined()
    await unlockBtn.trigger('click')
    expect(wrapper.emitted('exit')).toHaveLength(1)
  })
})
