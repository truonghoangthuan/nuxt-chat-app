import { ref, computed, shallowReactive, type ComputedRef, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Channel, ChatMessage, MessageReaction, Profile, ReplyTarget, ConnectionStatus, ChannelRead, MessageEncryptionState } from '~/types/chat'
import {
  normalizeChannelSlug,
  isValidChannelSlug,
  isValidMessageContent,
  isValidReactionEmoji,
  doesMessageMentionUser,
  normalizeDmPair,
  getDmPeerId,
  canUserAccessChannel,
} from '~/utils/chat'
import { isEncryptedEnvelope, encryptContent, decryptContent } from '~/utils/crypto'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'
import { deduplicatePresenceState } from '~/composables/usePresenceState'
import { createConnectionManager } from '~/composables/useConnectionManager'
import { useAuthProfile } from '~/composables/useAuthProfile'
import { useE2ee } from '~/composables/useE2ee'

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
    channel_id?: string
    reply_to?: ReplyTarget | null
    encryption?: MessageEncryptionState
  },
>(row: T, key: CryptoKey | null, fallbackChannelId?: string | null): Promise<T> {
  if (typeof row.content !== 'string') {
    return row
  }

  const channelId = row.channel_id || fallbackChannelId || ''
  let content = row.content
  let encryption: MessageEncryptionState

  if (!content.startsWith('e2ee:v1:')) {
    encryption = 'legacy'
  } else if (!key || !channelId || !isEncryptedEnvelope(content)) {
    content = ''
    encryption = 'undecryptable'
  } else {
    try {
      content = await decryptContent(key, content, channelId)
      encryption = 'e2ee'
    } catch {
      content = ''
      encryption = 'undecryptable'
    }
  }

  let replyTo = row.reply_to
  if (replyTo && typeof replyTo.content === 'string' && replyTo.encryption === undefined) {
    let replyContent = replyTo.content
    let replyEncryption: MessageEncryptionState
    if (!replyContent.startsWith('e2ee:v1:')) {
      replyEncryption = 'legacy'
    } else if (!key || !channelId || !isEncryptedEnvelope(replyContent)) {
      replyContent = ''
      replyEncryption = 'undecryptable'
    } else {
      try {
        replyContent = await decryptContent(key, replyContent, channelId)
        replyEncryption = 'e2ee'
      } catch {
        replyContent = ''
        replyEncryption = 'undecryptable'
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
    channel_id?: string
    reply_to?: ReplyTarget | null
    encryption?: MessageEncryptionState
  },
>(
  rows: T[],
  key: CryptoKey | null,
  fallbackChannelId?: string | null,
): Promise<T[]> {
  return Promise.all(rows.map(row => decryptMessageRow(row, key, fallbackChannelId)))
}

export function computeUnreadSnapshot(params: {
  messages: Array<Pick<ChatMessage, 'id' | 'channel_id' | 'user_id' | 'content' | 'created_at' | 'deleted_at' | 'reply_to_id'>>
  lastReadByChannel: Record<string, string>
  activeChannelId: string | null
  currentUserId: string
  currentDisplayName?: string | null
}): {
  unreadCounts: Record<string, number>
  unreadMentions: Record<string, number>
} {
  const unreadCounts: Record<string, number> = {}
  const unreadMentions: Record<string, number> = {}

  for (const msg of params.messages) {
    if (!msg || msg.deleted_at) continue
    if (msg.channel_id === params.activeChannelId) continue
    if (params.currentUserId && msg.user_id === params.currentUserId) continue

    const lastReadIso = params.lastReadByChannel[msg.channel_id]
    if (lastReadIso && Date.parse(msg.created_at) <= Date.parse(lastReadIso)) {
      continue
    }

    unreadCounts[msg.channel_id] = (unreadCounts[msg.channel_id] || 0) + 1
    if (doesMessageMentionUser(msg.content, params.currentDisplayName)) {
      unreadMentions[msg.channel_id] = (unreadMentions[msg.channel_id] || 0) + 1
    }
  }

  return { unreadCounts, unreadMentions }
}

export function computeOldestReadTimestamp(timestamps: string[]): string | null {
  if (timestamps.length === 0) return null
  return timestamps.reduce((a, b) => {
    const tA = Date.parse(a)
    const tB = Date.parse(b)
    if (!Number.isNaN(tA) && !Number.isNaN(tB)) {
      return tA < tB ? a : b
    }
    return a < b ? a : b
  })
}

export function computeChannelReadMap(params: {
  channels: Array<{ id: string }>
  readRows?: Array<{ channel_id: string; last_read_at: string }> | null
  existingMap?: Record<string, string>
  defaultReadTimestamp: string
}): Record<string, string> {
  const map: Record<string, string> = {}
  if (params.readRows) {
    for (const r of params.readRows) {
      map[r.channel_id] = r.last_read_at
    }
  }
  for (const ch of params.channels) {
    if (!map[ch.id]) {
      map[ch.id] = params.existingMap?.[ch.id] || params.defaultReadTimestamp
    }
  }
  return map
}

export function createChannelReadDebouncer(
  upsertFn: (channelId: string, timestamp: string) => Promise<any>,
  delayMs = 2000,
) {
  const timers = new Map<string, any>()
  const pendingTimestamps = new Map<string, string>()

  function schedule(channelId: string, timestamp: string, immediate = false): Promise<void> | void {
    pendingTimestamps.set(channelId, timestamp)
    const existing = timers.get(channelId)
    if (existing) {
      clearTimeout(existing)
      timers.delete(channelId)
    }

    const flush = async () => {
      timers.delete(channelId)
      const ts = pendingTimestamps.get(channelId) || timestamp
      pendingTimestamps.delete(channelId)
      try {
        await upsertFn(channelId, ts)
      } catch {
        // Ignored
      }
    }

    if (immediate) {
      return flush()
    }

    const timer = setTimeout(flush, delayMs)
    timers.set(channelId, timer)
  }

  function cancelAll() {
    for (const t of timers.values()) {
      clearTimeout(t)
    }
    timers.clear()
    pendingTimestamps.clear()
  }

  return { schedule, cancelAll, timers }
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
  activeChannelId: string | null
  messagesStore: ReturnType<typeof createMessagesStore>
  typingTracker: ReturnType<typeof createTypingTracker>
  unreadCounts: Record<string, number>
  unreadMentions?: Record<string, number>
  currentUserId?: string
  currentDisplayName?: string | null
}): void {
  if (params.row.channel_id === params.activeChannelId) {
    params.messagesStore.reconcileIncomingMessage(params.row)
    params.typingTracker.clearUserTyping(params.row.user_id)
  } else {
    if (params.currentUserId && params.row.user_id === params.currentUserId) {
      return
    }
    params.unreadCounts[params.row.channel_id] = (params.unreadCounts[params.row.channel_id] || 0) + 1
    if (
      params.unreadMentions
      && !params.row.deleted_at
      && (!params.currentUserId || params.row.user_id !== params.currentUserId)
      && (
        doesMessageMentionUser(params.row.content, params.currentDisplayName)
        || (params.currentUserId && params.row.reply_to?.user_id === params.currentUserId)
      )
    ) {
      params.unreadMentions[params.row.channel_id] = (params.unreadMentions[params.row.channel_id] || 0) + 1
    }
  }
}

export function handleRealtimeMessageUpdate(params: {
  row: Partial<ChatMessage> & { id: string; channel_id?: string }
  oldRow?: Partial<ChatMessage> | null
  activeChannelId: string | null
  messagesStore: ReturnType<typeof createMessagesStore>
  unreadCounts?: Record<string, number>
  unreadMentions?: Record<string, number>
  lastReadByChannel?: Record<string, string>
  currentUserId?: string
  currentDisplayName?: string | null
}): void {
  const isInactive = Boolean(params.row.channel_id && params.row.channel_id !== params.activeChannelId)
  if (isInactive) {
    const channelId = params.row.channel_id!
    const isSoftDeleted = Boolean(params.row.deleted_at && !params.oldRow?.deleted_at)
    const isFromOtherUser = !params.currentUserId || !params.row.user_id || params.row.user_id !== params.currentUserId

    if (isSoftDeleted && isFromOtherUser) {
      const lastReadIso = params.lastReadByChannel?.[channelId]
      const isUnread = !lastReadIso || !params.row.created_at || Date.parse(params.row.created_at) > Date.parse(lastReadIso)

      if (isUnread) {
        if (params.unreadCounts && (params.unreadCounts[channelId] || 0) > 0) {
          params.unreadCounts[channelId] -= 1
        }
        const wasMention = Boolean(
          params.row.content
          && doesMessageMentionUser(params.row.content, params.currentDisplayName),
        )
        if (wasMention && params.unreadMentions && (params.unreadMentions[channelId] || 0) > 0) {
          params.unreadMentions[channelId] -= 1
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
  activeChannelId: string | null
  messagesStore: ReturnType<typeof createMessagesStore>
}): void {
  if (params.reaction.channel_id && params.reaction.channel_id !== params.activeChannelId) {
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
  channelId: string
  activeChannelId: string | null
  profilesCache: Map<string, Profile>
  fetchProfile: (userId: string) => Promise<Profile | undefined>
}): Promise<Profile | undefined> {
  if (params.existingAuthor) {
    params.profilesCache.set(params.existingAuthor.id, params.existingAuthor)
    return params.existingAuthor
  }
  if (params.channelId !== params.activeChannelId) {
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

export function hydrateDmChannelPeers(params: {
  channels: Channel[]
  currentUserId?: string | null
  profilesCache: Map<string, Profile>
  fallbackProfiles?: Profile[]
}): Channel[] {
  if (!params.currentUserId) return []
  return params.channels
    .filter(ch => Boolean(ch.is_dm) && canUserAccessChannel(ch, params.currentUserId))
    .map((ch) => {
      const peerId = getDmPeerId(ch, params.currentUserId)
      const peer = peerId
        ? params.profilesCache.get(peerId)
          || params.fallbackProfiles?.find(p => p.id === peerId)
          || ch.peer
          || null
        : null
      return {
        ...ch,
        peer,
      }
    })
}

export function shouldProcessChannelMessage(
  channel: Channel | undefined | null,
  currentUserId?: string | null,
): boolean {
  if (!channel) return false
  return canUserAccessChannel(channel, currentUserId)
}

export function useChatRoom() {
  const supabase = useSupabaseClient()
  const authProfile = useAuthProfile()
  const e2ee = useE2ee()

  const channels = ref<Channel[]>([])
  const activeChannelId = ref<string | null>(null)
  const allProfiles = ref<Profile[]>([])
  const profilesCache = shallowReactive(new Map<string, Profile>())
  let isDisposed = false
  const readDebouncer = createChannelReadDebouncer(async (channelId, timestamp) => {
    const current = authProfile.currentProfile.value
    if (!current?.id) return
    try {
      await supabase
        .from('channel_reads')
        .upsert({
          user_id: current.id,
          channel_id: channelId,
          last_read_at: timestamp,
        })
    } catch {
      // Ignore channel_reads upsert error
    }
  }, 2000)

  const unreadCounts = ref<Record<string, number>>({})
  const unreadMentions = ref<Record<string, number>>({})
  const lastReadByChannel = ref<Record<string, string>>({})
  const activeChannelUnreadSince = ref<string | null>(null)

  const onlineFriends = ref<Profile[]>([])

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

  const publicChannels = computed<Channel[]>(() => {
    return channels.value.filter(c => !c.is_dm)
  })

  const dmChannels = computed<Channel[]>(() => {
    return hydrateDmChannelPeers({
      channels: channels.value,
      currentUserId: authProfile.currentProfile.value?.id,
      profilesCache,
      fallbackProfiles: knownProfiles.value,
    })
  })

  const activeChannel = computed<Channel | null>(() => {
    const raw = channels.value.find(c => c.id === activeChannelId.value) || null
    if (!raw) return null
    if (raw.is_dm) {
      return dmChannels.value.find(c => c.id === raw.id) || raw
    }
    return raw
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

  async function markChannelRead(channelId: string, immediate = true): Promise<void> {
    const current = authProfile.currentProfile.value
    const nowIso = new Date().toISOString()
    lastReadByChannel.value[channelId] = nowIso
    if (!current?.id) return

    await readDebouncer.schedule(channelId, nowIso, immediate)
  }

  async function loadChannelReadsAndUnreads(): Promise<void> {
    const current = authProfile.currentProfile.value
    if (!current?.id || channels.value.length === 0) return

    try {
      const { data: readRows } = await supabase
        .from('channel_reads')
        .select('*')
        .eq('user_id', current.id)

      const defaultRead = current.created_at || '1970-01-01T00:00:00.000Z'
      const map = computeChannelReadMap({
        channels: channels.value,
        readRows: readRows as ChannelRead[],
        existingMap: lastReadByChannel.value,
        defaultReadTimestamp: defaultRead,
      })
      lastReadByChannel.value = map

      const oldestRead = computeOldestReadTimestamp(Object.values(map))
      if (!oldestRead) return

      const { data: recentMessages } = await supabase
        .from('messages')
        .select('id, channel_id, user_id, content, created_at, deleted_at, reply_to_id')
        .gt('created_at', oldestRead)
        .order('created_at', { ascending: true })

      if (recentMessages) {
        const decryptedRecent = await decryptMessageRows(recentMessages as any, e2ee.key.value)
        const snapshot = computeUnreadSnapshot({
          messages: decryptedRecent as any,
          lastReadByChannel: map,
          activeChannelId: activeChannelId.value,
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

  async function hydrateMessagesWithReactionsAndReplies(
    rows: any[],
  ): Promise<Array<Omit<ChatMessage, 'status'>>> {
    if (!rows || rows.length === 0) return []

    const decryptedRows = await decryptMessageRows(rows, e2ee.key.value, activeChannelId.value)

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
      return {
        ...r,
        reactions: reactionsByMsgId.get(r.id) || r.reactions || [],
        reply_to: parent
          ? {
              id: parent.id,
              user_id: parent.user_id,
              content: parent.content,
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
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_color, avatar_url')
        .order('display_name', { ascending: true })

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

  async function loadChannels(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: true })

      if (data && !error) {
        channels.value = data as Channel[]
        if (!activeChannelId.value && data.length > 0) {
          const general = (data as Channel[]).find(c => !c.is_dm && c.slug === 'general')
          const firstPublic = (data as Channel[]).find(c => !c.is_dm)
          const initial = general || firstPublic || (data as Channel[])[0]
          if (initial) {
            await selectChannel(initial.id)
          }
        }
      }
    } catch {
      // Failed loading channels
    }
  }

  async function fetchGapMessages(): Promise<void> {
    if (!activeChannelId.value) return
    const lastTimestamp = messagesStore.getLastConfirmedTimestamp()

    try {
      let query = supabase
        .from('messages')
        .select('*, author:profiles(id, display_name, avatar_color, avatar_url)')
        .eq('channel_id', activeChannelId.value)

      if (lastTimestamp) {
        query = query.gt('created_at', lastTimestamp).order('created_at', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: true }).limit(PAGE_SIZE)
      }

      const { data, error } = await query

      if (data && !error && data.length > 0) {
        cacheProfilesFromMessages(data)
        const hydrated = await hydrateMessagesWithReactionsAndReplies(data)
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
      const p3 = activeChannelId.value ? subscribeWithPromise(typingChannel) : Promise.resolve(true)
      const results = await Promise.all([p1, p2, p3])
      const ok = results.every(Boolean)
      if (ok) {
        await fetchGapMessages()
        await loadChannelReadsAndUnreads()
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
        onlineFriends.value = deduplicatePresenceState(state as any)
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

          let targetChannel = channels.value.find(c => c.id === newRow.channel_id)
          if (!targetChannel) {
            try {
              const { data: fetchedChannel } = await supabase
                .from('channels')
                .select('*')
                .eq('id', newRow.channel_id)
                .single()
              if (fetchedChannel && canUserAccessChannel(fetchedChannel as Channel, currentId)) {
                targetChannel = fetchedChannel as Channel
                if (!channels.value.some(c => c.id === targetChannel!.id)) {
                  channels.value = [...channels.value, targetChannel]
                }
              }
            } catch {
              // ignore fetch failure
            }
          }

          if (!shouldProcessChannelMessage(targetChannel, currentId)) {
            return
          }

          if (targetChannel?.is_dm && currentId) {
            const peerId = getDmPeerId(targetChannel, currentId)
            if (peerId && !profilesCache.has(peerId)) {
              try {
                const { data: peerProfile } = await supabase
                  .from('profiles')
                  .select('id, display_name, avatar_color, avatar_url')
                  .eq('id', peerId)
                  .single()
                if (peerProfile) {
                  profilesCache.set(peerProfile.id, peerProfile as Profile)
                  if (!allProfiles.value.some(p => p.id === peerProfile.id)) {
                    allProfiles.value = [...allProfiles.value, peerProfile as Profile]
                  }
                }
              } catch {
                // ignore
              }
            }
          }

          const decryptedRow = await decryptMessageRow(
            newRow,
            e2ee.key.value,
            activeChannelId.value,
          )

          const author = await resolveMessageAuthor({
            userId: decryptedRow.user_id,
            existingAuthor: decryptedRow.author,
            channelId: decryptedRow.channel_id,
            activeChannelId: activeChannelId.value,
            profilesCache,
            fetchProfile: async (userId: string) => {
              try {
                const { data } = await supabase
                  .from('profiles')
                  .select('id, display_name, avatar_color, avatar_url')
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
          const replyTarget: ReplyTarget | null = parentMsg
            ? {
                id: parentMsg.id,
                user_id: parentMsg.user_id,
                content: parentMsg.content,
                deleted_at: parentMsg.deleted_at || null,
                author: parentMsg.author,
                encryption: parentMsg.encryption,
              }
            : (decryptedRow.reply_to || null)

          handleIncomingRealtimeMessage({
            row: { ...decryptedRow, author, reply_to: replyTarget, reactions: [] },
            activeChannelId: activeChannelId.value,
            messagesStore,
            typingTracker,
            unreadCounts: unreadCounts.value,
            unreadMentions: unreadMentions.value,
            currentUserId: authProfile.currentProfile.value?.id,
            currentDisplayName: authProfile.currentProfile.value?.display_name,
          })
          if (decryptedRow.channel_id === activeChannelId.value) {
            markChannelRead(decryptedRow.channel_id, false)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        async (payload) => {
          const decryptedNew = payload.new
            ? await decryptMessageRow(payload.new as any, e2ee.key.value, activeChannelId.value)
            : payload.new
          const decryptedOld = payload.old
            ? await decryptMessageRow(payload.old as any, e2ee.key.value, activeChannelId.value)
            : payload.old

          handleRealtimeMessageUpdate({
            row: decryptedNew as any,
            oldRow: decryptedOld as any,
            activeChannelId: activeChannelId.value,
            messagesStore,
            unreadCounts: unreadCounts.value,
            unreadMentions: unreadMentions.value,
            lastReadByChannel: lastReadByChannel.value,
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
            activeChannelId: activeChannelId.value,
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
            activeChannelId: activeChannelId.value,
            messagesStore,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channels' },
        (payload) => {
          const newChannel = payload.new as Channel
          const currentId = authProfile.currentProfile.value?.id
          if (!canUserAccessChannel(newChannel, currentId)) {
            return
          }
          if (!channels.value.some(c => c.id === newChannel.id)) {
            channels.value = [...channels.value, newChannel]
          }
          if (newChannel.is_dm && currentId) {
            const peerId = getDmPeerId(newChannel, currentId)
            if (peerId && !profilesCache.has(peerId)) {
              supabase
                .from('profiles')
                .select('id, display_name, avatar_color, avatar_url')
                .eq('id', peerId)
                .single()
                .then(({ data: peerProfile }) => {
                  if (peerProfile) {
                    profilesCache.set(peerProfile.id, peerProfile as Profile)
                    if (!allProfiles.value.some(p => p.id === peerProfile.id)) {
                      allProfiles.value = [...allProfiles.value, peerProfile as Profile]
                    }
                  }
                })
                .catch(() => {})
            }
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
            onlineFriends.value = applyRealtimeProfileUpdate({
              profile: updatedProfile,
              profilesCache,
              messagesStore,
              onlineFriends: onlineFriends.value,
            })
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

  function setupTypingSubscription(channelId: string): void {
    if (typingChannel) {
      supabase.removeChannel(typingChannel)
    }

    typingTracker.clearAll()

    typingChannel = supabase.channel(`typing:${channelId}`)
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

  async function selectChannel(channelId: string): Promise<void> {
    const priorLastRead = lastReadByChannel.value[channelId] || null
    const hadUnreads = (unreadCounts.value[channelId] || 0) > 0
    activeChannelUnreadSince.value = hadUnreads ? priorLastRead : null
    activeChannelId.value = channelId
    unreadCounts.value[channelId] = 0
    unreadMentions.value[channelId] = 0
    markChannelRead(channelId)
    setupTypingSubscription(channelId)

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, author:profiles(id, display_name, avatar_color, avatar_url)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      // Guard against race condition if user switched channels while query was in flight
      if (activeChannelId.value !== channelId) {
        return
      }

      if (data && !error) {
        hasMoreHistory.value = data.length >= PAGE_SIZE
        const chronological = [...data].reverse()
        cacheProfilesFromMessages(chronological)
        const hydrated = await hydrateMessagesWithReactionsAndReplies(chronological)
        if (activeChannelId.value !== channelId) {
          return
        }
        messagesStore.setInitialHistory(hydrated, channelId)
      } else {
        messagesStore.setInitialHistory([], channelId)
      }
    } catch {
      if (activeChannelId.value === channelId) {
        messagesStore.setInitialHistory([], channelId)
      }
    }
  }

  async function loadOlderMessages(): Promise<number> {
    if (!hasMoreHistory.value || isLoadingHistory.value || !activeChannelId.value) {
      return 0
    }

    const cursor = messagesStore.getOldestCursor()
    if (!cursor) {
      return 0
    }

    isLoadingHistory.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, author:profiles(id, display_name, avatar_color, avatar_url)')
        .eq('channel_id', activeChannelId.value)
        .or(`created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE)

      if (data && !error) {
        if (data.length < PAGE_SIZE) {
          hasMoreHistory.value = false
        }
        const chronological = [...data].reverse()
        cacheProfilesFromMessages(chronological)
        const hydrated = await hydrateMessagesWithReactionsAndReplies(chronological)
        return messagesStore.prependHistoryPage(hydrated)
      }
    } finally {
      isLoadingHistory.value = false
    }
    return 0
  }

  async function createChannel(name: string, description?: string): Promise<{ channel: Channel | null; error: string | null }> {
    const slug = normalizeChannelSlug(name)
    if (!isValidChannelSlug(slug)) {
      return {
        channel: null,
        error: 'Channel name must produce a lowercase slug of 2–32 alphanumeric or hyphen characters.',
      }
    }

    let current = authProfile.currentProfile.value
    if (!current?.id) {
      current = await authProfile.ensureProfile()
    }
    const payload = {
      slug,
      description: description?.trim() || null,
      created_by: current?.id || null,
    }

    const { data, error } = await supabase
      .from('channels')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      return { channel: null, error: error.message }
    }

    const newChannel = data as Channel
    if (!channels.value.some(c => c.id === newChannel.id)) {
      channels.value = [...channels.value, newChannel]
    }
    await selectChannel(newChannel.id)
    return { channel: newChannel, error: null }
  }

  async function openOrCreateDm(peerUserId: string): Promise<{ channel: Channel | null; error: string | null }> {
    let current = authProfile.currentProfile.value
    if (!current?.id) {
      current = await authProfile.ensureProfile()
    }
    if (!current?.id) {
      return { channel: null, error: 'Not authenticated.' }
    }

    const pair = normalizeDmPair(current.id, peerUserId)
    if (!pair) {
      return { channel: null, error: 'Cannot start a direct message with yourself.' }
    }

    if (peerUserId && !profilesCache.has(peerUserId)) {
      try {
        const { data: peerProfile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_color, avatar_url')
          .eq('id', peerUserId)
          .single()
        if (peerProfile) {
          profilesCache.set(peerProfile.id, peerProfile as Profile)
          if (!allProfiles.value.some(p => p.id === peerProfile.id)) {
            allProfiles.value = [...allProfiles.value, peerProfile as Profile]
          }
        }
      } catch {
        // ignore profile fetch failure
      }
    }

    const existingInMemory = channels.value.find(
      c => c.slug === pair.slug || (c.is_dm && c.dm_user_a === pair.dm_user_a && c.dm_user_b === pair.dm_user_b),
    )
    if (existingInMemory) {
      await selectChannel(existingInMemory.id)
      return { channel: existingInMemory, error: null }
    }

    const payload = {
      slug: pair.slug,
      description: null,
      created_by: current.id,
      is_dm: true,
      dm_user_a: pair.dm_user_a,
      dm_user_b: pair.dm_user_b,
    }

    const { data, error } = await supabase
      .from('channels')
      .insert(payload)
      .select('*')
      .single()

    let resolvedChannel: Channel | null = (data as Channel) || null

    if (error) {
      if (isDuplicateKeyError(error)) {
        const { data: existingRow } = await supabase
          .from('channels')
          .select('*')
          .eq('slug', pair.slug)
          .single()
        resolvedChannel = (existingRow as Channel) || null
      }
      if (!resolvedChannel) {
        return { channel: null, error: error.message }
      }
    }

    if (resolvedChannel) {
      if (!channels.value.some(c => c.id === resolvedChannel!.id)) {
        channels.value = [...channels.value, resolvedChannel]
      }
      await selectChannel(resolvedChannel.id)
    }

    return { channel: resolvedChannel, error: null }
  }

  async function sendMessage(content: string, replyToId?: string | null): Promise<void> {
    if (!activeChannelId.value || !isValidMessageContent(content)) return
    let current = authProfile.currentProfile.value
    if (!current?.id) {
      current = await authProfile.ensureProfile()
    }
    if (!current?.id) return

    const clientId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')

    const parentMsg = replyToId ? messages.value.find(m => m.id === replyToId) : undefined
    const replyTarget: ReplyTarget | null = parentMsg
      ? {
          id: parentMsg.id,
          user_id: parentMsg.user_id,
          content: parentMsg.content,
          deleted_at: parentMsg.deleted_at || null,
          author: parentMsg.author,
        }
      : null

    const plaintext = content.trim()
    const channelId = activeChannelId.value

    messagesStore.addOptimisticMessage({
      clientId,
      channelId,
      user: current,
      content: plaintext,
      replyToId: replyToId || null,
      replyTo: replyTarget,
      encryption: 'e2ee',
    })

    if (!e2ee.key.value) {
      messagesStore.markMessageFailed(clientId)
      return
    }

    try {
      const encryptedContent = await encryptContent(e2ee.key.value, plaintext, channelId)

      const { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          channel_id: channelId,
          user_id: current.id,
          content: encryptedContent,
          reply_to_id: replyToId || null,
        })
        .select('*, author:profiles(id, display_name, avatar_color, avatar_url)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await supabase
            .from('messages')
            .select('*, author:profiles(id, display_name, avatar_color, avatar_url)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            const decryptedExisting = await decryptMessageRow(existing, e2ee.key.value, channelId)
            messagesStore.markMessageSent(clientId, { ...decryptedExisting, reply_to: replyTarget })
          } else {
            messagesStore.markMessageFailed(clientId)
          }
        } else {
          messagesStore.markMessageFailed(clientId)
        }
      } else if (data) {
        const decryptedData = await decryptMessageRow(data, e2ee.key.value, channelId)
        messagesStore.markMessageSent(clientId, { ...decryptedData, reply_to: replyTarget })
      }
    } catch {
      messagesStore.markMessageFailed(clientId)
    }
  }

  async function retryMessage(clientId: string): Promise<void> {
    const retrying = messagesStore.markMessageRetrying(clientId)
    if (!retrying) return

    if (!e2ee.key.value) {
      messagesStore.markMessageFailed(clientId)
      return
    }

    try {
      const encryptedContent = await encryptContent(
        e2ee.key.value,
        retrying.content,
        retrying.channel_id,
      )

      const { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          channel_id: retrying.channel_id,
          user_id: retrying.user_id,
          content: encryptedContent,
          reply_to_id: retrying.reply_to_id || null,
        })
        .select('*, author:profiles(id, display_name, avatar_color, avatar_url)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await supabase
            .from('messages')
            .select('*, author:profiles(id, display_name, avatar_color, avatar_url)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            const decryptedExisting = await decryptMessageRow(
              existing,
              e2ee.key.value,
              retrying.channel_id,
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
          retrying.channel_id,
        )
        messagesStore.markMessageSent(clientId, { ...decryptedData, reply_to: retrying.reply_to })
      }
    } catch {
      messagesStore.markMessageFailed(clientId)
    }
  }

  function dismissMessage(clientId: string): void {
    messagesStore.dismissMessage(clientId)
  }

  async function editMessage(
    messageId: string,
    newContent: string,
  ): Promise<{ error: string | null }> {
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
    const targetMsg = messages.value.find(m => m.id === messageId)
    const channelId = targetMsg?.channel_id || activeChannelId.value
    if (!channelId) {
      return { error: 'Channel not found.' }
    }

    messagesStore.reconcileUpdatedMessage({
      id: messageId,
      content: trimmed,
      edited_at: editedAt,
      encryption: 'e2ee',
    })

    try {
      const encryptedContent = await encryptContent(e2ee.key.value, trimmed, channelId)

      const { error } = await supabase
        .from('messages')
        .update({ content: encryptedContent, edited_at: editedAt })
        .eq('id', messageId)
        .eq('user_id', current.id)

      return { error: error ? error.message : null }
    } catch (err: any) {
      return { error: err?.message || 'Failed to encrypt message.' }
    }
  }

  async function deleteMessage(messageId: string): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

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

    return { error: error ? error.message : null }
  }

  async function toggleReaction(
    messageId: string,
    emoji: string,
  ): Promise<{ error: string | null }> {
    if (!isValidReactionEmoji(emoji) || !activeChannelId.value) {
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
      return { error: error ? error.message : null }
    } else {
      const optimisticReaction: MessageReaction = {
        message_id: messageId,
        channel_id: activeChannelId.value,
        user_id: current.id,
        emoji,
      }
      messagesStore.applyReactionAdded(optimisticReaction)
      const { error } = await supabase
        .from('message_reactions')
        .insert(optimisticReaction)
      return { error: error ? error.message : null }
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
    await loadChannels()
    if (isDisposed) return
    await loadChannelReadsAndUnreads()
    if (isDisposed) return

    setupPresenceSubscription()
    setupDbChangesSubscription()

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
    }
  }

  async function syncOwnProfile(profile: Profile): Promise<void> {
    onlineFriends.value = applyRealtimeProfileUpdate({
      profile,
      profilesCache,
      messagesStore,
      onlineFriends: onlineFriends.value,
    })
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
    channels,
    publicChannels,
    dmChannels,
    activeChannelId,
    activeChannel,
    messages,
    hasMoreHistory,
    isLoadingHistory,
    unreadCounts,
    unreadMentions,
    activeChannelUnreadSince,
    allProfiles,
    knownProfiles,
    onlineFriends,
    typingLabel,
    connectionStatus,
    reconnectCountdownSec,
    initializeChat,
    selectChannel,
    createChannel,
    openOrCreateDm,
    sendMessage,
    retryMessage,
    dismissMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    loadOlderMessages,
    notifyTyping,
    retryConnectionNow,
    syncOwnProfile,
    markChannelRead,
    cleanupChat,
  }
}
