<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Profile } from '~/types/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    friends: Profile[]
    onlineFriends?: Profile[]
    currentUserId?: string | null
    errorMessage?: string | null
  }>(),
  {
    onlineFriends: () => [],
    currentUserId: null,
    errorMessage: null,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectFriend', userId: string): void
}>()

const searchQuery = ref('')
const isSubmitting = ref(false)

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = ''
      isSubmitting.value = false
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

let submitTimeout: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => {
  if (submitTimeout) {
    clearTimeout(submitTimeout)
    submitTimeout = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})

const onlineSet = computed(() => {
  return new Set((props.onlineFriends || []).map(f => f.id))
})

const filteredFriends = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return (props.friends || [])
    .filter(f => !props.currentUserId || f.id !== props.currentUserId)
    .filter(f => !q || f.display_name.toLowerCase().includes(q))
})

function handleSelect(friendId: string) {
  if (isSubmitting.value) return
  isSubmitting.value = true
  emit('selectFriend', friendId)
  if (submitTimeout) clearTimeout(submitTimeout)
  submitTimeout = setTimeout(() => {
    isSubmitting.value = false
    submitTimeout = null
  }, 1000)
}

function handleSearchEnter() {
  if (filteredFriends.value.length > 0) {
    handleSelect(filteredFriends.value[0].id)
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md fp-stage-surface rounded-[14px] border border-[var(--fp-border)] overflow-hidden">
      <div class="px-5 py-4 border-b border-[var(--fp-border)] flex items-center justify-between">
        <h3 class="fp-font-display text-[16px] font-bold text-[var(--fp-text-primary)]">
          New Direct Message
        </h3>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] text-lg font-bold flex items-center justify-center cursor-pointer"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <div class="p-4 space-y-3">
        <input
          v-model="searchQuery"
          type="text"
          data-test="dm-search-input"
          placeholder="Search friends by name..."
          class="w-full px-3.5 py-2 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[14.5px] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
          @keydown.enter.prevent="handleSearchEnter"
        />

        <p v-if="errorMessage" class="text-xs text-rose-500 font-medium">
          {{ errorMessage }}
        </p>

        <div class="max-h-64 overflow-y-auto space-y-1">
          <div
            v-if="filteredFriends.length === 0"
            class="py-6 text-center text-xs text-[var(--fp-text-muted)] italic"
          >
            No matching friends found
          </div>

          <button
            v-for="friend in filteredFriends"
            :key="friend.id"
            type="button"
            :data-test="`start-dm-friend-${friend.id}`"
            :disabled="isSubmitting"
            class="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--fp-hover)] transition-colors rounded-[8px] text-left cursor-pointer disabled:opacity-50 group"
            @click="handleSelect(friend.id)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UserAvatar
                :display-name="friend.display_name"
                :avatar-color="friend.avatar_color"
                :show-online="onlineSet.has(friend.id)"
                size="sm"
              />
              <div class="truncate">
                <div class="text-sm font-semibold text-[var(--fp-text-primary)] truncate">
                  {{ friend.display_name }}
                </div>
                <div class="text-[11px] text-[var(--fp-text-secondary)]">
                  {{ onlineSet.has(friend.id) ? 'Online' : 'Offline' }}
                </div>
              </div>
            </div>

            <span class="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/15 text-[var(--fp-accent-bright)] group-hover:bg-indigo-500 group-hover:text-white transition-colors shrink-0">
              Message
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
