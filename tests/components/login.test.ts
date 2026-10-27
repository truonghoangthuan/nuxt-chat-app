import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { signInWithPassword, signUpWithProfile } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithProfile: vi.fn(),
}))

vi.mock('~/composables/useAuthProfile', () => ({
  useAuthProfile: () => ({ signInWithPassword, signUpWithProfile }),
}))

import LoginPage from '~/pages/login.vue'

beforeEach(() => {
  signInWithPassword.mockReset()
  signUpWithProfile.mockReset()
  vi.stubGlobal('useSupabaseCookieRedirect', () => ({ pluck: vi.fn(() => null) }))
  vi.stubGlobal('navigateTo', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('login page', () => {
  it('renders shadcn form controls with vertically stacked labels', () => {
    const wrapper = mount(LoginPage)

    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    expect(wrapper.findAll('form label').every(label => label.classes().includes('block'))).toBe(true)
    wrapper.unmount()
  })

  it('uses adaptive contrast tokens for inputs, labels, and headings without hardcoded text-white', () => {
    const wrapper = mount(LoginPage)
    const inputs = wrapper.findAll('input')
    for (const input of inputs) {
      expect(input.classes()).not.toContain('text-white')
      expect(input.classes()).not.toContain('placeholder-white/40')
    }
    const heading = wrapper.find('h2')
    expect(heading.classes().some(c => c.includes('text-[var(--ap-text-primary)]'))).toBe(true)
    wrapper.unmount()
  })

  it('returns a signed-in user to the saved chess invite', async () => {
    const invitePath = '/chess?room=8b4d5f9a-3e43-4e52-9d53-2cf4e90f8a31'
    const pluck = vi.fn(() => invitePath)
    const navigateTo = vi.fn()
    signInWithPassword.mockResolvedValue({ error: null })
    vi.stubGlobal('useSupabaseCookieRedirect', () => ({ pluck }))
    vi.stubGlobal('navigateTo', navigateTo)

    const wrapper = mount(LoginPage)
    await wrapper.get('input[type="email"]').setValue('player@example.test')
    await wrapper.get('input[type="password"]').setValue('test-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(pluck).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith(invitePath)
    wrapper.unmount()
  })
})
