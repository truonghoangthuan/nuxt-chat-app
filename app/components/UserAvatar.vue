<script setup lang="ts">
import { computed } from 'vue'
import { getAvatarInitials, getAvatarColor } from '~/utils/chat'

const props = withDefaults(
  defineProps<{
    displayName: string
    avatarColor?: string
    showOnline?: boolean
    size?: 'sm' | 'md'
  }>(),
  {
    avatarColor: '',
    showOnline: false,
    size: 'md',
  },
)

const initials = computed(() => getAvatarInitials(props.displayName || '?'))
const bgColor = computed(() => props.avatarColor || getAvatarColor(props.displayName || 'seed'))
</script>

<template>
  <div class="relative inline-flex items-center justify-center shrink-0">
    <div
      class="rounded-full flex items-center justify-center font-semibold text-white select-none shadow-sm"
      :class="size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'"
      :style="{ backgroundColor: bgColor }"
      :title="displayName"
    >
      {{ initials }}
    </div>
    <span
      v-if="showOnline"
      class="absolute bottom-0 right-0 block rounded-full ring-2 ring-white dark:ring-slate-800 bg-emerald-500"
      :class="size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'"
    ></span>
  </div>
</template>
