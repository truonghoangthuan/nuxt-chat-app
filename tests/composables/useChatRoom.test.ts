import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowReactive, computed } from 'vue'
import {
  handleIncomingRealtimeMessage,
  handleRealtimeMessageUpdate,
  handleRealtimeReactionEvent,
  isDuplicateKeyError,
  resolveMessageAuthor,
  applyRealtimeProfileUpdate,
  computeUnreadSnapshot,
  computeOldestReadTimestamp,
  computeChannelReadMap,
  createChannelReadDebouncer,
  subscribeWithPromise,
  hydrateDmChannelPeers,
  shouldProcessChannelMessage,
  decryptMessageRow,
  decryptMessageRows,
  useChatRoom,
} from '~/composables/useChatRoom'
import { useE2ee } from '~/composables/useE2ee'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'

vi.mock('~/utils/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/image')>()
  return {
    ...actual,
    resizeImage: vi.fn(async (file: File) => ({
      blob: file,
      width: 800,
      height: 600,
    })),
  }
})
import { extractAuthUserId, useAuthProfile } from '~/composables/useAuthProfile'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'
import type { Profile, Conversation, Contact } from '~/types/chat'
import { createPhraseConfig, deriveKey, encryptContent, decryptContent } from '~/utils/crypto'

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

    it('decrements unreadCounts and unreadMentions when an unread message in an inactive channel is soft-deleted', () => {
      const store = createMessagesStore()
      const unreadCounts: Record<string, number> = { 'ch-inactive': 2 }
      const unreadMentions: Record<string, number> = { 'ch-inactive': 1 }
      const lastReadByChannel: Record<string, string> = { 'ch-inactive': '2026-10-18T09:00:00Z' }

      handleRealtimeMessageUpdate({
        row: {
          id: 'm-deleted',
          channel_id: 'ch-inactive',
          user_id: 'u-bob',
          content: 'Hey @Alice check this out',
          created_at: '2026-10-18T10:00:00Z',
          deleted_at: '2026-10-18T10:05:00Z',
        },
        oldRow: {
          id: 'm-deleted',
          channel_id: 'ch-inactive',
          user_id: 'u-bob',
          content: 'Hey @Alice check this out',
          created_at: '2026-10-18T10:00:00Z',
          deleted_at: null,
        },
        activeChannelId: 'ch-active',
        messagesStore: store,
        unreadCounts,
        unreadMentions,
        lastReadByChannel,
        currentUserId: 'u-alice',
        currentDisplayName: 'Alice',
      })

      expect(unreadCounts['ch-inactive']).toBe(1)
      expect(unreadMentions['ch-inactive']).toBe(0)
    })

    it('computeOldestReadTimestamp correctly finds earliest timestamp with mixed ISO millisecond formats', () => {
      expect(computeOldestReadTimestamp([])).toBe(null)
      const oldest = computeOldestReadTimestamp([
        '2026-10-18T10:00:00.500Z',
        '2026-10-18T10:00:00Z',
      ])
      expect(oldest).toBe('2026-10-18T10:00:00Z')
    })

    it('computeChannelReadMap defaults missing channels to profile created_at and preserves cached reads', () => {
      const channels = [{ id: 'ch-read' }, { id: 'ch-unread' }, { id: 'ch-cached' }]
      const readRows = [{ channel_id: 'ch-read', last_read_at: '2026-10-18T09:30:00Z' }]
      const existingMap = { 'ch-cached': '2026-10-18T09:45:00Z' }
      const defaultRead = '2026-10-18T08:00:00Z'

      const map = computeChannelReadMap({
        channels,
        readRows,
        existingMap,
        defaultReadTimestamp: defaultRead,
      })

      expect(map['ch-read']).toBe('2026-10-18T09:30:00Z')
      expect(map['ch-cached']).toBe('2026-10-18T09:45:00Z')
      expect(map['ch-unread']).toBe('2026-10-18T08:00:00Z')
    })

    it('createChannelReadDebouncer coalesces rapid read marks and supports immediate flush', async () => {
      vi.useFakeTimers()
      const upsertMock = vi.fn().mockResolvedValue({})
      const debouncer = createChannelReadDebouncer(upsertMock, 2000)

      debouncer.schedule('ch-1', '2026-10-18T10:00:00Z', false)
      debouncer.schedule('ch-1', '2026-10-18T10:00:01Z', false)
      debouncer.schedule('ch-1', '2026-10-18T10:00:02Z', false)

      expect(upsertMock).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2000)
      expect(upsertMock).toHaveBeenCalledTimes(1)
      expect(upsertMock).toHaveBeenCalledWith('ch-1', '2026-10-18T10:00:02Z')

      await debouncer.schedule('ch-2', '2026-10-18T10:01:00Z', true)
      expect(upsertMock).toHaveBeenCalledTimes(2)
      expect(upsertMock).toHaveBeenCalledWith('ch-2', '2026-10-18T10:01:00Z')

      debouncer.schedule('ch-3', '2026-10-18T10:02:00Z', false)
      debouncer.cancelAll()
      vi.advanceTimersByTime(2000)
      expect(upsertMock).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('subscribeWithPromise handles SUBSCRIBED, errors, CLOSED, and timeouts', async () => {
      expect(await subscribeWithPromise(null)).toBe(true)

      const okChannel = {
        subscribe: (cb: (s: string) => void) => {
          setTimeout(() => cb('SUBSCRIBED'), 10)
        },
      }
      expect(await subscribeWithPromise(okChannel)).toBe(true)

      const errChannel = {
        subscribe: (cb: (s: string) => void) => {
          setTimeout(() => cb('CHANNEL_ERROR'), 10)
        },
      }
      expect(await subscribeWithPromise(errChannel)).toBe(false)

      const closedChannel = {
        subscribe: (cb: (s: string) => void) => {
          setTimeout(() => cb('CLOSED'), 10)
        },
      }
      expect(await subscribeWithPromise(closedChannel)).toBe(false)

      const hungChannel = {
        subscribe: () => {},
      }
      expect(await subscribeWithPromise(hungChannel, 50)).toBe(false)
    })

    it('handleRealtimeMessageUpdate delegates to messagesStore for active channel and guards inactive soft-deletes', () => {
      const store = createMessagesStore()
      store.setInitialHistory([
        {
          id: 'm-active',
          client_id: 'c-active',
          channel_id: 'ch-active',
          user_id: 'u-bob',
          content: 'Active content',
          created_at: '2026-10-18T10:00:00Z',
        },
      ])

      handleRealtimeMessageUpdate({
        row: {
          id: 'm-active',
          channel_id: 'ch-active',
          user_id: 'u-bob',
          content: 'Active content',
          created_at: '2026-10-18T10:00:00Z',
          deleted_at: '2026-10-18T10:05:00Z',
        },
        activeChannelId: 'ch-active',
        messagesStore: store,
      })
      expect(store.messages.value[0].deleted_at).toBe('2026-10-18T10:05:00Z')

      const unreadCounts: Record<string, number> = { 'ch-inactive': 1 }
      const unreadMentions: Record<string, number> = { 'ch-inactive': 0 }
      const lastReadByChannel = { 'ch-inactive': '2026-10-18T11:00:00Z' }

      handleRealtimeMessageUpdate({
        row: {
          id: 'm-old',
          channel_id: 'ch-inactive',
          user_id: 'u-bob',
          content: 'Old message',
          created_at: '2026-10-18T10:00:00Z',
          deleted_at: '2026-10-18T11:05:00Z',
        },
        activeChannelId: 'ch-active',
        messagesStore: store,
        unreadCounts,
        unreadMentions,
        lastReadByChannel,
        currentUserId: 'u-alice',
      })
      expect(unreadCounts['ch-inactive']).toBe(1)

      handleRealtimeMessageUpdate({
        row: {
          id: 'm-own',
          channel_id: 'ch-inactive',
          user_id: 'u-alice',
          content: 'My own message',
          created_at: '2026-10-18T12:00:00Z',
          deleted_at: '2026-10-18T12:05:00Z',
        },
        activeChannelId: 'ch-active',
        messagesStore: store,
        unreadCounts,
        unreadMentions,
        lastReadByChannel,
        currentUserId: 'u-alice',
      })
      expect(unreadCounts['ch-inactive']).toBe(1)

      handleRealtimeMessageUpdate({
        row: {
          id: 'm-already-deleted',
          channel_id: 'ch-inactive',
          user_id: 'u-bob',
          content: 'Message',
          created_at: '2026-10-18T12:00:00Z',
          deleted_at: '2026-10-18T12:05:00Z',
        },
        oldRow: {
          id: 'm-already-deleted',
          channel_id: 'ch-inactive',
          user_id: 'u-bob',
          content: 'Message',
          created_at: '2026-10-18T12:00:00Z',
          deleted_at: '2026-10-18T12:04:00Z',
        },
        activeChannelId: 'ch-active',
        messagesStore: store,
        unreadCounts,
        unreadMentions,
        lastReadByChannel,
        currentUserId: 'u-alice',
      })
      expect(unreadCounts['ch-inactive']).toBe(1)
    })

    it('profilesCache is reactive and updates hydrateDmChannelPeers when peer profile is cached', () => {
      const cache = shallowReactive(new Map<string, Profile>())
      const channels = [
        {
          id: 'dm-1',
          name: 'dm-u1-u2',
          slug: 'dm-u1-u2',
          is_dm: true,
          dm_user_a: 'u-alice',
          dm_user_b: 'u-bob',
        },
      ]

      const dmChannels = computed(() => {
        return hydrateDmChannelPeers({
          channels,
          currentUserId: 'u-alice',
          profilesCache: cache,
          fallbackProfiles: [],
        })
      })

      expect(dmChannels.value[0].peer).toBe(null)

      cache.set('u-bob', {
        id: 'u-bob',
        display_name: 'Bob Ross',
        avatar_color: '#10b981',
      })

      expect(dmChannels.value[0].peer?.display_name).toBe('Bob Ross')
    })
  })

  describe('E2EE message row decryption and mention handling', () => {
    it('decryptMessageRow classifies e2ee, legacy, and undecryptable rows (including AAD mismatch and reply_to)', async () => {
      const cfg = await createPhraseConfig('chat room test phrase', 1000)
      const key = await deriveKey('chat room test phrase', cfg.salt, 1000)
      const cipher = await encryptContent(key, 'Hello @Alice!', 'ch-general')
      const parentCipher = await encryptContent(key, 'Quoted parent', 'ch-general')

      // Valid e2ee row + encrypted reply_to
      const okRow = await decryptMessageRow(
        {
          id: 'm-1',
          channel_id: 'ch-general',
          content: cipher,
          reply_to: { id: 'm-0', user_id: 'u-bob', content: parentCipher },
        },
        key,
      )
      expect(okRow.content).toBe('Hello @Alice!')
      expect(okRow.encryption).toBe('e2ee')
      expect(okRow.reply_to?.content).toBe('Quoted parent')
      expect(okRow.reply_to?.encryption).toBe('e2ee')

      // Legacy plaintext row
      const legacyRow = await decryptMessageRow(
        { id: 'm-2', channel_id: 'ch-general', content: 'Old unencrypted text' },
        key,
      )
      expect(legacyRow.content).toBe('Old unencrypted text')
      expect(legacyRow.encryption).toBe('legacy')

      // Cross-channel AAD mismatch -> undecryptable with empty content
      const replayedRow = await decryptMessageRow(
        { id: 'm-3', channel_id: 'ch-random', content: cipher },
        key,
      )
      expect(replayedRow.content).toBe('')
      expect(replayedRow.encryption).toBe('undecryptable')

      // Partial UPDATE row without content (e.g. soft-delete) leaves content undefined
      const softDeleteRow = await decryptMessageRow(
        { id: 'm-1', channel_id: 'ch-general', deleted_at: '2026-10-19T12:00:00Z' },
        key,
      )
      expect(softDeleteRow.content).toBeUndefined()
      expect(softDeleteRow.encryption).toBeUndefined()
    })

    it('counts @mentions on decrypted e2ee rows and never false-triggers on undecryptable rows', async () => {
      const cfg = await createPhraseConfig('unread mention phrase', 1000)
      const key = await deriveKey('unread mention phrase', cfg.salt, 1000)
      const mentionCipher = await encryptContent(key, 'Ping @Alice in encrypted channel', 'ch-random')

      const decryptedRows = await decryptMessageRows(
        [
          {
            id: 'm-enc-1',
            channel_id: 'ch-random',
            user_id: 'u-bob',
            content: mentionCipher,
            created_at: '2026-10-19T10:05:00Z',
          },
          {
            id: 'm-bad-1',
            channel_id: 'ch-random',
            user_id: 'u-bob',
            content: 'e2ee:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB',
            created_at: '2026-10-19T10:06:00Z',
          },
        ],
        key,
      )

      const snapshot = computeUnreadSnapshot({
        messages: decryptedRows as any,
        lastReadByChannel: { 'ch-random': '2026-10-19T10:00:00Z' },
        activeChannelId: 'ch-general',
        currentUserId: 'u-alice',
        currentDisplayName: 'Alice',
      })
      expect(snapshot.unreadCounts['ch-random']).toBe(2)
      expect(snapshot.unreadMentions['ch-random']).toBe(1)
    })

    it('formats reply_to image payload as photo summary and prevents false-positive mentions in unread snapshot', async () => {
      const cfg = await createPhraseConfig('reply preview phrase', 1000)
      const key = await deriveKey('reply preview phrase', cfg.salt, 1000)

      const imagePayload = JSON.stringify({
        type: 'images',
        images: [
          { path: 'channels/ch-general/c-1/0.enc', mimeType: 'image/jpeg', width: 800, height: 600, size: 100 },
          { path: 'channels/ch-general/c-1/1.enc', mimeType: 'image/png', width: 800, height: 600, size: 200 },
        ],
      })
      const encryptedImagePayload = await encryptContent(key, imagePayload, 'ch-general')
      const msgCipher = await encryptContent(key, 'Looks good!', 'ch-general')

      const decrypted = await decryptMessageRow(
        {
          id: 'm-reply-img',
          channel_id: 'ch-general',
          content: msgCipher,
          reply_to: {
            id: 'm-parent-img',
            user_id: 'u-bob',
            content: encryptedImagePayload,
          },
        },
        key,
      )

      expect(decrypted.reply_to?.content).toBe('📷 2 photos')
      expect(decrypted.reply_to?.encryption).toBe('e2ee')

      const singleImgPayload = JSON.stringify({
        type: 'images',
        images: [
          { path: 'channels/ch-general/c-1/0.enc', mimeType: 'image/jpeg', width: 800, height: 600, size: 100 },
        ],
      })
      const singleCipher = await encryptContent(key, singleImgPayload, 'ch-general')
      const singleDecrypted = await decryptMessageRow(
        {
          id: 'm-reply-1',
          channel_id: 'ch-general',
          content: msgCipher,
          reply_to: {
            id: 'm-parent-1',
            user_id: 'u-bob',
            content: singleCipher,
          },
        },
        key,
      )
      expect(singleDecrypted.reply_to?.content).toBe('📷 1 photo')

      const payloadWithMentionLikePath = JSON.stringify({
        type: 'images',
        images: [
          { path: 'channels/ch-random/c-1/@Alice.enc', mimeType: 'image/jpeg', width: 800, height: 600, size: 100 },
        ],
      })
      const cipherWithMention = await encryptContent(key, payloadWithMentionLikePath, 'ch-random')
      const decryptedRows = await decryptMessageRows(
        [
          {
            id: 'm-img-mention',
            channel_id: 'ch-random',
            user_id: 'u-bob',
            content: cipherWithMention,
            created_at: '2026-10-19T10:05:00Z',
          },
        ],
        key,
      )

      const snapshot = computeUnreadSnapshot({
        messages: decryptedRows as any,
        lastReadByChannel: { 'ch-random': '2026-10-19T10:00:00Z' },
        activeChannelId: 'ch-general',
        currentUserId: 'u-alice',
        currentDisplayName: 'Alice',
      })
      expect(snapshot.unreadCounts['ch-random']).toBe(1)
      expect(snapshot.unreadMentions['ch-random'] || 0).toBe(0)
    })
  })
})

