import { ref, computed, shallowReactive, isRef, type ComputedRef, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  Conversation,
  ConversationMember,
  Contact,
  ConversationType,
  Channel,
  ChatMessage,
  MessageReaction,
  Profile,
  ReplyTarget,
  ConnectionStatus,
  ConversationRead,
  ChannelRead,
  MessageEncryptionState,
  EncryptedImageMetadata,
  ImageMessagePayload,
  LocalImageAttachment,
} from '~/types/chat'
import {
  isValidMessageContent,
  isValidReactionEmoji,
  doesMessageMentionUser,
  isValidEmail,
  getDirectPeer,
  formatConversationTitle,
  validateBackgroundFile,
  serializeSystemMessage,
  isSystemPayload,
  parseSystemPayload,
  CHAT_BACKGROUND_PRESETS,
} from '~/utils/chat'
import { isEncryptedEnvelope, encryptContent, decryptContent, encryptBinary } from '~/utils/crypto'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'
import { deduplicatePresenceState } from '~/composables/usePresenceState'
import { createConnectionManager } from '~/composables/useConnectionManager'
import { useAuthProfile } from '~/composables/useAuthProfile'
import { useE2ee } from '~/composables/useE2ee'
import { useNotification, createNotificationManager } from '~/composables/useNotification'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'
import {
  computeUnreadSnapshot,
  computeInitialUnreadSnapshot,
  computeOldestReadTimestamp,
  computeConversationReadMap,
  computeChannelReadMap,
  createConversationReadDebouncer,
  createChannelReadDebouncer,
  createReadReceiptDebouncer,
  applyIncomingUnreadIncrement,
  applyActiveChannelReadReset,
  applyCrossTabReadTimestamp,
} from '~/composables/useUnreadReads'
import { createContactsActions } from '~/composables/useContacts'
import { createConversationsActions } from '~/composables/useConversations'

export {
  computeUnreadSnapshot,
  computeInitialUnreadSnapshot,
  computeOldestReadTimestamp,
  computeConversationReadMap,
  computeChannelReadMap,
  createConversationReadDebouncer,
  createChannelReadDebouncer,
  createReadReceiptDebouncer,
  applyIncomingUnreadIncrement,
  applyActiveChannelReadReset,
  applyCrossTabReadTimestamp,
}
export { createContactsActions }
export { createConversationsActions }
import {
  isImagePayload,
  parseImagePayload,
  formatImageMessageSummary,
  resizeImage,
  validateImageFiles,
} from '~/utils/image'

export const PAGE_SIZE = 40

export function isDuplicateKeyError(error: any): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  const msg = String(error.message || '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

export async function decryptMessageRow<
  T extends {
    content?: string
    conversation_id?: string
    channel_id?: string
    reply_to?: ReplyTarget | null
    encryption?: MessageEncryptionState
  },
>(row: T, key: CryptoKey | null, fallbackConversationId?: string | null): Promise<T> {
  if (typeof row.content !== 'string') {
    return row
  }

  const conversationId = row.conversation_id || row.channel_id || fallbackConversationId || ''
  let content = row.content
  let encryption: MessageEncryptionState

  if (!content.startsWith('e2ee:v1:')) {
    encryption = 'legacy'
  } else if (!key || !conversationId || !isEncryptedEnvelope(content)) {
    content = ''
    encryption = 'undecryptable'
  } else {
    try {
      content = await decryptContent(key, content, conversationId)
      encryption = 'e2ee'
    } catch {
      content = ''
      encryption = 'undecryptable'
    }
  }

  let replyTo = row.reply_to
  if (replyTo && typeof replyTo.content === 'string') {
    let replyContent = replyTo.content
    let replyEncryption: MessageEncryptionState = replyTo.encryption ?? 'legacy'
    if (replyTo.encryption === undefined) {
      if (!replyContent.startsWith('e2ee:v1:')) {
        replyEncryption = 'legacy'
      } else if (!key || !conversationId || !isEncryptedEnvelope(replyContent)) {
        replyContent = ''
        replyEncryption = 'undecryptable'
      } else {
        try {
          replyContent = await decryptContent(key, replyContent, conversationId)
          replyEncryption = 'e2ee'
        } catch {
          replyContent = ''
          replyEncryption = 'undecryptable'
        }
      }
    }
    if (isImagePayload(replyContent)) {
      const parsed = parseImagePayload(replyContent)
      if (parsed) {
        replyContent = formatImageMessageSummary(parsed.images.length)
      }
    }
    replyTo = {
      ...replyTo,
      content: replyContent,
      encryption: replyEncryption,
    }
  }

  return {
    ...row,
    content,
    encryption,
    ...(row.reply_to !== undefined ? { reply_to: replyTo } : {}),
  }
}

export async function decryptMessageRows<
  T extends {
    content?: string
    conversation_id?: string
    channel_id?: string
    reply_to?: ReplyTarget | null
    encryption?: MessageEncryptionState
  },
>(
  rows: T[],
  key: CryptoKey | null,
  fallbackConversationId?: string | null,
): Promise<T[]> {
  return Promise.all(rows.map(row => decryptMessageRow(row, key, fallbackConversationId)))
}

export function subscribeWithPromise(
  channel: { subscribe: (callback: (status: string) => void) => any } | null,
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!channel) {
      resolve(true)
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve(false)
      }
    }, timeoutMs)

    channel.subscribe((status: string) => {
      if (settled) return
      if (status === 'SUBSCRIBED') {
        settled = true
        clearTimeout(timer)
        resolve(true)
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        settled = true
        clearTimeout(timer)
        resolve(false)
      }
    })
  })
}

export function handleIncomingRealtimeMessage(params: {
  row: Omit<ChatMessage, 'status'>
  activeConversationId?: string | null
  activeChannelId?: string | null
  messagesStore: ReturnType<typeof createMessagesStore>
  typingTracker: ReturnType<typeof createTypingTracker>
  unreadCounts: Record<string, number>
  unreadMentions?: Record<string, number>
  currentUserId?: string
  currentDisplayName?: string | null
  conversations?: Conversation[] | Ref<Conversation[]>
  notificationManager?: ReturnType<typeof createNotificationManager>
  onNavigate?: (convId: string) => void
}): void {
  const activeId = params.activeConversationId !== undefined ? params.activeConversationId : params.activeChannelId
  const targetId = params.row.conversation_id || params.row.channel_id || ''

  const convList = params.conversations
    ? (isRef(params.conversations) ? params.conversations.value : params.conversations)
    : undefined
  if (convList) {
    const targetConv = convList.find(c => c.id === targetId)
    if (targetConv) {
      targetConv.lastMessage = params.row as ChatMessage
      targetConv.updated_at = params.row.created_at
    }
  }

  if (targetId && targetId === activeId) {
    params.messagesStore.reconcileIncomingMessage(params.row)
    params.typingTracker.clearUserTyping(params.row.user_id)
  } else if (targetId) {
    if (params.currentUserId && params.row.user_id === params.currentUserId) {
      return
    }
    params.unreadCounts[targetId] = (params.unreadCounts[targetId] || 0) + 1
    if (
      params.unreadMentions
      && !params.row.deleted_at
      && (!params.currentUserId || params.row.user_id !== params.currentUserId)
      && (
        doesMessageMentionUser(
          isImagePayload(params.row.content)
            ? (parseImagePayload(params.row.content)?.caption || formatImageMessageSummary(parseImagePayload(params.row.content)?.images.length || 1))
            : params.row.content,
          params.currentDisplayName,
        )
        || (params.currentUserId && params.row.reply_to?.user_id === params.currentUserId)
      )
    ) {
      params.unreadMentions[targetId] = (params.unreadMentions[targetId] || 0) + 1
    }
  }

  if (params.notificationManager) {
    params.notificationManager.notifyIncomingMessage({
      message: params.row as ChatMessage,
      activeConversationId: activeId,
      currentUserId: params.currentUserId,
      onNavigate: params.onNavigate,
    })
  }
}

