import { vi } from 'vitest'
import { ref } from 'vue'
export const room = (id = 'room') => ({ id, player_x_id: 'alice', player_o_id: 'bob', status: 'active', current_player_id: 'alice', winner_id: null, move_count: 0 })
export function backend() {
  let game = room()
  let moves: any[] = []
  const channels: any[] = []
  const rpc = vi.fn(async (name: string, args: any) => ({ data: name === 'create_caro_game' ? game : { ...game, id: args.p_game_id }, error: null }))
  const client = {
    rpc,
    from: vi.fn((table: string) => {
      const query: any = { select: () => query, eq: () => query, order: async () => ({ data: moves, error: null }), single: async () => ({ data: game, error: null }) }
      return query
    }),
    channel: vi.fn(() => {
      const channel: any = { events: [], on: (_: any, filter: any, cb: any) => { channel.events.push({ filter, cb }); return channel }, subscribe: (cb: any) => { channel.status = cb; return channel } }
      channels.push(channel); return channel
    }),
    removeChannel: vi.fn(async () => {}),
  }
  vi.stubGlobal('useSupabaseClient', () => client)
  vi.stubGlobal('useSupabaseUser', () => ref({ sub: 'alice' }))
  return { client, channels, setGame: (value: any) => { game = value }, setMoves: (value: any[]) => { moves = value } }
}
