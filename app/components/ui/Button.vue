<script setup lang="ts">
import type { ButtonHTMLAttributes, HTMLAttributes } from 'vue'

interface Props extends /* @vue-ignore */ ButtonHTMLAttributes {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  class?: HTMLAttributes['class']
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  type: 'button',
})

const variantClasses: Record<string, string> = {
  default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
  destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
  outline: 'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
}

const sizeClasses: Record<string, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-6',
  icon: 'size-9',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    data-slot="button"
    :class="[
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 shrink-0 cursor-pointer',
      variantClasses[variant] || variantClasses.default,
      sizeClasses[size] || sizeClasses.default,
      props.class,
    ]"
  >
    <slot />
  </button>
</template>
