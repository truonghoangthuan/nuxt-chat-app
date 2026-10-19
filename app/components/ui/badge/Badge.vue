<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { BadgeVariants } from '.'
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { Primitive } from 'reka-ui'
import { badgeVariants } from '.'

interface Props {
  as?: any
  asChild?: boolean
  variant?: BadgeVariants['variant']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  as: 'span',
  asChild: false,
})

const delegatedProps = reactiveOmit(props, 'class', 'variant')
</script>

<template>
  <Primitive
    data-slot="badge"
    :data-variant="variant"
    :as="as"
    :as-child="asChild"
    :class="cn(badgeVariants({ variant }), props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </Primitive>
</template>
