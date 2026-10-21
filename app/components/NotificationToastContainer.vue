<script setup lang="ts">
import { X } from '@lucide/vue'
import type { NotificationToastItem } from '~/types/notification'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    toasts?: NotificationToastItem[]
  }>(),
  {
    toasts: () => [],
  },
)

const emit = defineEmits<{
  (e: 'navigate', conversationId: string): void
  (e: 'dismiss', id: string): void
}>()

function handleClick(toast: NotificationToastItem) {
  emit('navigate', toast.conversationId)
  emit('dismiss', toast.id)
}
</script>

<template>
  <div
    v-if="toasts && toasts.length > 0"
    class="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    role="region"
    aria-live="polite"
    aria-label="Notifications"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      data-test="notification-toast"
      role="button"
      tabindex="0"
      class="pointer-events-auto flex items-start gap-3 p-3 rounded-[14px] border border-[var(--fp-border)] bg-[var(--fp-surface-strong)]/95 backdrop-blur-md shadow-xl hover:border-[var(--fp-accent-bright)] transition-all cursor-pointer group animate-in fade-in slide-in-from-top-2 duration-200"
      @click="handleClick(toast)"
      @keydown.enter="handleClick(toast)"
    >
      <UserAvatar
        :display-name="toast.title"
        :avatar-color="toast.avatarColor"
        :avatar-url="toast.avatarUrl"
        size="sm"
        class="shrink-0 mt-0.5"
      />

      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-1">
          <div class="text-xs font-semibold text-[var(--fp-text-primary)] truncate">
            {{ toast.title }}
          </div>
          <button
            type="button"
            data-test="toast-close-btn"
            class="text-[var(--fp-text-muted)] hover:text-[var(--fp-text-primary)] p-0.5 rounded hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
            aria-label="Dismiss notification"
            @click.stop="emit('dismiss', toast.id)"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <p class="text-xs text-[var(--fp-text-secondary)] line-clamp-2 mt-0.5 break-words">
          {{ toast.snippet }}
        </p>
      </div>
    </div>
  </div>
</template>
