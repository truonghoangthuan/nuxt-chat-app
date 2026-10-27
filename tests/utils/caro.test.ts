import { describe, expect, it } from 'vitest'
import {
  buildCaroBoard,
  findCaroWinningLine,
  isCaroBoardFull,
  isCaroCellAvailable,
  type CaroMove,
} from '~/utils/caro'

function blankBoard(): (('x' | 'o') | null)[][] {
  return Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null))
}

function winningBoard(coords: Array<[number, number]>, mark: 'x' | 'o' = 'x') {
  const board = blankBoard()
  for (const [row, col] of coords) board[row][col] = mark
  return board
}

describe('Caro rules and board state', () => {
  it('hydrates a 15×15 board from authoritative moves and maps each player to X/O', () => {
    const moves: CaroMove[] = [
      { row: 2, col: 4, player_id: 'alice', turn_number: 1 },
      { row: 3, col: 4, player_id: 'bob', turn_number: 2 },
    ]

    const board = buildCaroBoard(moves, 'alice', 'bob')
    expect(board).toHaveLength(15)
    expect(board.every(row => row.length === 15)).toBe(true)
    expect(board[2][4]).toBe('x')
    expect(board[3][4]).toBe('o')
    expect(board[0][0]).toBeNull()
  })

  it.each([
    ['horizontal', [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]]],
    ['vertical', [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8]]],
    ['diagonal down-right', [[2, 2], [3, 3], [4, 4], [5, 5], [6, 6]]],
    ['diagonal down-left', [[2, 8], [3, 7], [4, 6], [5, 5], [6, 4]]],
  ] as const)('finds a five-in-a-row %s win', (_direction, coords) => {
    expect(findCaroWinningLine(winningBoard(coords, 'x'), 'x')).toHaveLength(5)
  })

  it('does not report a win for four stones, a gap, or a run interrupted by the opponent', () => {
    const four = winningBoard([[7, 2], [7, 3], [7, 4], [7, 5]])
    const gap = winningBoard([[7, 2], [7, 3], [7, 5], [7, 6], [7, 7]])
    const interrupted = winningBoard([[7, 2], [7, 3], [7, 5], [7, 6], [7, 7]])
    interrupted[7][4] = 'o'

    expect(findCaroWinningLine(four, 'x')).toBeNull()
    expect(findCaroWinningLine(gap, 'x')).toBeNull()
    expect(findCaroWinningLine(interrupted, 'x')).toBeNull()
  })

  it('marks occupied and out-of-range cells unavailable', () => {
    const board = blankBoard()
    board[4][5] = 'o'

    expect(isCaroCellAvailable(board, 0, 0)).toBe(true)
    expect(isCaroCellAvailable(board, 4, 5)).toBe(false)
    expect(isCaroCellAvailable(board, -1, 0)).toBe(false)
    expect(isCaroCellAvailable(board, 15, 15)).toBe(false)
  })

  it('detects a full board without mutating it', () => {
    const board = blankBoard()
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) board[row][col] = (row + col) % 2 ? 'x' : 'o'
    }
    const snapshot = board.map(row => [...row])

    expect(isCaroBoardFull(board)).toBe(true)
    expect(board).toEqual(snapshot)
    board[14][14] = null
    expect(isCaroBoardFull(board)).toBe(false)
  })
})

describe('Caro defensive input handling', () => {
  it('handles invalid coordinates, ambiguous player IDs and edge overlines safely', () => {
    const moves = Object.freeze([
      Object.freeze({ row: 0.5, col: 0, player_id: 'alice', turn_number: 1 }),
      Object.freeze({ row: 0, col: NaN, player_id: 'alice', turn_number: 2 }),
      Object.freeze({ row: 0, col: 0, player_id: 'outsider', turn_number: 3 }),
      Object.freeze({ row: 1, col: 1, player_id: '', turn_number: 4 }),
    ])
    expect(buildCaroBoard(moves, 'alice', 'bob')).toEqual(blankBoard())
    expect(buildCaroBoard(moves, '', '')).toEqual(blankBoard())

    expect(buildCaroBoard([{ row: 0, col: 0, player_id: 'alice', turn_number: 1 }], 'alice', 'alice')).toEqual(blankBoard())

    expect(findCaroWinningLine(winningBoard([[14, 9], [14, 10], [14, 11], [14, 12], [14, 13], [14, 14]], 'o'), 'o')).toHaveLength(6)
    expect(isCaroBoardFull([])).toBe(false)
    expect(isCaroCellAvailable(blankBoard(), Infinity, 0)).toBe(false)
  })
})
