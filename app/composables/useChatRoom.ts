import { ref, computed, type ComputedRef, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Channel, ChatMessage, Profile, ConnectionStatus } from '~/types/chat'
import { normalizeChannelSlug, isValidChannelSlug, isValidMessageContent } from '~/utils/chat'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'
import { deduplicatePresenceState } from '~/composables/usePresenceState'
import { createConnectionManager } from '~/composables/useConnectionManager'
import { useAuthProfile } from '~/composables/useAuthProfile'

export const PAGE_SIZE = 40

export function isDuplicateKeyError(error: any): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  const msg = String(error.message || '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

export function handleIncomingRealtimeMessage(params: {
  row: Omit<ChatMessage, 'status'>
  activeChannelId: string | null
  messagesStore: ReturnType<typeof createMessagesStore>
  typingTracker: ReturnType<typeof createTypingTracker>
  unreadCounts: Record<string, number>
}): void {
  if (params.row.channel_id === params.activeChannelId) {
    params.messagesStore.reconcileIncomingMessage(params.row)
    params.typingTracker.clearUserTyping(params.row.user_id)
  } else {
    params.unreadCounts[params.row.channel_id] = (params.unreadCounts[params.row.channel_id] || 0) + 1
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


export function useChatRoom() {
  const supabase = useSupabaseClient()
  const authProfile = useAuthProfile()

  const channels = ref<Channel[]>([])
  const activeChannelId = ref<string | null>(null)
  const activeChannel = computed<Channel | null>(() => {
    return channels.value.find(c => c.id === activeChannelId.value) || null
  })

  const unreadCounts = ref<Record<string, number>>({})
  const onlineFriends = ref<Profile[]>([])
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

  const profilesCache = new Map<string, Profile>()

  function cacheProfilesFromMessages(rows: Array<{ author?: Profile }>): void {
    for (const row of rows) {
      if (row.author?.id) {
        profilesCache.set(row.author.id, row.author)
      }
    }
  }

  const connectionManager = createConnectionManager(async () => {
    return await reconnectChat()
  })

  const connectionStatus = connectionManager.status
  const reconnectCountdownSec = computed<number>(() => {
    return Math.ceil(connectionManager.nextRetryMs.value / 1000)
  })

  async function loadChannels(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: true })

      if (data && !error) {
        channels.value = data as Channel[]
        if (!activeChannelId.value && data.length > 0) {
          const general = (data as Channel[]).find(c => c.slug === 'general')
          await selectChannel(general ? general.id : data[0].id)
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
        .select('*, author:profiles(id, display_name, avatar_color)')
        .eq('channel_id', activeChannelId.value)

      if (lastTimestamp) {
        query = query.gt('created_at', lastTimestamp).order('created_at', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: true }).limit(PAGE_SIZE)
      }

      const { data, error } = await query

      if (data && !error && data.length > 0) {
        cacheProfilesFromMessages(data)
        messagesStore.mergeGapMessages(data)
      }
    } catch {
      // Ignored
    }
  }

  function subscribeWithPromise(channel: RealtimeChannel | null): Promise<boolean> {
    return new Promise((resolve) => {
      if (!channel) {
        resolve(true)
        return
      }
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          resolve(true)
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          resolve(false)
        }
      })
    })
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
          const author = await resolveMessageAuthor({
            userId: newRow.user_id,
            existingAuthor: newRow.author,
            channelId: newRow.channel_id,
            activeChannelId: activeChannelId.value,
            profilesCache,
            fetchProfile: async (userId: string) => {
              try {
                const { data } = await supabase
                  .from('profiles')
                  .select('id, display_name, avatar_color')
                  .eq('id', userId)
                  .single()
                return (data as Profile) || undefined
              } catch {
                return undefined
              }
            },
          })

          handleIncomingRealtimeMessage({
            row: { ...newRow, author },
            activeChannelId: activeChannelId.value,
            messagesStore,
            typingTracker,
            unreadCounts: unreadCounts.value,
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channels' },
        (payload) => {
          const newChannel = payload.new as Channel
          if (!channels.value.some(c => c.id === newChannel.id)) {
            channels.value = [...channels.value, newChannel]
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updatedProfile = payload.new as Profile
          if (updatedProfile?.id) {
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
    activeChannelId.value = channelId
    unreadCounts.value[channelId] = 0
    setupTypingSubscription(channelId)

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, author:profiles(id, display_name, avatar_color)')
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
        messagesStore.setInitialHistory(chronological, channelId)
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
        .select('*, author:profiles(id, display_name, avatar_color)')
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
        return messagesStore.prependHistoryPage(chronological)
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

  async function sendMessage(content: string): Promise<void> {
    if (!activeChannelId.value || !isValidMessageContent(content)) return
    let current = authProfile.currentProfile.value
    if (!current?.id) {
      current = await authProfile.ensureProfile()
    }
    if (!current?.id) return

    const clientId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')

    messagesStore.addOptimisticMessage({
      clientId,
      channelId: activeChannelId.value,
      user: current,
      content: content.trim(),
    })

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          channel_id: activeChannelId.value,
          user_id: current.id,
          content: content.trim(),
        })
        .select('*, author:profiles(id, display_name, avatar_color)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await supabase
            .from('messages')
            .select('*, author:profiles(id, display_name, avatar_color)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            messagesStore.markMessageSent(clientId, existing)
          } else {
            messagesStore.markMessageFailed(clientId)
          }
        } else {
          messagesStore.markMessageFailed(clientId)
        }
      } else if (data) {
        messagesStore.markMessageSent(clientId, data)
      }
    } catch {
      messagesStore.markMessageFailed(clientId)
    }
  }

  async function retryMessage(clientId: string): Promise<void> {
    const retrying = messagesStore.markMessageRetrying(clientId)
    if (!retrying) return

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          client_id: clientId,
          channel_id: retrying.channel_id,
          user_id: retrying.user_id,
          content: retrying.content,
        })
        .select('*, author:profiles(id, display_name, avatar_color)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await supabase
            .from('messages')
            .select('*, author:profiles(id, display_name, avatar_color)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            messagesStore.markMessageSent(clientId, existing)
          } else {
            messagesStore.markMessageFailed(clientId)
          }
        } else {
          messagesStore.markMessageFailed(clientId)
        }
      } else if (data) {
        messagesStore.markMessageSent(clientId, data)
      }
    } catch {
      messagesStore.markMessageFailed(clientId)
    }
  }

  function dismissMessage(clientId: string): void {
    messagesStore.dismissMessage(clientId)
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
    await authProfile.ensureProfile()
    await loadChannels()
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
          online_at: new Date().toISOString(),
        })
      } catch {
        // Ignore presence track error
      }
    }
  }

  function cleanupChat(): void {
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
    activeChannelId,
    activeChannel,
    messages,
    hasMoreHistory,
    isLoadingHistory,
    unreadCounts,
    onlineFriends,
    typingLabel,
    connectionStatus,
    reconnectCountdownSec,
    initializeChat,
    selectChannel,
    createChannel,
    sendMessage,
    retryMessage,
    dismissMessage,
    loadOlderMessages,
    notifyTyping,
    retryConnectionNow,
    syncOwnProfile,
    cleanupChat,
  }
}

