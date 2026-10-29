<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronLeft } from '@lucide/vue'
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
  <main class="caro-page min-h-dvh bg-[var(--ap-canvas)] text-[var(--ap-text-primary)] p-4 sm:p-8 animate-page-enter">
    <div class="mx-auto max-w-3xl space-y-6">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <NuxtLink to="/" data-test="back-to-chat" class="text-sm text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] inline-flex items-center gap-1.5 transition-colors">
            <ChevronLeft class="size-4" aria-hidden="true" />
            <span>Back to chat</span>
          </NuxtLink>
          <h1 class="text-3xl font-semibold mt-3">Caro</h1>
          <p class="text-sm text-[var(--ap-text-secondary)] mt-2">Two players. Five in a row. Your next move.</p>
        </div>
        <button data-test="create-caro" class="caro-control primary" :disabled="loading" @click="create">{{ game ? 'New room' : 'Create room' }}</button>
      </header>
      <section class="rounded-2xl border border-[var(--ap-glass-border)] bg-[var(--ap-stage)] backdrop-blur-2xl shadow-xl p-5 space-y-4" aria-label="Caro room">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_#007aff]" aria-hidden="true" />
          <p aria-live="polite" role="status" class="font-medium text-sm">{{ status }}</p>
        </div>
        <div v-if="error" role="alert" class="space-y-2 text-rose-500 dark:text-rose-400 text-sm">
          <p>{{ error }}</p>
          <button data-test="retry-caro" class="caro-control" :disabled="loading" @click="retryAction">Retry</button>
        </div>
        <template v-if="game">
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm pt-1">
            <span class="font-medium">You are <strong class="text-blue-500 font-bold">{{ game.player_x_id === playerId ? 'X' : 'O' }}</strong> · <span class="font-mono text-xs text-[var(--ap-text-muted)]">{{ game.move_count }} moves</span></span>
            <button data-test="copy-caro" class="caro-control" @click="copyInvite">{{ copied ? 'Link copied' : 'Copy invite link' }}</button>
          </div>
          <p class="text-xs text-[var(--ap-text-muted)]">X starts. Five or more contiguous stones in any direction wins. Scroll the board on small screens.</p>
          <div class="overflow-x-auto p-1 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[var(--ap-glass-border)]" aria-label="15 by 15 board">
            <div class="grid min-w-[660px] grid-cols-[repeat(15,minmax(0,1fr))] gap-px bg-[var(--ap-glass-border)] border border-[var(--ap-glass-border)] rounded-lg overflow-hidden">
              <template v-for="(row, r) in board" :key="r">
                <button v-for="(cell, c) in row" :key="c" data-test="caro-cell"
                  :aria-label="`Row ${r + 1}, column ${c + 1}, ${cell ? cell.toUpperCase() : 'empty'}`"
                  :disabled="!canMove || cell !== null"
                  class="aspect-square min-h-11 bg-[var(--ap-stage)] text-[var(--ap-text-primary)] text-xl font-bold hover:bg-[var(--ap-sidebar)] transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-blue-500 disabled:cursor-default"
                  :class="cell === 'x' ? 'text-blue-500' : (cell === 'o' ? 'text-rose-500' : '')"
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
.caro-control {
  border: 1px solid var(--ap-glass-border);
  border-radius: 9999px;
  padding: 0.5rem 1.1rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--ap-stage);
  color: var(--ap-text-primary);
  transition: all 150ms ease;
}
.caro-control:hover:not(:disabled) {
  background: var(--ap-sidebar);
  border-color: var(--ap-text-muted);
}
.caro-control.primary {
  background: var(--ap-blue);
  color: #ffffff;
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(0, 122, 255, 0.25);
}
.caro-control.primary:hover:not(:disabled) {
  opacity: 0.92;
}
.caro-control:active:not(:disabled) {
  transform: scale(0.96);
}
.caro-control:disabled {
  opacity: 0.5;
  cursor: default;
}
.caro-page a:focus-visible, .caro-control:focus-visible {
  outline: 2px solid var(--ap-blue);
  outline-offset: 3px;
}
</style>
