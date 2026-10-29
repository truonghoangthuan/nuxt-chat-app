import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import MessageComposer from '~/components/MessageComposer.vue'
import UserAvatar from '~/components/UserAvatar.vue'
import { useTheme } from '~/composables/useTheme'
import type { ChatMessage, Conversation } from '~/types/chat'

const alice = { id: 'alice', display_name: 'Alice', avatar_color: '#0284c7' }
const conversation: Conversation = { id: 'weekend', type: 'direct', peer: alice, created_by: 'me', created_at: '2026-10-20T00:00:00Z' }
const messages: ChatMessage[] = [
  { id: 'incoming', client_id: 'in', channel_id: 'weekend', user_id: 'alice', content: 'Coffee this weekend?', created_at: '2026-10-20T10:00:00Z', status: 'sent', author: alice },
  { id: 'outgoing', client_id: 'out', channel_id: 'weekend', user_id: 'me', content: 'See you there!', created_at: '2026-10-20T10:01:00Z', status: 'sent', reply_to_id: 'incoming' },
]

describe('Telegram workspace components', () => {
  beforeEach(() => {
    localStorage.clear()
    useTheme().initTheme()
    useTheme().setUiTheme('telegram')
  })
  afterEach(() => {
    localStorage.clear()
    useTheme().initTheme()
  })

  it('keeps conversation selection, search and sidebar quick actions with round messenger avatars', async () => {
    const sidebar = mount(ChatSidebar, { props: {
      conversations: [conversation], activeConversationId: 'weekend', unreadCounts: {}, onlineFriends: [], currentUser: alice,
      isDark: true, connectionStatus: 'connected', isOpenMobile: false,
    } })
    try {
      expect(sidebar.get('aside').classes()).toContain('chat-sidebar')
      expect(sidebar.findComponent(UserAvatar).props('shape')).toBe('circle')
      await sidebar.get('[data-test="conversation-item-weekend"]').trigger('click')
      expect(sidebar.emitted('selectConversation')?.[0]).toEqual(['weekend'])
      for (const [hook, event] of [['open-contacts', 'openContacts'], ['open-start-dm', 'openStartDm'], ['open-create-group', 'openCreateGroup'], ['open-profile-settings', 'openProfileSettings']] as const) {
        await sidebar.get(`[data-test="${hook}"]`).trigger('click')
        expect(sidebar.emitted(event)).toBeTruthy()
      }
      await sidebar.get('[data-test="conversation-search-input"]').setValue('no match')
      expect(sidebar.find('[data-test="conversation-item-weekend"]').exists()).toBe(false)
      useTheme().setUiTheme('default')
      await nextTick()
      await sidebar.get('[data-test="conversation-search-input"]').setValue('')
      expect(sidebar.findComponent(UserAvatar).props('shape')).toBe('squircle')
    } finally { sidebar.unmount() }
  })

  it('renders compact incoming/outgoing bubbles, keeps reply/profile actions and one wallpaper stage around the composer', async () => {
    const viewport = mount(MessageViewport, {
      props: { currentUserId: 'me', messages, channelId: 'weekend', backgroundUrl: 'https://example.com/wallpaper.jpg', loadOlder: vi.fn() },
      slots: { default: () => h(MessageComposer, { channelSlug: 'weekend' }) },
    })
    try {
      expect(viewport.classes()).toContain('chat-timeline-stage')
      expect(viewport.get('[data-test="message-bubble-incoming"]').attributes('data-direction')).toBe('incoming')
      expect(viewport.get('[data-test="message-bubble-outgoing"]').attributes('data-direction')).toBe('outgoing')
      expect(viewport.findAll('[data-test="chat-background-layer"]')).toHaveLength(1)
      expect(viewport.find('[data-test="composer-deck"]').exists()).toBe(true)
      expect(viewport.findComponent(UserAvatar).props('shape')).toBe('circle')
      await viewport.get('[data-test="reply-incoming"]').trigger('click')
      expect(viewport.emitted('reply')?.[0]).toEqual([messages[0]])
      await viewport.get('[data-test="recipient-avatar-trigger"]').trigger('click')
      expect(viewport.emitted('viewProfile')?.[0]).toEqual([alice])
      await viewport.setProps({ backgroundUrl: null })
      expect(viewport.find('[data-test="chat-background-layer"]').exists()).toBe(false)
    } finally { viewport.unmount() }
  })

  it('keeps Enter/Shift+Enter, circular send, stickers and disabled semantics without reloading', async () => {
    const composer = mount(MessageComposer, { props: { channelSlug: 'weekend', conversationId: 'weekend' } })
    try {
      expect(composer.get('[data-test="composer-deck"]').classes()).toContain('chat-composer-deck')
      const input = composer.get('textarea')
      const send = composer.get('[aria-label="Send message"]')
      expect(send.classes()).toContain('chat-composer-send')
      expect(send.attributes('disabled')).toBeDefined()
      await input.setValue('Hello')
      await input.trigger('keydown', { key: 'Enter', shiftKey: true })
      expect(composer.emitted('send')).toBeFalsy()
      await input.trigger('keydown', { key: 'Enter', shiftKey: false })
      expect(composer.emitted('send')?.[0]).toEqual(['Hello'])
      await input.setValue('Another message')
      await send.trigger('click')
      expect(composer.emitted('send')?.[1]).toEqual(['Another message'])
      await composer.get('[data-test="open-stickers-btn"]').trigger('click')
      expect(composer.emitted('toggleStickers')).toBeTruthy()
      useTheme().setUiTheme('vscode')
      await nextTick()
      expect(composer.find('[data-test="vscode-terminal-header"]').exists()).toBe(true)
      await composer.setProps({ disabled: true })
      expect(input.attributes('disabled')).toBeDefined()
    } finally { composer.unmount() }
  })
})
