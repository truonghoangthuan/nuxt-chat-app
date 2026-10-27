import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useCaroGame } from '~/composables/useCaroGame'

import { backend, room } from '../helpers/caroBackend'

describe('Caro authoritative room lifecycle', () => {
  let api: ReturnType<typeof backend>
  let scope: ReturnType<typeof effectScope>
  beforeEach(() => { api = backend(); scope = effectScope() })
  afterEach(() => { scope.stop(); vi.unstubAllGlobals() })
  it('creates, subscribes with room filters, reconciles moves and reconnects, then cleans up', async () => {
    const state = scope.run(() => useCaroGame())!
    await state.createRoom()
    expect(state.game.value.id).toBe('room')
    expect(api.channels[0].events.map((e: any) => e.filter.filter)).toEqual(['id=eq.room', 'game_id=eq.room'])
    api.setMoves([{ row: 0, col: 0, player_id: 'alice', turn_number: 1 }])
    api.setGame({ ...room(), move_count: 1, current_player_id: 'bob' })
    await api.channels[0].status('SUBSCRIBED')
    expect(state.board.value[0][0]).toBe('x')
    expect(state.canMove.value).toBe(false)
    await api.channels[0].status('CHANNEL_ERROR')
    expect(state.connection.value).toBe('reconnecting')
    await api.channels[0].status('SUBSCRIBED')
    expect(state.connection.value).toBe('connected')
    scope.stop()
    expect(api.client.removeChannel).toHaveBeenCalledWith(api.channels[0])
  })
  it('joins idempotently, rejects failed moves without optimistic stones, and clears old subscriptions', async () => {
    const state = scope.run(() => useCaroGame())!
    await state.joinRoom('room')
    await api.channels[0].status('SUBSCRIBED')
    api.client.rpc.mockResolvedValueOnce({ data: null as any, error: { message: 'Not your turn' } as any })
    await state.makeMove(0, 0)
    expect(state.board.value[0][0]).toBeNull()
    expect(state.error.value).toBe('Not your turn')
    await state.joinRoom('other')
    expect(api.client.removeChannel).toHaveBeenCalledWith(api.channels[0])
    const calls = api.client.from.mock.calls.length
    await api.channels[0].status('SUBSCRIBED')
    expect(api.client.from.mock.calls.length).toBe(calls)
  })
  it('ignores a pending join after leaving and surfaces RPC rejection', async () => {
    const state = scope.run(() => useCaroGame())!
    let resolve: any
    api.client.rpc.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = state.joinRoom('room')
    state.leaveRoom()
    resolve({ data: room(), error: null })
    await pending
    expect(state.game.value).toBeNull()
    expect(api.channels).toHaveLength(0)
    api.client.rpc.mockRejectedValueOnce(new Error('Offline'))
    await state.createRoom()
    expect(state.error.value).toBe('Offline')
    expect(state.loading.value).toBe(false)
  })
  it('keeps a new room busy when a previous room finishes a delayed reconciliation', async () => {
    const state = scope.run(() => useCaroGame())!
    await state.joinRoom('room')
    await api.channels[0].status('SUBSCRIBED')
    let finishOldRead: any
    api.client.from.mockImplementationOnce(() => {
      const query: any = { select: () => query, eq: () => query, single: () => new Promise(resolve => { finishOldRead = resolve }) }
      return query
    })
    const oldMove = state.makeMove(0, 0)
    await Promise.resolve(); await Promise.resolve()
    api.setGame(room('other'))
    await state.joinRoom('other')
    await api.channels[1].status('SUBSCRIBED')
    let finishNewMove: any
    api.client.rpc.mockImplementationOnce(() => new Promise(resolve => { finishNewMove = resolve }))
    const newMove = state.makeMove(0, 1)
    expect(state.submitting.value).toBe(true)
    finishOldRead({ data: room(), error: null })
    await oldMove
    expect(state.game.value.id).toBe('other')
    expect(state.submitting.value).toBe(true)
    finishNewMove({ data: room('other'), error: null })
    await newMove
  })

})
