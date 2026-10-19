<script setup lang="ts">
import { ref } from 'vue'
import { MessageCircle, Radio, UsersRound } from '@lucide/vue'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
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

function setMode(signUp: boolean) {
  isSignUp.value = signUp
  errorMsg.value = null
  infoMsg.value = null
}
</script>

<template>
  <main class="auth-shell min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(390px,480px)] gap-3 p-3 sm:p-4 lg:gap-4">
    <section class="auth-story relative hidden min-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl border border-[var(--fp-border)] bg-[var(--fp-stage)] p-8 lg:flex lg:flex-col lg:justify-between xl:p-12">
      <div class="relative z-10 flex items-center gap-3">
        <div class="brand-mark fp-btn-primary flex size-10 items-center justify-center rounded-xl text-sm font-extrabold text-white">FC</div>
        <div>
          <p class="fp-font-display text-sm font-bold tracking-tight text-[var(--fp-text-primary)]">Friends Chat</p>
          <p class="text-xs text-[var(--fp-text-muted)]">Your people, in one place</p>
        </div>
      </div>

      <div class="auth-story-copy relative z-10 max-w-2xl py-12">
        <div class="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--fp-border)] bg-[var(--fp-stage-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--fp-text-secondary)]">
          <Radio class="size-3.5 text-emerald-500" aria-hidden="true" />
          Real-time, room by room
        </div>
        <h1 class="fp-font-display max-w-2xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--fp-text-primary)] xl:text-6xl">
          Good conversations deserve a <span class="text-[var(--fp-accent-bright)]">better space.</span>
        </h1>
        <p class="mt-5 max-w-lg text-base leading-7 text-[var(--fp-text-secondary)]">
          Catch up in your channels, pick up a one-to-one chat, and stay close to the people who make your day.
        </p>
      </div>

      <div class="auth-preview relative z-10 grid grid-cols-2 gap-3 xl:max-w-2xl">
        <div class="rounded-xl border border-[var(--fp-border)] bg-[var(--fp-drawer)] p-4">
          <div class="mb-4 flex items-center justify-between">
            <p class="text-xs font-semibold text-[var(--fp-text-primary)]">Your spaces</p>
            <span class="rounded-md bg-[var(--fp-hover)] px-2 py-1 text-[10px] text-[var(--fp-text-muted)]">3 channels</span>
          </div>
          <div class="space-y-2 text-xs">
            <div class="flex items-center gap-2 rounded-lg bg-[var(--fp-active)] px-2.5 py-2 font-semibold text-[var(--fp-text-primary)]"><span class="font-mono text-[var(--fp-accent-bright)]">#</span> general</div>
            <div class="flex items-center gap-2 px-2.5 py-1.5 text-[var(--fp-text-secondary)]"><span class="font-mono">#</span> weekend-plans</div>
            <div class="flex items-center gap-2 px-2.5 py-1.5 text-[var(--fp-text-secondary)]"><span class="font-mono">#</span> good-music</div>
          </div>
        </div>
        <div class="flex flex-col justify-between rounded-xl border border-[var(--fp-border)] bg-[var(--fp-drawer)] p-4">
          <div class="flex items-center gap-2 text-xs font-semibold text-[var(--fp-text-primary)]"><UsersRound class="size-4 text-[var(--fp-accent-bright)]" aria-hidden="true" /> Around right now</div>
          <div class="space-y-3 py-4">
            <div v-for="(person, index) in [{ name: 'Alice Nguyen', color: '#e11d48' }, { name: 'Minh Tran', color: '#0891b2' }, { name: 'Khoa Le', color: '#ea580c' }]" :key="person.name" class="flex items-center gap-2.5">
              <span class="relative flex size-7 items-center justify-center rounded-lg text-[10px] font-bold text-white" :style="{ backgroundColor: person.color }">{{ person.name.split(' ').map(part => part[0]).join('') }}<i v-if="index < 2" class="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-[var(--fp-drawer)] bg-emerald-500" /></span>
              <span class="text-xs text-[var(--fp-text-secondary)]">{{ person.name }}</span>
              <span v-if="index === 0" class="ml-auto text-[10px] text-emerald-500">active</span>
            </div>
          </div>
          <div class="flex items-center gap-2 border-t border-[var(--fp-border)] pt-3 text-[11px] text-[var(--fp-text-muted)]"><MessageCircle class="size-3.5" aria-hidden="true" /> Start a conversation anytime</div>
        </div>
      </div>
      <p class="relative z-10 mt-8 text-[11px] text-[var(--fp-text-muted)]">A little less noise. A lot more connection.</p>
    </section>

    <section class="flex min-h-[calc(100vh-1.5rem)] flex-col justify-center rounded-2xl border border-[var(--fp-border)] bg-[var(--fp-stage)] px-5 py-10 sm:px-10 lg:min-h-[calc(100vh-2rem)] lg:px-12">
      <div class="mx-auto w-full max-w-[380px]">
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <div class="brand-mark fp-btn-primary flex size-10 items-center justify-center rounded-xl text-sm font-extrabold text-white">FC</div>
          <div>
            <p class="fp-font-display text-sm font-bold text-[var(--fp-text-primary)]">Friends Chat</p>
            <p class="text-xs text-[var(--fp-text-muted)]">Your people, in one place</p>
          </div>
        </div>

        <div class="mb-8">
          <p class="mb-2 text-xs font-semibold text-[var(--fp-accent-bright)]">{{ isSignUp ? 'YOUR PEOPLE ARE HERE' : 'WELCOME BACK' }}</p>
          <h2 class="fp-font-display text-3xl font-semibold tracking-tight text-[var(--fp-text-primary)]">{{ isSignUp ? 'Make yourself at home.' : 'Pick up where you left off.' }}</h2>
          <p class="mt-2 text-sm leading-6 text-[var(--fp-text-secondary)]">{{ isSignUp ? 'Create an account to join the conversation.' : 'Sign in to catch up with your friends.' }}</p>
        </div>

        <div role="tablist" aria-label="Account access" class="mb-6 grid grid-cols-2 rounded-lg border border-[var(--fp-border)] bg-[var(--fp-input-bg)] p-1">
          <button id="signin-tab" type="button" role="tab" :aria-selected="!isSignUp" class="rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fp-accent)]" :class="!isSignUp ? 'bg-[var(--fp-stage-subtle)] text-[var(--fp-text-primary)] shadow-sm' : 'text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)]'" @click="setMode(false)">Sign in</button>
          <button id="signup-tab" type="button" role="tab" :aria-selected="isSignUp" class="rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fp-accent)]" :class="isSignUp ? 'bg-[var(--fp-stage-subtle)] text-[var(--fp-text-primary)] shadow-sm' : 'text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)]'" @click="setMode(true)">Create account</button>
        </div>

        <div v-if="errorMsg" role="alert" class="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">{{ errorMsg }}</div>
        <div v-if="infoMsg" role="status" class="mb-4 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-700 dark:text-indigo-300">{{ infoMsg }}</div>

        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div v-if="isSignUp" class="space-y-1.5">
            <label for="display-name" class="block text-sm font-medium text-[var(--fp-text-primary)]">Display name</label>
            <Input id="display-name" v-model="displayName" autocomplete="nickname" type="text" required maxlength="40" placeholder="e.g. Alice" class="h-11 rounded-lg border-[var(--fp-border-strong)] bg-[var(--fp-input-bg)] text-sm focus-visible:ring-indigo-500/30" />
          </div>
          <div class="space-y-1.5">
            <label for="email" class="block text-sm font-medium text-[var(--fp-text-primary)]">Email address</label>
            <Input id="email" v-model="email" autocomplete="email" type="email" required placeholder="you@example.com" class="h-11 rounded-lg border-[var(--fp-border-strong)] bg-[var(--fp-input-bg)] text-sm focus-visible:ring-indigo-500/30" />
          </div>
          <div class="space-y-1.5">
            <label for="password" class="block text-sm font-medium text-[var(--fp-text-primary)]">Password</label>
            <Input id="password" v-model="password" :autocomplete="isSignUp ? 'new-password' : 'current-password'" type="password" required minlength="6" placeholder="At least 6 characters" class="h-11 rounded-lg border-[var(--fp-border-strong)] bg-[var(--fp-input-bg)] text-sm focus-visible:ring-indigo-500/30" />
          </div>
          <Button type="submit" :disabled="isLoading" class="mt-2 h-11 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(79,70,229,0.2)] hover:bg-indigo-700 focus-visible:ring-indigo-500 disabled:opacity-60">
            <span v-if="isLoading" class="mr-2 size-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
            {{ isLoading ? 'One moment…' : isSignUp ? 'Create your account' : 'Sign in to Friends Chat' }}
          </Button>
        </form>

        <p class="mt-6 text-center text-xs leading-5 text-[var(--fp-text-muted)]">By continuing, you agree to keep the conversation kind and respectful.</p>
      </div>
      <p class="mt-auto pt-8 text-center text-[11px] text-[var(--fp-text-muted)]">Friends Chat <span aria-hidden="true">·</span> Made for your circle</p>
    </section>
  </main>
</template>

<style scoped>
.auth-story {
  background-image: radial-gradient(ellipse at 78% 16%, color-mix(in srgb, var(--fp-accent) 10%, transparent), transparent 42%);
}

.auth-story-copy h1 {
  text-wrap: balance;
}

@media (prefers-reduced-motion: no-preference) {
  .auth-preview > div {
    animation: settle-in 420ms ease-out both;
  }

  .auth-preview > div:nth-child(2) {
    animation-delay: 70ms;
  }

  @keyframes settle-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
</style>
