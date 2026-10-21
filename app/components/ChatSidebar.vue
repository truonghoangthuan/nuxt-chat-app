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
  MessageSquare,
  MessageSquarePlus,
  Search,
} from '@lucide/vue'
import type { Conversation, Channel, Profile, ConnectionStatus } from '~/types/chat'
import {
  getDirectPeer,
  formatConversationTitle,
  formatConversationTime,
} from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'
import { Button } from '~/components/ui/button'

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
      const sender = conv.lastMessage.author?.display_name
      if (conv.type === 'group' && sender) {
        return `${sender}: ${conv.lastMessage.content}`
      }
      return conv.lastMessage.content
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

        <!-- Chats Workspace Active Indicator -->
        <button
          type="button"
          class="relative w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-500/15 text-[var(--fp-text-primary)] transition-colors cursor-pointer"
          title="Chats"
        >
          <span class="absolute -left-3 w-[3px] h-5 rounded-r bg-indigo-500"></span>
          <MessageSquare class="size-[18px]" aria-hidden="true" />
        </button>

        <!-- Contacts Button -->
        <button
          type="button"
          data-test="open-contacts"
          class="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
          title="Contacts"
          @click="onContactsClick"
        >
          <Users class="size-[18px]" aria-hidden="true" />
        </button>

        <!-- New Direct Chat Button -->
        <button
          type="button"
          data-test="open-start-dm"
          class="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
          title="New Direct Chat"
          @click="onNewDirectChatClick"
        >
          <MessageSquarePlus class="size-[18px]" aria-hidden="true" />
        </button>

        <!-- New Group Button -->
        <button
          type="button"
          data-test="open-create-group"
          class="w-10 h-10 rounded-[10px] flex items-center justify-center text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors cursor-pointer"
          title="New Group"
          @click="onNewGroupClick"
        >
          <Plus class="size-[18px]" aria-hidden="true" />
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

    <!-- Drawer / Sidebar Body -->
    <aside
      aria-label="Channel and Friends Directory"
      class="fixed inset-y-0 left-0 z-40 w-64 md:w-[264px] flex flex-col bg-[var(--fp-drawer)] text-[var(--fp-text-secondary)] border-r md:border border-[var(--fp-border)] md:rounded-[14px] shadow-[var(--fp-specular)] transition-transform duration-200 ease-in-out md:static md:translate-x-0"
      :class="isOpenMobile ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Header -->
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
            class="md:hidden text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] p-1 text-lg font-bold leading-none cursor-pointer"
            @click="emit('closeMobile')"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Top Search Input -->
      <div class="px-2.5 pt-3 pb-1 shrink-0">
        <div class="relative flex items-center">
          <Search class="absolute left-2.5 size-3.5 text-[var(--fp-text-muted)] pointer-events-none" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            data-test="conversation-search-input"
            placeholder="Search conversations..."
            class="w-full h-8 pl-8 pr-7 text-xs rounded-[8px] bg-[var(--fp-surface)] border border-[var(--fp-border)] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
            @keydown.esc="searchQuery = ''"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2 text-[var(--fp-text-muted)] hover:text-[var(--fp-text-primary)] p-0.5 cursor-pointer"
            aria-label="Clear search"
            @click="searchQuery = ''"
          >
            <X class="size-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="px-2.5 pt-1.5 pb-2 flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="flex-1 h-7.5 px-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-[var(--fp-border)] bg-[var(--fp-surface)] hover:bg-[var(--fp-hover)] text-[var(--fp-text-primary)] rounded-[8px] cursor-pointer"
          data-test="sidebar-open-contacts"
          title="Open Contacts"
          @click="onContactsClick"
        >
          <Users class="size-3.5 text-indigo-500" aria-hidden="true" />
          <span>Contacts</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="flex-1 h-7.5 px-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-[var(--fp-border)] bg-[var(--fp-surface)] hover:bg-[var(--fp-hover)] text-[var(--fp-text-primary)] rounded-[8px] cursor-pointer"
          data-test="sidebar-open-create-group"
          title="New Group"
          @click="onNewGroupClick"
        >
          <Plus class="size-3.5 text-indigo-500" aria-hidden="true" />
          <span>New Group</span>
        </Button>
      </div>

      <!-- Scrollable Navigation (Conversations + Online Friends) -->
      <div class="flex-1 overflow-y-auto px-2.5 py-2 space-y-4">
        <!-- Unified Conversations Section -->
        <div>
          <div class="flex items-center justify-between px-2 mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--fp-text-secondary)]">
            <span>Conversations</span>
            <button
              type="button"
              class="text-xs text-[var(--fp-accent-bright)] hover:underline flex items-center gap-0.5 font-semibold transition-colors cursor-pointer"
              title="New Direct Chat"
              @click="onNewDirectChatClick"
            >
              <Plus class="size-3" aria-hidden="true" /> New Chat
            </button>
          </div>

          <!-- Empty State -->
          <div
            v-if="filteredConversations.length === 0"
            class="px-3 py-6 text-center text-xs text-[var(--fp-text-muted)] italic"
          >
            <template v-if="searchQuery.trim()">
              No conversations match your search
            </template>
            <template v-else>
              No conversations yet. Start a new direct chat or create a group!
            </template>
          </div>

          <!-- Conversations List -->
          <div v-else class="space-y-0.5">
            <button
              v-for="conv in filteredConversations"
              :key="conv.id"
              type="button"
              :data-test="`conversation-item-${conv.id}`"
              class="w-full flex items-center px-2.5 py-2 rounded-[8px] text-[13.5px] font-medium transition-all group cursor-pointer text-left"
              :class="activeId === conv.id ? 'bg-[var(--fp-active)] text-[var(--fp-text-primary)] font-semibold shadow-[inset_2px_0_0_#6366f1]' : 'text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]'"
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
                  class="w-7 h-7 rounded-[7px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-500 flex items-center justify-center font-bold text-xs select-none shrink-0"
                  :title="getConvTitle(conv)"
                >
                  <Users class="size-3.5" aria-hidden="true" />
                </div>

                <!-- Text & Metadata Content -->
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                  <!-- Row 1: Title & Timestamp -->
                  <div class="flex items-center justify-between gap-1.5">
                    <span
                      class="truncate text-[13.5px] font-medium"
                      :class="activeId === conv.id ? 'text-[var(--fp-text-primary)] font-semibold' : 'text-[var(--fp-text-primary)]'"
                    >
                      {{ getConvTitle(conv) }}
                    </span>
                    <span
                      v-if="formatConversationTime(conv)"
                      :data-test="`conversation-time-${conv.id}`"
                      class="text-[11px] text-[var(--fp-text-muted)] shrink-0 font-normal"
                    >
                      {{ formatConversationTime(conv) }}
                    </span>
                  </div>

                  <!-- Row 2: Subtitle & Badges -->
                  <div class="flex items-center justify-between gap-1.5 mt-0.5">
                    <span
                      class="truncate text-[11px] text-[var(--fp-text-muted)]"
                      :class="{ italic: conv.lastMessage?.deleted_at }"
                    >
                      {{ getConvSubtitle(conv) }}
                    </span>
                    <div class="flex items-center gap-1 shrink-0">
                      <span
                        v-if="(unreadMentions?.[conv.id] || 0) > 0"
                        :data-test="`mention-badge-${conv.id}`"
                        class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-slate-950 shadow-xs"
                        title="You were mentioned"
                      >
                        @
                      </span>
                      <span
                        v-if="(unreadCounts[conv.id] || 0) > 0"
                        class="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500 text-white min-w-[20px] text-center shadow-xs"
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
                Chat
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

          <!-- Notifications Toggle -->
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-test="toggle-notifications-btn"
            class="size-8 rounded-lg text-[var(--fp-text-secondary)] hover:bg-[var(--fp-hover)] hover:text-[var(--fp-text-primary)]"
            :aria-label="notificationsEnabled ? 'Mute notifications' : 'Enable notifications'"
            :title="notificationsEnabled ? 'Mute notifications' : 'Enable notifications'"
            @click="emit('toggleNotifications')"
          >
            <Bell v-if="notificationsEnabled" class="size-4" aria-hidden="true" />
            <BellOff v-else class="size-4 text-amber-500" aria-hidden="true" />
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
