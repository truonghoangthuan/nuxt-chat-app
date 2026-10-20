import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('~/composables/useAuthProfile', () => ({
  useAuthProfile: () => ({
    signInWithPassword: vi.fn(),
    signUpWithProfile: vi.fn(),
  }),
}))

import LoginPage from '~/pages/login.vue'

describe('login page', () => {
  it('renders shadcn form controls with vertically stacked labels', () => {
    const wrapper = mount(LoginPage)

    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
    expect(wrapper.findAll('form label').every(label => label.classes().includes('block'))).toBe(true)
  })
})
