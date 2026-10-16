<script setup lang="ts">
import { ref } from 'vue'
import { useAuthProfile } from '~/composables/useAuthProfile'

const { signInWithPassword, signUpWithProfile } = useAuthProfile()

const isSignUp = ref(false)
const email = ref('')
const password = ref('')
const displayName = ref('')
const errorMsg = ref<string | null>(null)
const infoMsg = ref<string | null>(null)
const isLoading = ref(false)

async function handleSubmit() {
  errorMsg.value = null
  infoMsg.value = null

  if (!email.value || !password.value) {
    errorMsg.value = 'Please provide both email and password.'
    return
  }

  if (isSignUp.value && !displayName.value.trim()) {
    errorMsg.value = 'Please provide a display name.'
    return
  }

  isLoading.value = true
  try {
    if (isSignUp.value) {
      const res = await signUpWithProfile(email.value, password.value, displayName.value)
      if (res.error) {
        errorMsg.value = res.error
      } else if (res.needsEmailConfirmation) {
        infoMsg.value = 'Check your email inbox to confirm your account before signing in.'
      } else {
        await navigateTo('/')
      }
    } else {
      const res = await signInWithPassword(email.value, password.value)
      if (res.error) {
        errorMsg.value = res.error
      } else {
        await navigateTo('/')
      }
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'An unexpected error occurred.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4 py-12 transition-colors">
    <div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
          Friends Chat
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {{ isSignUp ? 'Create your account to start chatting' : 'Welcome back! Sign in to join your friends' }}
        </p>
      </div>

      <!-- Tab Switcher -->
      <div class="flex rounded-lg bg-slate-100 dark:bg-slate-900 p-1 mb-6">
        <button
          type="button"
          class="flex-1 py-2 text-sm font-medium rounded-md transition-all"
          :class="!isSignUp ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
          @click="isSignUp = false; errorMsg = null; infoMsg = null"
        >
          Sign In
        </button>
        <button
          type="button"
          class="flex-1 py-2 text-sm font-medium rounded-md transition-all"
          :class="isSignUp ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'"
          @click="isSignUp = true; errorMsg = null; infoMsg = null"
        >
          Create Account
        </button>
      </div>

      <!-- Error / Info Alerts -->
      <div
        v-if="errorMsg"
        class="mb-4 p-3 rounded-lg text-sm bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
      >
        {{ errorMsg }}
      </div>

      <div
        v-if="infoMsg"
        class="mb-4 p-3 rounded-lg text-sm bg-sky-50 border border-sky-200 text-sky-700 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300"
      >
        {{ infoMsg }}
      </div>

      <!-- Form -->
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div v-if="isSignUp">
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Display Name
          </label>
          <input
            v-model="displayName"
            type="text"
            required
            placeholder="e.g. Alice"
            class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Email Address
          </label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="you@example.com"
            class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Password
          </label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
            class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
        >
          <span v-if="isLoading" class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          {{ isSignUp ? 'Sign Up' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>
