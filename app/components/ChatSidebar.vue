<script setup lang="ts">
import type { Channel, Profile, ConnectionStatus } from '~/types/chat'
import { getDmPeerId } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    channels: Channel[]
    dmChannels?: Channel[]
    activeChannelId: string | null
    unreadCounts: Record<string, number>
    unreadMentions?: Record<string, number>
    onlineFriends: Profile[]
    currentUser: Profile | null
    isDark: boolean
    connectionStatus: ConnectionStatus
    isOpenMobile: boolean
  }>(),
  {
    dmChannels: () => [],
    unreadMentions: () => ({}),
  },
)

const emit = defineEmits<{
  (e: 'selectChannel', channelId: string): void
  (e: 'openCreateChannel'): void
  (e: 'openStartDm'): void
  (e: 'startDmWithUser', userId: string): void
  (e: 'openProfileSettings'): void
  (e: 'toggleTheme'): void
  (e: 'logout'): void
  (e: 'closeMobile'): void
}>()

function onChannelClick(channelId: string) {
  emit('selectChannel', channelId)
  emit('closeMobile')
}

function isPeerOnline(dm: Channel): boolean {
  const peerId = dm.peer?.id || (props.currentUser ? getDmPeerId(dm, props.currentUser.id) : null)
  if (!peerId) return false
  return props.onlineFriends.some(f => f.id === peerId)
}

function onOnlineFriendClick(friend: Profile) {
  if (props.currentUser && friend.id === props.currentUser.id) return
  emit('startDmWithUser', friend.id)
  emit('closeMobile')
}
</script>

