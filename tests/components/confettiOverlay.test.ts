import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfettiOverlay from '~/components/ConfettiOverlay.vue'
import * as confettiUtils from '~/utils/confetti'

describe('ConfettiOverlay (app/components/ConfettiOverlay.vue)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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
    vi.advanceTimersByTime(4000)
    expect(wrapper.emitted('complete')).toBeTruthy()
  })

  it('does not duplicate bursts on initial activation', async () => {
    const burstSpy = vi.spyOn(confettiUtils, 'createRaycastConfettiBurst')
    burstSpy.mockClear()

    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: false,
        burstKey: 0,
      },
    })

    await wrapper.setProps({ active: true, burstKey: 1 })
    await wrapper.vm.$nextTick()

    expect(burstSpy).toHaveBeenCalledTimes(1)
  })

  it('completes immediately when prefers-reduced-motion is active', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: true,
        burstKey: 1,
      },
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('complete')).toBeTruthy()
    window.matchMedia = originalMatchMedia
  })

  it('passes a randomly picked effect to createRaycastConfettiBurst when effect prop is omitted', async () => {
    const burstSpy = vi.spyOn(confettiUtils, 'createRaycastConfettiBurst')
    burstSpy.mockClear()

    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: true,
        burstKey: 1,
      },
    })
    await wrapper.vm.$nextTick()

    expect(burstSpy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      undefined,
      expect.stringMatching(/^(confetti|pets|water|party)$/),
    )
  })

  it('honors explicit effect prop when provided', async () => {
    const burstSpy = vi.spyOn(confettiUtils, 'createRaycastConfettiBurst')
    burstSpy.mockClear()

    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: true,
        burstKey: 1,
        effect: 'pets',
      },
    })
    await wrapper.vm.$nextTick()

    expect(burstSpy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      undefined,
      'pets',
    )
  })
})
