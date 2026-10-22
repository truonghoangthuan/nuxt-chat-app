<script setup lang="ts">
import { ref } from 'vue'
import type { E2eeStatus } from '~/composables/useE2ee'

const props = withDefaults(
  defineProps<{
    status: E2eeStatus
    error?: string | null
    isUnlocking?: boolean
  }>(),
  {
    error: null,
    isUnlocking: false,
  },
)

const emit = defineEmits<{
  (e: 'unlock', phrase: string): void
  (e: 'retryConfig'): void
  (e: 'logout'): void
  (e: 'retry-config'): void
}>()

const phrase = ref('')
const showPhrase = ref(false)

function handleUnlockSubmit() {
  const trimmed = phrase.value.trim()
  if (!trimmed || props.isUnlocking) return
  emit('unlock', phrase.value)
}

function handleRetryConfig() {
  emit('retryConfig')
  emit('retry-config')
}
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[var(--om-canvas)] min-h-0 w-full transition-colors">
    <!-- Ambient glow -->
    <div
      class="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[280px] rounded-full bg-indigo-500/10 blur-3xl"
      aria-hidden="true"
    ></div>

    <!-- Main Card -->
    <div class="relative w-full max-w-[420px] rounded-[16px] border border-[var(--om-border-strong)] bg-[var(--om-card)] p-8 shadow-2xl">
      <!-- Brand & Lock Icon Header -->
      <div class="flex flex-col items-center text-center mb-6">
        <div class="w-12 h-12 rounded-[12px] bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-[var(--om-accent-bright)] mb-3 text-xl font-bold shadow-xs">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 class="text-xl font-bold text-[var(--om-text-primary)] tracking-tight">
          End-to-End Encryption
        </h1>
        <p class="text-[13px] text-[var(--om-text-secondary)] mt-1.5 leading-relaxed">
          Messages in this workspace are protected with client-side zero-knowledge encryption.
        </p>
      </div>

      <!-- State: Loading -->
      <div v-if="status === 'loading'" class="py-8 flex flex-col items-center justify-center text-center space-y-3">
        <div class="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
        <p class="text-sm font-medium text-[var(--om-text-secondary)]">
          Verifying encryption key...
        </p>
      </div>

      <!-- State: Unconfigured -->
      <div v-else-if="status === 'unconfigured'" class="space-y-4">
        <div class="p-3.5 rounded-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs leading-relaxed">
          <span class="font-bold block mb-1">Encryption not configured</span>
          The server does not have an active E2EE configuration record (<code class="font-mono text-[11px]">public.e2ee_config</code>). Run the setup script to initialize the workspace master key.
        </div>
        <div class="flex items-center gap-3 pt-2">
          <button
            type="button"
            data-test="e2ee-retry-config"
            class="flex-1 py-2 px-4 rounded-[8px] bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-xs transition-all"
            @click="handleRetryConfig"
          >
            Retry Connection
          </button>
          <button
            type="button"
            class="py-2 px-4 rounded-[8px] border border-[var(--om-border)] text-xs font-semibold text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-hover)] cursor-pointer transition-colors"
            @click="emit('logout')"
          >
            Sign Out
          </button>
        </div>
      </div>

      <!-- State: Locked -->
      <div v-else-if="status === 'locked'" class="space-y-4">
        <!-- Error Alert -->
        <div
          v-if="error"
          class="p-3 rounded-[8px] text-xs font-medium bg-rose-500/10 border border-rose-500/25 text-rose-500"
        >
          {{ error }}
        </div>

        <form class="space-y-4" @submit.prevent="handleUnlockSubmit">
          <div>
            <label class="block text-xs font-semibold text-[var(--om-text-secondary)] mb-1.5">
              Workspace Secret Passphrase
            </label>
            <div class="relative">
              <input
                v-model="phrase"
                :type="showPhrase ? 'text' : 'password'"
                data-test="e2ee-phrase-input"
                required
                autocomplete="current-password"
                placeholder="Enter shared secret phrase..."
                class="w-full px-3.5 py-2 pr-10 text-sm rounded-[8px] bg-[var(--om-input-bg)] border border-[var(--om-border)] text-[var(--om-text-primary)] placeholder-[var(--om-text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 px-3 flex items-center text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)] cursor-pointer"
                :title="showPhrase ? 'Hide phrase' : 'Show phrase'"
                @click="showPhrase = !showPhrase"
              >
                <svg v-if="!showPhrase" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              </button>
            </div>
            <p class="text-[11px] text-[var(--om-text-muted)] font-mono mt-1.5">
              PBKDF2-HMAC-SHA256 (600,000 iterations). Client-side only.
            </p>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button
              type="submit"
              :disabled="isUnlocking || !phrase.trim()"
              class="flex-1 py-2 px-4 rounded-[8px] bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              <span v-if="isUnlocking" class="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
              <span>{{ isUnlocking ? 'Unlocking...' : 'Unlock Chat' }}</span>
            </button>
            <button
              type="button"
              class="py-2 px-4 rounded-[8px] border border-[var(--om-border)] text-xs font-semibold text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-hover)] cursor-pointer transition-colors"
              @click="emit('logout')"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
