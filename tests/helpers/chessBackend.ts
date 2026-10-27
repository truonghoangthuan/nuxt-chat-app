import { vi } from 'vitest'
import { ref } from 'vue'
import { Chess } from 'chess.js'
import type { ChessGame } from '~/types/chess'
export const roomId = '11111111-1111-4111-8111-111111111111'
export const room = (): ChessGame => ({ id: roomId, white_id: 'alice', black_id: 'bob', fen: new Chess().fen(), moves: [], move_count: 0, turn: 'w', status: 'active', result: null })
export function backend() {
  let game = room()
  const channels: any[] = []
  const single = vi.fn(async () => ({ data: structuredClone(game), error: null as any }))
  const client = {
    rpc: vi.fn(async () => ({ data: structuredClone(game), error: null as any })),
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
    channel: vi.fn(() => {
      const channel: any = { events: [], on: vi.fn((_event, filter, cb) => { channel.events.push({ filter, cb }); return channel }), subscribe: vi.fn(cb => { channel.status = cb; return channel }) }
      channels.push(channel); return channel
    }),
    removeChannel: vi.fn(async () => {}),
  }
  const fetch = vi.fn(async () => structuredClone(game))
  vi.stubGlobal('useSupabaseClient', () => client)
  vi.stubGlobal('useSupabaseUser', () => ref({ sub: 'alice' }))
  vi.stubGlobal('$fetch', fetch)
  return { client, channels, single, fetch, setGame: (value: ChessGame) => { game = value } }
}
