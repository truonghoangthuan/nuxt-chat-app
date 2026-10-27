<script setup lang="ts">
import { computed } from 'vue'
import { getAvatarInitials, getAvatarColor } from '~/utils/chat'

const props = withDefaults(
  defineProps<{
    displayName: string
    avatarColor?: string
    avatarUrl?: string | null
    showOnline?: boolean
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    shape?: 'squircle' | 'circle'
  }>(),
  {
    avatarColor: '',
    avatarUrl: '',
    showOnline: false,
    size: 'md',
    shape: 'squircle',
  },
)

const initials = computed(() => getAvatarInitials(props.displayName || '?'))
const bgColor = computed(() => props.avatarColor || getAvatarColor(props.displayName || 'seed'))

const sizeClasses = computed(() => {
  const isCircle = props.shape === 'circle'
  if (props.size === 'xs') return `w-4 h-4 ${isCircle ? 'rounded-full' : 'rounded-[4px]'} text-[8px]`
  if (props.size === 'sm') return `w-7 h-7 ${isCircle ? 'rounded-full' : 'rounded-[7px]'} text-[11px]`
  if (props.size === 'lg') return `w-11 h-11 ${isCircle ? 'rounded-full' : 'rounded-[11px]'} text-sm`
  if (props.size === 'xl') return `w-16 h-16 ${isCircle ? 'rounded-full' : 'rounded-[16px]'} text-xl`
  if (props.size === '2xl') return `w-20 h-20 ${isCircle ? 'rounded-full' : 'rounded-[20px]'} text-2xl`
  return `w-9 h-9 ${isCircle ? 'rounded-full' : 'rounded-[9px]'} text-[13px]`
})

const dotClasses = computed(() => {
  if (props.size === 'xs') return 'w-1.5 h-1.5 -bottom-0.5 -right-0.5'
  if (props.size === 'sm') return 'w-2 h-2 -bottom-0.5 -right-0.5'
  if (props.size === 'lg') return 'w-3 h-3 -bottom-0.5 -right-0.5'
  if (props.size === 'xl') return 'w-3.5 h-3.5 -bottom-0.5 -right-0.5'
  if (props.size === '2xl') return 'w-4 h-4 -bottom-0.5 -right-0.5 ring-[3px]'
  return 'w-2.5 h-2.5 -bottom-0.5 -right-0.5'
})
</script>

<template>
  <div class="relative inline-flex items-center justify-center shrink-0">
    <div
      class="relative flex items-center justify-center font-bold tracking-tight text-white select-none overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-150"
      :class="sizeClasses"
      :style="{ backgroundColor: bgColor }"
      :title="displayName"
    >
      <img
        v-if="avatarUrl"
        :key="avatarUrl"
        :src="avatarUrl"
        alt=""
        class="absolute inset-0 w-full h-full object-cover"
        referrerpolicy="no-referrer"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      {{ initials }}
    </div>
    <span
      v-if="showOnline"
      class="absolute block rounded-full ring-2 ring-[var(--ap-stage)] bg-emerald-500 transition-transform"
      :class="dotClasses"
    ></span>
  </div>
</template>
