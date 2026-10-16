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
    class="bg-amber-500 text-amber-950 px-4 py-2 text-xs md:text-sm font-medium flex items-center justify-between shadow-sm transition-all"
  >
    <div class="flex items-center gap-2">
      <span class="inline-block w-2 h-2 rounded-full bg-amber-900 animate-pulse"></span>
      <span>
        Disconnected from realtime chat. Reconnecting in {{ countdownSec }}s...
      </span>
    </div>
    <button
      type="button"
      class="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold transition-colors shadow-sm"
      @click="emit('retry')"
    >
      Retry now
    </button>
  </div>
</template>
