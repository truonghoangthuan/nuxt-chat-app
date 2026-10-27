import { Chess } from 'chess.js'
import { createError } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChessGame, ChessMoveRequest } from '../../app/types/chess'

export function chessOutcome(chess: Chess): Pick<ChessGame, 'status' | 'result'> {
  if (chess.isCheckmate()) return { status: 'checkmate', result: chess.turn() === 'w' ? 'black' : 'white' }
  if (chess.isStalemate()) return { status: 'draw', result: 'stalemate' }
  if (chess.isThreefoldRepetition()) return { status: 'draw', result: 'repetition' }
  if (chess.isInsufficientMaterial()) return { status: 'draw', result: 'insufficient_material' }
  if (chess.isDrawByFiftyMoves()) return { status: 'draw', result: 'fifty_moves' }
  return { status: chess.isCheck() ? 'check' : 'active', result: null }
}

export async function submitChessMove(client: SupabaseClient, actor: string, body: unknown): Promise<ChessGame> {
  if (!actor) throw createError({ statusCode: 401, statusMessage: 'Sign in to play.' })
  const input = body as ChessMoveRequest
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['roomId', 'from', 'to', 'promotion', 'expectedMoveCount'].includes(key))
    || typeof input.roomId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.roomId)
    || typeof input.from !== 'string' || !/^[a-h][1-8]$/.test(input.from)
    || typeof input.to !== 'string' || !/^[a-h][1-8]$/.test(input.to)
    || (input.promotion !== undefined && !['q', 'r', 'b', 'n'].includes(input.promotion))
    || !Number.isSafeInteger(input.expectedMoveCount) || input.expectedMoveCount < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid move request.' })
  }
  const { data, error } = await client.from('chess_games').select('*').eq('id', input.roomId).single()
  if (error || !data) throw createError({ statusCode: 404, statusMessage: 'Room unavailable.' })
  const game = data as ChessGame
  if (actor !== game.white_id && actor !== game.black_id) throw createError({ statusCode: 403, statusMessage: 'This room is private.' })
  if (actor !== (game.turn === 'w' ? game.white_id : game.black_id)) throw createError({ statusCode: 403, statusMessage: 'Wait for your turn.' })
  if (!game.black_id || !['active', 'check'].includes(game.status) || game.move_count !== input.expectedMoveCount) {
    throw createError({ statusCode: 409, statusMessage: 'Room changed. Refresh before moving.' })
  }
  // Replay only database history: loading FEN alone loses repetition counts.
  const chess = new Chess()
  try {
    for (const san of game.moves) chess.move(san)
    if (chess.fen() !== game.fen || game.moves.length !== game.move_count || chess.turn() !== game.turn || chess.isGameOver()) throw new Error('Inconsistent state')
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Room state could not be verified.' })
  }
  let san: string
  try { san = chess.move({ from: input.from, to: input.to, ...(input.promotion ? { promotion: input.promotion } : {}) }).san }
  catch { throw createError({ statusCode: 422, statusMessage: 'That move is not legal.' }) }
  const outcome = chessOutcome(chess)
  const committed = await client.rpc('commit_chess_move', {
    p_game_id: game.id, p_actor: actor, p_expected_count: game.move_count, p_expected_fen: game.fen,
    p_fen: chess.fen(), p_san: san, p_turn: chess.turn(), p_status: outcome.status, p_result: outcome.result,
  })
  if (committed.error) throw createError({ statusCode: 409, statusMessage: 'Move not saved. Refresh and try again.' })
  return committed.data as ChessGame
}
