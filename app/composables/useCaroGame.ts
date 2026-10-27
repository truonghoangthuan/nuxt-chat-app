import { computed, onScopeDispose, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { buildCaroBoard, isCaroCellAvailable, type CaroMove } from '~/utils/caro'
import { extractAuthUserId } from '~/composables/useAuthProfile'

export interface CaroGame {
  id: string
  player_x_id: string
  player_o_id: string | null
  status: 'waiting' | 'active' | 'won' | 'draw'
  current_player_id: string | null
  winner_id: string | null
  move_count: number
}

export function useCaroGame() {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const game = ref<CaroGame | null>(null)
  const moves = ref<CaroMove[]>([])
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref('')
  const connection = ref<'connecting' | 'connected' | 'reconnecting'>('connecting')
  let channel: RealtimeChannel | null = null
  let generation = 0
  let refreshVersion = 0
  const playerId = computed(() => extractAuthUserId(user.value))
  const board = computed(() => buildCaroBoard(moves.value, game.value?.player_x_id || '', game.value?.player_o_id || ''))
  const canMove = computed(() => game.value?.status === 'active' && game.value.current_player_id === playerId.value && !loading.value && !submitting.value && connection.value === 'connected')
  const message = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Unable to load game. Please retry.'

  function leaveRoom() {
    generation++; refreshVersion++
    if (channel) void client.removeChannel(channel)
    channel = null
    game.value = null; moves.value = []; loading.value = false; submitting.value = false
    connection.value = 'connecting'
  }

  async function refresh() {
    const id = game.value?.id
    if (!id) return
    const token = generation
    const version = ++refreshVersion
    try {
      // Read the room before moves: only publish a coherent turn-count snapshot.
      const result = await client.from('caro_games').select('*').eq('id', id).single()
      if (result.error) throw result.error
      const history = await client.from('caro_moves').select('row,col,player_id,turn_number').eq('game_id', id).order('turn_number')
      if (history.error) throw history.error
      if (token !== generation || version !== refreshVersion) return
      const authoritative = result.data as CaroGame
      game.value = authoritative
      moves.value = (history.data as CaroMove[]).filter(move => move.turn_number <= authoritative.move_count)
    } catch (cause) {
      if (token === generation && version === refreshVersion) error.value = message(cause)
    }
  }

  function subscribe(token: number) {
    const id = game.value!.id
    const reconcile = () => token === generation ? refresh() : Promise.resolve()
    channel = client.channel(`caro:${id}:${token}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caro_games', filter: `id=eq.${id}` }, reconcile)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'caro_moves', filter: `game_id=eq.${id}` }, reconcile)
      .subscribe(async status => {
        if (token !== generation) return
        connection.value = status === 'SUBSCRIBED' ? 'connected' : 'reconnecting'
        if (status === 'SUBSCRIBED') await refresh()
      })
  }

  async function openRoom(id?: string) {
    leaveRoom()
    const token = generation
    loading.value = true; error.value = ''
    try {
      const result = id
        ? await client.rpc('join_caro_game', { p_game_id: id })
        : await client.rpc('create_caro_game')
      if (result.error) throw result.error
      if (token !== generation) return
      game.value = result.data as CaroGame
      subscribe(token)
      await refresh()
    } catch (cause) {
      if (token === generation) error.value = message(cause)
    } finally {
      if (token === generation) loading.value = false
    }
  }

  async function retry() {
    error.value = ''
    await refresh()
  }

  async function makeMove(row: number, col: number) {
    if (!canMove.value || !isCaroCellAvailable(board.value, row, col)) return
    const token = generation
    submitting.value = true; error.value = ''
    try {
      const result = await client.rpc('make_caro_move', { p_game_id: game.value!.id, p_row: row, p_col: col })
      if (result.error) throw result.error
    } catch (cause) {
      if (token === generation) error.value = message(cause)
    } finally {
      if (token === generation) {
        await refresh()
        if (token === generation) submitting.value = false
      }
    }
  }
  onScopeDispose(leaveRoom)
  return { game, moves, board, playerId, loading, submitting, error, connection, canMove, refresh, retry, leaveRoom, createRoom: () => openRoom(), joinRoom: (id: string) => openRoom(id), makeMove }
}
