export interface ChessGame {
  id: string
  white_id: string
  black_id: string | null
  fen: string
  moves: string[]
  move_count: number
  turn: 'w' | 'b'
  status: 'waiting' | 'active' | 'check' | 'checkmate' | 'draw'
  result: 'white' | 'black' | 'stalemate' | 'repetition' | 'insufficient_material' | 'fifty_moves' | null
}
export interface ChessMoveRequest {
  roomId: string
  from: string
  to: string
  promotion?: string
  expectedMoveCount: number
}
