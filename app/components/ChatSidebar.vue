<script setup lang="ts">
import { Sun, Moon, X, Settings, LogOut, Plus } from '@lucide/vue'
import type { Channel, Profile, ConnectionStatus } from '~/types/chat'
import { getDmPeerId } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'
import { Button } from '~/components/ui/button'

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
      aria-label="Workspace navigation"
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-10 rounded-[10px] text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]"
          :aria-label="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
          @click="emit('toggleTheme')"
        >
          <Sun v-if="isDark" class="size-[18px]" aria-hidden="true" />
          <Moon v-else class="size-[18px]" aria-hidden="true" />
        </Button>

        <button
          type="button"
          class="p-0.5 rounded-[9px] hover:ring-2 hover:ring-indigo-500/50 transition-all cursor-pointer"
          :title="currentUser?.display_name || 'Profile Settings'"
          @click="emit('openProfileSettings')"
        >
          <UserAvatar
            :display-name="currentUser?.display_name || 'You'"
            :avatar-color="currentUser?.avatar_color"
            :avatar-url="currentUser?.avatar_url"
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
            <span>{{ connectionStatus === 'connected' ? 'Live' : 'Syncing' }}</span>
          </div>

          <button
            type="button"
            class="md:hidden text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] p-1 text-lg font-bold leading-none"
            @click="emit('closeMobile')"
          >
            <X class="size-4" aria-hidden="true" />
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
              <Plus class="size-3" aria-hidden="true" /> New
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
              <Plus class="size-3" aria-hidden="true" /> New
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
                  :avatar-url="dm.peer?.avatar_url"
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
                  :avatar-url="friend.avatar_url"
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
            :avatar-url="currentUser?.avatar_url"
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-test="open-profile-settings"
            class="size-8 rounded-lg text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]"
            aria-label="Profile Settings"
            title="Profile Settings"
            @click="emit('openProfileSettings')"
          >
            <Settings class="size-4" aria-hidden="true" />
          </Button>

          <!-- Theme Toggle -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 rounded-lg text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]"
            :aria-label="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            @click="emit('toggleTheme')"
          >
            <Sun v-if="isDark" class="size-4" aria-hidden="true" />
            <Moon v-else class="size-4" aria-hidden="true" />
          </Button>

          <!-- Logout -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 rounded-lg text-[var(--fp-text-secondary)] hover:bg-rose-500/10 hover:text-rose-500"
            aria-label="Log out"
            title="Log Out"
            @click="emit('logout')"
          >
            <LogOut class="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </aside>
  </div>
</template>
