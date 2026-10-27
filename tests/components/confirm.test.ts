import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import ConfirmPage from '~/pages/confirm.vue'

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('email confirmation page', () => {
  it('returns an authenticated user to the saved chess invite', async () => {
    vi.useFakeTimers()
    const invitePath = '/chess?room=8b4d5f9a-3e43-4e52-9d53-2cf4e90f8a31'
    const pluck = vi.fn(() => invitePath)
    const navigateTo = vi.fn()
    vi.stubGlobal('useSupabaseUser', () => ref({ id: 'player-id' }))
    vi.stubGlobal('useSupabaseCookieRedirect', () => ({ pluck }))
    vi.stubGlobal('navigateTo', navigateTo)

    const wrapper = mount(ConfirmPage)
    await flushPromises()

    expect(pluck).toHaveBeenCalledOnce()
    expect(navigateTo).toHaveBeenCalledWith(invitePath)
    wrapper.unmount()
  })
})
