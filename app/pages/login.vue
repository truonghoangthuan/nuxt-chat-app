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
  <div class="min-h-screen flex items-center justify-center bg-[var(--fp-void)] px-4 py-12 relative overflow-hidden transition-colors">
    <!-- Subtle radial ambient indigo glow -->
    <div
      class="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[560px] h-[320px] rounded-full bg-indigo-500/10 blur-3xl"
      aria-hidden="true"
    ></div>

    <div class="relative w-full max-w-[420px] fp-stage-surface rounded-[16px] border border-[var(--fp-border)] p-8">
      <!-- Brand Header -->
      <div class="flex flex-col items-center text-center mb-6">
        <div class="fp-font-display w-11 h-11 rounded-[12px] fp-btn-primary flex items-center justify-center text-white text-base font-extrabold tracking-tight mb-3">
          FC
        </div>
        <h1 class="fp-font-display text-2xl font-bold text-[var(--fp-text-primary)] tracking-tight">
          Friends Chat
        </h1>
        <p class="text-[14px] text-[var(--fp-text-secondary)] mt-1">
          {{ isSignUp ? 'Create your studio identity to start chatting' : 'Welcome back! Sign in to join your friends' }}
        </p>
      </div>

      <!-- Segmented Tab Switcher -->
      <div class="flex rounded-[9px] bg-[var(--fp-input-bg)] border border-[var(--fp-border)] p-1 mb-6">
        <button
          type="button"
          class="flex-1 py-1.5 text-[14px] font-semibold rounded-[6px] transition-all cursor-pointer"
          :class="!isSignUp ? 'bg-[var(--fp-stage-subtle)] text-[var(--fp-text-primary)] shadow-xs' : 'text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)]'"
          @click="isSignUp = false; errorMsg = null; infoMsg = null"
        >
          Sign In
        </button>
        <button
          type="button"
          class="flex-1 py-1.5 text-[14px] font-semibold rounded-[6px] transition-all cursor-pointer"
          :class="isSignUp ? 'bg-[var(--fp-stage-subtle)] text-[var(--fp-text-primary)] shadow-xs' : 'text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)]'"
          @click="isSignUp = true; errorMsg = null; infoMsg = null"
        >
          Create Account
        </button>
      </div>

      <!-- Error / Info Alerts -->
      <div
        v-if="errorMsg"
        class="mb-4 p-3 rounded-[8px] text-xs font-medium bg-rose-500/15 border border-rose-500/35 text-rose-600 dark:text-rose-300"
      >
        {{ errorMsg }}
      </div>

      <div
        v-if="infoMsg"
        class="mb-4 p-3 rounded-[8px] text-xs font-medium bg-indigo-500/15 border border-indigo-500/35 text-indigo-700 dark:text-indigo-300"
      >
        {{ infoMsg }}
      </div>

      <!-- Form -->
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div v-if="isSignUp">
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Display Name
          </label>
          <input
            v-model="displayName"
            type="text"
            required
            placeholder="e.g. Alice"
            class="w-full px-3.5 py-2.5 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none focus:border-indigo-500 text-[14.5px] transition-colors"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Email Address
          </label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="you@example.com"
            class="w-full px-3.5 py-2.5 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none focus:border-indigo-500 text-[14.5px] transition-colors"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Password
          </label>
          <input
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
            class="w-full px-3.5 py-2.5 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none focus:border-indigo-500 text-[14.5px] transition-colors"
          />
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-2.5 px-4 rounded-[8px] fp-btn-primary font-semibold text-[14.5px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 cursor-pointer"
        >
          <span v-if="isLoading" class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          {{ isSignUp ? 'Sign Up' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>
