import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatSidebar from '~/components/ChatSidebar.vue'
import { useTheme } from '~/composables/useTheme'
import type { Conversation } from '~/types/chat'

const conversations: Conversation[] = [
  { id: 'direct', type: 'direct', title: null, peer: { id: 'bob', display_name: 'Bob', email: 'bob@example.com', avatar_color: '#0284c7' }, created_by: 'me', created_at: '2026-10-20T10:00:00Z' },
  { id: 'group', type: 'group', title: 'Weekend friends', created_by: 'me', created_at: '2026-10-21T10:00:00Z' },
  { id: 'read', type: 'group', title: 'Read room', created_by: 'me', created_at: '2026-10-19T10:00:00Z' },
]
function sidebar() {
  return mount(ChatSidebar, { props: {
    conversations, unreadCounts: { direct: 2, group: 3 }, onlineFriends: [],
    currentUser: { id: 'me', email: 'me@example.com', display_name: 'Me', avatar_color: '#0284c7' },
    isDark: false, connectionStatus: 'connected', isOpenMobile: true,
  } })
}
function ids(wrapper: ReturnType<typeof sidebar>) {
  return wrapper.findAll('[data-test^="conversation-item-"]').map(row => row.attributes('data-test'))
}
afterEach(() => { useTheme().setUiTheme('default') })

describe('conversation list filters', () => {
  it('filters Direct and Groups while composing with name/email search and Escape', async () => {
    const wrapper = sidebar()
    try {
      await wrapper.get('[data-test="conversation-filter-direct"]').trigger('click')
      expect(ids(wrapper)).toEqual(['conversation-item-direct'])
      const search = wrapper.get('[data-test="conversation-search-input"]')
      await search.setValue('BOB@EXAMPLE.COM')
      expect(ids(wrapper)).toEqual(['conversation-item-direct'])
      await wrapper.get('[data-test="conversation-filter-group"]').trigger('click')
      expect(ids(wrapper)).toEqual([])
      expect(wrapper.text()).toContain('No conversations match your search and filter')
      await search.trigger('keydown', { key: 'Escape' })
      expect(ids(wrapper)).toEqual(['conversation-item-group', 'conversation-item-read'])
      expect(wrapper.get('[data-test="conversation-filter-group"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('[data-test="conversation-filter-direct"]').attributes('aria-pressed')).toBe('false')
      await wrapper.setProps({ conversations: [conversations[0]] })
      expect(wrapper.text()).toContain('No group conversations')
      await wrapper.setProps({ conversations: [conversations[1]] })
      await wrapper.get('[data-test="conversation-filter-direct"]').trigger('click')
      expect(wrapper.text()).toContain('No direct conversations')
    } finally { wrapper.unmount() }
  })

  it.each(['default', 'vscode', 'yahoo', 'telegram'] as const)('keeps filtering and quick actions in the %s theme', async theme => {
    useTheme().setUiTheme(theme)
    const wrapper = sidebar()
    try {
      await wrapper.get('[data-test="conversation-filter-unread"]').trigger('click')
      await wrapper.get('[data-test="conversation-search-input"]').setValue(' weekend ')
      expect(ids(wrapper)).toEqual(['conversation-item-group'])
      for (const [hook, event] of [['open-contacts', 'openContacts'], ['open-start-dm', 'openStartDm'], ['open-create-group', 'openCreateGroup']] as const) {
        await wrapper.get(`[data-test="${hook}"]`).trigger('click')
        expect(wrapper.emitted(event)).toEqual([[]])
      }
      await wrapper.get('[data-test="conversation-search-input"]').setValue('')
      await wrapper.setProps({ unreadCounts: { direct: -1 } })
      expect(ids(wrapper)).toEqual([])
    } finally { wrapper.unmount() }
    const reopened = sidebar()
    try {
      expect(reopened.get('[data-test="conversation-filter-all"]').attributes('aria-pressed')).toBe('true')
    } finally { reopened.unmount() }
  })

  it('supports the legacy channel inputs without changing their activity ordering', async () => {
    const wrapper = sidebar()
    try {
      await wrapper.setProps({ conversations: undefined,
        dmChannels: [{ id: 'legacy-dm', type: 'direct', slug: 'bob', created_by: 'me', created_at: '2026-10-20T10:00:00Z', peer: conversations[0].peer }],
        channels: [{ id: 'legacy-group', slug: 'friends', created_by: 'me', created_at: '2026-10-21T10:00:00Z' }],
      })
      await wrapper.get('[data-test="conversation-filter-direct"]').trigger('click')
      expect(ids(wrapper)).toEqual(['conversation-item-legacy-dm'])
      await wrapper.get('[data-test="conversation-filter-group"]').trigger('click')
      expect(ids(wrapper)).toEqual(['conversation-item-legacy-group'])
    } finally { wrapper.unmount() }
  })

  it('defaults to All and shows only live unread conversations without changing selection or reads', async () => {
    const wrapper = sidebar()
    try {
      expect(wrapper.get('[data-test="conversation-filter-all"]').attributes('aria-pressed')).toBe('true')
      expect(ids(wrapper)).toEqual(['conversation-item-group', 'conversation-item-direct', 'conversation-item-read'])
      await wrapper.get('[data-test="conversation-filter-unread"]').trigger('click')
      expect(ids(wrapper)).toEqual(['conversation-item-group', 'conversation-item-direct'])
      expect(wrapper.emitted('selectConversation')).toBeUndefined()
      await wrapper.setProps({ unreadCounts: { direct: 0, group: 0 } })
      expect(ids(wrapper)).toEqual([])
      expect(wrapper.text()).toContain('No unread conversations')
      await wrapper.setProps({ unreadCounts: { read: 1 } })
      expect(ids(wrapper)).toEqual(['conversation-item-read'])
      await wrapper.get('[data-test="conversation-item-read"]').trigger('click')
      expect(wrapper.emitted('selectConversation')).toEqual([['read']])
      expect(wrapper.emitted('selectChannel')).toEqual([['read']])
      expect(wrapper.emitted('closeMobile')).toEqual([[]])
      await wrapper.get('[data-test="conversation-filter-all"]').trigger('click')
      expect(ids(wrapper)).toHaveLength(3)
    } finally { wrapper.unmount() }
  })
})
