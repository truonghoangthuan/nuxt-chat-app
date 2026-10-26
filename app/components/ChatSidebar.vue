<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Sun,
  Moon,
  X,
  Settings,
  Bell,
  BellOff,
  LogOut,
  Plus,
  Users,
  MessageSquarePlus,
  Search,
  Download,
} from '@lucide/vue'
import type { Conversation, Channel, Profile, ConnectionStatus } from '~/types/chat'
import {
  getDirectPeer,
  formatConversationTitle,
  formatConversationTime,
  isSystemPayload,
  parseSystemPayload,
  formatSystemMessageText,
} from '~/utils/chat'
import {
  isImagePayload,
  parseImagePayload,
  formatImageMessageSummary,
} from '~/utils/image'
import UserAvatar from '~/components/UserAvatar.vue'
import Button from '~/components/ui/Button.vue'

const props = withDefaults(
  defineProps<{
    conversations?: Conversation[]
    activeConversationId?: string | null
    channels?: Channel[]
    dmChannels?: Channel[]
    activeChannelId?: string | null
    unreadCounts: Record<string, number>
    unreadMentions?: Record<string, number>
    onlineFriends: Profile[]
    currentUser: Profile | null
    isDark: boolean
    connectionStatus: ConnectionStatus
    isOpenMobile: boolean
    notificationsEnabled?: boolean
    notificationPermission?: NotificationPermission
    canInstallPwa?: boolean
  }>(),
  {
    conversations: undefined,
    activeConversationId: null,
    channels: () => [],
    dmChannels: () => [],
    activeChannelId: null,
    unreadMentions: () => ({}),
    notificationsEnabled: true,
    notificationPermission: 'default',
    canInstallPwa: false,
  },
)

const emit = defineEmits<{
  (e: 'selectConversation', conversationId: string): void
  (e: 'selectChannel', channelId: string): void
  (e: 'openContacts'): void
  (e: 'openNewChat'): void
  (e: 'openStartDm'): void
  (e: 'openCreateGroup'): void
  (e: 'openCreateChannel'): void
  (e: 'startDmWithUser', userId: string): void
  (e: 'openProfileSettings'): void
  (e: 'toggleNotifications'): void
  (e: 'toggleTheme'): void
  (e: 'installPwa'): void
  (e: 'logout'): void
  (e: 'closeMobile'): void
}>()

const searchQuery = ref('')

const activeId = computed(() => props.activeConversationId || props.activeChannelId)

const rawConversations = computed<Conversation[]>(() => {
  if (props.conversations !== undefined) {
    return props.conversations
  }
  const synthesized: Conversation[] = []
  if (props.dmChannels) {
    for (const dm of props.dmChannels) {
      synthesized.push({
        id: dm.id,
        type: 'direct',
        title: dm.title || dm.peer?.display_name || 'Direct Message',
        created_by: dm.created_by,
        created_at: dm.created_at,
        peer: dm.peer,
      })
    }
  }
  if (props.channels) {
    for (const ch of props.channels) {
      synthesized.push({
        id: ch.id,
        type: ch.type || (ch.is_dm ? 'direct' : 'group'),
        title: ch.title || (ch.slug ? `#${ch.slug}` : 'General'),
        created_by: ch.created_by,
        created_at: ch.created_at,
        peer: ch.peer,
      })
    }
  }
  return synthesized
})

function getPeerForConv(conv: Conversation): Profile | null {
  return getDirectPeer(conv, props.currentUser?.id)
}

function isPeerOnline(conv: Conversation): boolean {
  if (conv.type !== 'direct') return false
  const peer = getPeerForConv(conv)
  if (peer?.id) {
    return props.onlineFriends.some(f => f.id === peer.id)
  }
  if (conv.members && conv.members.length > 0 && props.currentUser) {
    const peerMember = conv.members.find(m => m.user_id !== props.currentUser?.id)
    if (peerMember) {
      return props.onlineFriends.some(f => f.id === peerMember.user_id)
    }
  }
  return false
}

function getConvTitle(conv: Conversation): string {
  return formatConversationTitle(conv, props.currentUser?.id)
}

