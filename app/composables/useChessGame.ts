import { computed, onScopeDispose, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ChessGame } from '~/types/chess'
import { extractAuthUserId } from '~/composables/useAuthProfile'

export function useChessGame() {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const game = ref<ChessGame | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref('')
  const connection = ref<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const synced = ref(false)
  const playerId = computed(() => extractAuthUserId(user.value))
  const canMove = computed(() => !!game.value && ['active', 'check'].includes(game.value.status)
    && (game.value.turn === 'w' ? game.value.white_id : game.value.black_id) === playerId.value
    && synced.value && connection.value === 'connected' && !loading.value && !submitting.value)
  let channel: RealtimeChannel | null = null
  let generation = 0
  let refreshVersion = 0
  const message = (cause: any) => cause?.data?.statusMessage || cause?.message || 'Unable to load room. Please retry.'

  function leaveRoom() {
    generation++; refreshVersion++
    if (channel) void client.removeChannel(channel)
    channel = null; game.value = null; loading.value = false; submitting.value = false
    synced.value = false; connection.value = 'connecting'; error.value = ''
  }
  async function refresh() {
    const id = game.value?.id
    if (!id) return
    const token = generation; const version = ++refreshVersion
    try {
      const result = await client.from('chess_games').select('*').eq('id', id).single()
      if (result.error || !result.data) throw result.error || new Error('Room unavailable.')
      if (token !== generation || version !== refreshVersion) return
      const next = result.data as ChessGame
      if (!game.value || next.move_count >= game.value.move_count) game.value = next
      synced.value = true
    } catch (cause) {
      if (token === generation && version === refreshVersion) { synced.value = false; error.value = message(cause) }
    }
  }
  function subscribe(token: number) {
    const id = game.value!.id
    channel = client.channel(`chess:${id}:${token}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chess_games', filter: `id=eq.${id}` }, () => token === generation ? refresh() : Promise.resolve())
      .subscribe(async status => {
        if (token !== generation) return
        connection.value = status === 'SUBSCRIBED' ? 'connected' : 'reconnecting'
        synced.value = false
        if (status === 'SUBSCRIBED') await refresh()
      })
  }
  async function openRoom(id?: string) {
    leaveRoom()
    if (id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      error.value = 'Invalid room link.'; return
    }
    const token = generation; loading.value = true
    try {
      const result = id ? await client.rpc('join_chess_game', { p_game_id: id }) : await client.rpc('create_chess_game')
      if (result.error) throw result.error
      if (token !== generation) return
      game.value = result.data as ChessGame
      subscribe(token)
      await refresh()
    } catch (cause) {
      if (token === generation) error.value = message(cause)
    } finally { if (token === generation) loading.value = false }
  }
  async function makeMove(move: { from: string; to: string; promotion?: string }) {
    if (!canMove.value || !game.value) return
    const token = generation
    submitting.value = true; error.value = ''
    try {
      await $fetch('/api/chess/move', { method: 'POST', body: {
        roomId: game.value.id, from: move.from, to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}), expectedMoveCount: game.value.move_count,
      } })
    } catch (cause) { if (token === generation) error.value = message(cause) }
    finally {
      if (token === generation) {
        await refresh()
        if (token === generation) submitting.value = false
      }
    }
  }
  async function retry() { if (game.value) await openRoom(game.value.id) }
  onScopeDispose(leaveRoom)
  return { game, playerId, loading, submitting, error, connection, synced, canMove, refresh, retry, leaveRoom,
    createRoom: () => openRoom(), joinRoom: (id: string) => openRoom(id), makeMove }
}
