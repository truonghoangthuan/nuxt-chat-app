<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import type { Profile } from '~/types/chat'
import UserAvatar from '~/components/UserAvatar.vue'
import { X, Copy, Check, MessageSquare } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    profile: Profile | null
    isOnline?: boolean
    isCurrentUser?: boolean
  }>(),
  {
    isOnline: false,
    isCurrentUser: false,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'startDm', userId: string): void
}>()

const copiedEmail = ref(false)
const copiedId = ref(false)

async function copyText(text: string, type: 'email' | 'id') {
  if (!text) return
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'email') {
        copiedEmail.value = true
        setTimeout(() => { copiedEmail.value = false }, 2000)
      } else {
        copiedId.value = true
        setTimeout(() => { copiedId.value = false }, 2000)
      }
    } catch {
      // ignore
    }
  }
}

function handleStartDm() {
  if (props.profile?.id) {
    emit('startDm', props.profile.id)
    emit('close')
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

function openQrInNewTab(url?: string | null) {
  if (url && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown)
      }
    } else {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})
</script>

<template>
  <div
    v-if="isOpen && profile"
    data-test="user-profile-modal"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    role="dialog"
    aria-modal="true"
    :aria-label="`Profile of ${profile.display_name}`"
  >
    <!-- Frosted Backdrop -->
    <div
      data-test="profile-modal-backdrop"
      class="fixed inset-0 bg-black/40 backdrop-blur-md transition-opacity"
      @click="emit('close')"
    ></div>

    <!-- Centered Card -->
    <div
      class="messenger-dialog-surface relative w-full max-w-sm rounded-3xl bg-white/95 dark:bg-[#161824]/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl p-6 overflow-hidden flex flex-col gap-5 z-10 transition-all text-[var(--ap-text-primary)]"
      @click.stop
    >
      <!-- Close Button -->
      <button
        type="button"
        data-test="close-profile-modal"
        aria-label="Close profile modal"
        class="absolute top-4 right-4 p-1.5 rounded-full text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"
        @click="emit('close')"
      >
        <X class="w-4 h-4" />
      </button>

      <!-- Profile Header (Avatar + Name + Status) -->
      <div class="flex flex-col items-center text-center gap-3.5 mt-2">
        <UserAvatar
          :display-name="profile.display_name"
          :avatar-color="profile.avatar_color"
          :avatar-url="profile.avatar_url"
          :show-online="isOnline"
          size="2xl"
          class="ring-4 ring-black/5 dark:ring-white/10 shadow-xl"
        />

        <div class="flex flex-col items-center gap-1">
          <h3 class="text-lg font-bold text-[var(--ap-text-primary)] tracking-tight">
            {{ profile.display_name }}
          </h3>
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors"
            :class="isOnline ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-[var(--ap-text-muted)]'"
          >
            <span
              class="w-1.5 h-1.5 rounded-full inline-block"
              :class="isOnline ? 'bg-emerald-500 shadow-[0_0_6px_#34c759]' : 'bg-black/30 dark:bg-white/30'"
            ></span>
            {{ isOnline ? 'Active now' : 'Offline' }}
          </span>
        </div>
      </div>

      <!-- Detail Fields -->
      <div class="flex flex-col gap-2.5 text-xs">
        <!-- Email Field -->
        <div class="p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 flex items-center justify-between gap-2">
          <div class="min-w-0 flex flex-col">
            <span class="text-[10.5px] uppercase font-mono tracking-wider text-[var(--ap-text-muted)]">Email</span>
            <span class="font-medium text-[var(--ap-text-primary)] truncate select-all">
              {{ profile.email || 'No email available' }}
            </span>
          </div>
          <button
            v-if="profile.email"
            type="button"
            data-test="copy-profile-email"
            :title="copiedEmail ? 'Copied' : 'Copy email'"
            class="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors cursor-pointer shrink-0"
            @click="copyText(profile.email, 'email')"
          >
            <Check v-if="copiedEmail" class="w-3.5 h-3.5 text-emerald-500" />
            <Copy v-else class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- User ID Field -->
        <div class="p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 flex items-center justify-between gap-2">
          <div class="min-w-0 flex flex-col">
            <span class="text-[10.5px] uppercase font-mono tracking-wider text-[var(--ap-text-muted)]">User ID</span>
            <span class="font-mono text-[11px] text-[var(--ap-text-secondary)] truncate select-all">
              {{ profile.id }}
            </span>
          </div>
          <button
            type="button"
            data-test="copy-profile-id"
            :title="copiedId ? 'Copied' : 'Copy user ID'"
            class="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors cursor-pointer shrink-0"
            @click="copyText(profile.id, 'id')"
          >
            <Check v-if="copiedId" class="w-3.5 h-3.5 text-emerald-500" />
            <Copy v-else class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Bank QR Code Field -->
        <div
          v-if="profile.bank_qr_url"
          data-test="user-bank-qr"
          class="p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 flex flex-col items-center gap-2"
        >
          <span class="text-[10.5px] uppercase font-mono tracking-wider text-[var(--ap-text-muted)] self-start">
            Bank QR Code
          </span>
          <div class="w-44 h-44 rounded-xl overflow-hidden bg-white p-2 shadow-xs border border-black/10 flex items-center justify-center">
            <img
              :src="profile.bank_qr_url"
              alt="Bank QR Code"
              class="w-full h-full object-contain cursor-pointer hover:scale-105 transition-transform"
              @click="openQrInNewTab(profile.bank_qr_url)"
            />
          </div>
          <span class="text-[10px] text-[var(--ap-text-muted)]">Click QR to open in full size</span>
        </div>
      </div>

      <!-- Action Button -->
      <button
        v-if="!isCurrentUser"
        type="button"
        data-test="start-dm-btn"
        class="w-full py-2.5 px-4 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer transition-colors active:scale-98"
        @click="handleStartDm"
      >
        <MessageSquare class="w-3.5 h-3.5" />
        <span>Send Direct Message</span>
      </button>
    </div>
  </div>
</template>