export function handleRealtimeMessageUpdate(params: {
  row: Partial<ChatMessage> & { id: string; conversation_id?: string; channel_id?: string }
  oldRow?: Partial<ChatMessage> | null
  activeConversationId?: string | null
  activeChannelId?: string | null
  messagesStore: ReturnType<typeof createMessagesStore>
  unreadCounts?: Record<string, number>
  unreadMentions?: Record<string, number>
  lastReadByConversation?: Record<string, string>
  lastReadByChannel?: Record<string, string>
  currentUserId?: string
  currentDisplayName?: string | null
}): void {
  const activeId = params.activeConversationId !== undefined ? params.activeConversationId : params.activeChannelId
  const targetId = params.row.conversation_id || params.row.channel_id
  const isInactive = Boolean(targetId && targetId !== activeId)

  if (isInactive && targetId) {
    const isSoftDeleted = Boolean(params.row.deleted_at && !params.oldRow?.deleted_at)
    const isFromOtherUser = !params.currentUserId || !params.row.user_id || params.row.user_id !== params.currentUserId

    if (isSoftDeleted && isFromOtherUser) {
      const lastReadMap = params.lastReadByConversation || params.lastReadByChannel
      const lastReadIso = lastReadMap?.[targetId]
      const isUnread = !lastReadIso || !params.row.created_at || Date.parse(params.row.created_at) > Date.parse(lastReadIso)

      if (isUnread) {
        if (params.unreadCounts && (params.unreadCounts[targetId] || 0) > 0) {
          params.unreadCounts[targetId] -= 1
        }
        const wasMention = Boolean(
          params.row.content
          && doesMessageMentionUser(
            isImagePayload(params.row.content)
              ? formatImageMessageSummary(parseImagePayload(params.row.content)?.images.length || 1)
              : params.row.content,
            params.currentDisplayName,
          ),
        )
        if (wasMention && params.unreadMentions && (params.unreadMentions[targetId] || 0) > 0) {
          params.unreadMentions[targetId] -= 1
        }
      }
    }
    return
  }
  params.messagesStore.reconcileUpdatedMessage(params.row)
}

export function handleRealtimeReactionEvent(params: {
  eventType: 'INSERT' | 'DELETE'
  reaction: MessageReaction
  activeConversationId?: string | null
  activeChannelId?: string | null
  messagesStore: ReturnType<typeof createMessagesStore>
}): void {
  const activeId = params.activeConversationId !== undefined ? params.activeConversationId : params.activeChannelId
  const targetId = params.reaction.conversation_id || params.reaction.channel_id
  if (targetId && activeId && targetId !== activeId) {
    return
  }
  if (params.eventType === 'INSERT') {
    params.messagesStore.applyReactionAdded(params.reaction)
  } else {
    params.messagesStore.applyReactionRemoved(params.reaction)
  }
}

export async function resolveMessageAuthor(params: {
  userId: string
  existingAuthor?: Profile
  conversationId?: string
  channelId?: string
  activeConversationId?: string | null
  activeChannelId?: string | null
  profilesCache: Map<string, Profile>
  fetchProfile: (userId: string) => Promise<Profile | undefined>
}): Promise<Profile | undefined> {
  if (params.existingAuthor) {
    params.profilesCache.set(params.existingAuthor.id, params.existingAuthor)
    return params.existingAuthor
  }
  const targetId = params.conversationId || params.channelId
  const activeId = params.activeConversationId !== undefined ? params.activeConversationId : params.activeChannelId
  if (targetId && activeId && targetId !== activeId) {
    return undefined
  }
  const cached = params.profilesCache.get(params.userId)
  if (cached) {
    return cached
  }
  const fetched = await params.fetchProfile(params.userId)
  if (fetched) {
    params.profilesCache.set(fetched.id, fetched)
  }
  return fetched
}

export function applyRealtimeProfileUpdate(params: {
  profile: Profile
  profilesCache: Map<string, Profile>
  messagesStore: ReturnType<typeof createMessagesStore>
  onlineFriends: Profile[]
}): Profile[] {
  params.profilesCache.set(params.profile.id, params.profile)
  params.messagesStore.updateAuthorProfile(params.profile)

  const updatedFriends = params.onlineFriends.map(friend =>
    friend.id === params.profile.id ? { ...friend, ...params.profile } : friend,
  )
  updatedFriends.sort((a, b) => a.display_name.localeCompare(b.display_name))
  return updatedFriends
}

export function filterOnlineFriends(
  onlineUsers: Profile[],
  contacts: Contact[],
): Profile[] {
  const friendIds = new Set(contacts.map(c => c.contact_user_id))
  return onlineUsers.filter(u => friendIds.has(u.id))
}