function getConvSubtitle(conv: Conversation): string {
  if (conv.lastMessage) {
    if (conv.lastMessage.deleted_at) {
      return 'This message was deleted'
    }
    if (conv.lastMessage.encryption === 'undecryptable') {
      return '🔒 Unable to decrypt'
    }
    if (conv.lastMessage.content?.startsWith('e2ee:')) {
      return '🔒 Encrypted message'
    }
    if (conv.lastMessage.content) {
      let text = conv.lastMessage.content
      if (isSystemPayload(text)) {
        const parsed = parseSystemPayload(text)
        return parsed ? formatSystemMessageText(parsed) : 'System notification'
      }
      if (isImagePayload(text)) {
        const parsed = parseImagePayload(text)
        text = parsed?.caption || formatImageMessageSummary(parsed?.images?.length || 1)
      }
      const sender = conv.lastMessage.author?.display_name
      if (conv.type === 'group' && sender) {
        return `${sender}: ${text}`
      }
      return text
    }
  }
  if (conv.type === 'direct') {
    const peer = getPeerForConv(conv)
    return peer?.email || 'Direct message'
  }
  if (conv.members && conv.members.length > 0) {
    return `${conv.members.length} members`
  }
  return 'Group chat'
}

function getConversationActivityTimestamp(conv: Conversation): number {
  if (conv.lastMessage?.created_at) {
    const t = Date.parse(conv.lastMessage.created_at)
    if (!Number.isNaN(t)) return t
  }
  if (conv.updated_at) {
    const t = Date.parse(conv.updated_at)
    if (!Number.isNaN(t)) return t
  }
  if (conv.created_at) {
    const t = Date.parse(conv.created_at)
    if (!Number.isNaN(t)) return t
  }
  return 0
}

const filteredConversations = computed<Conversation[]>(() => {
  const query = searchQuery.value.trim().toLowerCase()
  let list = rawConversations.value

  if (query) {
    list = list.filter(conv => {
      const title = getConvTitle(conv).toLowerCase()
      if (title.includes(query)) return true
      if (conv.title && conv.title.toLowerCase().includes(query)) return true
      const peer = getPeerForConv(conv)
      if (peer?.display_name?.toLowerCase().includes(query)) return true
      if (peer?.email?.toLowerCase().includes(query)) return true
      return false
    })
  }

  return [...list].sort((a, b) => {
    const timeA = getConversationActivityTimestamp(a)
    const timeB = getConversationActivityTimestamp(b)
    return timeB - timeA
  })
})

function onConversationClick(convId: string) {
  emit('selectConversation', convId)
  emit('selectChannel', convId)
  emit('closeMobile')
}

function onOnlineFriendClick(friend: Profile) {
  if (props.currentUser && friend.id === props.currentUser.id) return
  emit('startDmWithUser', friend.id)
  emit('closeMobile')
}

function onNewDirectChatClick() {
  emit('openNewChat')
  emit('openStartDm')
}

function onNewGroupClick() {
  emit('openCreateGroup')
  emit('openCreateChannel')
}

function onContactsClick() {
  emit('openContacts')
}
</script>

