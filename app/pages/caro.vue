<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useCaroGame } from '~/composables/useCaroGame'
import { useTheme } from '~/composables/useTheme'

const route = useRoute()
const router = useRouter()
const { initTheme } = useTheme()
const { game, board, playerId, loading, submitting, error, connection, canMove, createRoom, joinRoom, makeMove, retry, leaveRoom } = useCaroGame()
const copied = ref(false)
const roomId = computed(() => typeof route.query.room === 'string' ? route.query.room : '')
const status = computed(() => {
  if (loading.value) return 'Loading room…'
  if (!game.value) return 'Create a room and invite a friend.'
  if (game.value.status === 'waiting') return 'Waiting for another player — share your invite link.'
  if (game.value.status === 'draw') return 'Draw — the board is full.'
  if (game.value.status === 'won') return game.value.winner_id === playerId.value ? 'You won!' : 'Your opponent won.'
  if (connection.value !== 'connected') return 'Reconnecting — waiting for live updates.'
  if (submitting.value) return 'Sending move…'
  return game.value.current_player_id === playerId.value ? 'Your turn' : "Opponent’s turn"
})
async function openFromLink() {
  copied.value = false
  if (roomId.value) await joinRoom(roomId.value)
  else leaveRoom()
}
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
    const url = new URL('/caro', window.location.origin)
    url.searchParams.set('room', game.value.id)
    await navigator.clipboard.writeText(url.toString())
    copied.value = true
  } catch { error.value = 'Could not copy. Copy the room URL from your address bar.' }
}
watch(roomId, () => {
  if (roomId.value !== game.value?.id) void openFromLink()
})
onMounted(() => { initTheme?.(); void openFromLink() })
</script>

<template>
  <main class="caro-page min-h-dvh bg-[var(--ap-canvas)] text-[var(--ap-text-primary)] p-4 sm:p-8">
    <div class="mx-auto max-w-3xl space-y-6">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <a href="/" class="text-sm underline text-[var(--ap-text-secondary)]">Back to chat</a>
          <h1 class="text-3xl font-semibold mt-3">Caro</h1>
          <p class="text-sm text-[var(--ap-text-secondary)] mt-2">Two players. Five in a row. Your next move.</p>
        </div>
        <button data-test="create-caro" class="caro-control" :disabled="loading" @click="create">Create room</button>
      </header>
      <section class="rounded-2xl border border-[var(--ap-glass-border)] bg-[var(--ap-stage)] p-4 space-y-4" aria-label="Caro room">
        <p aria-live="polite" role="status" class="font-medium">{{ status }}</p>
        <div v-if="error" role="alert" class="space-y-2">
          <p>{{ error }}</p>
          <button data-test="retry-caro" class="caro-control" :disabled="loading" @click="retryAction">Retry</button>
        </div>
        <template v-if="game">
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>You are {{ game.player_x_id === playerId ? 'X' : 'O' }} · {{ game.move_count }} moves</span>
            <button data-test="copy-caro" class="caro-control" @click="copyInvite">{{ copied ? 'Link copied' : 'Copy invite link' }}</button>
          </div>
          <p class="text-sm text-[var(--ap-text-secondary)]">X starts. Five or more contiguous stones in any direction wins. Scroll the board on small screens.</p>
          <div class="overflow-x-auto p-1" aria-label="15 by 15 board">
            <div class="grid min-w-[660px] grid-cols-[repeat(15,minmax(0,1fr))] gap-px bg-[var(--ap-text-muted)] border border-[var(--ap-text-muted)]">
              <template v-for="(row, r) in board" :key="r">
                <button v-for="(cell, c) in row" :key="c" data-test="caro-cell"
                  :aria-label="`Row ${r + 1}, column ${c + 1}, ${cell ? cell.toUpperCase() : 'empty'}`"
                  :disabled="!canMove || cell !== null"
                  class="aspect-square min-h-11 bg-[var(--ap-stage)] text-[var(--ap-text-primary)] text-xl font-semibold hover:bg-[var(--ap-sidebar)] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-current disabled:cursor-default"
                  @click="makeMove(r, c)">{{ cell?.toUpperCase() }}</button>
              </template>
            </div>
          </div>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.caro-control { border: 1px solid var(--ap-text-muted); border-radius: 0.65rem; padding: 0.65rem 1rem; font-weight: 600; }
.caro-control:hover { background: var(--ap-sidebar); }
.caro-control:disabled { opacity: 0.5; }
.caro-page a:focus-visible, .caro-control:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
</style>
