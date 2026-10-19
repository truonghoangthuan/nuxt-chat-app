<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>

<template>
  <div class="min-h-screen bg-[var(--fp-void)] text-[var(--fp-text-primary)] antialiased selection:bg-indigo-500/30 selection:text-indigo-200 transition-colors">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
