import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useChessGame } from '~/composables/useChessGame'
import { backend, room, roomId } from '../helpers/chessBackend'

describe('Chess room lifecycle', () => {
  let api: ReturnType<typeof backend>
  let scope: ReturnType<typeof effectScope>
  beforeEach(() => { api = backend(); scope = effectScope() })
  afterEach(() => { scope.stop(); vi.unstubAllGlobals() })
  it('creates with no supplied identity, subscribes, reconciles and tears down', async () => {
    const state = scope.run(useChessGame)!
    await state.createRoom()
    expect(api.client.rpc).toHaveBeenCalledWith('create_chess_game')
    expect(state.canMove.value).toBe(false)
    await api.channels[0].status('SUBSCRIBED')
    expect(state.canMove.value).toBe(true)
    expect(api.channels[0].events[0].filter.filter).toBe(`id=eq.${roomId}`)
    api.setGame({ ...room(), status: 'draw', result: 'repetition' })
    await api.channels[0].events[0].cb()
    expect(state.canMove.value).toBe(false)
    scope.stop()
    expect(api.client.removeChannel).toHaveBeenCalledWith(api.channels[0])
  })
  it('posts only move intent, keeps board authoritative, and blocks double submissions', async () => {
    const state = scope.run(useChessGame)!
    await state.joinRoom(roomId); await api.channels[0].status('SUBSCRIBED')
    let reject: any
    api.fetch.mockImplementationOnce(() => new Promise((_r, fail) => { reject = fail }))
    const pending = state.makeMove({ from: 'e2', to: 'e4' })
    await state.makeMove({ from: 'd2', to: 'd4' })
    expect(api.fetch).toHaveBeenCalledTimes(1)
    expect(api.fetch).toHaveBeenCalledWith('/api/chess/move', { method: 'POST', body: { roomId, from: 'e2', to: 'e4', expectedMoveCount: 0 } })
    expect(state.game.value?.fen).toBe(room().fen)
    reject(new Error('Stale move')); await pending
    expect(state.error.value).toContain('Stale move')
    expect(state.submitting.value).toBe(false)
  })
  it('fails closed after read/disconnect errors and retries subscription', async () => {
    const state = scope.run(useChessGame)!
    await state.joinRoom(roomId); await api.channels[0].status('SUBSCRIBED')
    api.single.mockResolvedValueOnce({ data: null as any, error: { message: 'Offline' } })
    await state.refresh()
    expect(state.canMove.value).toBe(false)
    await state.retry()
    expect(api.client.removeChannel).toHaveBeenCalledWith(api.channels[0])
    await api.channels[1].status('SUBSCRIBED')
    expect(state.error.value).toBe('')
    expect(state.canMove.value).toBe(true)
    await api.channels[1].status('CHANNEL_ERROR')
    expect(state.canMove.value).toBe(false)
  })
  it('ignores delayed room opens and previous room refreshes', async () => {
    const state = scope.run(useChessGame)!
    let resolve: any
    api.client.rpc.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = state.joinRoom(roomId)
    state.leaveRoom(); resolve({ data: room(), error: null }); await pending
    expect(state.game.value).toBeNull()
    await state.joinRoom(roomId)
    api.single.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const refresh = state.refresh()
    state.leaveRoom(); resolve({ data: room(), error: null }); await refresh
    expect(state.game.value).toBeNull()
  })
  it('rejects malformed invite IDs before calling RPC', async () => {
    const state = scope.run(useChessGame)!
    await state.joinRoom('invalid')
    expect(api.client.rpc).not.toHaveBeenCalled()
    expect(state.error.value).toContain('Invalid')
  })
})
