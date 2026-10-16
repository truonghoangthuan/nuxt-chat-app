<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>

<template>
  <div class="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
