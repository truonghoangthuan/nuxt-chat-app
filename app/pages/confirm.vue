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
  <div class="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
    <div class="text-center">
      <div class="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p class="text-slate-300 text-sm">
        Confirming your account and redirecting...
      </p>
    </div>
  </div>
</template>
