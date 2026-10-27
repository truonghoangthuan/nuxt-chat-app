export type CaroMark = 'x' | 'o'
export type CaroBoard = (CaroMark | null)[][]

export interface CaroMove {
  row: number
  col: number
  player_id: string
  turn_number: number
}

export function isCaroCellAvailable(board: CaroBoard, row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < 15 && col >= 0 && col < 15 && board[row]?.[col] === null
}

export function buildCaroBoard(moves: readonly CaroMove[], playerXId: string, playerOId: string): CaroBoard {
  const board: CaroBoard = Array.from({ length: 15 }, () => Array(15).fill(null))
  if (playerXId === playerOId) return board
  for (const move of [...moves].sort((a, b) => a.turn_number - b.turn_number)) {
    const mark = move.player_id && move.player_id === playerXId ? 'x' : move.player_id && move.player_id === playerOId ? 'o' : null
    if (mark && isCaroCellAvailable(board, move.row, move.col)) board[move.row][move.col] = mark
  }
  return board
}

export function findCaroWinningLine(board: CaroBoard, mark: CaroMark): { row: number; col: number }[] | null {
  for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line: { row: number; col: number }[] = []
      for (let r = row, c = col; r >= 0 && r < 15 && c >= 0 && c < 15 && board[r]?.[c] === mark; r += dr, c += dc) line.push({ row: r, col: c })
      if (line.length >= 5) return line
    }
  }
  return null
}

export function isCaroBoardFull(board: CaroBoard): boolean {
  return board.length === 15 && board.every(row => row.length === 15 && row.every(cell => cell === 'x' || cell === 'o'))
}
