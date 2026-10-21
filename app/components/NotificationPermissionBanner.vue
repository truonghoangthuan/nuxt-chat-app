<script setup lang="ts">
import { ref, computed } from 'vue'
import { Bell, X } from '@lucide/vue'

const props = defineProps<{
  permission: NotificationPermission
}>()

const emit = defineEmits<{
  (e: 'requestPermission'): void
  (e: 'dismiss'): void
}>()

const isDismissed = ref(false)

const isVisible = computed(() => {
  return props.permission === 'default' && !isDismissed.value
})

function handleEnable() {
  emit('requestPermission')
}

function handleDismiss() {
  isDismissed.value = true
  emit('dismiss')
}
</script>

<template>
  <aside
    v-if="isVisible"
    data-test="notification-permission-banner"
    aria-label="Desktop Notifications Permission"
    class="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs font-medium bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/25 text-amber-900 dark:text-amber-200"
  >
    <div class="flex items-center gap-2.5 min-w-0">
      <span class="flex items-center justify-center size-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
        <Bell class="size-3.5" aria-hidden="true" />
      </span>
      <span class="truncate">
        Enable desktop notifications to receive alerts when friends message you.
      </span>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        data-test="enable-notifications-banner-btn"
        class="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-stone-900 font-semibold transition-colors cursor-pointer"
        @click="handleEnable"
      >
        Enable notifications
      </button>

      <button
        type="button"
        data-test="dismiss-banner-btn"
        aria-label="Dismiss notification prompt"
        class="p-1 rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
        @click="handleDismiss"
      >
        <X class="size-3.5" aria-hidden="true" />
      </button>
    </div>
  </aside>
</template>
