<script setup lang="ts">
import { computed } from 'vue'
import { getAvatarInitials, getAvatarColor } from '~/utils/chat'

const props = withDefaults(
  defineProps<{
    displayName: string
    avatarColor?: string
    avatarUrl?: string | null
    showOnline?: boolean
    size?: 'sm' | 'md' | 'lg'
  }>(),
  {
    avatarColor: '',
    avatarUrl: '',
    showOnline: false,
    size: 'md',
  },
)

const initials = computed(() => getAvatarInitials(props.displayName || '?'))
const bgColor = computed(() => props.avatarColor || getAvatarColor(props.displayName || 'seed'))

const sizeClasses = computed(() => {
  if (props.size === 'sm') return 'w-7 h-7 rounded-[7px] text-[11px]'
  if (props.size === 'lg') return 'w-11 h-11 rounded-[11px] text-sm'
  return 'w-9 h-9 rounded-[9px] text-[13px]'
})

const dotClasses = computed(() => {
  if (props.size === 'sm') return 'w-2 h-2 -bottom-0.5 -right-0.5'
  if (props.size === 'lg') return 'w-3 h-3 -bottom-0.5 -right-0.5'
  return 'w-2.5 h-2.5 -bottom-0.5 -right-0.5'
})
</script>

<template>
  <div class="relative inline-flex items-center justify-center shrink-0">
    <div
      class="fp-font-display flex items-center justify-center font-bold tracking-tight text-white select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.2)]"
      :class="sizeClasses"
      :style="{ backgroundColor: bgColor }"
      :title="displayName"
    >
      <img
        v-if="avatarUrl"
        :key="avatarUrl"
        :src="avatarUrl"
        alt=""
        class="absolute inset-0 w-full h-full object-cover rounded-[inherit]"
        referrerpolicy="no-referrer"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      {{ initials }}
    </div>
    <span
      v-if="showOnline"
      class="absolute block rounded-full ring-2 ring-[var(--fp-stage)] bg-emerald-500"
      :class="dotClasses"
    ></span>
  </div>
</template>
