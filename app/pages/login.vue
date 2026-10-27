<script setup lang="ts">
import { ref } from 'vue'
import { MessageCircle, Radio, UsersRound } from '@lucide/vue'
import Button from '~/components/ui/Button.vue'
import Input from '~/components/ui/Input.vue'
import { useAuthProfile } from '~/composables/useAuthProfile'
import { safeAuthRedirectPath } from '~/utils/authRedirect'

const { signInWithPassword, signUpWithProfile } = useAuthProfile()
const redirectInfo = useSupabaseCookieRedirect()

async function redirectAfterAuth() {
  return await navigateTo(safeAuthRedirectPath(redirectInfo.pluck()))
}

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
        await redirectAfterAuth()
      }
    } else {
      const res = await signInWithPassword(email.value, password.value)
      if (res.error) {
        errorMsg.value = res.error
      } else {
        await redirectAfterAuth()
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
  <main class="auth-shell min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(390px,460px)] gap-3 p-3 sm:p-4 lg:gap-4 bg-[var(--ap-canvas)]">
    <!-- Left Hero Section (Cupertino Frosted Showcase) -->
    <section class="auth-story relative hidden min-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl border border-[var(--ap-glass-border)] bg-[var(--ap-stage)] backdrop-blur-2xl p-8 lg:flex lg:flex-col lg:justify-between xl:p-12 shadow-xl">
      <div class="relative z-10 flex items-center gap-3">
        <div class="brand-mark flex size-10 items-center justify-center rounded-xl bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-500/30">FC</div>
        <div>
          <p class="text-sm font-semibold tracking-tight text-[var(--ap-text-primary)]">Friends Chat</p>
          <p class="text-xs text-[var(--ap-text-muted)]">Cupertino Fluid Messenger</p>
        </div>
      </div>

      <div class="auth-story-copy relative z-10 max-w-2xl py-12">
        <div class="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--ap-glass-border)] bg-[var(--ap-glass)] backdrop-blur-md px-3 py-1 text-xs font-medium text-[var(--ap-text-secondary)]">
          <Radio class="size-3 text-emerald-400" aria-hidden="true" />
          <span>Real-time presence & zero-knowledge E2EE</span>
        </div>
        <h1 class="max-w-2xl text-4xl font-semibold leading-[1.12] tracking-tight text-[var(--ap-text-primary)] xl:text-5xl">
          Good conversations deserve a <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">better space.</span>
        </h1>
        <p class="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--ap-text-secondary)]">
          Catch up in topic channels, pick up an encrypted direct message, and stay effortlessly connected with fluid glass physics.
        </p>
      </div>

      <div class="auth-preview relative z-10 grid grid-cols-2 gap-3 xl:max-w-2xl">
        <div class="rounded-2xl border border-[var(--ap-glass-border)] bg-[var(--ap-glass)] backdrop-blur-md p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-xs font-semibold text-[var(--ap-text-primary)]">Your spaces</p>
            <span class="rounded-full bg-[var(--ap-glass)] border border-[var(--ap-glass-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--ap-text-muted)]">3 channels</span>
          </div>
          <div class="space-y-1.5 text-xs">
            <div class="flex items-center gap-2 rounded-xl bg-blue-600/30 border border-blue-500/30 px-2.5 py-1.5 font-medium text-white"><span class="font-mono text-blue-300">#</span> general</div>
            <div class="flex items-center gap-2 px-2.5 py-1 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors"><span class="font-mono text-[var(--ap-text-muted)]">#</span> weekend-plans</div>
            <div class="flex items-center gap-2 px-2.5 py-1 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors"><span class="font-mono text-[var(--ap-text-muted)]">#</span> good-music</div>
          </div>
        </div>
        <div class="flex flex-col justify-between rounded-2xl border border-[var(--ap-glass-border)] bg-[var(--ap-glass)] backdrop-blur-md p-4 shadow-sm">
          <div class="flex items-center gap-2 text-xs font-semibold text-[var(--ap-text-primary)]"><UsersRound class="size-3.5 text-blue-400" aria-hidden="true" /> Around right now</div>
          <div class="space-y-2.5 py-3">
            <div v-for="(person, index) in [{ name: 'Alice Nguyen', color: '#e11d48' }, { name: 'Minh Tran', color: '#0891b2' }, { name: 'Khoa Le', color: '#ea580c' }]" :key="person.name" class="flex items-center gap-2.5">
              <span class="relative flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs" :style="{ backgroundColor: person.color }">{{ person.name.split(' ').map(part => part[0]).join('') }}<i v-if="index < 2" class="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full border border-black bg-emerald-400" /></span>
              <span class="text-xs text-[var(--ap-text-secondary)]">{{ person.name }}</span>
              <span v-if="index === 0" class="ml-auto text-[10px] text-emerald-400 font-mono">active</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 border-t border-[var(--ap-glass-border)] pt-2.5 text-[11px] text-[var(--ap-text-muted)]"><MessageCircle class="size-3 text-blue-400" aria-hidden="true" /> Start a conversation anytime</div>
        </div>
      </div>
      <p class="relative z-10 mt-6 text-[11px] text-[var(--ap-text-muted)]">Apple Fluid System · Zero-knowledge AES-256-GCM</p>
    </section>

    <!-- Right Auth Form Card -->
    <section class="flex min-h-[calc(100vh-1.5rem)] flex-col justify-center rounded-2xl border border-[var(--ap-glass-border)] bg-[var(--ap-stage)] backdrop-blur-2xl px-5 py-8 sm:px-10 lg:min-h-[calc(100vh-2rem)] lg:px-10 shadow-xl">
      <div class="mx-auto w-full max-w-[360px]">
        <div class="mb-6 flex items-center gap-3 lg:hidden">
          <div class="brand-mark flex size-9 items-center justify-center rounded-xl bg-blue-500 text-xs font-bold text-white shadow-md shadow-blue-500/30">FC</div>
          <div>
            <p class="text-sm font-semibold text-[var(--ap-text-primary)]">Friends Chat</p>
            <p class="text-xs text-[var(--ap-text-muted)]">Your people, in one place</p>
          </div>
        </div>

        <div class="mb-6">
          <p class="mb-1 text-[11px] font-semibold tracking-wider uppercase text-blue-400">{{ isSignUp ? 'YOUR PEOPLE ARE HERE' : 'WELCOME BACK' }}</p>
          <h2 class="text-2xl font-bold tracking-tight text-[var(--ap-text-primary)]">{{ isSignUp ? 'Make yourself at home.' : 'Pick up where you left off.' }}</h2>
          <p class="mt-1.5 text-xs text-[var(--ap-text-secondary)]">{{ isSignUp ? 'Create an account to join the conversation.' : 'Sign in to catch up with your friends.' }}</p>
        </div>

        <div role="tablist" aria-label="Account access" class="mb-5 grid grid-cols-2 rounded-full border border-[var(--ap-glass-border)] bg-[var(--ap-glass)] p-1 backdrop-blur-md">
          <button id="signin-tab" type="button" role="tab" :aria-selected="!isSignUp" class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none cursor-pointer" :class="!isSignUp ? 'bg-[var(--ap-stage)] text-[var(--ap-text-primary)] shadow-xs' : 'text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)]'" @click="setMode(false)">Sign in</button>
          <button id="signup-tab" type="button" role="tab" :aria-selected="isSignUp" class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none cursor-pointer" :class="isSignUp ? 'bg-[var(--ap-stage)] text-[var(--ap-text-primary)] shadow-xs' : 'text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)]'" @click="setMode(true)">Create account</button>
        </div>

        <div v-if="errorMsg" role="alert" class="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-400 backdrop-blur-md">{{ errorMsg }}</div>
        <div v-if="infoMsg" role="status" class="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-xs text-blue-300 backdrop-blur-md">{{ infoMsg }}</div>

        <form class="space-y-3.5" @submit.prevent="handleSubmit">
          <div v-if="isSignUp" class="space-y-1">
            <label for="display-name" class="block text-xs font-semibold text-[var(--ap-text-secondary)]">Display name</label>
            <Input id="display-name" v-model="displayName" autocomplete="nickname" type="text" required maxlength="40" placeholder="e.g. Alice" class="h-10 rounded-xl border-[var(--ap-glass-border)] bg-[var(--ap-glass)] text-sm text-[var(--ap-text-primary)] placeholder:text-[var(--ap-text-muted)] focus-visible:ring-blue-500/30" />
          </div>
          <div class="space-y-1">
            <label for="email" class="block text-xs font-semibold text-[var(--ap-text-secondary)]">Email address</label>
            <Input id="email" v-model="email" autocomplete="email" type="email" required placeholder="you@example.com" class="h-10 rounded-xl border-[var(--ap-glass-border)] bg-[var(--ap-glass)] text-sm text-[var(--ap-text-primary)] placeholder:text-[var(--ap-text-muted)] focus-visible:ring-blue-500/30" />
          </div>
          <div class="space-y-1">
            <label for="password" class="block text-xs font-semibold text-[var(--ap-text-secondary)]">Password</label>
            <Input id="password" v-model="password" :autocomplete="isSignUp ? 'new-password' : 'current-password'" type="password" required minlength="6" placeholder="At least 6 characters" class="h-10 rounded-xl border-[var(--ap-glass-border)] bg-[var(--ap-glass)] text-sm text-[var(--ap-text-primary)] placeholder:text-[var(--ap-text-muted)] focus-visible:ring-blue-500/30" />
          </div>
          <Button type="submit" :disabled="isLoading" class="mt-2 h-10 w-full rounded-full bg-blue-500 hover:bg-blue-600 text-xs font-semibold text-white shadow-md shadow-blue-500/30 focus-visible:ring-blue-500 disabled:opacity-50 cursor-pointer transition-all active:scale-95">
            <span v-if="isLoading" class="mr-2 size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
            {{ isLoading ? 'One moment…' : isSignUp ? 'Create your account' : 'Sign in to Friends Chat' }}
          </Button>
        </form>

        <p class="mt-5 text-center text-[11px] leading-relaxed text-[var(--ap-text-muted)]">By continuing, you agree to keep the conversation kind and respectful.</p>
      </div>
      <p class="mt-auto pt-6 text-center text-[11px] text-[var(--ap-text-muted)]">Friends Chat <span aria-hidden="true">·</span> Apple Fluid System</p>
    </section>
  </main>
</template>

<style scoped>
.auth-story {
  background-image: radial-gradient(ellipse at 78% 16%, rgba(0, 122, 255, 0.15), transparent 45%);
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
