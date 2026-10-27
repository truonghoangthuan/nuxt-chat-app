import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import ChessPage from '~/pages/chess.vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
import { backend, room, roomId } from '../helpers/chessBackend'

describe('Chess page', () => {
  let api: ReturnType<typeof backend>, route: any, wrapper: any
  beforeEach(() => {
    api = backend(); route = reactive({ query: {} })
    vi.stubGlobal('useRoute', () => route)
    vi.stubGlobal('useRouter', () => ({ replace: vi.fn(async (v: any) => { route.query = v.query }) }))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } })
  })
  afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
  it('creates a waiting room and copies a UUID invite', async () => {
    api.setGame({ ...room(), black_id: null, status: 'waiting' })
    wrapper = mount(ChessPage)
    expect(wrapper.findAll('[data-square]')).toHaveLength(64)
    await wrapper.get('[data-test="create-chess"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Waiting for opponent')
    await wrapper.get('[data-test="copy-chess"]').trigger('click'); await flushPromises()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining(`/chess?room=${roomId}`))
    expect(wrapper.text()).toContain('Link copied')
  })
  it('joins from invite, makes a move, shows checkmate read-only, and reopens', async () => {
    route.query = { room: roomId }; wrapper = mount(ChessPage); await flushPromises()
    expect(api.client.rpc).toHaveBeenCalledWith('join_chess_game', { p_game_id: roomId })
    await api.channels[0].status('SUBSCRIBED'); await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Your turn')
    await wrapper.get('[data-square="e2"]').trigger('click')
    await wrapper.get('[data-square="e4"]').trigger('click'); await flushPromises()
    expect(api.fetch).toHaveBeenCalledTimes(1)
    api.setGame({ ...room(), status: 'checkmate', result: 'white' })
    await api.channels[0].events[0].cb(); await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Checkmate')
    expect(wrapper.get('[data-square="e2"]').attributes('aria-disabled')).toBe('true')
    wrapper.unmount(); wrapper = mount(ChessPage); await flushPromises()
    expect(wrapper.text()).toContain('Checkmate')
  })
  it('reports inaccessible rooms and retries; has a sidebar entry', async () => {
    route.query = { room: roomId }
    api.client.rpc.mockRejectedValueOnce(new Error('Room unavailable'))
    wrapper = mount(ChessPage); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Room unavailable')
    await wrapper.get('[data-test="retry-chess"]').trigger('click'); await flushPromises()
    expect(api.client.rpc).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    wrapper = mount(ChatSidebar, { props: { unreadCounts: {}, onlineFriends: [], currentUser: null, isDark: false, connectionStatus: 'connected', isOpenMobile: false } })
    expect(wrapper.get('[data-test="play-chess"]').attributes('href')).toBe('/chess')
  })
})
