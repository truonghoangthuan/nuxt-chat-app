<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Chess } from 'chess.js'
import { ChevronLeft, Copy, Moon, Sun } from '@lucide/vue'
import ChessBoard from '~/components/ChessBoard.vue'
import { useChessGame } from '~/composables/useChessGame'
import { useTheme } from '~/composables/useTheme'
const route = useRoute()
const router = useRouter()
const { initTheme, toggleTheme, isDark } = useTheme()
const { game, playerId, loading, submitting, error, connection, synced, canMove, createRoom, joinRoom, makeMove, retry, leaveRoom } = useChessGame()
const initialFen = new Chess().fen()
const roomId = computed(() => typeof route.query.room === 'string' ? route.query.room : '')
const copied = ref(false)
const color = computed(() => game.value?.white_id === playerId.value ? 'White' : 'Black')
const finished = computed(() => game.value?.status === 'checkmate' || game.value?.status === 'draw')
const drawReasons = { stalemate: 'stalemate', repetition: 'threefold repetition', insufficient_material: 'insufficient material', fifty_moves: 'fifty-move rule' }
const status = computed(() => {
  if (loading.value) return 'Loading room…'
  if (!game.value) return 'Invite a friend to play'
  if (game.value.status === 'waiting') return 'Waiting for opponent'
  if (game.value.status === 'checkmate') return `Checkmate — ${game.value.result === 'white' ? 'White' : 'Black'} wins`
  if (game.value.status === 'draw') return `Draw — ${drawReasons[game.value.result as keyof typeof drawReasons] || 'game completed'}`
  if (connection.value !== 'connected' || !synced.value) return 'Reconnecting…'
  if (submitting.value) return 'Sending move…'
  return `${game.value.status === 'check' ? 'Check — ' : ''}${canMove.value ? 'Your turn' : 'Opponent’s turn'}`
})
const movePairs = computed(() => {
  const moves = game.value?.moves || []
  return Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => ({ number: i + 1, white: moves[i * 2], black: moves[i * 2 + 1] }))
})
async function openFromLink() { copied.value = false; if (roomId.value) await joinRoom(roomId.value); else leaveRoom() }
async function create() {
  await createRoom()
  if (game.value) await router.replace({ query: { room: game.value.id } })
}
async function retryAction() {
  if (game.value) await retry()
  else if (roomId.value) await openFromLink()
  else await create()
}
async function copyInvite() {
  if (!game.value) return
  try {
    const url = new URL('/chess', window.location.origin)
    url.searchParams.set('room', game.value.id)
    await navigator.clipboard.writeText(url.toString()); copied.value = true
  } catch { error.value = 'Could not copy. Copy the room URL from your address bar.' }
}
watch(roomId, () => { copied.value = false; if (roomId.value !== game.value?.id) void openFromLink() })
onMounted(() => { initTheme(); void openFromLink() })
</script>

<template>
  <main class="chess-page">
    <div class="chess-shell">
      <header class="chess-header">
        <div>
          <a href="/" class="back-link"><ChevronLeft :size="14" aria-hidden="true" /> Back to chat</a>
          <h1>Chess</h1>
        </div>
        <div class="header-actions">
          <button class="chess-control theme-button" :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleTheme">
            <Sun v-if="isDark" :size="18" aria-hidden="true" /><Moon v-else :size="18" aria-hidden="true" />
          </button>
          <button data-test="create-chess" class="chess-control primary" :disabled="loading || submitting" @click="create">{{ game ? 'New room' : 'Create room' }}</button>
        </div>
      </header>
      <div class="chess-layout">
        <section aria-label="Chess game" class="board-section">
          <ChessBoard :fen="game?.fen || initialFen" :can-move="canMove" @move="makeMove" />
        </section>
        <aside class="room-panel" aria-label="Chess room">
          <p role="status" aria-live="polite" class="room-status"><span class="status-dot" aria-hidden="true" />{{ status }}</p>
          <p v-if="!game" class="room-description">Create a private room, then share the link. Your friend joins as Black.</p>
          <p v-else-if="game.status === 'waiting'" class="room-description">Your room is ready. Share the invite link to start a game.</p>
          <p v-else-if="finished" class="room-description">Game completed. You can reopen this link to review the board, or create a new room.</p>
          <p v-else class="room-description">You’re playing {{ color }}. {{ submitting ? 'Waiting for your move to be saved.' : 'Take your time. There’s no clock.' }}</p>
          <div v-if="error" role="alert" class="room-error"><p>{{ error }}</p><button data-test="retry-chess" class="chess-control" :disabled="loading" @click="retryAction">Retry</button></div>
          <button v-else-if="game && connection !== 'connected' && !loading" class="chess-control" @click="retryAction">Reconnect</button>
          <div class="players">
            <div class="player"><span class="seat white-seat" aria-hidden="true">♟</span><div><strong>{{ game ? (color === 'White' ? 'You' : 'Opponent') : 'You' }}</strong><p>White · moves first</p></div></div>
            <div class="player"><span class="seat black-seat" aria-hidden="true">♟</span><div><strong>{{ game && color === 'Black' ? 'You' : 'Opponent' }}</strong><p>{{ game?.black_id ? 'Black · joined' : 'Black · join with your invite' }}</p></div></div>
          </div>
          <button v-if="game" data-test="copy-chess" class="chess-control copy-button" @click="copyInvite"><Copy :size="15" aria-hidden="true" />{{ copied ? 'Link copied' : 'Copy invite link' }}</button>
          <p class="room-footnote">Standard chess · White moves first · 8 × 8 board</p>
          <details v-if="movePairs.length" class="move-history">
            <summary>Move history ({{ game?.move_count }} plies)</summary>
            <table><caption class="sr-only">Moves in standard algebraic notation</caption><thead><tr><th scope="col">Move</th><th scope="col">White</th><th scope="col">Black</th></tr></thead><tbody><tr v-for="pair in movePairs" :key="pair.number"><th scope="row">{{ pair.number }}</th><td>{{ pair.white }}</td><td>{{ pair.black || '—' }}</td></tr></tbody></table>
          </details>
        </aside>
      </div>
    </div>
  </main>
