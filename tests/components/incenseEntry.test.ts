import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
vi.mock('~/composables/useTheme', () => ({ useTheme: () => ({ uiTheme: ref('default') }) }))
const props = { unreadCounts: {}, onlineFriends: [], currentUser: null, isDark: false, connectionStatus: 'connected' as const, isOpenMobile: false }
describe('incense activities entry', () => {
  it('requires a selected conversation and deliberate opt-in', async () => {
    const wrapper = mount(ChatSidebar, { props })
    expect(wrapper.get('[data-test="open-incense"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Chọn cuộc trò chuyện')
    await wrapper.setProps({ canOpenIncense: true })
    await wrapper.get('[data-test="open-incense"]').trigger('click')
    expect(wrapper.emitted('openIncense')).toHaveLength(1)
    wrapper.unmount()
  })
})
