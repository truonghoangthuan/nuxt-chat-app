import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfettiOverlay from '~/components/ConfettiOverlay.vue'

describe('ConfettiOverlay (app/components/ConfettiOverlay.vue)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders canvas element when active is true', () => {
    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: true,
        burstKey: 0,
      },
    })

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="confetti-canvas"]').exists()).toBe(true)
  })

  it('does not render anything when active is false', () => {
    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: false,
      },
    })

    expect(wrapper.find('[data-test="confetti-overlay"]').exists()).toBe(false)
  })

  it('emits complete after completion safety timeout', async () => {
    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: true,
        burstKey: 0,
      },
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('complete')).toBeFalsy()
    vi.advanceTimersByTime(3500)
    expect(wrapper.emitted('complete')).toBeTruthy()
  })
})
