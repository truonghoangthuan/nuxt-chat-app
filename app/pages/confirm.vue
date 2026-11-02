<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { safeAuthRedirectPath } from '~/utils/authRedirect'

const user = useSupabaseUser()
const redirectInfo = useSupabaseCookieRedirect()
const timedOut = ref(false)

function redirectAfterAuth() {
  return navigateTo(safeAuthRedirectPath(redirectInfo.pluck()))
}

function returnToLogin() {
  return navigateTo('/login')
}

watch(user, () => {
  if (user.value) {
    return redirectAfterAuth()
  }
}, { immediate: true })

onMounted(() => {
  setTimeout(() => {
    if (!user.value) {
      timedOut.value = true
    }
  }, 5000)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[var(--ap-canvas)] text-[var(--ap-text-primary)] p-4">
    <div class="bg-[var(--ap-stage)] rounded-[16px] border border-[var(--ap-glass-border)] px-8 py-7 text-center max-w-sm w-full shadow-lg">
      <div v-if="!timedOut">
        <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3.5" />
        <p class="text-[var(--ap-text-secondary)] text-sm font-medium">
          Confirming your account and redirecting...
        </p>
      </div>
      <div v-else>
        <p class="text-sm font-medium text-amber-400 mb-3">
          Confirmation is taking longer than expected.
        </p>
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
          @click="returnToLogin"
        >
          Return to Sign In
        </button>
      </div>
    </div>
  </div>
</template>
