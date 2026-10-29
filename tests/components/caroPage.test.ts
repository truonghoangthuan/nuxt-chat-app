import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, config } from '@vue/test-utils'
import { reactive } from 'vue'

config.global.stubs = { ...config.global.stubs, NuxtLink: true }
import CaroPage from '~/pages/caro.vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
import { backend, room } from '../helpers/caroBackend'

describe('Caro page and entry point', () => {
  let api: ReturnType<typeof backend>
  let route: any
  let wrapper: any
  beforeEach(() => {
    api = backend(); route = reactive({ query: {} })
    vi.stubGlobal('useRoute', () => route)
    vi.stubGlobal('useRouter', () => ({ replace: vi.fn(async (value: any) => { route.query = value.query }) }))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } })
  })
  afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
  it('creates a waiting room and copies its invite URL', async () => {
    api.setGame({ ...room(), player_o_id: null, status: 'waiting', current_player_id: null })
    wrapper = mount(CaroPage)
    await wrapper.get('[data-test="create-caro"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Waiting for another player')
    await wrapper.get('[data-test="copy-caro"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/caro?room=room'))
    expect(wrapper.findAll('[data-test="caro-cell"]')).toHaveLength(225)
  })
  it('joins from the URL, sends a move, shows realtime results and cleans up on route change', async () => {
    route.query = { room: 'room' }
    wrapper = mount(CaroPage); await flushPromises()
    expect(api.client.rpc).toHaveBeenCalledWith('join_caro_game', { p_game_id: 'room' })
    await api.channels[0].status('SUBSCRIBED'); await flushPromises()
    expect(wrapper.get('[aria-live="polite"]').text()).toContain('Your turn')
    await wrapper.get('[aria-label="Row 1, column 1, empty"]').trigger('click'); await flushPromises()
    expect(api.client.rpc).toHaveBeenCalledWith('make_caro_move', { p_game_id: 'room', p_row: 0, p_col: 0 })
    api.setGame({ ...room(), status: 'won', winner_id: 'alice', current_player_id: null, move_count: 1 })
    api.setMoves([{ row: 0, col: 0, player_id: 'alice', turn_number: 1 }])
    await api.channels[0].events[0].cb(); await flushPromises()
    expect(wrapper.text()).toContain('You won')
    expect(wrapper.get('[aria-label="Row 1, column 1, X"]').attributes('disabled')).toBeDefined()
    api.setGame({ ...room(), status: 'draw', current_player_id: null })
    await api.channels[0].events[0].cb(); await flushPromises()
    expect(wrapper.text()).toContain('Draw')
    route.query = {}; await flushPromises()
    expect(api.client.removeChannel).toHaveBeenCalledWith(api.channels[0])
  })
  it('shows join failures and permits retry', async () => {
    route.query = { room: 'invalid' }
    api.client.rpc.mockResolvedValueOnce({ data: null as any, error: { message: 'Room unavailable' } as any })
    wrapper = mount(CaroPage); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Room unavailable')
    await wrapper.get('[data-test="retry-caro"]').trigger('click'); await flushPromises()
    expect(api.client.rpc).toHaveBeenCalledTimes(2)
  })
  it('clears a transient room-read error after a successful retry', async () => {
    route.query = { room: 'room' }
    wrapper = mount(CaroPage); await flushPromises()
    const failedQuery: any = {
      select: () => failedQuery,
      eq: () => failedQuery,
      single: async () => ({ data: null, error: { message: 'Offline' } }),
      order: async () => ({ data: [], error: null }),
    }
    api.client.from.mockImplementationOnce(() => failedQuery)
    await api.channels[0].events[0].cb(); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Offline')
    await wrapper.get('[data-test="retry-caro"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('retries room creation when it failed before a room exists', async () => {
    api.client.rpc.mockRejectedValueOnce(new Error('Offline'))
    api.setGame({ ...room(), player_o_id: null, status: 'waiting', current_player_id: null })
    wrapper = mount(CaroPage)
    await wrapper.get('[data-test="create-caro"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Offline')
    await wrapper.get('[data-test="retry-caro"]').trigger('click'); await flushPromises()
    expect(api.client.rpc).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Waiting for another player')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('offers Play Caro navigation from the sidebar', () => {
    wrapper = mount(ChatSidebar, { props: { unreadCounts: {}, onlineFriends: [], currentUser: null, isDark: false, connectionStatus: 'connected', isOpenMobile: false } })
    expect(wrapper.get('[data-test="play-caro"]').attributes('href')).toBe('/caro')
    expect(wrapper.get('[data-test="play-caro"]').text()).toContain('Play Caro')
  })

  it('navigates back to chat via NuxtLink without full page reload', () => {
    wrapper = mount(CaroPage)
    const backLink = wrapper.get('[data-test="back-to-chat"]')
    expect(backLink.attributes('to')).toBe('/')
    expect(backLink.attributes('href')).toBeUndefined()
  })
})
