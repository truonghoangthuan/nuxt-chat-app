<script setup lang="ts">
import type { Channel, Profile, ConnectionStatus } from '~/types/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = defineProps<{
  channels: Channel[]
  activeChannelId: string | null
  unreadCounts: Record<string, number>
  onlineFriends: Profile[]
  currentUser: Profile | null
  isDark: boolean
  connectionStatus: ConnectionStatus
  isOpenMobile: boolean
}>()

const emit = defineEmits<{
  (e: 'selectChannel', channelId: string): void
  (e: 'openCreateChannel'): void
  (e: 'openProfileSettings'): void
  (e: 'toggleTheme'): void
  (e: 'logout'): void
  (e: 'closeMobile'): void
}>()


function onChannelClick(channelId: string) {
  emit('selectChannel', channelId)
  emit('closeMobile')
}
</script>

<template>
  <div>
    <!-- Mobile Backdrop -->
    <div
      v-if="isOpenMobile"
      class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
      @click="emit('closeMobile')"
    ></div>

    <!-- Sidebar Container -->
    <aside
      class="fixed inset-y-0 left-0 z-40 w-64 md:w-72 flex flex-col bg-slate-900 text-slate-300 border-r border-slate-800 transition-transform duration-200 ease-in-out md:static md:translate-x-0"
      :class="isOpenMobile ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- App Header -->
      <div class="h-14 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div class="flex items-center gap-2 font-bold text-white tracking-wide">
          <div class="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center text-white text-xs font-black shadow-sm">
            FC
          </div>
          <span>Friends Chat</span>
          <!-- Connection Indicator -->
          <span
            class="w-2 h-2 rounded-full inline-block ml-1"
            :class="connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'"
            :title="`Status: ${connectionStatus}`"
          ></span>
        </div>

        <button
          type="button"
          class="md:hidden text-slate-400 hover:text-white p-1 text-xl font-bold"
          @click="emit('closeMobile')"
        >
          ×
        </button>
      </div>

      <!-- Scrollable Navigation (Channels + Friends) -->
      <div class="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <!-- Channels Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Channels</span>
            <button
              type="button"
              class="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium transition-colors"
              @click="emit('openCreateChannel')"
            >
              + New
            </button>
          </div>

          <div class="space-y-0.5">
            <button
              v-for="ch in channels"
              :key="ch.id"
              type="button"
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all group"
              :class="activeChannelId === ch.id ? 'bg-sky-600/20 text-white font-semibold' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'"
              @click="onChannelClick(ch.id)"
            >
              <div class="flex items-center gap-2 truncate">
                <span class="text-slate-500 font-mono text-base">#</span>
                <span class="truncate">{{ ch.slug }}</span>
              </div>

              <!-- Unread badge -->
              <span
                v-if="(unreadCounts[ch.id] || 0) > 0"
                class="px-1.5 py-0.5 rounded-full text-xs font-bold bg-sky-500 text-white min-w-5 text-center shadow-sm"
              >
                {{ unreadCounts[ch.id] }}
              </span>
            </button>
          </div>
        </div>

        <!-- Online Friends Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Online Friends</span>
            <span class="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
              {{ onlineFriends.length }}
            </span>
          </div>

          <div v-if="onlineFriends.length === 0" class="px-2 py-3 text-xs text-slate-500 italic">
            No other friends currently online
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="friend in onlineFriends"
              :key="friend.id"
              class="flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition-colors"
            >
              <UserAvatar
                :display-name="friend.display_name"
                :avatar-color="friend.avatar_color"
                :show-online="true"
                size="sm"
              />
              <span class="truncate">
                {{ friend.display_name }}
                <span v-if="currentUser && friend.id === currentUser.id" class="text-slate-500 text-[10px] ml-1">(you)</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- User Profile & Settings Footer -->
      <div class="p-3 border-t border-slate-800 bg-slate-900/90 shrink-0 flex items-center justify-between">
        <div class="flex items-center gap-2.5 min-w-0">
          <UserAvatar
            :display-name="currentUser?.display_name || 'You'"
            :avatar-color="currentUser?.avatar_color"
            :show-online="true"
            size="sm"
          />
          <div class="truncate">
            <div class="text-xs font-semibold text-white truncate">
              {{ currentUser?.display_name || 'Guest' }}
            </div>
            <div class="text-[10px] text-slate-500 truncate">Online</div>
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <!-- Profile Settings -->
          <button
            type="button"
            data-test="open-profile-settings"
            class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Profile Settings"
            @click="emit('openProfileSettings')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
          </button>

          <!-- Theme Toggle -->
          <button
            type="button"
            class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            @click="emit('toggleTheme')"
          >
            <span v-if="isDark" class="text-sm">☀️</span>
            <span v-else class="text-sm">🌙</span>
          </button>

          <!-- Logout -->
          <button
            type="button"
            class="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
            title="Log Out"
            @click="emit('logout')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>
