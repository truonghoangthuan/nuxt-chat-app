<script setup lang="ts">
import type { HTMLAttributes, InputHTMLAttributes } from 'vue'

interface Props extends /* @vue-ignore */ InputHTMLAttributes {
  class?: HTMLAttributes['class']
  type?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
})

const model = defineModel<string | number>()
</script>

<template>
  <input
    v-model="model"
    data-slot="input"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :class="[
      'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50',
      props.class,
    ]"
  >
</template>
