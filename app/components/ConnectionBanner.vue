<script setup lang="ts">
import type { ConnectionStatus } from '~/types/chat'

const props = defineProps<{
  status: ConnectionStatus
  countdownSec: number
}>()

const emit = defineEmits<{
  (e: 'retry'): void
}>()
</script>

<template>
  <div
    v-if="status !== 'connected'"
    class="bg-amber-500/10 border-b border-amber-500/20 text-amber-500 px-5 py-2 text-xs font-medium flex items-center justify-between shrink-0 transition-all"
  >
    <div class="flex items-center gap-2.5">
      <span class="inline-block w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)] animate-pulse"></span>
      <span>
        Disconnected from realtime chat. Reconnecting in <strong class="font-mono">{{ countdownSec }}s</strong>...
      </span>
    </div>
    <button
      type="button"
      class="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-[6px] text-xs font-semibold transition-colors shadow-xs cursor-pointer"
      @click="emit('retry')"
    >
      Retry now
    </button>
  </div>
</template>