describe('useChatRoom sendImages orchestration & immutability guard', () => {
  let mockUpload: any
  let mockRemove: any
  let mockInsert: any
  let mockInsertSingle: any
  let mockSupabase: any
  let testKey: CryptoKey


  beforeEach(async () => {
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn((file: File) => 'blob:http://localhost/' + file.name)
    }
    mockUpload = vi.fn().mockResolvedValue({ data: { path: 'ok' }, error: null })
    mockRemove = vi.fn().mockResolvedValue({ data: [], error: null })
    mockInsertSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'msg-srv-img-1',
        client_id: 'client-uuid',
        channel_id: 'ch-test',
        user_id: 'u-alice',
        content: 'encrypted-content',
        created_at: '2026-10-20T12:00:00.000Z',
        author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
      },
      error: null,
    })

    mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: mockInsertSingle,
      }),
    })

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'messages') {
          return {
            insert: mockInsert,
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }),
      storage: {
        from: vi.fn((bucket: string) => ({
          upload: mockUpload,
          remove: mockRemove,
        })),
      },
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }),
      removeChannel: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    }
    vi.stubGlobal('useSupabaseClient', () => mockSupabase)
    vi.stubGlobal('useSupabaseUser', () => ({ value: null }))

    const cfg = await createPhraseConfig('orchestration test secret', 1000)
    testKey = await deriveKey('orchestration test secret', cfg.salt, 1000)
    const e2ee = useE2ee()
    e2ee.key.value = testKey
    const auth = useAuthProfile()
    auth.currentProfile.value = {
      id: 'u-alice',
      display_name: 'Alice',
      avatar_color: '#0284c7',
    }
  })

  it('sendImages produces optimistic message, uploads encrypted binaries to storage, inserts encrypted row, and marks sent', async () => {
    const room = useChatRoom()
    room.activeChannelId.value = 'ch-general'

    const file1 = new File(['file1-bytes'], 'pic1.jpg', { type: 'image/jpeg' })
    const file2 = new File(['file2-bytes'], 'pic2.png', { type: 'image/png' })

    const result = await room.sendImages([file1, file2])
    expect(result).toBe(true)
    expect(mockUpload).toHaveBeenCalledTimes(2)
    expect(room.messages.value).toHaveLength(1)
    expect(room.messages.value[0].status).toBe('sent')
    expect(room.messages.value[0].id).toBe('msg-srv-img-1')
  })

  it('sendImages returns false when active channel, user profile, or e2ee key is missing, or files are invalid', async () => {
    const room = useChatRoom()
    const file = new File(['test'], 'pic.jpg', { type: 'image/jpeg' })

    // Missing active channel
    room.activeChannelId.value = null
    expect(await room.sendImages([file])).toBe(false)

    room.activeChannelId.value = 'ch-general'

    // Invalid file type
    const badFile = new File(['bad'], 'doc.pdf', { type: 'application/pdf' })
    expect(await room.sendImages([badFile])).toBe(false)

    // Missing key
    const e2ee = useE2ee()
    e2ee.key.value = null
    expect(await room.sendImages([file])).toBe(false)
  })

  it('sendImages marks message failed and returns false if storage upload fails', async () => {
    const room = useChatRoom()
    room.activeChannelId.value = 'ch-general'
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Storage upload failed') })

    const file = new File(['test'], 'pic.jpg', { type: 'image/jpeg' })
    const result = await room.sendImages([file])

    expect(result).toBe(false)
    expect(room.messages.value).toHaveLength(1)
    expect(room.messages.value[0].status).toBe('failed')
  })

  it('editMessage rejects editing image messages with error', async () => {
    const room = useChatRoom()
    room.activeChannelId.value = 'ch-general'

    const imagePayload = JSON.stringify({
      type: 'images',
      images: [{ path: 'channels/ch-general/c-1/0.enc', mimeType: 'image/jpeg', width: 800, height: 600, size: 100 }],
    })
    room.messages.value = [
      {
        id: 'img-msg-1',
        client_id: 'c-1',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: imagePayload,
        created_at: '2026-10-20T12:00:00.000Z',
        status: 'sent',
      },
    ]

    const res = await room.editMessage('img-msg-1', 'New text')
    expect(res).toEqual({ error: 'Image messages cannot be edited.' })
  })
  it('retryMessage retries failed image upload and inserts storage paths, not blob URLs', async () => {
    const room = useChatRoom()
    room.activeChannelId.value = 'ch-general'

    // First attempt fails during storage upload
    mockUpload.mockResolvedValueOnce({ data: null, error: new Error('Upload glitch') })

    const file = new File(['retry-image-bytes'], 'retry.jpg', { type: 'image/jpeg' })
    const initialSend = await room.sendImages([file])
    expect(initialSend).toBe(false)

    const failedMsg = room.messages.value[0]
    expect(failedMsg.status).toBe('failed')
    expect(mockInsert).not.toHaveBeenCalled()
    // Second attempt via retryMessage succeeds
    mockUpload.mockResolvedValueOnce({ data: { path: 'ok' }, error: null })
    await room.retryMessage(failedMsg.client_id)

    expect(mockUpload).toHaveBeenCalledTimes(2)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(room.messages.value[0].status).toBe('sent')

    const insertedRow = mockInsert.mock.calls[0][0]
    const decryptedPayload = await decryptContent(testKey, insertedRow.content, 'ch-general')
    expect(decryptedPayload).not.toContain('blob:')
    expect(decryptedPayload).toContain('channels/ch-general/')
  })

  it('retryMessage safely aborts if pending image files are missing from memory', async () => {
    const room = useChatRoom()
    room.activeChannelId.value = 'ch-general'

    const imagePayload = JSON.stringify({
      type: 'images',
      images: [{ path: 'blob:http://localhost/test.jpg', mimeType: 'image/jpeg', width: 0, height: 0, size: 100 }],
    })
    room.messages.value = [
      {
        id: 'c-orphan',
        client_id: 'c-orphan',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: imagePayload,
        created_at: '2026-10-20T12:00:00.000Z',
        status: 'failed',
      },
    ]

    await room.retryMessage('c-orphan')

    expect(room.messages.value[0].status).toBe('failed')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('selectChannel invokes imageAttachmentCache.revokeAllUrls to release memory on channel switch', async () => {
    const room = useChatRoom()
    const cache = useImageAttachmentCache()
    const revokeSpy = vi.spyOn(cache, 'revokeAllUrls')

    await room.selectChannel('ch-random')

    expect(revokeSpy).toHaveBeenCalled()
  })

  it('deleteMessage removes storage attachments when deleting an image message', async () => {
    const room = useChatRoom()
    room.activeChannelId.value = 'ch-general'

    const imagePayload = JSON.stringify({
      type: 'images',
      images: [
        { path: 'channels/ch-general/c-1/0.enc', mimeType: 'image/jpeg', width: 800, height: 600, size: 100 },
        { path: 'channels/ch-general/c-1/1.enc', mimeType: 'image/png', width: 800, height: 600, size: 200 },
      ],
    })

    room.messages.value = [
      {
        id: 'msg-img-delete-1',
        client_id: 'c-del-1',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: imagePayload,
        created_at: '2026-10-20T12:00:00.000Z',
        status: 'sent',
      },
    ]

    const result = await room.deleteMessage('msg-img-delete-1')
    expect(result.error).toBeNull()
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('message-attachments')
    expect(mockRemove).toHaveBeenCalledWith([
      'channels/ch-general/c-1/0.enc',
      'channels/ch-general/c-1/1.enc',
    ])
  })
})

