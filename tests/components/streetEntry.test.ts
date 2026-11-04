import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
vi.mock('~/composables/useTheme', () => ({ useTheme: () => ({ uiTheme: ref('default') }) }))
const props = { unreadCounts: {}, onlineFriends: [], currentUser: null, isDark: false, connectionStatus: 'connected' as const, isOpenMobile: false }
describe('street activity entry', () => {
  it('explains that a group is required instead of exposing private chats to a street', async () => {
    const wrapper = mount(ChatSidebar, { props })
    expect(wrapper.get('[data-test="open-street"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Chọn nhóm để ra phố')
    wrapper.unmount()
  })
  it('opens the selected group street explicitly when allowed', async () => {
    const wrapper = mount(ChatSidebar, { props: { ...props, canOpenStreet: true } })
    await wrapper.get('[data-test="open-street"]').trigger('click')
    expect(wrapper.emitted('openStreet')).toHaveLength(1)
    wrapper.unmount()
  })
})