</template>

<style scoped>
.chess-page { min-height: 100dvh; padding: 32px; background: var(--ap-canvas); color: var(--ap-text-primary); }
.chess-shell { max-width: 1040px; margin: 0 auto; }
.chess-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-bottom: 24px; border-bottom: 1px solid var(--ap-glass-border); }
.back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--ap-text-secondary); min-height: 32px; }
h1 { font-size: 28px; line-height: 1.2; font-weight: 650; margin-top: 8px; }
.header-actions { display: flex; gap: 12px; align-items: center; }
.chess-control { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border: 1px solid var(--ap-text-muted); padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
.chess-control:hover { background: var(--ap-glass-hover); }
.chess-control.primary { background: var(--ap-blue); border-color: transparent; color: var(--primary-foreground); }
.chess-control:disabled { opacity: .5; cursor: default; }
.theme-button { padding: 10px; }
.chess-page :is(a, button, summary):focus-visible { outline: 2px solid var(--ap-blue); outline-offset: 3px; }
.chess-layout { display: grid; grid-template-columns: minmax(0, 608px) minmax(260px, 1fr); gap: 32px; align-items: start; padding-top: 32px; }
.board-section { min-width: 0; }
.room-panel { margin-top: 32px; padding: 24px; border: 1px solid var(--ap-glass-border); border-radius: 16px; background: var(--ap-stage); }
.room-status { font-size: 16px; font-weight: 650; display: flex; align-items: center; gap: 9px; }
.status-dot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: var(--ap-blue); }
.room-description { font-size: 13px; line-height: 1.6; color: var(--ap-text-secondary); margin-top: 10px; }
.players { margin: 20px 0; }
.player { display: flex; gap: 12px; align-items: center; padding: 14px 0; border-top: 1px solid var(--ap-glass-border); }
.player strong { font-size: 13px; font-weight: 600; } .player p { font-size: 12px; color: var(--ap-text-secondary); margin-top: 3px; }
.seat { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--ap-text-muted); font-size: 23px; font-family: 'DejaVu Sans', 'Segoe UI Symbol', serif; }
.white-seat { background: #fffdf5; color: #fffdf5; -webkit-text-stroke: 1px #25323a; } .black-seat { background: #25323a; color: #fffdf5; }
.copy-button { width: 100%; }
.room-footnote { font-size: 11px; line-height: 1.6; color: var(--ap-text-secondary); margin-top: 16px; }
.room-error { margin: 16px 0; font-size: 13px; overflow-wrap: anywhere; } .room-error button { margin-top: 8px; }
.move-history { border-top: 1px solid var(--ap-glass-border); margin-top: 20px; padding-top: 16px; font-size: 13px; }
.move-history summary { cursor: pointer; min-height: 32px; } table { width: 100%; text-align: left; margin-top: 8px; } th, td { padding: 6px 4px; }
@media (max-width: 720px) { .chess-page { padding: 16px; } .chess-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; padding-top: 24px; } .room-panel { margin-top: 0; padding: 20px; } .chess-header { padding-bottom: 16px; } .chess-shell { max-width: 520px; } }
</style>
