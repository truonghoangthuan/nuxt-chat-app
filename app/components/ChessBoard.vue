<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Chess, type Square } from 'chess.js'
const props = defineProps<{ fen: string; canMove: boolean }>()
const emit = defineEmits<{ move: [move: { from: string; to: string; promotion?: string }] }>()
const chess = computed(() => new Chess(props.fen))
const squares = computed(() => chess.value.board().flatMap((row, r) => row.map((piece, c) => ({ square: `${'abcdefgh'[c]}${8 - r}` as Square, piece, light: (r + c) % 2 === 0, rank: 8 - r, file: 'abcdefgh'[c], r, c }))))
const names = { p: 'pawn', r: 'rook', n: 'knight', b: 'bishop', q: 'queen', k: 'king' }
const glyphs = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' }
const selected = ref<Square | null>(null)
const focusIndex = ref(0)
const root = ref<HTMLElement | null>(null)
const pending = ref<{ from: string; to: string } | null>(null)
const promotion = ref('q')
const promotionSelect = ref<HTMLSelectElement | null>(null)
const legal = computed(() => selected.value ? chess.value.moves({ square: selected.value, verbose: true }) : [])
const destinations = computed(() => new Set(legal.value.map(move => move.to)))
watch(() => [props.fen, props.canMove], () => { selected.value = null; pending.value = null })
async function choose(square: Square) {
  if (!props.canMove || pending.value) return
  if (selected.value && destinations.value.has(square)) {
    const move = { from: selected.value, to: square }
    if (legal.value.some(candidate => candidate.to === square && candidate.promotion)) {
      pending.value = move; promotion.value = 'q'
      await nextTick(); promotionSelect.value?.focus()
    } else { emit('move', move); selected.value = null }
    return
  }
  selected.value = chess.value.get(square)?.color === chess.value.turn() && selected.value !== square ? square : null
}
function focusSquare(index: number) {
  focusIndex.value = index
  nextTick(() => root.value?.querySelector<HTMLButtonElement>(`[data-square="${squares.value[index].square}"]`)?.focus())
}
function keydown(event: KeyboardEvent, index: number) {
  const row = Math.floor(index / 8); const col = index % 8
  const targets: Record<string, number> = {
    ArrowLeft: row * 8 + Math.max(0, col - 1), ArrowRight: row * 8 + Math.min(7, col + 1),
    ArrowUp: Math.max(0, row - 1) * 8 + col, ArrowDown: Math.min(7, row + 1) * 8 + col,
    Home: row * 8, End: row * 8 + 7,
  }
  if (event.key in targets) { event.preventDefault(); focusSquare(targets[event.key]) }
  if (event.key === 'Escape') { selected.value = null; pending.value = null }
}
function finishPromotion(confirm: boolean) {
  if (confirm && pending.value && props.canMove) emit('move', { ...pending.value, promotion: promotion.value })
  pending.value = null; selected.value = null; focusSquare(focusIndex.value)
}
</script>

<template>
  <div ref="root" class="chess-board-wrap">
    <div class="chess-board" role="group" aria-label="Chess board, White at bottom. Arrow keys move focus; Enter or Space selects a square.">
      <button v-for="(cell, index) in squares" :key="cell.square" type="button" :data-square="cell.square"
        class="chess-square" :class="[{ light: cell.light, selected: selected === cell.square }, cell.piece?.color === 'w' ? 'white-piece' : 'black-piece']"
        :tabindex="index === focusIndex ? 0 : -1" :aria-disabled="!canMove || !!pending"
        :aria-pressed="selected === cell.square"
        :aria-label="`${cell.square}, ${cell.piece ? `${cell.piece.color === 'w' ? 'White' : 'Black'} ${names[cell.piece.type]}` : 'empty'}${destinations.has(cell.square) ? ', legal destination' : ''}`"
        @focus="focusIndex = index" @keydown="keydown($event, index)" @click="choose(cell.square)">
        <span v-if="cell.c === 0" class="rank" aria-hidden="true">{{ cell.rank }}</span>
        <span v-if="cell.r === 7" class="file" aria-hidden="true">{{ cell.file }}</span>
        <span v-if="cell.piece" class="piece" aria-hidden="true">{{ glyphs[cell.piece.type] }}</span>
        <span v-if="destinations.has(cell.square)" class="destination" aria-hidden="true" />
      </button>
    </div>
    <p class="board-hint">Select a piece, then a highlighted square. Arrow keys navigate; Enter selects.</p>
    <div v-if="pending" class="promotion" @keydown.esc.prevent="finishPromotion(false)">
      <label for="chess-promotion">Promote pawn to</label>
      <select id="chess-promotion" ref="promotionSelect" v-model="promotion">
        <option value="q">Queen</option><option value="r">Rook</option><option value="b">Bishop</option><option value="n">Knight</option>
      </select>
      <button type="button" data-test="confirm-promotion" @click="finishPromotion(true)">Promote</button>
      <button type="button" @click="finishPromotion(false)">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.chess-board-wrap { min-width: 0; --chess-light: #e9eedf; --chess-dark: #7e9e87; --chess-ink: #25323a; --chess-ivory: #fffdf5; }
.chess-board { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); border-radius: 6px; overflow: hidden; box-shadow: 0 8px 24px var(--ap-glass); }
.chess-square { position: relative; display: grid; place-items: center; aspect-ratio: 1; padding: 0; border: 0; background: var(--chess-dark); cursor: pointer; }
.chess-square.light { background: var(--chess-light); }
.chess-square[aria-disabled="true"] { cursor: default; }
.chess-square.selected { box-shadow: inset 0 0 0 4px var(--ap-blue); }
.chess-square:focus-visible { outline: 3px solid var(--chess-ink); outline-offset: -4px; z-index: 1; }
.piece { font-family: 'DejaVu Sans', 'Segoe UI Symbol', 'Arial Unicode MS', serif; font-size: clamp(25px, 6.4vw, 56px); line-height: 1; }
.white-piece .piece { color: var(--chess-ivory); -webkit-text-stroke: 1px var(--chess-ink); filter: drop-shadow(0 1px 1px var(--chess-ink)); }
.black-piece .piece { color: var(--chess-ink); -webkit-text-stroke: .4px var(--chess-ivory); }
.rank, .file { position: absolute; font-size: clamp(9px, 1.8vw, 12px); font-weight: 600; color: var(--chess-ink); line-height: 1; }
.rank { left: 3px; top: 3px; } .file { right: 3px; bottom: 3px; }
.destination { position: absolute; width: 22%; height: 22%; border-radius: 50%; background: var(--chess-ink); opacity: .55; pointer-events: none; }
.chess-square:has(.piece) .destination { width: 85%; height: 85%; background: transparent; border: 3px solid var(--chess-ink); }
.board-hint { color: var(--ap-text-secondary); font-size: .75rem; margin-top: 16px; line-height: 1.5; }
.promotion { margin-top: 16px; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.promotion select, .promotion button { padding: 10px 14px; min-height: 44px; border: 1px solid var(--ap-text-secondary); border-radius: 8px; background: var(--ap-stage); color: var(--ap-text-primary); }
.promotion :focus-visible { outline: 2px solid var(--ap-blue); outline-offset: 3px; }
</style>
