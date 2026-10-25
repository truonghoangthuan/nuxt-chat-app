<script setup lang="ts">
import { watch, onMounted } from 'vue'

const user = useSupabaseUser()

watch(user, () => {
  if (user.value) {
    return navigateTo('/')
  }
}, { immediate: true })

onMounted(() => {
  setTimeout(() => {
    navigateTo('/')
  }, 1200)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[var(--ap-canvas)] text-[var(--ap-text-primary)] p-4">
    <div class="bg-[var(--ap-stage)] rounded-[16px] border border-[var(--ap-glass-border)] px-8 py-7 text-center max-w-sm w-full shadow-lg">
      <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3.5" />
      <p class="text-[var(--ap-text-secondary)] text-sm font-medium">
        Confirming your account and redirecting...
      </p>
    </div>
  </div>
</template>