<template>
  <div class="flex h-full shrink-0">
    <!-- Mobile Backdrop -->
    <div
      v-if="isOpenMobile"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
      @click="emit('closeMobile')"
    ></div>

    <!-- Unified Apple Messages Sidebar (260px) -->
    <aside
      aria-label="Channel and Friends Directory"
      class="fixed inset-y-0 left-0 z-40 w-64 md:w-64 flex flex-col bg-[var(--ap-sidebar)] backdrop-blur-2xl md:rounded-2xl border-r md:border border-[var(--ap-glass-border)] shadow-xl shrink-0 overflow-hidden transition-transform duration-200 ease-in-out md:static md:translate-x-0"
      :class="isOpenMobile ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Header Bar with Quick Actions (Traffic lights removed) -->
      <div class="h-12 px-3.5 flex items-center justify-between border-b border-[var(--ap-glass-border)] shrink-0">
        <!-- Title -->
        <span class="text-xs font-semibold text-[var(--ap-text-primary)] tracking-tight">Messages</span>

        <!-- Quick actions -->
        <div class="flex items-center gap-1">
          <!-- Realtime status indicator -->
          <div
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border transition-colors mr-0.5"
            :class="connectionStatus === 'connected' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'"
            :title="`Status: ${connectionStatus}`"
          >
            <span
              class="w-1.5 h-1.5 rounded-full inline-block"
              :class="connectionStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-amber-500 animate-pulse'"
            ></span>
            <span class="hidden sm:inline">{{ connectionStatus === 'connected' ? 'Live' : 'Sync' }}</span>
          </div>

          <!-- Contacts Button -->
          <button
            type="button"
            data-test="open-contacts"
            class="w-6 h-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors cursor-pointer"
            title="Contacts"
            @click="onContactsClick"
          >
            <Users class="size-3.5" aria-hidden="true" />
          </button>

          <!-- New Direct Chat Button -->
          <button
            type="button"
            data-test="open-start-dm"
            class="w-6 h-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors cursor-pointer"
            title="New Direct Chat"
            @click="onNewDirectChatClick"
          >
            <MessageSquarePlus class="size-3.5" aria-hidden="true" />
          </button>

          <!-- New Group Button -->
          <button
            type="button"
            data-test="open-create-group"
            class="w-6 h-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition-colors cursor-pointer"
            title="New Group"
            @click="onNewGroupClick"
          >
            <Plus class="size-3.5" aria-hidden="true" />
          </button>

          <!-- Mobile Close Button -->
          <button
            type="button"
            class="md:hidden text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] p-1 text-sm font-bold leading-none cursor-pointer"
            @click="emit('closeMobile')"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Search Capsule -->
      <div class="px-3 py-2 shrink-0">
        <div class="relative flex items-center">
          <Search class="absolute left-3 size-3.5 text-[var(--ap-text-muted)] pointer-events-none" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            data-test="conversation-search-input"
            placeholder="Search"
            class="w-full h-8 pl-8 pr-7 bg-black/5 dark:bg-white/8 border border-black/10 dark:border-white/10 rounded-full text-xs text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus:outline-none focus:bg-black/8 dark:focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50 transition-all"
            @keydown.esc="searchQuery = ''"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2.5 text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] p-0.5 cursor-pointer"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <X class="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Scrollable Area (Conversations + Online Friends) -->
      <div class="flex-1 overflow-y-auto px-2 py-1 space-y-3 custom-scroll">
        <!-- Unified Conversations Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ap-text-muted)]">
            <span>Conversations</span>
          </div>

          <!-- Empty State -->
          <div
            v-if="filteredConversations.length === 0"
            class="px-3 py-6 text-center text-xs text-[var(--ap-text-muted)] italic"
          >
            <template v-if="searchQuery.trim()">
              No conversations match your search
            </template>
            <template v-else>
              No conversations yet. Start a new direct chat or create a group!
            </template>
          </div>

          <!-- Conversations List -->
          <div v-else class="space-y-1">
            <button
              v-for="conv in filteredConversations"
              :key="conv.id"
              type="button"
              :data-test="`conversation-item-${conv.id}`"
              class="w-full flex items-center px-2.5 py-2 rounded-xl text-[13.5px] transition-all group cursor-pointer text-left"
              :class="activeId === conv.id ? 'bg-blue-600/15 dark:bg-blue-600/25 border border-blue-500/30 text-blue-900 dark:text-white font-medium shadow-xs' : 'text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'"
              @click="onConversationClick(conv.id)"
            >
              <div
                :data-test="conv.type === 'direct' ? `dm-channel-${conv.id}` : undefined"
                class="w-full flex items-center gap-2.5 min-w-0"
              >
                <!-- Direct Peer Avatar -->
                <UserAvatar
                  v-if="conv.type === 'direct'"
                  :display-name="getPeerForConv(conv)?.display_name || getConvTitle(conv)"
                  :avatar-color="getPeerForConv(conv)?.avatar_color"
                  :avatar-url="getPeerForConv(conv)?.avatar_url"
                  :show-online="isPeerOnline(conv)"
                  size="sm"
                />
                <!-- Group Avatar -->
                <div
                  v-else
                  class="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-500 dark:text-blue-400 flex items-center justify-center font-bold text-xs select-none shrink-0"
                  :title="getConvTitle(conv)"
                >
                  <Users class="size-4" aria-hidden="true" />
                </div>

                <!-- Text & Metadata Content -->
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                  <!-- Row 1: Title & Timestamp -->
                  <div class="flex items-center justify-between gap-1.5">
                    <span
                      class="truncate text-[13px] font-medium"
                      :class="activeId === conv.id ? 'text-blue-900 dark:text-white' : 'text-[var(--ap-text-primary)]'"
                    >
                      {{ getConvTitle(conv) }}
                    </span>
                    <span
                      v-if="formatConversationTime(conv)"
                      :data-test="`conversation-time-${conv.id}`"
                      class="text-[11px] text-[var(--fp-text-muted)] text-[var(--ap-text-muted)] shrink-0 font-normal font-mono"
                    >
                      {{ formatConversationTime(conv) }}
                    </span>
                  </div>

                  <!-- Row 2: Subtitle & Badges -->
                  <div class="flex items-center justify-between gap-1.5 mt-0.5">
                    <span
                      class="truncate text-[11px]"
                      :class="[
                        activeId === conv.id ? 'text-blue-700/80 dark:text-blue-200/70' : 'text-[var(--ap-text-muted)]',
                        { italic: conv.lastMessage?.deleted_at }
                      ]"
                    >
                      {{ getConvSubtitle(conv) }}
                    </span>
                    <div class="flex items-center gap-1 shrink-0">
                      <span
                        v-if="(unreadMentions?.[conv.id] || 0) > 0"
                        :data-test="`mention-badge-${conv.id}`"
                        class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 font-mono shadow-xs"
                        title="You were mentioned"
                      >
                        @
                      </span>
                      <span
                        v-if="(unreadCounts[conv.id] || 0) > 0"
                        class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-500 text-white min-w-[18px] text-center font-mono shadow-xs"
                      >
                        {{ unreadCounts[conv.id] }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Online Friends Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ap-text-muted)]">
            <span>Online Friends</span>
            <span class="text-[10px] bg-black/5 dark:bg-white/5 text-[var(--ap-text-secondary)] border border-black/10 dark:border-white/10 px-1.5 py-0.2 rounded-full font-mono font-semibold">
              {{ onlineFriends.length }}
            </span>
          </div>

          <div v-if="onlineFriends.length === 0" class="px-2 py-2 text-xs text-[var(--ap-text-muted)] italic">
            No other friends currently online
          </div>

          <div v-else class="space-y-0.5">
            <button
              v-for="friend in onlineFriends"
              :key="friend.id"
              type="button"
              :data-test="`online-friend-${friend.id}`"
              :disabled="Boolean(currentUser && friend.id === currentUser.id)"
              class="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[12.5px] font-medium text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left group"
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
                  <span v-if="currentUser && friend.id === currentUser.id" class="text-[var(--ap-text-muted)] text-[11px] ml-1">(you)</span>
                </span>
              </div>
              <span
                v-if="!currentUser || friend.id !== currentUser.id"
                class="text-[11px] font-medium text-blue-500 dark:text-blue-400 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
              >
                Chat
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Footer Profile Capsule -->
      <div class="p-2 border-t border-[var(--ap-glass-border)] bg-black/2 dark:bg-white/3 shrink-0 flex items-center justify-between gap-1.5">
        <div class="flex items-center gap-2 min-w-0 pl-1">
          <UserAvatar
            :display-name="currentUser?.display_name || 'You'"
            :avatar-color="currentUser?.avatar_color"
            :avatar-url="currentUser?.avatar_url"
            :show-online="true"
            size="sm"
          />
          <div class="truncate">
            <div class="text-xs font-semibold text-[var(--ap-text-primary)] truncate">
              {{ currentUser?.display_name || 'Guest' }}
            </div>
            <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Online
            </div>
          </div>
        </div>

        <div class="flex items-center gap-0.5 shrink-0">
          <!-- Install Windows PWA App -->
          <Button
            v-if="canInstallPwa"
            type="button"
            variant="ghost"
            size="icon"
            data-test="install-pwa-btn"
            class="size-7.5 rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
            aria-label="Install Windows App"
            title="Install Windows App"
            @click="emit('installPwa')"
          >
            <Download class="size-3.5" aria-hidden="true" />
          </Button>

          <!-- Profile Settings -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-test="open-profile-settings"
            class="size-7.5 rounded-full text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--ap-text-primary)]"
            aria-label="Profile Settings"
            title="Profile Settings"
            @click="emit('openProfileSettings')"
          >
            <Settings class="size-3.5" aria-hidden="true" />
          </Button>

          <!-- Notifications Toggle -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-test="toggle-notifications-btn"
            class="relative size-7.5 rounded-full text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--ap-text-primary)]"
            :aria-label="notificationPermission === 'denied' ? 'Notifications blocked by browser' : (notificationsEnabled ? 'Mute notifications' : 'Enable notifications')"
            :title="notificationPermission === 'denied' ? 'Notifications blocked in browser settings' : (notificationsEnabled ? 'Mute notifications' : 'Enable notifications')"
            @click="emit('toggleNotifications')"
          >
            <Bell v-if="notificationsEnabled && notificationPermission !== 'denied'" class="size-3.5" aria-hidden="true" />
            <BellOff v-else class="size-3.5 text-amber-500" aria-hidden="true" />
            <span
              v-if="notificationsEnabled && notificationPermission === 'default'"
              data-test="notifications-pending-badge"
              class="absolute top-1 right-1 size-1.5 rounded-full bg-amber-400 ring-1 ring-black"
              aria-hidden="true"
            />
          </Button>

          <!-- Theme Toggle -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7.5 rounded-full text-[var(--ap-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--ap-text-primary)]"
            :aria-label="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
            @click="emit('toggleTheme')"
          >
            <Sun v-if="isDark" class="size-3.5" aria-hidden="true" />
            <Moon v-else class="size-3.5" aria-hidden="true" />
          </Button>

          <!-- Logout -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7.5 rounded-full text-[var(--ap-text-secondary)] hover:bg-rose-500/20 hover:text-rose-500"
            aria-label="Log out"
            title="Log Out"
            @click="emit('logout')"
          >
            <LogOut class="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </aside>
  </div>
</template>