export function useChatRoom() {
  const supabase = useSupabaseClient()
  const authProfile = useAuthProfile()
  const e2ee = useE2ee()
  const notification = useNotification()

  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const contacts = ref<Contact[]>([])

  // Transitional aliases for channels and legacy components
  const channels = conversations as any as Ref<Channel[]>
  const activeChannelId = activeConversationId

  const allProfiles = ref<Profile[]>([])
  const profilesCache = shallowReactive(new Map<string, Profile>())
  const pendingImageFiles = new Map<string, { files: File[]; caption?: string; conversationId: string; channelId?: string }>()
  let isDisposed = false

  const readDebouncer = createConversationReadDebouncer(async (convId, timestamp) => {
    const current = authProfile.currentProfile.value
    if (!current?.id) return
    try {
      await supabase
        .from('conversation_reads')
        .upsert({
          user_id: current.id,
          conversation_id: convId,
          last_read_at: timestamp,
        })
    } catch {
      // Ignore read upsert error
    }
  }, 2000)

  const unreadCounts = ref<Record<string, number>>({})
  const unreadMentions = ref<Record<string, number>>({})
  const lastReadByConversation = ref<Record<string, string>>({})
  const lastReadByChannel = lastReadByConversation
  const activeChannelUnreadSince = ref<string | null>(null)
  const conversationReadsByConv = ref<Record<string, Record<string, string>>>({})
  const activeConversationReads = computed<Record<string, string>>(() => {
    const id = activeConversationId.value
    return id ? (conversationReadsByConv.value[id] || {}) : {}
  })

  const rawOnlineUsers = ref<Profile[]>([])
  const onlineFriends = ref<Profile[]>([])

  function syncOnlineFriends(): void {
    onlineFriends.value = filterOnlineFriends(rawOnlineUsers.value, contacts.value)
  }

  const knownProfiles = computed<Profile[]>(() => {
    const map = new Map<string, Profile>()
    for (const p of allProfiles.value) {
      map.set(p.id, p)
    }
    for (const p of profilesCache.values()) {
      map.set(p.id, p)
    }
    for (const f of onlineFriends.value) {
      map.set(f.id, f)
    }
    if (authProfile.currentProfile.value) {
      map.set(authProfile.currentProfile.value.id, authProfile.currentProfile.value)
    }
    return Array.from(map.values()).sort((a, b) => a.display_name.localeCompare(b.display_name))
  })

  const activeConversation = computed<Conversation | null>(() => {
    if (!activeConversationId.value) return null
    return conversations.value.find(c => c.id === activeConversationId.value) || null
  })

  // Transitional aliases
  const activeChannel = activeConversation as any as ComputedRef<Channel | null>
  const publicChannels = computed<Channel[]>(() => {
    return (conversations.value as any[]).filter(c => c.type === 'group' || (!c.is_dm && c.type !== 'direct'))
  })
  const dmChannels = computed<Channel[]>(() => {
    return (conversations.value as any[]).filter(c => c.type === 'direct' || c.is_dm)
  })

  const hasMoreHistory = ref<boolean>(true)
  const isLoadingHistory = ref<boolean>(false)

  const messagesStore = createMessagesStore()
  const messages = messagesStore.messages

  const typingTracker = createTypingTracker(() => authProfile.currentProfile.value?.id, 3000)
  const typingLabel = typingTracker.typingLabel

  let presenceChannel: RealtimeChannel | null = null
  let dbChangesChannel: RealtimeChannel | null = null
  let typingChannel: RealtimeChannel | null = null
  let lastTypingSentAt = 0

  function cacheProfilesFromMessages(rows: Array<{ author?: Profile }>): void {
    for (const row of rows) {
      if (row.author?.id) {
        profilesCache.set(row.author.id, row.author)
      }
    }
  }

  async function markConversationRead(conversationId: string, immediate = true): Promise<void> {
    const current = authProfile.currentProfile.value
    const nowIso = new Date().toISOString()
    lastReadByConversation.value[conversationId] = nowIso
    if (current?.id) {
      const existing = conversationReadsByConv.value[conversationId] || {}
      conversationReadsByConv.value = {
        ...conversationReadsByConv.value,
        [conversationId]: {
          ...existing,
          [current.id]: nowIso,
        },
      }
    }
    if (!current?.id) return

    await readDebouncer.schedule(conversationId, nowIso, immediate)
  }
  const markChannelRead = markConversationRead

  async function loadConversationReadsAndUnreads(): Promise<void> {
    const current = authProfile.currentProfile.value
    if (!current?.id || conversations.value.length === 0) return

    try {
      const convIds = conversations.value.map(c => c.id).filter(Boolean)
      let readsQuery: any = supabase
        .from('conversation_reads')
        .select('*')

      if (convIds.length > 0 && typeof readsQuery.in === 'function') {
        readsQuery = readsQuery.in('conversation_id', convIds)
      }

      let readRows: any[] | null = null
      const { data: convReadRows, error: convReadErr } = await readsQuery

      if (!convReadErr && convReadRows) {
        readRows = convReadRows.filter((r: any) => r.user_id === current.id)
        const readsMap: Record<string, Record<string, string>> = {}
        for (const r of convReadRows) {
          if (r.conversation_id && r.user_id && r.last_read_at) {
            if (!readsMap[r.conversation_id]) {
              readsMap[r.conversation_id] = {}
            }
            readsMap[r.conversation_id][r.user_id] = r.last_read_at
          }
        }
        conversationReadsByConv.value = readsMap
      }

      const UNREAD_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000
      const defaultRead = current.created_at || new Date(Date.now() - UNREAD_LOOKBACK_MS).toISOString()
      const map = computeConversationReadMap({
        conversations: conversations.value,
        readRows,
        existingMap: lastReadByConversation.value,
        defaultReadTimestamp: defaultRead,
      })
      lastReadByConversation.value = map

      const oldestRead = computeOldestReadTimestamp(Object.values(map))
      if (!oldestRead) return

      let query: any = supabase
        .from('messages')
        .select('id, conversation_id, user_id, content, created_at, deleted_at, reply_to_id')
        .gt('created_at', oldestRead)

      if (convIds.length > 0 && typeof query.in === 'function') {
        query = query.in('conversation_id', convIds)
      }
      query = query.order('created_at', { ascending: true })
      if (typeof query.limit === 'function') {
        query = query.limit(1000)
      }

      let { data: recentMessages } = await query

      if (recentMessages) {
        const decryptedRecent = await decryptMessageRows(recentMessages as any, e2ee.key.value)
        const snapshot = computeUnreadSnapshot({
          messages: decryptedRecent as any,
          lastReadByConversation: map,
          activeConversationId: activeConversationId.value,
          currentUserId: current.id,
          currentDisplayName: current.display_name,
        })
        unreadCounts.value = snapshot.unreadCounts
        unreadMentions.value = snapshot.unreadMentions
      }
    } catch {
      // Ignore unread hydration failure
    }
  }
  const loadChannelReadsAndUnreads = loadConversationReadsAndUnreads

  async function hydrateMessagesWithReactionsAndReplies(
    rows: any[],
  ): Promise<Array<Omit<ChatMessage, 'status'>>> {
    if (!rows || rows.length === 0) return []

    const currentConvId = activeConversationId.value
    const decryptedRows = await decryptMessageRows(rows, e2ee.key.value, currentConvId)

    const messageIds = decryptedRows.map(r => r.id)
    const reactionsByMsgId = new Map<string, MessageReaction[]>()

    try {
      const { data: reactionRows } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds)

      if (reactionRows) {
        for (const r of reactionRows as MessageReaction[]) {
          const list = reactionsByMsgId.get(r.message_id) || []
          list.push(r)
          reactionsByMsgId.set(r.message_id, list)
        }
      }
    } catch {
      // Ignore reaction hydration errors
    }

    const knownById = new Map<string, any>()
    for (const m of messages.value) {
      knownById.set(m.id, m)
    }
    for (const r of decryptedRows) {
      knownById.set(r.id, r)
    }

    return decryptedRows.map((r) => {
      const parent = r.reply_to_id ? knownById.get(r.reply_to_id) : null
      let parentContent = parent?.content
      if (parentContent && isImagePayload(parentContent)) {
        parentContent = formatImageMessageSummary(parseImagePayload(parentContent)?.images.length || 1)
      }
      return {
        ...r,
        conversation_id: r.conversation_id || r.channel_id || currentConvId || '',
        channel_id: r.channel_id || r.conversation_id || currentConvId || '',
        reactions: reactionsByMsgId.get(r.id) || r.reactions || [],
        reply_to: parent
          ? {
              id: parent.id,
              user_id: parent.user_id,
              content: parentContent,
              deleted_at: parent.deleted_at || null,
              author: parent.author,
              encryption: parent.encryption,
            }
          : (r.reply_to || null),
      }
    })
  }

  const connectionManager = createConnectionManager(async () => {
    return await reconnectChat()
  })

  const connectionStatus = connectionManager.status
  const reconnectCountdownSec = computed<number>(() => {
    return Math.ceil(connectionManager.nextRetryMs.value / 1000)
  })

  async function loadAllProfiles(): Promise<void> {
    try {
      let query: any = supabase
        .from('profiles')
        .select('id, email, display_name, avatar_color, avatar_url')
        .order('display_name', { ascending: true })

      if (typeof query.limit === 'function') {
        query = query.limit(200)
      }

      const { data, error } = await query

      if (data && !error) {
        allProfiles.value = data as Profile[]
        for (const p of data as Profile[]) {
          profilesCache.set(p.id, p)
        }
      }
    } catch {
      // Ignore profile directory load error
    }
  }

  const contactsActions = createContactsActions({
    supabase,
    authProfile,
    contacts,
    profilesCache,
    allProfiles,
    syncOnlineFriends,
  })
  const {
    findUserByEmail,
    lookupUserByEmail,
    loadContacts,
    addContact,
    removeContact,
  } = contactsActions

  async function loadConversations(): Promise<void> {
    const current = authProfile.currentProfile.value
    if (!current?.id) return

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*, members:conversation_members(*, profile:profiles(*))')
        .order('updated_at', { ascending: false })

      if (data && !error && data.length > 0) {
        const convs: Conversation[] = (data as any[]).map((c) => {
          let peer: Profile | null = null
          if (c.type === 'direct' && c.members) {
            const peerMember = c.members.find((m: any) => m.user_id !== current.id)
            peer = peerMember?.profile || profilesCache.get(peerMember?.user_id) || null
          }
          const existingConv = conversations.value.find(item => item.id === c.id)
          const matchingMsgs = messages.value.filter(
            m => m.conversation_id === c.id || m.channel_id === c.id,
          )
          const lastMsg = matchingMsgs.length > 0
            ? matchingMsgs[matchingMsgs.length - 1]
            : (existingConv?.lastMessage || c.lastMessage || null)
          return {
            id: c.id,
            type: c.type,
            title: c.title,
            created_by: c.created_by,
            created_at: c.created_at,
            updated_at: lastMsg?.created_at || c.updated_at,
            members: c.members || [],
            peer,
            lastMessage: lastMsg,
            unreadCount: unreadCounts.value[c.id] || 0,
            background_url: c.background_url || null,
          }
        })
        conversations.value = convs
        if (!activeConversationId.value && convs.length > 0) {
          await selectConversation(convs[0].id)
        }
      }
    } catch {
      // Failed loading conversations
    }
  }

  async function fetchGapMessages(): Promise<void> {
    const convId = activeConversationId.value
    if (!convId) return
    const lastTimestamp = messagesStore.getLastConfirmedTimestamp()

    try {
      let query = supabase
        .from('messages')
        .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url, email)')
        .eq('conversation_id', convId)

      if (lastTimestamp) {
        query = query.gt('created_at', lastTimestamp).order('created_at', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: true }).limit(PAGE_SIZE)
      }

      let { data, error } = await query

      if (activeConversationId.value !== convId) return

      if (data && !error && data.length > 0) {
        cacheProfilesFromMessages(data)
        const hydrated = await hydrateMessagesWithReactionsAndReplies(data)
        if (activeConversationId.value !== convId) return
        messagesStore.mergeGapMessages(hydrated)
      }
    } catch {
      // Ignored
    }
  }

  async function reconnectChat(): Promise<boolean> {
    try {
      const p1 = subscribeWithPromise(presenceChannel)
      const p2 = subscribeWithPromise(dbChangesChannel)
      const p3 = activeConversationId.value ? subscribeWithPromise(typingChannel) : Promise.resolve(true)
      const results = await Promise.all([p1, p2, p3])
      const ok = results.every(Boolean)
      if (ok) {
        await fetchGapMessages()
        await loadConversationReadsAndUnreads()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  function setupPresenceSubscription(): void {
    if (presenceChannel) {
      supabase.removeChannel(presenceChannel)
    }

    const current = authProfile.currentProfile.value
    if (!current) return

    presenceChannel = supabase.channel('presence:global', {
      config: { presence: { key: current.id } },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel?.presenceState() || {}
        rawOnlineUsers.value = deduplicatePresenceState(state as any)
        syncOnlineFriends()
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel?.track({
            user_id: current.id,
            display_name: current.display_name,
            avatar_color: current.avatar_color,
            avatar_url: current.avatar_url || null,
            online_at: new Date().toISOString(),
          })
          connectionManager.handleConnected()
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          connectionManager.handleDisconnect()
        }
      })
  }

  function setupDbChangesSubscription(): void {
    if (dbChangesChannel) {
      supabase.removeChannel(dbChangesChannel)
    }

    dbChangesChannel = supabase
      .channel('chat:db_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newRow = payload.new as any
          const currentId = authProfile.currentProfile.value?.id
          const convId = newRow.conversation_id || newRow.channel_id

          let targetConv = conversations.value.find(c => c.id === convId)
          if (!targetConv) {
            try {
              const { data: fetchedConv } = await supabase
                .from('conversations')
                .select('*, members:conversation_members(*, profile:profiles(*))')
                .eq('id', convId)
                .single()
              if (fetchedConv) {
                targetConv = fetchedConv as Conversation
                if (!conversations.value.some(c => c.id === targetConv!.id)) {
                  conversations.value = [targetConv, ...conversations.value]
                }
              }
            } catch {
              // ignore fetch failure
            }
          }

          const decryptedRow = await decryptMessageRow(
            newRow,
            e2ee.key.value,
            activeConversationId.value,
          )

          const author = await resolveMessageAuthor({
            userId: decryptedRow.user_id,
            existingAuthor: decryptedRow.author,
            conversationId: convId,
            activeConversationId: activeConversationId.value,
            profilesCache,
            fetchProfile: async (userId: string) => {
              try {
                const { data } = await supabase
                  .from('profiles')
                  .select('id, email, display_name, avatar_color, avatar_url')
                  .eq('id', userId)
                  .single()
                return (data as Profile) || undefined
              } catch {
                return undefined
              }
            },
          })

          const parentMsg = decryptedRow.reply_to_id
            ? messages.value.find(m => m.id === decryptedRow.reply_to_id)
            : undefined
          let parentContent = parentMsg?.content
          if (parentContent && isImagePayload(parentContent)) {
            parentContent = formatImageMessageSummary(parseImagePayload(parentContent)?.images.length || 1)
          }
          const replyTarget: ReplyTarget | null = parentMsg
            ? {
                id: parentMsg.id,
                user_id: parentMsg.user_id,
                content: parentContent,
                deleted_at: parentMsg.deleted_at || null,
                author: parentMsg.author,
                encryption: parentMsg.encryption,
              }
            : (decryptedRow.reply_to || null)

          const fullDecryptedRow = {
            ...decryptedRow,
            conversation_id: convId,
            channel_id: convId,
            author,
            reply_to: replyTarget,
            reactions: [],
          }

          handleIncomingRealtimeMessage({
            row: fullDecryptedRow,
            activeConversationId: activeConversationId.value,
            messagesStore,
            typingTracker,
            unreadCounts: unreadCounts.value,
            unreadMentions: unreadMentions.value,
            currentUserId: authProfile.currentProfile.value?.id,
            currentDisplayName: authProfile.currentProfile.value?.display_name,
            conversations: conversations.value,
            notificationManager: notification,
            onNavigate: (id) => selectConversation(id),
          })
          if (targetConv) {
            targetConv.lastMessage = fullDecryptedRow as any
            targetConv.updated_at = decryptedRow.created_at
          }
          if (convId === activeConversationId.value) {
            markConversationRead(convId, false)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        async (payload) => {
          const decryptedNew = payload.new
            ? await decryptMessageRow(payload.new as any, e2ee.key.value, activeConversationId.value)
            : payload.new
          const decryptedOld = payload.old
            ? await decryptMessageRow(payload.old as any, e2ee.key.value, activeConversationId.value)
            : payload.old

          handleRealtimeMessageUpdate({
            row: decryptedNew as any,
            oldRow: decryptedOld as any,
            activeConversationId: activeConversationId.value,
            messagesStore,
            unreadCounts: unreadCounts.value,
            unreadMentions: unreadMentions.value,
            lastReadByConversation: lastReadByConversation.value,
            currentUserId: authProfile.currentProfile.value?.id,
            currentDisplayName: authProfile.currentProfile.value?.display_name,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          handleRealtimeReactionEvent({
            eventType: 'INSERT',
            reaction: payload.new as MessageReaction,
            activeConversationId: activeConversationId.value,
            messagesStore,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          handleRealtimeReactionEvent({
            eventType: 'DELETE',
            reaction: payload.old as MessageReaction,
            activeConversationId: activeConversationId.value,
            messagesStore,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        async (payload) => {
          const newConv = payload.new as Conversation
          if (!conversations.value.some(c => c.id === newConv.id)) {
            try {
              const { data } = await supabase
                .from('conversations')
                .select('*, members:conversation_members(*, profile:profiles(*))')
                .eq('id', newConv.id)
                .single()
              if (data && !conversations.value.some(c => c.id === data.id)) {
                conversations.value = [data as Conversation, ...conversations.value]
              }
            } catch {
              // ignore
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const updated = payload.new as Conversation
          if (updated?.id) {
            conversations.value = conversations.value.map(c =>
              c.id === updated.id ? { ...c, ...updated } : c,
            )
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_members' },
        async (payload) => {
          const newMember = payload.new as ConversationMember
          const currentId = authProfile.currentProfile.value?.id
          if (newMember.user_id === currentId) {
            await loadConversations()
          } else {
            const conv = conversations.value.find(c => c.id === newMember.conversation_id)
            if (conv && !conv.members?.some(m => m.user_id === newMember.user_id)) {
              let p = profilesCache.get(newMember.user_id)
              if (!p) {
                const { data } = await supabase.from('profiles').select('*').eq('id', newMember.user_id).single()
                if (data) p = data as Profile
              }
              conv.members = [...(conv.members || []), { ...newMember, profile: p || null }]
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'conversation_members' },
        (payload) => {
          const oldMember = payload.old as ConversationMember
          const currentId = authProfile.currentProfile.value?.id
          if (oldMember.user_id === currentId) {
            conversations.value = conversations.value.filter(c => c.id !== oldMember.conversation_id)
            if (activeConversationId.value === oldMember.conversation_id) {
              const next = conversations.value[0]?.id || null
              if (next) {
                selectConversation(next)
              } else {
                activeConversationId.value = null
                messagesStore.setInitialHistory([], '')
              }
            }
          } else {
            const conv = conversations.value.find(c => c.id === oldMember.conversation_id)
            if (conv) {
              conv.members = conv.members?.filter(m => m.user_id !== oldMember.user_id)
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contacts' },
        (payload) => {
          const newContact = payload.new as Contact
          const currentId = authProfile.currentProfile.value?.id
          if (newContact.user_id === currentId && !contacts.value.some(c => c.contact_user_id === newContact.contact_user_id)) {
            const p = profilesCache.get(newContact.contact_user_id) || allProfiles.value.find(pr => pr.id === newContact.contact_user_id)
            contacts.value = [...contacts.value, { ...newContact, profile: p || null }]
            syncOnlineFriends()

            if (!p) {
              supabase
                .from('profiles')
                .select('*')
                .eq('id', newContact.contact_user_id)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    profilesCache.set(data.id, data as Profile)
                    allProfiles.value = [...allProfiles.value.filter(x => x.id !== data.id), data as Profile]
                    contacts.value = contacts.value.map(c => c.contact_user_id === data.id ? { ...c, profile: data as Profile } : c)
                    syncOnlineFriends()
                  }
                })
                .catch(() => {})
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'contacts' },
        (payload) => {
          const oldContact = payload.old as Contact
          const currentId = authProfile.currentProfile.value?.id
          if (oldContact.user_id === currentId) {
            contacts.value = contacts.value.filter(c => c.contact_user_id !== oldContact.contact_user_id)
            syncOnlineFriends()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload) => {
          const newProfile = payload.new as Profile
          if (newProfile?.id) {
            profilesCache.set(newProfile.id, newProfile)
            if (!allProfiles.value.some(p => p.id === newProfile.id)) {
              allProfiles.value = [...allProfiles.value, newProfile].sort((a, b) =>
                a.display_name.localeCompare(b.display_name),
              )
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updatedProfile = payload.new as Profile
          if (updatedProfile?.id) {
            allProfiles.value = allProfiles.value.map(p =>
              p.id === updatedProfile.id ? { ...p, ...updatedProfile } : p,
            )
            rawOnlineUsers.value = applyRealtimeProfileUpdate({
              profile: updatedProfile,
              profilesCache,
              messagesStore,
              onlineFriends: rawOnlineUsers.value,
            })
            syncOnlineFriends()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_reads' },
        (payload) => {
          const row = payload.new as any
          if (row && row.conversation_id && row.user_id && row.last_read_at) {
            const existing = conversationReadsByConv.value[row.conversation_id] || {}
            conversationReadsByConv.value = {
              ...conversationReadsByConv.value,
              [row.conversation_id]: {
                ...existing,
                [row.user_id]: row.last_read_at,
              },
            }
            if (row.user_id === authProfile.currentProfile.value?.id) {
              lastReadByConversation.value[row.conversation_id] = row.last_read_at
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          connectionManager.handleConnected()
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          connectionManager.handleDisconnect()
        }
      })
  }

  function setupTypingSubscription(conversationId: string): void {
    if (typingChannel) {
      supabase.removeChannel(typingChannel)
    }

    typingTracker.clearAll()

    typingChannel = supabase.channel(`typing:${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload?.payload) {
          typingTracker.recordTyping(payload.payload)
        }
      })
      .subscribe()
  }

  function notifyTyping(): void {
    const now = Date.now()
    if (now - lastTypingSentAt < 1500) {
      return
    }
    lastTypingSentAt = now

    const current = authProfile.currentProfile.value
    if (!current || !typingChannel) return

    typingChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: current.id,
        display_name: current.display_name,
      },
    })
  }

  async function selectConversation(conversationId: string): Promise<void> {
    if (activeConversationId.value === conversationId && messagesStore.messages.value.length > 0) {
      markConversationRead(conversationId)
      return
    }
    useImageAttachmentCache().revokeAllUrls()
    const priorLastRead = lastReadByConversation.value[conversationId] || null
    const hadUnreads = (unreadCounts.value[conversationId] || 0) > 0
    activeChannelUnreadSince.value = hadUnreads ? priorLastRead : null
    activeConversationId.value = conversationId
    unreadCounts.value[conversationId] = 0
    unreadMentions.value[conversationId] = 0
    markConversationRead(conversationId)
    setupTypingSubscription(conversationId)

    try {
      let { data, error } = await supabase
        .from('messages')
        .select('*, author:profiles!messages_user_id_fkey(id, email, display_name, avatar_color, avatar_url)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      // Guard against race condition if user switched conversations while query was in flight
      if (activeConversationId.value !== conversationId) {
        return
      }

      if (data && !error) {
        hasMoreHistory.value = data.length >= PAGE_SIZE
        const chronological = [...data].reverse()
        cacheProfilesFromMessages(chronological)
        const hydrated = await hydrateMessagesWithReactionsAndReplies(chronological)
        if (activeConversationId.value !== conversationId) {
          return
        }
        messagesStore.setInitialHistory(hydrated, conversationId)
        const targetConv = conversations.value.find(c => c.id === conversationId)
        if (targetConv && hydrated.length > 0) {
          targetConv.lastMessage = hydrated[hydrated.length - 1] as ChatMessage
          targetConv.updated_at = hydrated[hydrated.length - 1].created_at || targetConv.updated_at
        }
      } else {
        messagesStore.setInitialHistory([], conversationId)
      }
    } catch {
      if (activeConversationId.value === conversationId) {
        messagesStore.setInitialHistory([], conversationId)
      }
    }
  }
  const selectChannel = selectConversation

  async function loadOlderMessages(): Promise<number> {
    const convId = activeConversationId.value
    if (!hasMoreHistory.value || isLoadingHistory.value || !convId) {
      return 0
    }

    const cursor = messagesStore.getOldestCursor()
    if (!cursor) {
      return 0
    }

    isLoadingHistory.value = true
    try {
      let query = supabase
        .from('messages')
        .select('*, author:profiles!messages_user_id_fkey(id, email, display_name, avatar_color, avatar_url)')
        .eq('conversation_id', convId)
        .or(`created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      let { data, error } = await query

      if (activeConversationId.value !== convId) {
        return 0
      }

      if (data && !error) {
        if (data.length < PAGE_SIZE) {
          hasMoreHistory.value = false
        }
        const chronological = [...data].reverse()
        cacheProfilesFromMessages(chronological)
        const hydrated = await hydrateMessagesWithReactionsAndReplies(chronological)
        if (activeConversationId.value !== convId) {
          return 0
        }
        return messagesStore.prependHistoryPage(hydrated)
      }
    } finally {
      isLoadingHistory.value = false
    }
    return 0
  }

  const conversationsActions = createConversationsActions({
    supabase,
    authProfile,
    conversations,
    activeConversationId,
    unreadCounts,
    profilesCache,
    allProfiles,
    selectConversation,
    loadConversations,
    messagesStore,
    sendMessage: (content: string, replyTo?: any, conversationId?: string) => sendMessage(content, replyTo, conversationId),
    findUserByEmail,
  })

  const {
    openOrCreateDirectChat,
    createGroup,
    createGroupChat,
    addMemberToGroup,
    addGroupMember,
    leaveGroup,
    leaveGroupChat,
    updateGroupTitle,
    updateGroupName,
    updateChatBackground,
    removeChatBackground,
  } = conversationsActions

  const createChannel = async (name: string) => createGroup(name, []).then(channel => ({ channel, error: null })).catch((err: any) => ({ channel: null, error: err?.message || 'Failed to create channel.' }))
  const openOrCreateDm = async (peerUserId: string) => openOrCreateDirectChat(peerUserId).then(channel => ({ channel, error: null })).catch((err: any) => ({ channel: null, error: err?.message || 'Failed to open direct message.' }))

  async function sendMessage(
    content: string,
    replyToId?: string | null,
    targetConversationId?: string | null,
  ): Promise<void> {
    const conversationId = targetConversationId || activeConversationId.value
    if (!conversationId || !isValidMessageContent(content)) return
    let current = authProfile.currentProfile.value
    if (!current?.id) {
      current = await authProfile.ensureProfile()
    }
    if (!current?.id) return

    const isCurrentActive = conversationId === activeConversationId.value

    const clientId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')

    const parentMsg = replyToId ? messages.value.find(m => m.id === replyToId) : undefined
    let parentContent = parentMsg?.content
    if (parentContent && isImagePayload(parentContent)) {
      parentContent = formatImageMessageSummary(parseImagePayload(parentContent)?.images.length || 1)
    }
    const replyTarget: ReplyTarget | null = parentMsg
      ? {
          id: parentMsg.id,
          user_id: parentMsg.user_id,
          content: parentContent,
          deleted_at: parentMsg.deleted_at || null,
          author: parentMsg.author,
        }
      : null

    const plaintext = content.trim()

    let optimisticMessage: any = null
    if (isCurrentActive) {
      optimisticMessage = messagesStore.addOptimisticMessage({
        clientId,
        conversationId,
        channelId: conversationId,
        user: current,
        content: plaintext,
        replyToId: replyToId || null,
        replyTo: replyTarget,
        encryption: 'e2ee',
      })
    }

    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (targetConv) {
      if (optimisticMessage) {
        targetConv.lastMessage = optimisticMessage
      }
      targetConv.updated_at = new Date().toISOString()
    }

    if (!e2ee.key.value) {
      if (isCurrentActive) {
        messagesStore.markMessageFailed(clientId)
      }
      return
    }

    try {
      const encryptedContent = await encryptContent(e2ee.key.value, plaintext, conversationId)

      let { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          conversation_id: conversationId,
          user_id: current.id,
          content: encryptedContent,
          reply_to_id: replyToId || null,
        })
        .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await supabase
            .from('messages')
            .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            const decryptedExisting = await decryptMessageRow(existing, e2ee.key.value, conversationId)
            const sentMsg = { ...decryptedExisting, reply_to: replyTarget, status: 'sent' as const }
            if (isCurrentActive) {
              messagesStore.markMessageSent(clientId, sentMsg)
            }
            if (targetConv) {
              targetConv.lastMessage = sentMsg as ChatMessage
              targetConv.updated_at = sentMsg.created_at || targetConv.updated_at
            }
          } else if (isCurrentActive) {
            messagesStore.markMessageFailed(clientId)
          }
        } else if (isCurrentActive) {
          messagesStore.markMessageFailed(clientId)
        }
      } else if (data) {
        const decryptedData = await decryptMessageRow(data, e2ee.key.value, conversationId)
        const sentMsg = { ...decryptedData, reply_to: replyTarget, status: 'sent' as const }
        if (isCurrentActive) {
          messagesStore.markMessageSent(clientId, sentMsg)
        }
        if (targetConv) {
          targetConv.lastMessage = sentMsg as ChatMessage
          targetConv.updated_at = sentMsg.created_at || targetConv.updated_at
        }
      }
    } catch {
      if (isCurrentActive) {
        messagesStore.markMessageFailed(clientId)
      }
    }
  }

  async function sendBuzz(): Promise<void> {
    const conversationId = activeConversationId.value
    if (!conversationId) return
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    const actorName = current?.display_name || 'Someone'
    const payload = serializeSystemMessage({
      type: 'system',
      event: 'buzz',
      actorName,
    })
    await sendMessage(payload, undefined, conversationId)
  }

  async function sendImages(
    files: File[],
    captionOrClientId?: string,
    overrideClientId?: string,
  ): Promise<boolean> {
    let caption: string | undefined
    let clientIdOverride: string | undefined

    if (overrideClientId) {
      caption = captionOrClientId
      clientIdOverride = overrideClientId
    } else if (captionOrClientId) {
      if (pendingImageFiles.has(captionOrClientId)) {
        clientIdOverride = captionOrClientId
        caption = pendingImageFiles.get(captionOrClientId)?.caption
      } else {
        caption = captionOrClientId
      }
    }

    const conversationId = clientIdOverride
      ? (pendingImageFiles.get(clientIdOverride)?.conversationId || pendingImageFiles.get(clientIdOverride)?.channelId || activeConversationId.value)
      : activeConversationId.value

    if (!conversationId) return false

    let current = authProfile.currentProfile.value
    if (!current?.id) {
      current = await authProfile.ensureProfile()
    }
    if (!current?.id) return false

    const validation = validateImageFiles(files)
    if (!validation.valid) return false

    const key = e2ee.key.value
    if (!key) return false

    const clientId = clientIdOverride || (
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')
    )

    pendingImageFiles.set(clientId, { files, caption, conversationId, channelId: conversationId })

    const createdBlobUrls: string[] = []
    function revokeCreatedBlobs() {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        for (const url of createdBlobUrls) {
          try {
            URL.revokeObjectURL(url)
          } catch {}
        }
      }
    }

    if (!clientIdOverride) {
      const localPreviews: LocalImageAttachment[] = files.map((file) => {
        const localUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : ''
        if (localUrl) {
          createdBlobUrls.push(localUrl)
        }
        return {
          file,
          localUrl,
          width: 0,
          height: 0,
        }
      })

      const optimisticPayload: ImageMessagePayload = {
        type: 'images',
        images: localPreviews.map((p) => ({
          path: p.localUrl,
          mimeType: p.file.type || 'image/jpeg',
          width: p.width,
          height: p.height,
          size: p.file.size,
        })),
        ...(caption?.trim() ? { caption: caption.trim() } : {}),
      }

      const optimisticContent = JSON.stringify(optimisticPayload)
      const optimisticMessage = messagesStore.addOptimisticMessage({
        clientId,
        conversationId,
        channelId: conversationId,
        user: current,
        content: optimisticContent,
        encryption: 'e2ee',
      })
      const targetConv = conversations.value.find(c => c.id === conversationId)
      if (targetConv) {
        if (optimisticMessage) {
          targetConv.lastMessage = optimisticMessage
        }
        targetConv.updated_at = new Date().toISOString()
      }
    }

    const uploadedMetadatas: EncryptedImageMetadata[] = []

    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      try {
        const resized = await resizeImage(file)
        const arrayBuffer = await resized.blob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        const encryptedBytes = await encryptBinary(key, bytes, conversationId)
        const storagePrefix = conversationId.startsWith('ch-') ? 'channels' : 'conversations'
        const storagePath = `${storagePrefix}/${conversationId}/${clientId}/${index}.enc`

        const { error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(storagePath, encryptedBytes, {
            contentType: 'application/octet-stream',
            upsert: true,
          })

        if (uploadError) {
          messagesStore.markMessageFailed(clientId)
          return false
        }

        uploadedMetadatas.push({
          path: storagePath,
          mimeType: file.type || 'image/jpeg',
          width: resized.width,
          height: resized.height,
          size: resized.blob.size,
        })
      } catch {
        messagesStore.markMessageFailed(clientId)
        return false
      }
    }

    const finalPayload: ImageMessagePayload = {
      type: 'images',
      images: uploadedMetadatas,
      ...(caption?.trim() ? { caption: caption.trim() } : {}),
    }
    const payloadJson = JSON.stringify(finalPayload)

    try {
      const encryptedEnvelope = await encryptContent(key, payloadJson, conversationId)

      let { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          conversation_id: conversationId,
          user_id: current.id,
          content: encryptedEnvelope,
        })
        .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await supabase
            .from('messages')
            .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            revokeCreatedBlobs()
            pendingImageFiles.delete(clientId)
            messagesStore.markMessageSent(clientId, existing.id, existing.created_at)
            return true
          }
        }
        messagesStore.markMessageFailed(clientId)
        return false
      }

      if (data) {
        revokeCreatedBlobs()
        pendingImageFiles.delete(clientId)
        messagesStore.markMessageSent(clientId, data.id, data.created_at)
        return true
      }

      messagesStore.markMessageFailed(clientId)
      return false
    } catch {
      messagesStore.markMessageFailed(clientId)
      return false
    }
  }

  async function retryMessage(clientId: string): Promise<void> {
    const retrying = messagesStore.markMessageRetrying(clientId)
    if (!retrying) return

    if (!e2ee.key.value) {
      messagesStore.markMessageFailed(clientId)
      return
    }

    const conversationId = retrying.conversation_id || retrying.channel_id
    if (!conversationId) {
      messagesStore.markMessageFailed(clientId)
      return
    }

    if (isImagePayload(retrying.content)) {
      const pending = pendingImageFiles.get(clientId)
      if (!pending) {
        messagesStore.markMessageFailed(clientId)
        return
      }
      const ok = await sendImages(pending.files, pending.caption, clientId)
      if (!ok) {
        messagesStore.markMessageFailed(clientId)
      }
      return
    }

    try {
      const encryptedContent = await encryptContent(
        e2ee.key.value,
        retrying.content,
        conversationId,
      )

      let { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          conversation_id: conversationId,
          user_id: retrying.user_id,
          content: encryptedContent,
          reply_to_id: retrying.reply_to_id || null,
        })
        .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await supabase
            .from('messages')
            .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            const decryptedExisting = await decryptMessageRow(
              existing,
              e2ee.key.value,
              conversationId,
            )
            messagesStore.markMessageSent(clientId, { ...decryptedExisting, reply_to: retrying.reply_to })
          } else {
            messagesStore.markMessageFailed(clientId)
          }
        } else {
          messagesStore.markMessageFailed(clientId)
        }
      } else if (data) {
        const decryptedData = await decryptMessageRow(
          data,
          e2ee.key.value,
          conversationId,
        )
        messagesStore.markMessageSent(clientId, { ...decryptedData, reply_to: retrying.reply_to })
      }
    } catch {
      messagesStore.markMessageFailed(clientId)
    }
  }

  function dismissMessage(clientId: string): void {
    pendingImageFiles.delete(clientId)
    messagesStore.dismissMessage(clientId)
  }

  async function editMessage(
    messageId: string,
    newContent: string,
  ): Promise<{ error: string | null }> {
    const targetMsg = messages.value.find(m => m.id === messageId)
    if (targetMsg && isImagePayload(targetMsg.content)) {
      return { error: 'Image messages cannot be edited.' }
    }

    if (!isValidMessageContent(newContent)) {
      return { error: 'Message content must be 1–4000 characters.' }
    }
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }
    if (!e2ee.key.value) {
      return { error: 'Encryption key is locked.' }
    }

    const trimmed = newContent.trim()
    const editedAt = new Date().toISOString()
    const conversationId = targetMsg?.conversation_id || targetMsg?.channel_id || activeConversationId.value
    if (!conversationId) {
      return { error: 'Conversation not found.' }
    }

    const originalContent = targetMsg?.content
    const originalEditedAt = targetMsg?.edited_at ?? null
    const originalEncryption = targetMsg?.encryption

    messagesStore.reconcileUpdatedMessage({
      id: messageId,
      content: trimmed,
      edited_at: editedAt,
      encryption: 'e2ee',
    })

    try {
      const encryptedContent = await encryptContent(e2ee.key.value, trimmed, conversationId)

      const { error } = await supabase
        .from('messages')
        .update({ content: encryptedContent, edited_at: editedAt })
        .eq('id', messageId)
        .eq('user_id', current.id)

      if (error) {
        messagesStore.reconcileUpdatedMessage({
          id: messageId,
          content: originalContent,
          edited_at: originalEditedAt,
          encryption: originalEncryption,
        })
        return { error: error.message }
      }
      return { error: null }
    } catch (err: any) {
      messagesStore.reconcileUpdatedMessage({
        id: messageId,
        content: originalContent,
        edited_at: originalEditedAt,
        encryption: originalEncryption,
      })
      return { error: err?.message || 'Failed to encrypt message.' }
    }
  }

  async function togglePinMessage(messageId: string): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetMsg = messages.value.find(m => m.id === messageId)
    if (!targetMsg) {
      return { error: 'Message not found.' }
    }

    const originalPinnedAt = targetMsg.pinned_at ?? null
    const originalPinnedBy = targetMsg.pinned_by ?? null
    const wasPinned = Boolean(targetMsg.pinned_at)
    const newPinnedAt = wasPinned ? null : new Date().toISOString()
    const newPinnedBy = wasPinned ? null : current.id

    // Optimistic update
    messagesStore.reconcileUpdatedMessage({
      id: messageId,
      pinned_at: newPinnedAt,
      pinned_by: newPinnedBy,
    })

    const { data, error } = await supabase.rpc('toggle_pin_message', {
      p_message_id: messageId,
    })

    const rpcError = error ? error.message : ((data as any)?.error || null)

    if (rpcError) {
      // Revert optimistic update
      messagesStore.reconcileUpdatedMessage({
        id: messageId,
        pinned_at: originalPinnedAt,
        pinned_by: originalPinnedBy,
      })
      return { error: rpcError }
    }

    return { error: null }
  }

  async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetMsg = messages.value.find(m => m.id === messageId)
    const originalDeletedAt = targetMsg?.deleted_at ?? null

    const deletedAt = new Date().toISOString()
    messagesStore.reconcileUpdatedMessage({
      id: messageId,
      deleted_at: deletedAt,
    })

    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: deletedAt })
      .eq('id', messageId)
      .eq('user_id', current.id)

    if (error) {
      messagesStore.reconcileUpdatedMessage({
        id: messageId,
        deleted_at: originalDeletedAt,
      })
      return { error: error.message }
    }

    if (targetMsg && isImagePayload(targetMsg.content)) {
      const parsed = parseImagePayload(targetMsg.content)
      if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) {
        const paths = parsed.images.map(img => img.path).filter(Boolean)
        if (paths.length > 0) {
          try {
            await supabase.storage.from('message-attachments').remove(paths)
          } catch {
            // Ignore removal errors
          }
        }
      }
    }

    return { error: null }
  }

  async function toggleReaction(
    messageId: string,
    emoji: string,
  ): Promise<{ error: string | null }> {
    const conversationId = activeConversationId.value
    if (!isValidReactionEmoji(emoji) || !conversationId) {
      return { error: 'Invalid reaction.' }
    }
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetMsg = messages.value.find(m => m.id === messageId)
    const alreadyReacted = Boolean(
      targetMsg?.reactions?.some(r => r.user_id === current.id && r.emoji === emoji),
    )

    if (alreadyReacted) {
      messagesStore.applyReactionRemoved({
        message_id: messageId,
        user_id: current.id,
        emoji,
      })
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .match({ message_id: messageId, user_id: current.id, emoji })
      if (error) {
        messagesStore.applyReactionAdded({
          message_id: messageId,
          conversation_id: conversationId,
          channel_id: conversationId,
          user_id: current.id,
          emoji,
        })
        return { error: error.message }
      }
      return { error: null }
    } else {
      const optimisticReaction: MessageReaction = {
        message_id: messageId,
        conversation_id: conversationId,
        channel_id: conversationId,
        user_id: current.id,
        emoji,
      }
      messagesStore.applyReactionAdded(optimisticReaction)
      const { error } = await supabase
        .from('message_reactions')
        .insert(optimisticReaction)
      if (error) {
        messagesStore.applyReactionRemoved({
          message_id: messageId,
          user_id: current.id,
          emoji,
        })
        return { error: error.message }
      }
      return { error: null }
    }
  }

  async function retryConnectionNow(): Promise<void> {
    await connectionManager.retryNow()
  }

  function onOnline(): void {
    connectionManager.retryNow()
  }

  function onOffline(): void {
    connectionManager.handleDisconnect()
  }

  async function initializeChat(): Promise<void> {
    isDisposed = false
    await authProfile.ensureProfile()
    if (isDisposed) return
    await loadAllProfiles()
    if (isDisposed) return
    await loadContacts()
    if (isDisposed) return
    await loadConversations()
    if (isDisposed) return
    await loadConversationReadsAndUnreads()
    if (isDisposed) return

    setupPresenceSubscription()
    setupDbChangesSubscription()

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
    }
  }

  async function syncOwnProfile(profile: Profile): Promise<void> {
    rawOnlineUsers.value = applyRealtimeProfileUpdate({
      profile,
      profilesCache,
      messagesStore,
      onlineFriends: rawOnlineUsers.value,
    })
    syncOnlineFriends()
    if (presenceChannel) {
      try {
        await presenceChannel.track({
          user_id: profile.id,
          display_name: profile.display_name,
          avatar_color: profile.avatar_color,
          avatar_url: profile.avatar_url || null,
          online_at: new Date().toISOString(),
        })
      } catch {
        // Ignore presence track error
      }
    }
  }

  function cleanupChat(): void {
    isDisposed = true
    pendingImageFiles.clear()
    readDebouncer.cancelAll()
    if (presenceChannel) supabase.removeChannel(presenceChannel)
    if (dbChangesChannel) supabase.removeChannel(dbChangesChannel)
    if (typingChannel) supabase.removeChannel(typingChannel)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
    connectionManager.dispose()
    typingTracker.clearAll()
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    contacts,
    findUserByEmail,
    addContact,
    removeContact,
    loadContacts,
    selectConversation,
    openOrCreateDirectChat,
    createGroup,
    addMemberToGroup,
    leaveGroup,
    updateGroupTitle,
    updateChatBackground,
    removeChatBackground,
    loadConversations,

    // Transitional aliases for channels and legacy components
    channels,
    publicChannels,
    dmChannels,
    activeChannelId,
    activeChannel,
    selectChannel,
    createChannel,
    openOrCreateDm,

    // Messages state & actions
    messages,
    hasMoreHistory,
    isLoadingHistory,
    unreadCounts,
    unreadMentions,
    activeChannelUnreadSince,
    conversationReadsByConv,
    activeConversationReads,
    allProfiles,
    knownProfiles,
    onlineFriends,
    typingLabel,
    connectionStatus,
    reconnectCountdownSec,
    initializeChat,
    sendMessage,
    sendBuzz,
    sendImages,
    retryMessage,
    dismissMessage,
    editMessage,
    deleteMessage,
    togglePinMessage,
    toggleReaction,
    loadOlderMessages,
    notifyTyping,
    retryConnectionNow,
    syncOwnProfile,
    markChannelRead,
    markConversationRead,
    cleanupChat,
    soundEnabled: notification.soundEnabled,
    desktopEnabled: notification.desktopEnabled,
    notificationPermission: notification.permission,
    notificationToasts: notification.toasts,
    toggleSound: notification.toggleSound,
    toggleDesktop: notification.toggleDesktop,
    requestNotificationPermission: notification.requestPermission,
    dismissNotificationToast: notification.dismissToast,
    addNotificationToast: notification.addToast,
  }
}
