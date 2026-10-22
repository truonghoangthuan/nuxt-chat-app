<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>

<template>
  <div class="min-h-screen bg-[var(--ap-canvas)] text-[var(--ap-text-primary)] antialiased selection:bg-blue-500/30 selection:text-blue-200 transition-colors">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
