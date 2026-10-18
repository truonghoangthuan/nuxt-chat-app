<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchQuery.value = ''
    }
  },
)

const onlineSet = computed(() => {
  return new Set((props.onlineFriends || []).map(f => f.id))
})

const filteredFriends = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return (props.friends || [])
    .filter(f => !props.currentUserId || f.id !== props.currentUserId)
    .filter(f => !q || f.display_name.toLowerCase().includes(q))
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-base font-bold text-slate-900 dark:text-white">
          New Direct Message
        </h3>
        <button
          type="button"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xl font-bold leading-none"
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
          class="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />

        <p v-if="errorMessage" class="text-xs text-rose-500 font-medium">
          {{ errorMessage }}
        </p>

        <div class="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          <div
            v-if="filteredFriends.length === 0"
            class="py-6 text-center text-xs text-slate-500 dark:text-slate-400 italic"
          >
            No matching friends found
          </div>

          <button
            v-for="friend in filteredFriends"
            :key="friend.id"
            type="button"
            :data-test="`start-dm-friend-${friend.id}`"
            class="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors rounded-lg text-left cursor-pointer"
            @click="emit('selectFriend', friend.id)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UserAvatar
                :display-name="friend.display_name"
                :avatar-color="friend.avatar_color"
                :show-online="onlineSet.has(friend.id)"
                size="sm"
              />
              <div class="truncate">
                <div class="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {{ friend.display_name }}
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                  {{ onlineSet.has(friend.id) ? 'Online' : 'Offline' }}
                </div>
              </div>
            </div>

            <span class="text-xs font-medium text-sky-600 dark:text-sky-400 shrink-0">
              Message →
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
