import { describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { chessOutcome, submitChessMove } from '../../server/utils/chessMove'

const id = '11111111-1111-4111-8111-111111111111'
const room = () => ({ id, white_id: 'white', black_id: 'black', fen: new Chess().fen(), moves: [] as string[], move_count: 0, turn: 'w', status: 'active', result: null })
const request = (extra = {}) => ({ roomId: id, from: 'e2', to: 'e4', expectedMoveCount: 0, ...extra })
function backend(state = room()) {
  const single = vi.fn(async () => ({ data: structuredClone(state), error: null }))
  const rpc = vi.fn(async (_name: string, args: any) => {
    if (args.p_expected_count !== state.move_count) return { error: { message: 'Stale move' } }
    Object.assign(state, { fen: args.p_fen, moves: [...state.moves, args.p_san], move_count: state.move_count + 1, turn: args.p_turn, status: args.p_status, result: args.p_result })
    return { data: structuredClone(state), error: null }
  })
  return { from: vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })), rpc, single }
}

describe('server-authoritative chess moves', () => {
  it('loads DB state and commits server-computed FEN/SAN with a compare-and-set', async () => {
    const db = backend()
    const result = await submitChessMove(db as any, 'white', request())
    expect(result.move_count).toBe(1)
    expect(db.rpc).toHaveBeenCalledWith('commit_chess_move', expect.objectContaining({ p_actor: 'white', p_expected_count: 0, p_expected_fen: new Chess().fen(), p_san: 'e4', p_turn: 'b', p_status: 'active' }))
  })
  it.each(['fen', 'turn', 'winner', 'san', 'result', 'actor'])('rejects untrusted %s rather than forwarding it', async field => {
    const db = backend()
    await expect(submitChessMove(db as any, 'white', request({ [field]: 'forged' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it.each(['intruder', 'black', ''])('rejects unauthorized actor %s', async actor => {
    const db = backend()
    await expect(submitChessMove(db as any, actor, request())).rejects.toMatchObject({ statusCode: actor ? 403 : 401 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('rejects illegal moves, stale requests and completed/waiting rooms', async () => {
    for (const [state, input] of [[room(), request({ to: 'e5' })], [room(), request({ expectedMoveCount: 1 })], [{ ...room(), status: 'waiting' }, request()], [{ ...room(), status: 'checkmate' }, request()]] as const) {
      const db = backend(state as any)
      await expect(submitChessMove(db as any, 'white', input)).rejects.toBeDefined()
      expect(db.rpc).not.toHaveBeenCalled()
    }
  })
  it('allows only one of two simultaneous requests to commit', async () => {
    const db = backend()
    const results = await Promise.allSettled([submitChessMove(db as any, 'white', request()), submitChessMove(db as any, 'white', request({ to: 'e3' }))])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } })
  })
  it('fails closed on corrupted history/FEN', async () => {
    const db = backend({ ...room(), moves: ['e4'] })
    await expect(submitChessMove(db as any, 'white', request())).rejects.toMatchObject({ statusCode: 500 })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('replays stored history to detect repetition after reopening', async () => {
    const moves = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1']
    const chess = new Chess(); moves.forEach(m => chess.move(m))
    const db = backend({ ...room(), moves, fen: chess.fen(), move_count: 7, turn: 'b' })
    await submitChessMove(db as any, 'black', request({ from: 'f6', to: 'g8', expectedMoveCount: 7 }))
    expect(db.rpc).toHaveBeenCalledWith('commit_chess_move', expect.objectContaining({ p_status: 'draw', p_result: 'repetition' }))
  })
})

describe('real chess.js rules and result classification', () => {
  it('supports castling and forbids castling through check', () => {
    const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(chess.move({ from: 'e1', to: 'g1' }).san).toBe('O-O')
    expect(chess.get('f1')?.type).toBe('r')
    const checked = new Chess('r3kr1r/8/8/8/8/8/8/R3K2R w KQ - 0 1')
    expect(() => checked.move({ from: 'e1', to: 'g1' })).toThrow()
  })
  it('supports en passant and all four promotion choices', () => {
    const chess = new Chess(); ['e4','a6','e5','d5'].forEach(m => chess.move(m))
    expect(chess.move('exd6').isEnPassant()).toBe(true)
    expect(chess.get('d5')).toBeUndefined()
    for (const promotion of ['q','r','b','n']) {
      const promoted = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1')
      promoted.move({ from: 'a7', to: 'a8', promotion })
      expect(promoted.get('a8')?.type).toBe(promotion)
    }
  })
  it('classifies check and checkmate', () => {
    const chess = new Chess(); ['f3','e5','g4','Qh4#'].forEach(m => chess.move(m))
    expect(chessOutcome(chess)).toEqual({ status: 'checkmate', result: 'black' })
    expect(chessOutcome(new Chess('7k/8/8/8/8/8/7R/K7 b - - 0 1')).status).toBe('check')
  })
  it.each([
    ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'stalemate'],
    ['7k/8/6K1/8/8/8/8/8 w - - 0 1', 'insufficient_material'],
    ['7k/8/6K1/8/8/8/8/R7 w - - 100 51', 'fifty_moves'],
  ])('classifies draw %s', (fen, result) => expect(chessOutcome(new Chess(fen))).toEqual({ status: 'draw', result }))
})
