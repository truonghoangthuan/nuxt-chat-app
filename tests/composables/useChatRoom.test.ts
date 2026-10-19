import { describe, it, expect, vi } from 'vitest'
import {
  handleIncomingRealtimeMessage,
  handleRealtimeMessageUpdate,
  handleRealtimeReactionEvent,
  isDuplicateKeyError,
  resolveMessageAuthor,
  applyRealtimeProfileUpdate,
  computeUnreadSnapshot,
  hydrateDmChannelPeers,
  shouldProcessChannelMessage,
} from '~/composables/useChatRoom'
import { extractAuthUserId } from '~/composables/useAuthProfile'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'
import type { Profile } from '~/types/chat'

describe('useChatRoom realtime message routing & profile caching', () => {
  it('increments unread count for inactive channels and reconciles messages for active channel', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-me', 3000)
    const unreadCounts: Record<string, number> = {}

    typing.recordTyping({ user_id: 'u-alice', display_name: 'Alice' })

    // Message for inactive channel ch-random
    handleIncomingRealtimeMessage({
      row: {
        id: 'm-10',
        client_id: 'c-10',
        channel_id: 'ch-random',
        user_id: 'u-alice',
        content: 'Random thought',
        created_at: '2026-10-16T11:00:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
    })
    expect(unreadCounts['ch-random']).toBe(1)
    expect(store.messages.value).toHaveLength(0)

    // Message for active channel ch-general from Alice -> appends and clears Alice's typing
    handleIncomingRealtimeMessage({
      row: {
        id: 'm-11',
        client_id: 'c-11',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: 'Hello general',
        created_at: '2026-10-16T11:01:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
    })
    expect(store.messages.value).toHaveLength(1)
    expect(typing.typingLabel.value).toBe('')
  })

  it('skips profile query for inactive channel messages and caches fetched profiles', async () => {
    const cache = new Map<string, Profile>()
    const fetchProfile = vi.fn().mockResolvedValue({
      id: 'u-alice',
      display_name: 'Alice',
      avatar_color: '#0284c7',
    })

    // Inactive channel -> should not call fetchProfile
    const inactiveAuthor = await resolveMessageAuthor({
      userId: 'u-alice',
      channelId: 'ch-random',
      activeChannelId: 'ch-general',
      profilesCache: cache,
      fetchProfile,
    })
    expect(inactiveAuthor).toBeUndefined()
    expect(fetchProfile).not.toHaveBeenCalled()

    // Active channel (cache miss) -> calls fetchProfile once and populates cache
    const firstActiveAuthor = await resolveMessageAuthor({
      userId: 'u-alice',
      channelId: 'ch-general',
      activeChannelId: 'ch-general',
      profilesCache: cache,
      fetchProfile,
    })
    expect(firstActiveAuthor?.display_name).toBe('Alice')
    expect(fetchProfile).toHaveBeenCalledTimes(1)

    // Active channel (cache hit) -> returns cached profile without calling fetchProfile again
    const secondActiveAuthor = await resolveMessageAuthor({
      userId: 'u-alice',
      channelId: 'ch-general',
      activeChannelId: 'ch-general',
      profilesCache: cache,
      fetchProfile,
    })
    expect(secondActiveAuthor?.display_name).toBe('Alice')
    expect(fetchProfile).toHaveBeenCalledTimes(1)
  })

  it('propagates realtime profile updates to cache, messagesStore, and onlineFriends', () => {
    const cache = new Map<string, Profile>()
    const store = createMessagesStore()
    const onlineFriends: Profile[] = [
      { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
    ]

    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: 'Hello',
        created_at: '2026-10-16T10:00:00Z',
        author: onlineFriends[0],
      },
    ])

    const updatedAlice: Profile = {
      id: 'u-alice',
      display_name: 'Alice Cooper',
      avatar_color: '#e11d48',
    }

    const updatedFriends = applyRealtimeProfileUpdate({
      profile: updatedAlice,
      profilesCache: cache,
      messagesStore: store,
      onlineFriends,
    })

    expect(cache.get('u-alice')).toEqual(updatedAlice)
    expect(store.messages.value[0].author).toEqual(updatedAlice)
    expect(updatedFriends[0]).toEqual(updatedAlice)
  })

  it('detects Postgres 23505 duplicate key unique constraint error for idempotent retry', () => {
    expect(isDuplicateKeyError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isDuplicateKeyError({ message: 'duplicate key value violates unique constraint "messages_client_id_key"' })).toBe(true)
    expect(isDuplicateKeyError({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    expect(isDuplicateKeyError(null)).toBe(false)
  })

  it('extracts user UUID from either JwtPayload.sub (@nuxtjs/supabase v2) or User.id', () => {
    expect(extractAuthUserId({ sub: 'uuid-from-jwt-sub' })).toBe('uuid-from-jwt-sub')
    expect(extractAuthUserId({ id: 'uuid-from-user-id' })).toBe('uuid-from-user-id')
    expect(extractAuthUserId(null)).toBeNull()
  })

  it('routes realtime message UPDATE and reaction INSERT/DELETE events for the active channel', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: 'Initial text',
        created_at: '2026-10-18T10:00:00Z',
      },
    ])

    // Ignore UPDATE from inactive channel
    handleRealtimeMessageUpdate({
      row: {
        id: 'm-1',
        channel_id: 'ch-random',
        content: 'Should be ignored',
        edited_at: '2026-10-18T10:01:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].content).toBe('Initial text')

    // Apply UPDATE for active channel
    handleRealtimeMessageUpdate({
      row: {
        id: 'm-1',
        channel_id: 'ch-general',
        content: 'Updated text',
        edited_at: '2026-10-18T10:01:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].content).toBe('Updated text')
    expect(store.messages.value[0].edited_at).toBe('2026-10-18T10:01:00Z')

    // Reaction INSERT & DELETE
    handleRealtimeReactionEvent({
      eventType: 'INSERT',
      reaction: {
        id: 'r-1',
        message_id: 'm-1',
        channel_id: 'ch-general',
        user_id: 'u-bob',
        emoji: '🔥',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].reactions).toHaveLength(1)

    handleRealtimeReactionEvent({
      eventType: 'DELETE',
      reaction: {
        id: 'r-1',
        message_id: 'm-1',
        channel_id: 'ch-general',
        user_id: 'u-bob',
        emoji: '🔥',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
    })
    expect(store.messages.value[0].reactions).toHaveLength(0)
  })

  it('computes initial unread counts and @mention counts per channel from channel_reads timestamps', () => {
    const snapshot = computeUnreadSnapshot({
      messages: [
        {
          id: 'm-1',
          channel_id: 'ch-general',
          user_id: 'u-bob',
          content: 'Already read in general',
          created_at: '2026-10-18T10:00:00Z',
        },
        {
          id: 'm-2',
          channel_id: 'ch-random',
          user_id: 'u-bob',
          content: 'Hey @Alice check this out!',
          created_at: '2026-10-18T10:05:00Z',
        },
        {
          id: 'm-3',
          channel_id: 'ch-random',
          user_id: 'u-bob',
          content: 'Another unread in random',
          created_at: '2026-10-18T10:06:00Z',
        },
        {
          id: 'm-4',
          channel_id: 'ch-random',
          user_id: 'u-alice',
          content: 'Own message should not count as unread',
          created_at: '2026-10-18T10:07:00Z',
        },
      ],
      lastReadByChannel: {
        'ch-general': '2026-10-18T10:01:00Z',
        'ch-random': '2026-10-18T10:00:00Z',
      },
      activeChannelId: 'ch-general',
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice',
    })

    expect(snapshot.unreadCounts['ch-general'] || 0).toBe(0)
    expect(snapshot.unreadCounts['ch-random']).toBe(2)
    expect(snapshot.unreadMentions['ch-random']).toBe(1)
  })

  it('increments unreadMentions when an incoming realtime message for an inactive channel mentions current user', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-alice', 3000)
    const unreadCounts: Record<string, number> = {}
    const unreadMentions: Record<string, number> = {}

    handleIncomingRealtimeMessage({
      row: {
        id: 'm-20',
        client_id: 'c-20',
        channel_id: 'ch-random',
        user_id: 'u-bob',
        content: 'Ping @Alice for game night',
        created_at: '2026-10-18T11:00:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
      unreadMentions,
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice',
    })

    expect(unreadCounts['ch-random']).toBe(1)
    expect(unreadMentions['ch-random']).toBe(1)
  })

  it('does NOT increment unread counts or mentions when incoming realtime message was sent by current user', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-alice', 3000)
    const unreadCounts: Record<string, number> = {}
    const unreadMentions: Record<string, number> = {}

    handleIncomingRealtimeMessage({
      row: {
        id: 'm-30',
        client_id: 'c-30',
        channel_id: 'ch-random',
        user_id: 'u-alice',
        content: 'Own message in another channel with @Alice mention',
        created_at: '2026-10-18T11:05:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
      unreadMentions,
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice',
    })

    expect(unreadCounts['ch-random']).toBeUndefined()
    expect(unreadMentions['ch-random']).toBeUndefined()
  })

  it('isDuplicateKeyError accurately detects Postgres code 23505 and message variants', () => {
    expect(isDuplicateKeyError({ code: '23505' })).toBe(true)
    expect(isDuplicateKeyError({ message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isDuplicateKeyError({ message: 'Unique constraint "channels_slug_key" violated' })).toBe(true)
    expect(isDuplicateKeyError({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    expect(isDuplicateKeyError(null)).toBe(false)
    expect(isDuplicateKeyError(undefined)).toBe(false)
  })

  describe('hydrateDmChannelPeers (Sub-Project 4)', () => {
    it('filters DM channels accessible to currentUserId and attaches the peer Profile', () => {
      const profilesCache = new Map<string, Profile>([
        ['user-1', { id: 'user-1', display_name: 'Alice', avatar_color: '#0284c7' }],
        ['user-2', { id: 'user-2', display_name: 'Bob', avatar_color: '#7c3aed' }],
        ['user-3', { id: 'user-3', display_name: 'Charlie', avatar_color: '#059669' }],
      ])

      const channels = [
        {
          id: 'ch-general',
          slug: 'general',
          description: 'General',
          created_by: null,
          created_at: '2026-10-19T00:00:00Z',
          is_dm: false,
        },
        {
          id: 'dm-1-2',
          slug: 'dm:user-1:user-2',
          description: null,
          created_by: 'user-1',
          created_at: '2026-10-19T00:01:00Z',
          is_dm: true,
          dm_user_a: 'user-1',
          dm_user_b: 'user-2',
        },
        {
          id: 'dm-2-3',
          slug: 'dm:user-2:user-3',
          description: null,
          created_by: 'user-2',
          created_at: '2026-10-19T00:02:00Z',
          is_dm: true,
          dm_user_a: 'user-2',
          dm_user_b: 'user-3',
        },
      ]

      const hydratedForAlice = hydrateDmChannelPeers({
        channels,
        currentUserId: 'user-1',
        profilesCache,
      })

      expect(hydratedForAlice).toHaveLength(1)
      expect(hydratedForAlice[0]!.id).toBe('dm-1-2')
      expect(hydratedForAlice[0]!.peer?.display_name).toBe('Bob')
    })

    it('hydrates peer correctly when current user is dm_user_b or falls back to fallbackProfiles', () => {
      const emptyCache = new Map<string, Profile>()
      const fallbackProfiles: Profile[] = [
        { id: 'user-1', display_name: 'Alice', avatar_color: '#0284c7' },
      ]

      const channels = [
        {
          id: 'dm-1-2',
          slug: 'dm:user-1:user-2',
          description: null,
          created_by: 'user-1',
          created_at: '2026-10-19T00:01:00Z',
          is_dm: true,
          dm_user_a: 'user-1',
          dm_user_b: 'user-2',
        },
      ]

      const hydratedForBob = hydrateDmChannelPeers({
        channels,
        currentUserId: 'user-2',
        profilesCache: emptyCache,
        fallbackProfiles,
      })

      expect(hydratedForBob).toHaveLength(1)
      expect(hydratedForBob[0]!.peer?.display_name).toBe('Alice')
    })

    it('returns empty array when currentUserId is missing and sets peer to null when unresolvable', () => {
      const channels = [
        {
          id: 'dm-1-2',
          slug: 'dm:user-1:user-2',
          description: null,
          created_by: 'user-1',
          created_at: '2026-10-19T00:01:00Z',
          is_dm: true,
          dm_user_a: 'user-1',
          dm_user_b: 'user-2',
        },
      ]

      expect(hydrateDmChannelPeers({ channels, currentUserId: null, profilesCache: new Map() })).toEqual([])

      const unresolvable = hydrateDmChannelPeers({
        channels,
        currentUserId: 'user-1',
        profilesCache: new Map(),
      })
      expect(unresolvable).toHaveLength(1)
      expect(unresolvable[0]!.peer).toBeNull()
    })

    it('shouldProcessChannelMessage returns false for null/undefined channel or unauthorized DM', () => {
      expect(shouldProcessChannelMessage(undefined, 'u-1')).toBe(false)
      expect(shouldProcessChannelMessage(null, 'u-1')).toBe(false)

      const unauthorizedDm = {
        id: 'dm-1',
        is_dm: true,
        dm_user_a: 'u-2',
        dm_user_b: 'u-3',
      } as any
      expect(shouldProcessChannelMessage(unauthorizedDm, 'u-1')).toBe(false)

      const authorizedDmA = {
        id: 'dm-2',
        is_dm: true,
        dm_user_a: 'u-1',
        dm_user_b: 'u-2',
      } as any
      expect(shouldProcessChannelMessage(authorizedDmA, 'u-1')).toBe(true)

      const authorizedDmB = {
        id: 'dm-3',
        is_dm: true,
        dm_user_a: 'u-2',
        dm_user_b: 'u-1',
      } as any
      expect(shouldProcessChannelMessage(authorizedDmB, 'u-1')).toBe(true)

      const publicChannel = {
        id: 'c-1',
        is_dm: false,
      } as any
      expect(shouldProcessChannelMessage(publicChannel, 'u-1')).toBe(true)
    })
  })
})