<template>
  <div class="flex h-full shrink-0">
    <!-- Mobile Backdrop -->
    <div
      v-if="isOpenMobile"
      class="fixed inset-0 z-40 bg-black/65 backdrop-blur-xs md:hidden"
      @click="emit('closeMobile')"
    ></div>

    <!-- Desktop Precision Icon Rail (64px) -->
    <nav
      aria-label="Precision Rail"
      class="hidden md:flex w-16 h-full flex-col items-center justify-between py-3 bg-[var(--fp-rail)] rounded-[14px] border border-[var(--fp-border)] shadow-[var(--fp-specular)] shrink-0 mr-2.5"
    >
      <div class="flex flex-col items-center gap-2.5 w-full">
        <!-- Brand Cube -->
        <div
          class="fp-font-display w-10 h-10 rounded-[11px] fp-btn-primary flex items-center justify-center text-white text-sm font-extrabold tracking-tight select-none"
          title="Friends Studio"
        >
          FC
        </div>

        <div class="w-7 h-px bg-[var(--fp-border)] my-0.5"></div>

        <!-- Channels Workspace Active Indicator -->
        <button
          type="button"
          class="relative w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-500/15 text-[var(--fp-text-primary)] transition-colors cursor-pointer"
          title="Channels & Direct Messages"
        >
          <span class="absolute -left-3 w-[3px] h-5 rounded-r bg-indigo-500"></span>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
          </svg>
        </button>

        <!-- Quick Create Channel -->
        <button
          type="button"
          class="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
          title="Create Channel"
          @click="emit('openCreateChannel')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v8M8 12h8" />
          </svg>
        </button>

        <!-- Quick New Direct Message -->
        <button
          type="button"
          class="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
          title="New Direct Message"
          @click="emit('openStartDm')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>

      <!-- Rail Bottom Utilities -->
      <div class="flex flex-col items-center gap-2 w-full">
        <button
          type="button"
          class="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
          :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          @click="emit('toggleTheme')"
        >
          <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="4" />
            <path stroke-linecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </button>

        <button
          type="button"
          class="p-0.5 rounded-[9px] hover:ring-2 hover:ring-indigo-500/50 transition-all cursor-pointer"
          :title="currentUser?.display_name || 'Profile Settings'"
          @click="emit('openProfileSettings')"
        >
          <UserAvatar
            :display-name="currentUser?.display_name || 'You'"
            :avatar-color="currentUser?.avatar_color"
            :show-online="true"
            size="sm"
          />
        </button>
      </div>
    </nav>

    <!-- Channel & Presence Tree Drawer -->
    <aside
      aria-label="Channel and Friends Directory"
      class="fixed inset-y-0 left-0 z-40 w-64 md:w-[248px] flex flex-col bg-[var(--fp-drawer)] text-[var(--fp-text-secondary)] border-r md:border border-[var(--fp-border)] md:rounded-[14px] shadow-[var(--fp-specular)] transition-transform duration-200 ease-in-out md:static md:translate-x-0"
      :class="isOpenMobile ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Workspace Studio Header -->
      <div class="h-[54px] px-3.5 flex items-center justify-between border-b border-[var(--fp-border)] shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <div class="md:hidden fp-font-display w-7 h-7 rounded-[8px] fp-btn-primary flex items-center justify-center text-white text-xs font-extrabold shrink-0">
            FC
          </div>
          <span class="fp-font-display font-bold text-[15px] tracking-tight text-[var(--fp-text-primary)] truncate">
            Friends Chat
          </span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <!-- Realtime Telemetry Badge -->
          <div
            class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors"
            :class="connectionStatus === 'connected' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'"
            :title="`Status: ${connectionStatus}`"
          >
            <span
              class="w-1.5 h-1.5 rounded-full inline-block"
              :class="connectionStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-amber-500 animate-pulse'"
            ></span>
            <span>{{ connectionStatus === 'connected' ? '14ms' : 'sync' }}</span>
          </div>

          <button
            type="button"
            class="md:hidden text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] p-1 text-lg font-bold leading-none"
            @click="emit('closeMobile')"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Scrollable Navigation (Channels + DMs + Online Friends) -->
      <div class="flex-1 overflow-y-auto px-2.5 py-3.5 space-y-5">
        <!-- Channels Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--fp-text-secondary)]">
            <span>Channels</span>
            <button
              type="button"
              class="text-xs text-[var(--fp-accent-bright)] hover:underline flex items-center gap-0.5 font-semibold transition-colors cursor-pointer"
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
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] text-[14px] font-medium transition-all group cursor-pointer"
              :class="activeChannelId === ch.id ? 'bg-[var(--fp-active)] text-[var(--fp-text-primary)] font-semibold shadow-[inset_2px_0_0_#6366f1]' : 'text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]'"
              @click="onChannelClick(ch.id)"
            >
              <div class="flex items-center gap-2 truncate">
                <span
                  class="fp-font-mono text-sm font-semibold transition-colors"
                  :class="activeChannelId === ch.id ? 'text-[var(--fp-accent-bright)]' : 'text-[var(--fp-text-muted)] group-hover:text-[var(--fp-text-secondary)]'"
                >#</span>
                <span class="truncate">{{ ch.slug }}</span>
              </div>

              <!-- Unread & Mention badges -->
              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="(unreadMentions?.[ch.id] || 0) > 0"
                  :data-test="`mention-badge-${ch.id}`"
                  class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950 shadow-xs"
                  title="You were mentioned"
                >
                  @
                </span>
                <span
                  v-if="(unreadCounts[ch.id] || 0) > 0"
                  class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500 text-white min-w-[20px] text-center shadow-xs"
                >
                  {{ unreadCounts[ch.id] }}
                </span>
              </div>
            </button>
          </div>
        </div>

        <!-- Direct Messages Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--fp-text-secondary)]">
            <span>Direct Messages</span>
            <button
              type="button"
              data-test="open-start-dm"
              class="text-xs text-[var(--fp-accent-bright)] hover:underline flex items-center gap-0.5 font-semibold transition-colors cursor-pointer"
              @click="emit('openStartDm')"
            >
              + New
            </button>
          </div>

          <div v-if="!dmChannels || dmChannels.length === 0" class="px-2 py-1.5 text-xs text-[var(--fp-text-muted)] italic">
            No conversations yet
          </div>

          <div v-else class="space-y-0.5">
            <button
              v-for="dm in dmChannels"
              :key="dm.id"
              type="button"
              :data-test="`dm-channel-${dm.id}`"
              class="w-full flex items-center justify-between px-2 py-1.5 rounded-[8px] text-[13.5px] font-medium transition-all group cursor-pointer"
              :class="activeChannelId === dm.id ? 'bg-[var(--fp-active)] text-[var(--fp-text-primary)] font-semibold shadow-[inset_2px_0_0_#6366f1]' : 'text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]'"
              @click="onChannelClick(dm.id)"
            >
              <div class="flex items-center gap-2 truncate">
                <UserAvatar
                  :display-name="dm.peer?.display_name || 'Friend'"
                  :avatar-color="dm.peer?.avatar_color"
                  :show-online="isPeerOnline(dm)"
                  size="sm"
                />
                <span class="truncate">{{ dm.peer?.display_name || 'Direct Message' }}</span>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <span
                  v-if="(unreadMentions?.[dm.id] || 0) > 0"
                  :data-test="`mention-badge-${dm.id}`"
                  class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950 shadow-xs"
                  title="You were mentioned"
                >
                  @
                </span>
                <span
                  v-if="(unreadCounts[dm.id] || 0) > 0"
                  class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500 text-white min-w-[20px] text-center shadow-xs"
                >
                  {{ unreadCounts[dm.id] }}
                </span>
              </div>
            </button>
          </div>
        </div>

        <!-- Online Friends Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--fp-text-secondary)]">
            <span>Online Friends</span>
            <span class="text-[11px] bg-[var(--fp-hover)] text-[var(--fp-text-secondary)] border border-[var(--fp-border)] px-1.5 py-0.2 rounded-md font-semibold">
              {{ onlineFriends.length }}
            </span>
          </div>

          <div v-if="onlineFriends.length === 0" class="px-2 py-2 text-xs text-[var(--fp-text-muted)] italic">
            No other friends currently online
          </div>

          <div v-else class="space-y-0.5">
            <button
              v-for="friend in onlineFriends"
              :key="friend.id"
              type="button"
              :data-test="`online-friend-${friend.id}`"
              :disabled="Boolean(currentUser && friend.id === currentUser.id)"
              class="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors text-left group"
              :class="currentUser && friend.id === currentUser.id ? 'cursor-default' : 'cursor-pointer'"
              @click="onOnlineFriendClick(friend)"
            >
              <div class="flex items-center gap-2 truncate">
                <UserAvatar
                  :display-name="friend.display_name"
                  :avatar-color="friend.avatar_color"
                  :show-online="true"
                  size="sm"
                />
                <span class="truncate">
                  {{ friend.display_name }}
                  <span v-if="currentUser && friend.id === currentUser.id" class="text-[var(--fp-text-muted)] text-[11px] ml-1">(you)</span>
                </span>
              </div>
              <span
                v-if="!currentUser || friend.id !== currentUser.id"
                class="text-[11px] font-semibold text-[var(--fp-text-muted)] group-hover:text-[var(--fp-accent-bright)] shrink-0 transition-colors"
              >
                DM
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- User Profile & Settings Footer -->
      <div class="p-2.5 border-t border-[var(--fp-border)] bg-[var(--fp-rail)]/60 md:rounded-b-[14px] shrink-0 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2.5 min-w-0">
          <UserAvatar
            :display-name="currentUser?.display_name || 'You'"
            :avatar-color="currentUser?.avatar_color"
            :show-online="true"
            size="sm"
          />
          <div class="truncate">
            <div class="text-xs font-semibold text-[var(--fp-text-primary)] truncate">
              {{ currentUser?.display_name || 'Guest' }}
            </div>
            <div class="text-[11px] text-emerald-500 font-medium truncate">
              Online
            </div>
          </div>
        </div>

        <div class="flex items-center gap-0.5 shrink-0">
          <!-- Profile Settings -->
          <button
            type="button"
            data-test="open-profile-settings"
            class="p-1.5 text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] rounded-lg hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
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
            class="p-1.5 text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] rounded-lg hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            @click="emit('toggleTheme')"
          >
            <span v-if="isDark" class="text-xs">☀️</span>
            <span v-else class="text-xs">🌙</span>
          </button>

          <!-- Logout -->
          <button
            type="button"
            class="p-1.5 text-[var(--fp-text-secondary)] hover:text-rose-500 rounded-lg hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
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
