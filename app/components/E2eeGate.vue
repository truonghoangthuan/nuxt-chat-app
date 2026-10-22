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
  <div class="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[var(--ap-canvas)] min-h-0 w-full transition-colors">
    <!-- Ambient glow -->
    <div
      class="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[540px] h-[320px] rounded-full bg-blue-500/12 blur-3xl"
      aria-hidden="true"
    ></div>

    <!-- Main Cupertino Card -->
    <div class="relative w-full max-w-[440px] rounded-3xl border border-[var(--ap-glass-border)] bg-[var(--ap-stage)] backdrop-blur-2xl p-8 shadow-2xl">
      <!-- Brand & Lock Icon Header -->
      <div class="flex flex-col items-center text-center mb-6">
        <div class="relative mb-4 flex items-center justify-center">
          <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-400 p-0.5 shadow-[0_0_30px_rgba(168,85,247,0.35)] animate-pulse">
            <div class="w-full h-full bg-[#161824] rounded-full flex items-center justify-center text-white/90">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </div>

        <h1 class="text-xl font-bold text-white/95 tracking-tight">
          End-to-End Encryption
        </h1>
        <p class="text-[13px] text-white/60 mt-1.5 leading-relaxed">
          Messages in this workspace are protected with client-side zero-knowledge AES-256-GCM encryption.
        </p>
      </div>

      <!-- State: Loading -->
      <div v-if="status === 'loading'" class="py-8 flex flex-col items-center justify-center text-center space-y-3">
        <div class="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
        <p class="text-sm font-medium text-white/70">
          Verifying encryption key...
        </p>
      </div>

      <!-- State: Unconfigured -->
      <div v-else-if="status === 'unconfigured'" class="space-y-4">
        <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed backdrop-blur-md">
          <span class="font-bold block mb-1">Encryption not configured</span>
          The server does not have an active E2EE configuration record (<code class="font-mono text-[11px] bg-black/30 px-1.5 py-0.5 rounded">public.e2ee_config</code>). Run the setup script to initialize the workspace master key.
        </div>
        <div class="flex items-center gap-3 pt-2">
          <button
            type="button"
            data-test="e2ee-retry-config"
            class="flex-1 py-2.5 px-4 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer shadow-md shadow-blue-500/30 transition-all active:scale-95"
            @click="handleRetryConfig"
          >
            Retry Connection
          </button>
          <button
            type="button"
            class="py-2.5 px-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 hover:text-white cursor-pointer transition-colors"
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
          class="p-3 rounded-xl text-xs font-medium bg-rose-500/10 border border-rose-500/25 text-rose-400 backdrop-blur-md"
        >
          {{ error }}
        </div>

        <form class="space-y-4" @submit.prevent="handleUnlockSubmit">
          <div>
            <label class="block text-xs font-semibold text-white/70 mb-1.5">
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
                class="w-full h-10 px-4 pr-10 text-xs rounded-full bg-white/8 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
              <button
                type="button"
                class="absolute inset-y-0 right-0 px-3.5 flex items-center text-white/40 hover:text-white cursor-pointer"
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
            <p class="text-[11px] text-white/40 font-mono mt-1.5 pl-2">
              PBKDF2-HMAC-SHA256 (600,000 iterations). Client-side only.
            </p>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button
              type="submit"
              :disabled="isUnlocking || !phrase.trim()"
              class="flex-1 h-10 px-4 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer shadow-md shadow-blue-500/30 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span v-if="isUnlocking" class="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
              <span>{{ isUnlocking ? 'Unlocking...' : 'Unlock Chat' }}</span>
            </button>
            <button
              type="button"
              class="h-10 px-5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 hover:text-white cursor-pointer transition-colors"
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