describe('useChatRoom contacts and conversations', () => {
  let mockSupabase: any
  let testKey: CryptoKey
  let mockProfilesDb: Map<string, Profile>
  let mockContactsDb: Array<{ user_id: string; contact_user_id: string; created_at: string }>
  let mockConversationsDb: Array<any>
  let mockMembersDb: Array<any>
  let mockMessagesInsert: any
  let mockContactsSelect: any
  let mockMembersInsertError: any
  let mockMembersDeleteError: any

  beforeEach(async () => {
    mockMembersInsertError = null
    mockMembersDeleteError = null
    mockProfilesDb = new Map([
      ['u-alice', { id: 'u-alice', email: 'alice@example.com', display_name: 'Alice', avatar_color: '#0284c7' }],
      ['u-bob', { id: 'u-bob', email: 'bob@example.com', display_name: 'Bob', avatar_color: '#7c3aed' }],
      ['u-charlie', { id: 'u-charlie', email: 'charlie@example.com', display_name: 'Charlie', avatar_color: '#059669' }],
      ['u-david', { id: 'u-david', email: 'david@example.com', display_name: 'David', avatar_color: '#d97706' }],
    ])
    mockContactsDb = []
    mockConversationsDb = []
    mockMembersDb = []
    mockMessagesInsert = vi.fn().mockImplementation((payload) => ({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'm-srv-1',
            ...payload,
            created_at: new Date().toISOString(),
            author: mockProfilesDb.get(payload.user_id),
          },
          error: null,
        }),
      }),
    }))

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              ilike: vi.fn().mockImplementation((col: string, val: string) => ({
                single: vi.fn().mockImplementation(async () => {
                  if (col === 'email') {
                    const match = Array.from(mockProfilesDb.values()).find(p => p.email.toLowerCase() === val.toLowerCase())
                    return { data: match || null, error: match ? null : { message: 'Not found' } }
                  }
                  return { data: null, error: { message: 'Not found' } }
                }),
              })),
              eq: vi.fn().mockImplementation((col: string, val: string) => ({
                single: vi.fn().mockImplementation(async () => {
                  if (col === 'email') {
                    const match = Array.from(mockProfilesDb.values()).find(p => p.email.toLowerCase() === val.toLowerCase())
                    return { data: match || null, error: match ? null : { message: 'Not found' } }
                  }
                  const match = mockProfilesDb.get(val)
                  return { data: match || null, error: match ? null : { message: 'Not found' } }
                }),
              })),
              order: vi.fn().mockResolvedValue({ data: Array.from(mockProfilesDb.values()), error: null }),
            }),
          }
        }
        if (table === 'contacts') {
          mockContactsSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => ({
              order: vi.fn().mockResolvedValue({
                data: mockContactsDb.filter(c => c.user_id === val).map(c => ({
                  ...c,
                  profile: mockProfilesDb.get(c.contact_user_id) || null,
                })),
                error: null,
              }),
            })),
          })
          return {
            select: mockContactsSelect,
            insert: vi.fn().mockImplementation((payload: any) => {
              const row = {
                user_id: payload.user_id,
                contact_user_id: payload.contact_user_id,
                created_at: new Date().toISOString(),
              }
              mockContactsDb.push(row)
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      ...row,
                      profile: mockProfilesDb.get(payload.contact_user_id) || null,
                    },
                    error: null,
                  }),
                }),
              }
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col1: string, val1: string) => ({
                eq: vi.fn().mockImplementation((_col2: string, val2: string) => {
                  mockContactsDb = mockContactsDb.filter(
                    c => !(c.user_id === val1 && c.contact_user_id === val2),
                  )
                  return Promise.resolve({ error: null })
                }),
              })),
            }),
          }
        }
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => ({
                single: vi.fn().mockImplementation(async () => {
                  const conv = mockConversationsDb.find(c => c[col] === val)
                  return { data: conv || null, error: conv ? null : { message: 'Not found' } }
                }),
              })),
              order: vi.fn().mockResolvedValue({
                data: mockConversationsDb,
                error: null,
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              const newConv = {
                id: 'conv-' + (mockConversationsDb.length + 1),
                type: payload.type,
                title: payload.title || null,
                created_by: payload.created_by,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
              mockConversationsDb.push(newConv)
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: newConv, error: null }),
                }),
              }
            }),
          }
        }
        if (table === 'conversation_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => ({
                data: mockMembersDb.filter(m => m[col] === val),
                error: null,
              })),
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              if (mockMembersInsertError) {
                return Promise.resolve({ error: mockMembersInsertError })
              }
              const rows = Array.isArray(payload) ? payload : [payload]
              for (const r of rows) {
                mockMembersDb.push({
                  ...r,
                  joined_at: new Date().toISOString(),
                })
              }
              return Promise.resolve({ error: null })
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col1: string, val1: string) => ({
                eq: vi.fn().mockImplementation((_col2: string, val2: string) => {
                  if (mockMembersDeleteError) {
                    return Promise.resolve({ error: mockMembersDeleteError })
                  }
                  mockMembersDb = mockMembersDb.filter(
                    m => !(m.conversation_id === val1 && m.user_id === val2),
                  )
                  return Promise.resolve({ error: null })
                }),
              })),
            }),
          }
        }
        if (table === 'messages') {
          return {
            insert: mockMessagesInsert,
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        send: vi.fn(),
      }),
      removeChannel: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    }

    vi.stubGlobal('useSupabaseClient', () => mockSupabase)
    vi.stubGlobal('useSupabaseUser', () => ({ value: null }))

    const cfg = await createPhraseConfig('contacts test secret', 1000)
    testKey = await deriveKey('contacts test secret', cfg.salt, 1000)
    const e2ee = useE2ee()
    e2ee.key.value = testKey
    const auth = useAuthProfile()
    auth.currentProfile.value = mockProfilesDb.get('u-alice')!
  })

  it('finds user by email and adds/removes contacts', async () => {
    const room = useChatRoom()

    const bob = await room.findUserByEmail('bob@example.com')
    expect(bob).toBeDefined()
    expect(bob?.id).toBe('u-bob')
    expect(bob?.display_name).toBe('Bob')

    // Case-insensitive email lookup
    const bobUpper = await room.findUserByEmail('BOB@EXAMPLE.COM')
    expect(bobUpper).toBeDefined()
    expect(bobUpper?.id).toBe('u-bob')

    const unknown = await room.findUserByEmail('nonexistent@example.com')
    expect(unknown).toBeNull()

    // Add Bob to contacts
    await room.addContact('u-bob')
    expect(room.contacts.value).toHaveLength(1)
    expect(room.contacts.value[0].contact_user_id).toBe('u-bob')
    expect(room.contacts.value[0].profile?.display_name).toBe('Bob')

    // Adding Bob again is idempotent
    await room.addContact('u-bob')
    expect(room.contacts.value).toHaveLength(1)

    // Remove Bob from contacts
    await room.removeContact('u-bob')
    expect(room.contacts.value).toHaveLength(0)
  })

  it('creates direct conversation idempotently', async () => {
    const room = useChatRoom()

    // First call creates conversation and adds members
    const conv1 = await room.openOrCreateDirectChat('u-bob')
    expect(conv1).toBeDefined()
    expect(conv1.type).toBe('direct')
    expect(conv1.peer?.id).toBe('u-bob')
    expect(room.activeConversationId.value).toBe(conv1.id)
    expect(room.conversations.value).toHaveLength(1)
    expect(room.conversations.value[0].id).toBe(conv1.id)

    // Second call with same peer returns existing conversation without duplicate creation
    const conv2 = await room.openOrCreateDirectChat('u-bob')
    expect(conv2.id).toBe(conv1.id)
    expect(room.conversations.value).toHaveLength(1)
  })

  it('creates group conversation with participant list', async () => {
    const room = useChatRoom()

    const group = await room.createGroup('Design Team', ['u-bob', 'u-charlie'])
    expect(group).toBeDefined()
    expect(group.type).toBe('group')
    expect(group.title).toBe('Design Team')
    expect(group.members).toHaveLength(3) // alice (owner) + bob + charlie
    expect(room.activeConversationId.value).toBe(group.id)
    expect(room.conversations.value).toContainEqual(expect.objectContaining({ id: group.id }))
  })

  it('allows adding members to an existing group and rejects adding members to direct messages', async () => {
    const room = useChatRoom()

    // Type guard prevents adding members to a direct message
    const dm = await room.openOrCreateDirectChat('u-bob')
    await expect(room.addMemberToGroup(dm.id, 'charlie@example.com')).rejects.toThrow(
      'Cannot add members to a direct message.',
    )

    const group = await room.createGroup('Frontend Guild', ['u-bob'])
    expect(group.members).toHaveLength(2)

    await room.addMemberToGroup(group.id, 'charlie@example.com')
    const updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.members).toHaveLength(3)
    expect(updated?.members?.some(m => m.user_id === 'u-charlie')).toBe(true)
  })

  it('allows members to leave group and updates active conversation', async () => {
    const room = useChatRoom()

    const group1 = await room.createGroup('Team 1', ['u-bob'])
    const group2 = await room.createGroup('Team 2', ['u-charlie'])
    expect(room.conversations.value).toHaveLength(2)
    expect(room.activeConversationId.value).toBe(group2.id)

    await room.leaveGroup(group2.id)
    expect(room.conversations.value.find(c => c.id === group2.id)).toBeUndefined()
    expect(room.conversations.value).toHaveLength(1)
    expect(room.activeConversationId.value).toBe(group1.id)
  })

  it('sends messages and encrypts using conversation_id as AAD', async () => {
    const room = useChatRoom()

    const conv = await room.openOrCreateDirectChat('u-bob')
    await room.sendMessage('Secret hello to Bob!')

    expect(mockMessagesInsert).toHaveBeenCalledTimes(1)
    const inserted = mockMessagesInsert.mock.calls[0][0]
    expect(inserted.conversation_id).toBe(conv.id)
    expect(inserted.content).toMatch(/^e2ee:v1:/)

    // Decrypting with the correct conversation_id recovers the message
    const plaintext = await decryptContent(testKey, inserted.content, conv.id)
    expect(plaintext).toBe('Secret hello to Bob!')

    // Decrypting with a mismatched conversation_id throws / fails (proving AAD binding)
    await expect(decryptContent(testKey, inserted.content, 'wrong-conv-id')).rejects.toThrow()
  })

  it('loads contacts with disambiguated profiles foreign key', async () => {
    const room = useChatRoom()
    await room.loadContacts()
    expect(mockContactsSelect).toHaveBeenCalledWith(
      'user_id, contact_user_id, created_at, profile:profiles!contacts_contact_user_id_fkey(*)',
    )
  })

  it('throws when conversation_members insert fails in openOrCreateDirectChat', async () => {
    mockMembersInsertError = { message: 'Insert direct member failed' }
    const room = useChatRoom()
    await expect(room.openOrCreateDirectChat('u-bob')).rejects.toThrow('Insert direct member failed')
  })

  it('throws when conversation_members insert fails in createGroup', async () => {
    mockMembersInsertError = { message: 'Insert group member failed' }
    const room = useChatRoom()
    await expect(room.createGroup('Fail Group', ['u-bob'])).rejects.toThrow('Insert group member failed')
  })

  it('throws and retains group in state when conversation_members delete fails in leaveGroup', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Persistent Group', ['u-bob'])
    expect(room.conversations.value.some(c => c.id === group.id)).toBe(true)

    mockMembersDeleteError = { message: 'Delete member failed' }
    await expect(room.leaveGroup(group.id)).rejects.toThrow('Delete member failed')
    expect(room.conversations.value.some(c => c.id === group.id)).toBe(true)
  })

  it('updates target conversation lastMessage and updated_at on sendMessage and handleIncomingRealtimeMessage', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Testing Recency', ['u-bob'])

    expect(group.lastMessage).toBeUndefined()

    await room.sendMessage('Hello everyone in Testing Recency')

    const targetConv = room.conversations.value.find(c => c.id === group.id)
    expect(targetConv?.lastMessage).toBeDefined()
    expect(targetConv?.lastMessage?.content).toBe('Hello everyone in Testing Recency')
    expect(targetConv?.updated_at).toBeDefined()

    // Realtime message from bob
    const incomingRow = {
      id: 'm-rt-1',
      client_id: 'c-rt-1',
      conversation_id: group.id,
      user_id: 'u-bob',
      content: 'Hey Alice from Bob',
      created_at: '2026-10-21T10:00:00Z',
    }
    handleIncomingRealtimeMessage({
      row: incomingRow as any,
      activeConversationId: group.id,
      messagesStore: { reconcileIncomingMessage: vi.fn() } as any,
      typingTracker: { clearUserTyping: vi.fn() } as any,
      unreadCounts: {},
      conversations: room.conversations,
    })

    expect(targetConv?.lastMessage?.id).toBe('m-rt-1')
    expect(targetConv?.lastMessage?.content).toBe('Hey Alice from Bob')
    expect(targetConv?.updated_at).toBe('2026-10-21T10:00:00Z')
  })
})
