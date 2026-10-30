import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowReactive, computed } from 'vue'
import {
  handleIncomingRealtimeMessage,
  handleRealtimeMessageUpdate,
  handleRealtimeReactionEvent,
  isDuplicateKeyError,
  resolveMessageAuthor,
  applyRealtimeProfileUpdate,
  filterOnlineFriends,
  computeUnreadSnapshot,
  computeOldestReadTimestamp,
  computeChannelReadMap,
  createChannelReadDebouncer,
  subscribeWithPromise,
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
import { isSystemPayload, parseSystemPayload } from '~/utils/chat'

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

  it('dispatches incoming message to notificationManager if provided', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-me', 3000)
    const notifyMock = vi.fn()
    const mockNotifManager = {
      notifyIncomingMessage: notifyMock,
    } as any

    handleIncomingRealtimeMessage({
      row: {
        id: 'm-20',
        client_id: 'c-20',
        conversation_id: 'conv-99',
        user_id: 'u-alice',
        content: 'Notification test',
        created_at: '2026-10-21T10:00:00Z',
      },
      activeConversationId: 'conv-1',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts: {},
      notificationManager: mockNotifManager,
    })

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({ id: 'm-20', content: 'Notification test' }),
      activeConversationId: 'conv-1',
    }))
  })

  it('dispatches incoming message for active conversation to notificationManager (for background tab alert)', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-me', 3000)
    const notifyMock = vi.fn()
    const mockNotifManager = {
      notifyIncomingMessage: notifyMock,
    } as any

    handleIncomingRealtimeMessage({
      row: {
        id: 'm-21',
        client_id: 'c-21',
        conversation_id: 'conv-active',
        user_id: 'u-alice',
        content: 'Active room test',
        created_at: '2026-10-21T10:00:00Z',
      },
      activeConversationId: 'conv-active',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts: {},
      notificationManager: mockNotifManager,
    })

    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({ id: 'm-21', content: 'Active room test' }),
      activeConversationId: 'conv-active',
    }))
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

  it('returns cached profile for inactive channel without calling fetchProfile', async () => {
    const cache = new Map<string, Profile>()
    cache.set('u-bob', { id: 'u-bob', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' })
    const fetchProfile = vi.fn().mockResolvedValue(undefined)

    const author = await resolveMessageAuthor({
      userId: 'u-bob',
      channelId: 'ch-other',
      activeChannelId: 'ch-general',
      profilesCache: cache,
      fetchProfile,
    })

    expect(author?.display_name).toBe('Bob')
    expect(fetchProfile).not.toHaveBeenCalled()
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

  it('filterOnlineFriends only keeps users who are added friends in contacts', () => {
    const onlineUsers: Profile[] = [
      { id: 'u-friend-1', display_name: 'Friend One', avatar_color: '#0284c7', email: 'f1@example.com' },
      { id: 'u-stranger-2', display_name: 'Stranger Two', avatar_color: '#10b981', email: 's2@example.com' },
      { id: 'u-friend-3', display_name: 'Friend Three', avatar_color: '#f59e0b', email: 'f3@example.com' },
    ]
    const contacts: any[] = [
      { user_id: 'u-self', contact_user_id: 'u-friend-1' },
      { user_id: 'u-self', contact_user_id: 'u-friend-3' },
    ]

    const result = filterOnlineFriends(onlineUsers, contacts)
    expect(result.map(u => u.id)).toEqual(['u-friend-1', 'u-friend-3'])
    expect(result.some(u => u.id === 'u-stranger-2')).toBe(false)
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
        if (table === 'conversation_reads' || table === 'channel_reads') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }
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
      rpc: vi.fn((fnName: string, params: any) => {
        if (fnName === 'toggle_pin_message') {
          if (mockTogglePinError) {
            return Promise.resolve({ data: { error: mockTogglePinError }, error: null })
          }
          return Promise.resolve({ data: { success: true }, error: null })
        }
        if (fnName === 'lookup_profile_by_email') {
          const match = Array.from(mockProfilesDb.values()).find(
            p => p.email.toLowerCase() === params.search_email.toLowerCase(),
          )
          return Promise.resolve({ data: match ? [match] : [], error: null })
        }
        if (fnName === 'add_mutual_friend') {
          mockContactsDb.push({
            user_id: 'u-alice',
            contact_user_id: params.target_user_id,
            created_at: new Date().toISOString(),
          })
          mockContactsDb.push({
            user_id: params.target_user_id,
            contact_user_id: 'u-alice',
            created_at: new Date().toISOString(),
          })
          return Promise.resolve({ data: null, error: null })
        }
        if (fnName === 'toggle_pin_message') {
          if (mockTogglePinError) {
            return Promise.resolve({ data: { error: mockTogglePinError }, error: null })
          }
          return Promise.resolve({ data: { success: true }, error: null })
        }
        if (fnName === 'remove_mutual_friend') {
          mockContactsDb = mockContactsDb.filter(
            c => !(
              (c.user_id === 'u-alice' && c.contact_user_id === params.target_user_id) ||
              (c.user_id === params.target_user_id && c.contact_user_id === 'u-alice')
            ),
          )
          return Promise.resolve({ data: null, error: null })
        }
        return Promise.resolve({ data: null, error: { message: 'Unknown RPC' } })
      }),
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
    const sentPayload = JSON.parse(room.messages.value[0].content)
    expect(sentPayload.images[0].path).toMatch(/^channels\/ch-general\//)
    expect(sentPayload.images[0].path).not.toContain('blob:')
  })

  it('sendImages embeds caption into optimistic message and final encrypted payload', async () => {
    const room = useChatRoom()
    room.activeChannelId.value = 'ch-general'

    const file = new File(['file-bytes'], 'pic.jpg', { type: 'image/jpeg' })
    const result = await room.sendImages([file], 'My awesome trip')
    expect(result).toBe(true)

    // Verify inserted payload envelope decrypts to payload with caption
    expect(mockInsert).toHaveBeenCalled()
    const insertedRow = mockInsert.mock.calls[mockInsert.mock.calls.length - 1][0]
    const decryptedPayload = await decryptContent(testKey, insertedRow.content, 'ch-general')
    const parsedPayload = JSON.parse(decryptedPayload)
    expect(parsedPayload.caption).toBe('My awesome trip')
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
    const initialSend = await room.sendImages([file], 'My retry caption')
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
    const parsedDecrypted = JSON.parse(decryptedPayload)
    expect(parsedDecrypted.caption).toBe('My retry caption')
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
  let mockConversationsUpdateError: { message: string } | null = null
  let mockTogglePinError: string | null = null
  let mockMessagesUpdateError: { message: string } | null = null
  let mockReactionsError: { message: string } | null = null
  let capturedMessagesSelect = ''

  beforeEach(async () => {
    mockConversationsUpdateError = null
    mockMessagesUpdateError = null
    mockReactionsError = null
    capturedMessagesSelect = ''
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
            update: vi.fn().mockImplementation((payload: any) => ({
              eq: vi.fn().mockImplementation((_col: string, val: string) => {
                if (mockConversationsUpdateError) {
                  return Promise.resolve({ error: mockConversationsUpdateError })
                }
                const conv = mockConversationsDb.find(c => c.id === val)
                if (conv) {
                  Object.assign(conv, payload)
                }
                return Promise.resolve({ error: null })
              }),
            })),
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
            update: vi.fn().mockImplementation((payload: any) => ({
              eq: vi.fn().mockImplementation((_col1: string, _val1: string) => ({
                eq: vi.fn().mockImplementation((_col2: string, _val2: string) => {
                  if (mockMessagesUpdateError) {
                    return Promise.resolve({ error: mockMessagesUpdateError })
                  }
                  return Promise.resolve({ error: null })
                }),
              })),
            })),
            select: vi.fn((fields?: string) => {
              if (fields) capturedMessagesSelect = fields
              return {
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }
            }),
          }
        }
        if (table === 'message_reactions') {
          return {
            insert: vi.fn().mockImplementation((_payload: any) => {
              if (mockReactionsError) {
                return Promise.resolve({ error: mockReactionsError })
              }
              return Promise.resolve({ error: null })
            }),
            delete: vi.fn().mockReturnValue({
              match: vi.fn().mockImplementation((_matchObj: any) => {
                if (mockReactionsError) {
                  return Promise.resolve({ error: mockReactionsError })
                }
                return Promise.resolve({ error: null })
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
      rpc: vi.fn((fnName: string, params: any) => {
        if (fnName === 'lookup_profile_by_email') {
          const match = Array.from(mockProfilesDb.values()).find(
            p => p.email.toLowerCase() === params.search_email.toLowerCase(),
          )
          return Promise.resolve({ data: match ? [match] : [], error: null })
        }
        if (fnName === 'toggle_pin_message') {
          if (mockTogglePinError) {
            return Promise.resolve({ data: { error: mockTogglePinError }, error: null })
          }
          return Promise.resolve({ data: { success: true }, error: null })
        }
        if (fnName === 'add_mutual_friend') {
          mockContactsDb.push({
            user_id: 'u-alice',
            contact_user_id: params.target_user_id,
            created_at: new Date().toISOString(),
          })
          mockContactsDb.push({
            user_id: params.target_user_id,
            contact_user_id: 'u-alice',
            created_at: new Date().toISOString(),
          })
          return Promise.resolve({ data: null, error: null })
        }
        if (fnName === 'remove_mutual_friend') {
          mockContactsDb = mockContactsDb.filter(
            c => !(
              (c.user_id === 'u-alice' && c.contact_user_id === params.target_user_id) ||
              (c.user_id === params.target_user_id && c.contact_user_id === 'u-alice')
            ),
          )
          return Promise.resolve({ data: null, error: null })
        }
        return Promise.resolve({ data: null, error: { message: 'Unknown RPC' } })
      }),
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
    expect(mockSupabase.rpc).toHaveBeenCalledWith('lookup_profile_by_email', { search_email: 'bob@example.com' })

    // Add Bob to contacts via mutual friend RPC
    await room.addContact('u-bob')
    expect(mockSupabase.rpc).toHaveBeenCalledWith('add_mutual_friend', { target_user_id: 'u-bob' })
    expect(room.contacts.value).toHaveLength(1)
    expect(room.contacts.value[0].contact_user_id).toBe('u-bob')
    expect(room.contacts.value[0].profile?.display_name).toBe('Bob')
    expect(mockContactsDb.some(c => c.user_id === 'u-alice' && c.contact_user_id === 'u-bob')).toBe(true)
    expect(mockContactsDb.some(c => c.user_id === 'u-bob' && c.contact_user_id === 'u-alice')).toBe(true)

    // Adding Bob again is idempotent
    await room.addContact('u-bob')
    expect(room.contacts.value).toHaveLength(1)

    // Remove Bob from contacts via mutual friend removal RPC
    await room.removeContact('u-bob')
    expect(mockSupabase.rpc).toHaveBeenCalledWith('remove_mutual_friend', { target_user_id: 'u-bob' })
    expect(room.contacts.value).toHaveLength(0)
    expect(mockContactsDb.some(c => c.user_id === 'u-alice' && c.contact_user_id === 'u-bob')).toBe(false)
    expect(mockContactsDb.some(c => c.user_id === 'u-bob' && c.contact_user_id === 'u-alice')).toBe(false)
  })

  it('openOrCreateDirectChat prefers atomic get_or_create_direct_conversation RPC before client queries', async () => {
    const rpcSpy = vi.spyOn(mockSupabase, 'rpc').mockImplementation(async (fnName: string, args: any) => {
      if (fnName === 'get_or_create_direct_conversation') {
        const convId = 'conv-rpc-dm-1'
        mockConversationsDb.push({
          id: convId,
          type: 'direct',
          title: null,
          created_by: 'u-alice',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          members: [
            { conversation_id: convId, user_id: 'u-alice', role: 'owner', profile: mockProfilesDb.get('u-alice') },
            { conversation_id: convId, user_id: args.target_user_id, role: 'member', profile: mockProfilesDb.get(args.target_user_id) },
          ],
        })
        return { data: convId, error: null }
      }
      return { data: null, error: { message: 'Unknown RPC' } }
    })

    const room = useChatRoom()
    const conv = await room.openOrCreateDirectChat('u-bob')
    expect(rpcSpy).toHaveBeenCalledWith('get_or_create_direct_conversation', { target_user_id: 'u-bob' })
    expect(conv.id).toBe('conv-rpc-dm-1')
    expect(conv.type).toBe('direct')
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

  it('deduplicates concurrent openOrCreateDirectChat calls for the same peer', async () => {
    const room = useChatRoom()
    let conversationInserts = 0
    const origFrom = mockSupabase.from
    mockSupabase.from = vi.fn((table: string) => {
      const res = origFrom(table)
      if (table === 'conversations') {
        const origInsert = res.insert
        res.insert = vi.fn().mockImplementation((payload: any) => {
          conversationInserts++
          const builder = origInsert(payload)
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 20))
                return {
                  data: {
                    id: 'conv-concurrent',
                    type: payload.type,
                    title: null,
                    created_by: payload.created_by,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }
              }),
            }),
          }
        })
      }
      return res
    })

    const [conv1, conv2] = await Promise.all([
      room.openOrCreateDirectChat('u-bob'),
      room.openOrCreateDirectChat('u-bob'),
    ])

    expect(conv1).toBeDefined()
    expect(conv2).toBeDefined()
    expect(conv1.id).toBe(conv2.id)
    expect(conversationInserts).toBe(1)
    expect(room.conversations.value.filter(c => c.type === 'direct')).toHaveLength(1)
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

  it('validates title and updates group title in state and database', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Original Title', ['u-bob'])

    // Empty title rejected
    const emptyRes = await room.updateGroupTitle(group.id, '   ')
    expect(emptyRes.error).toBe('Group title must be 1–100 characters.')

    // Valid title update
    const successRes = await room.updateGroupTitle(group.id, 'Renamed Team')
    expect(successRes.error).toBeNull()

    const updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.title).toBe('Renamed Team')
  })

  it('rolls back title and updated_at in state if database update fails', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Stable Group', ['u-bob'])
    const originalUpdatedAt = group.updated_at

    mockConversationsUpdateError = { message: 'Database update rejected' }
    const res = await room.updateGroupTitle(group.id, 'Failing Rename')
    expect(res.error).toBe('Database update rejected')

    const current = room.conversations.value.find(c => c.id === group.id)
    expect(current?.title).toBe('Stable Group')
    expect(current?.updated_at).toBe(originalUpdatedAt)
  })

  it('returns error when updating title for non-group conversation or when unauthenticated', async () => {
    const room = useChatRoom()
    const dm = await room.openOrCreateDirectChat('u-bob')
    const dmRes = await room.updateGroupTitle(dm.id, 'New DM Name')
    expect(dmRes.error).toBe('Group conversation not found.')

    const auth = useAuthProfile()
    const origProfile = auth.currentProfile.value
    auth.currentProfile.value = null
    const noAuthRes = await room.updateGroupTitle(dm.id, 'New Name')
    expect(noAuthRes.error).toBe('Not authenticated.')
    auth.currentProfile.value = origProfile
  })

  it('togglePinMessage toggles pin state optimistically and calls RPC', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Pin Team', ['u-bob'])
    await room.sendMessage('Important note')
    const msg = room.messages.value[0]
    expect(msg).toBeDefined()

    const res = await room.togglePinMessage(msg.id)
    expect(res.error).toBeNull()
    const pinned = room.messages.value.find(m => m.id === msg.id)
    expect(pinned?.pinned_at).toBeTruthy()

    // Toggle again to unpin
    const res2 = await room.togglePinMessage(msg.id)
    expect(res2.error).toBeNull()
    const unpinned = room.messages.value.find(m => m.id === msg.id)
    expect(unpinned?.pinned_at).toBeNull()
  })

  it('togglePinMessage reverts optimistic pin state when RPC returns error in data payload', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Denied Pin Team', ['u-bob'])
    await room.sendMessage('Confidential note')
    const msg = room.messages.value[0]
    expect(msg).toBeDefined()

    mockTogglePinError = 'Access denied'
    const res = await room.togglePinMessage(msg.id)
    expect(res.error).toBe('Access denied')

    const after = room.messages.value.find(m => m.id === msg.id)
    expect(after?.pinned_at).toBeNull()
    mockTogglePinError = null
  })

  it('editMessage reverts optimistic update when Supabase update fails', async () => {
    const room = useChatRoom()
    await room.createGroup('Edit Team', ['u-bob'])
    await room.sendMessage('Original content')
    const msg = room.messages.value[0]
    expect(msg).toBeDefined()
    expect(msg.content).toBe('Original content')

    mockMessagesUpdateError = { message: 'Database edit error' }
    const res = await room.editMessage(msg.id, 'Edited content')
    expect(res.error).toBe('Database edit error')

    const after = room.messages.value.find(m => m.id === msg.id)
    expect(after?.content).toBe('Original content')
    expect(after?.edited_at).toBeFalsy()
  })

  it('deleteMessage reverts optimistic deletion when Supabase update fails', async () => {
    const room = useChatRoom()
    await room.createGroup('Delete Team', ['u-bob'])
    await room.sendMessage('Message to delete')
    const msg = room.messages.value[0]
    expect(msg).toBeDefined()

    mockMessagesUpdateError = { message: 'Database delete error' }
    const res = await room.deleteMessage(msg.id)
    expect(res.error).toBe('Database delete error')

    const after = room.messages.value.find(m => m.id === msg.id)
    expect(after?.deleted_at).toBeNull()
  })

  it('toggleReaction reverts optimistic reaction when Supabase operation fails', async () => {
    const room = useChatRoom()
    await room.createGroup('Reaction Team', ['u-bob'])
    await room.sendMessage('Message to react')
    const msg = room.messages.value[0]
    expect(msg).toBeDefined()

    // Test addition rollback on error
    mockReactionsError = { message: 'Failed to add reaction' }
    const res = await room.toggleReaction(msg.id, '👍')
    expect(res.error).toBe('Failed to add reaction')

    let after = room.messages.value.find(m => m.id === msg.id)
    expect(after?.reactions?.some(r => r.emoji === '👍')).toBeFalsy()

    // Now add reaction successfully
    mockReactionsError = null
    const addRes = await room.toggleReaction(msg.id, '👍')
    expect(addRes.error).toBeNull()
    after = room.messages.value.find(m => m.id === msg.id)
    expect(after?.reactions?.some(r => r.emoji === '👍')).toBe(true)

    // Test removal rollback on error
    mockReactionsError = { message: 'Failed to remove reaction' }
    const removeRes = await room.toggleReaction(msg.id, '👍')
    expect(removeRes.error).toBe('Failed to remove reaction')
    after = room.messages.value.find(m => m.id === msg.id)
    expect(after?.reactions?.some(r => r.emoji === '👍')).toBe(true)
  })

  it('toggleReaction inserts into message_reactions with conversation_id and without channel_id', async () => {
    const room = useChatRoom()
    await room.createGroup('Reaction Test Team', ['u-bob'])
    await room.sendMessage('Target msg')
    const msg = room.messages.value[0]

    let insertedPayload: any = null
    const origFrom = mockSupabase.from
    mockSupabase.from = vi.fn((table: string) => {
      const res = origFrom(table)
      if (table === 'message_reactions') {
        res.insert = vi.fn().mockImplementation((payload: any) => {
          insertedPayload = payload
          return Promise.resolve({ error: null })
        })
      }
      return res
    })

    const res = await room.toggleReaction(msg.id, '👍')
    expect(res.error).toBeNull()
    expect(insertedPayload).toBeDefined()
    expect(insertedPayload.conversation_id).toBeDefined()
    expect(insertedPayload.channel_id).toBeUndefined()
  })

  it('initializeChat queries recent unread messages using conversation_id without channel_id', async () => {
    mockConversationsDb.push({
      id: 'conv-test-1',
      type: 'public',
      title: 'General',
      created_at: '2026-10-18T10:00:00Z',
      updated_at: '2026-10-18T10:00:00Z',
    })
    mockMembersDb.push({
      conversation_id: 'conv-test-1',
      user_id: 'u-alice',
      role: 'member',
      joined_at: '2026-10-18T10:00:00Z',
      conversation: {
        id: 'conv-test-1',
        type: 'public',
        title: 'General',
        created_at: '2026-10-18T10:00:00Z',
        updated_at: '2026-10-18T10:00:00Z',
      },
    })

    mockSupabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'u-alice', email: 'alice@example.com' } },
      error: null,
    })
    const room = useChatRoom()
    await room.initializeChat()

    expect(capturedMessagesSelect).toBeTruthy()
    expect(capturedMessagesSelect).toContain('conversation_id')
    expect(capturedMessagesSelect).not.toContain('channel_id')
  })

  it('selectChannel disambiguates author profile embedding with messages_user_id_fkey', async () => {
    let capturedSelect = ''
    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'messages') {
        return {
          select: vi.fn((fields: string) => {
            capturedSelect = fields
            return {
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }
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
    })

    const room = useChatRoom()
    await room.selectChannel('conv-test-1')

    expect(capturedSelect).toContain('author:profiles!messages_user_id_fkey')
    expect(capturedSelect).not.toMatch(/author:profiles\(/)
  })

  it('updates chat background with a preset and syncs to conversation state', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Background Group', ['u-bob'])

    const res = await room.updateChatBackground(group.id, 'preset:aurora')
    expect(res.error).toBeNull()

    const updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.background_url).toBe('preset:aurora')

    const lastInsertCall = mockMessagesInsert.mock.calls[mockMessagesInsert.mock.calls.length - 1][0]
    const decrypted = await decryptContent(testKey, lastInsertCall.content, group.id)
    const parsed = JSON.parse(decrypted)
    expect(parsed.event).toBe('background_change')
    expect(parsed.detail).toBe('Aurora Borealis')
  })

  it('removes chat background and resets to null', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Background Reset Group', ['u-bob'])
    await room.updateChatBackground(group.id, 'preset:sunset')

    const res = await room.removeChatBackground(group.id)
    expect(res.error).toBeNull()

    const updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.background_url).toBeNull()
  })

  it('updates, adds, and removes confetti dictionary words for a conversation', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Confetti Group', ['u-bob'])

    const addRes = await room.addConfettiWord(group.id, '  hooray, congrats  ')
    expect(addRes.error).toBeNull()

    let updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.confetti_words).toEqual(['hooray', 'congrats'])

    // Adding duplicate word is a no-op
    await room.addConfettiWord(group.id, 'CONGRATS')
    updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.confetti_words).toEqual(['hooray', 'congrats'])

    // Remove single word
    const remRes = await room.removeConfettiWord(group.id, 'hooray')
    expect(remRes.error).toBeNull()
    updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.confetti_words).toEqual(['congrats'])
  })

  it('rolls back confetti dictionary on update error', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Error Group', ['u-bob'])
    await room.addConfettiWord(group.id, 'stable')

    mockConversationsUpdateError = { message: 'Database failure' }
    const res = await room.addConfettiWord(group.id, 'new-word')
    expect(res.error).toBe('Database failure')

    const updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.confetti_words).toEqual(['stable'])
  })

  it('selectConversation does not fire a redundant second messages query when the primary query fails', async () => {
    const selectSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Network timeout' } }),
          }),
        }),
      }),
    })
    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'messages') return { select: selectSpy }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
    })

    const room = useChatRoom()
    await room.selectConversation('conv-1')
    expect(selectSpy).toHaveBeenCalledTimes(1)
  })

  it('discards stale loadOlderMessages and fetchGapMessages results when activeConversationId changes in flight', async () => {
    let resolveQuery: (val: any) => void = () => {}
    const delayedPromise = new Promise((resolve) => {
      resolveQuery = resolve
    })

    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue(delayedPromise),
                  }),
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
    })

    const room = useChatRoom()
    room.activeConversationId.value = 'conv-1'
    room.hasMoreHistory.value = true
    room.messages.value = [
      {
        id: 'm-current-1',
        client_id: 'c-1',
        conversation_id: 'conv-1',
        user_id: 'u-alice',
        content: 'current message',
        created_at: '2026-10-20T10:00:00Z',
        status: 'sent',
      } as any,
    ]

    const loadPromise = room.loadOlderMessages()
    // User switches conversations while query is in flight
    room.activeConversationId.value = 'conv-2'
    room.messages.value = []

    // Now resolve query with old conversation messages
    resolveQuery({
      data: [
        {
          id: 'm-old-1',
          client_id: 'c-old-1',
          conversation_id: 'conv-1',
          user_id: 'u-bob',
          content: 'old message from conv-1',
          created_at: '2026-10-19T10:00:00Z',
          status: 'sent',
        },
      ],
      error: null,
    })

    const prependedCount = await loadPromise
    expect(prependedCount).toBe(0)
    expect(room.messages.value).toHaveLength(0)
  })

  it('loadConversationReadsAndUnreads scopes query to conversation IDs and clamps default read timestamp to 30-day window instead of 1970', async () => {
    let capturedGt = ''
    let capturedInKey = ''
    let capturedInValues: any[] = []
    let capturedLimit: number | null = null
    let capturedOrderCol = ''
    let capturedOrderOptions: any = null

    const origFrom = mockSupabase.from
    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'conversation_reads') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            gt: vi.fn().mockImplementation((col: string, val: string) => {
              capturedGt = val
              const chain: any = {
                in: vi.fn().mockImplementation((inCol: string, inVals: any[]) => {
                  capturedInKey = inCol
                  capturedInValues = inVals
                  return chain
                }),
                order: vi.fn().mockImplementation((col: string, options: any) => {
                  capturedOrderCol = col
                  capturedOrderOptions = options
                  return chain
                }),
                limit: vi.fn().mockImplementation((lim: number) => {
                  capturedLimit = lim
                  return Promise.resolve({ data: [], error: null })
                }),
              }
              chain.then = (fn: any) => Promise.resolve({ data: [], error: null }).then(fn)
              return chain
            }),
          }),
        }
      }
      return origFrom(table)
    })

    mockSupabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'u-alice', email: 'alice@example.com' } },
      error: null,
    })
    mockProfilesDb.set('u-alice', {
      id: 'u-alice',
      email: 'alice@example.com',
      display_name: 'Alice',
      avatar_color: '#0284c7',
    })
    mockConversationsDb.push({
      id: 'conv-101',
      type: 'group',
      title: 'Scoped Channel',
      created_at: '2026-10-18T10:00:00Z',
      updated_at: '2026-10-18T10:00:00Z',
    })
    mockMembersDb.push({
      conversation_id: 'conv-101',
      user_id: 'u-alice',
      role: 'member',
      joined_at: '2026-10-18T10:00:00Z',
      conversation: {
        id: 'conv-101',
        type: 'group',
        title: 'Scoped Channel',
        created_at: '2026-10-18T10:00:00Z',
        updated_at: '2026-10-18T10:00:00Z',
      },
    })

    const room = useChatRoom()
    await room.initializeChat()

    expect(capturedGt).not.toContain('1970-01-01')
    const parsedGt = Date.parse(capturedGt)
    expect(Number.isNaN(parsedGt)).toBe(false)
    const thirtyDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
    expect(parsedGt).toBeGreaterThan(thirtyDaysAgo)
    expect(capturedInKey).toBe('conversation_id')
    expect(capturedInValues).toEqual(['conv-101'])
    expect(capturedLimit).toBe(1000)
    expect(capturedOrderCol).toBe('created_at')
    expect(capturedOrderOptions?.ascending).toBe(false)
  })

  it('removes and waits for old dbChangesChannel before creating a replacement', async () => {
    let removePromiseFinished = false
    mockSupabase.removeChannel = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 20))
      removePromiseFinished = true
    })

    let createdAfterRemove = false
    const origChannel = mockSupabase.channel
    mockSupabase.channel = vi.fn().mockImplementation((name: string, ...args: any[]) => {
      if (name === 'chat:db_changes' && mockSupabase.removeChannel.mock.calls.length > 0) {
        createdAfterRemove = removePromiseFinished
      }
      return origChannel ? origChannel(name, ...args) : { on: vi.fn().mockReturnThis(), subscribe: vi.fn() }
    })

    const room = useChatRoom()
    await room.initializeChat()
    // Second initialization triggers teardown of previous dbChangesChannel
    await room.initializeChat()

    expect(mockSupabase.removeChannel).toHaveBeenCalled()
    expect(createdAfterRemove).toBe(true)
  })

  it('sendBuzz emits an encrypted system message with event buzz', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Buzz Group', ['u-bob'])
    room.activeConversationId.value = group.id

    await room.sendBuzz()

    expect(mockMessagesInsert).toHaveBeenCalled()
    const lastCall = mockMessagesInsert.mock.calls[mockMessagesInsert.mock.calls.length - 1][0]
    expect(lastCall.conversation_id).toBe(group.id)
    expect(lastCall.content).toMatch(/^e2ee:v1:/)
    const decrypted = await decryptContent(testKey, lastCall.content, group.id)
    expect(isSystemPayload(decrypted)).toBe(true)
    const payload = parseSystemPayload(decrypted)
    expect(payload?.event).toBe('buzz')
    expect(payload?.actorName).toBe('Alice')
  })

  it('updateGroupTitle and updateChatBackground emit encrypted system activity messages', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Original Title', ['u-bob'])
    room.activeConversationId.value = group.id
    mockMessagesInsert.mockClear()

    await room.updateGroupTitle(group.id, 'Renamed Title')
    expect(mockMessagesInsert).toHaveBeenCalled()
    let lastCall = mockMessagesInsert.mock.calls[mockMessagesInsert.mock.calls.length - 1][0]
    let decrypted = await decryptContent(testKey, lastCall.content, group.id)
    let payload = parseSystemPayload(decrypted)
    expect(payload?.event).toBe('group_rename')
    expect(payload?.detail).toBe('Renamed Title')

    mockMessagesInsert.mockClear()
    await room.updateChatBackground(group.id, 'preset:sunset')
    expect(mockMessagesInsert).toHaveBeenCalled()
    lastCall = mockMessagesInsert.mock.calls[mockMessagesInsert.mock.calls.length - 1][0]
    decrypted = await decryptContent(testKey, lastCall.content, group.id)
    payload = parseSystemPayload(decrypted)
    expect(payload?.event).toBe('background_change')

    mockMessagesInsert.mockClear()
    await room.removeChatBackground(group.id)
    expect(mockMessagesInsert).toHaveBeenCalled()
    lastCall = mockMessagesInsert.mock.calls[mockMessagesInsert.mock.calls.length - 1][0]
    decrypted = await decryptContent(testKey, lastCall.content, group.id)
    payload = parseSystemPayload(decrypted)
    expect(payload?.event).toBe('background_reset')
  })

  it('tracks conversation reads across all conversation members in conversationReadsByConv', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Reads Group', ['u-bob'])
    room.activeConversationId.value = group.id

    room.markConversationRead(group.id)
    expect(room.activeConversationReads.value['u-alice']).toBeTruthy()
    expect(room.conversationReadsByConv.value[group.id]['u-alice']).toBeTruthy()
  })

  it('selectConversation skips revokeAllUrls when re-selecting the already active conversation with loaded messages', async () => {
    const room = useChatRoom()
    room.activeConversationId.value = 'conv-active-1'
    room.messages.value = [
      {
        id: 'm-1',
        client_id: 'c-1',
        conversation_id: 'conv-active-1',
        channel_id: 'conv-active-1',
        user_id: 'u-alice',
        content: 'Hello',
        created_at: '2026-10-20T12:00:00.000Z',
        status: 'sent',
      },
    ]
    const cache = useImageAttachmentCache()
    const revokeSpy = vi.spyOn(cache, 'revokeAllUrls')

    await room.selectConversation('conv-active-1')
    expect(revokeSpy).not.toHaveBeenCalled()
  })

  it('loadConversationReadsAndUnreads scopes conversation_reads query to active conversation IDs', async () => {
    let capturedReadsInIds: string[] | null = null
    const origFrom = mockSupabase.from
    mockSupabase.from = vi.fn((table: string) => {
      if (table === 'conversation_reads') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn((_col: string, ids: string[]) => {
              capturedReadsInIds = ids
              return Promise.resolve({ data: [], error: null })
            }),
          }),
        }
      }
      return origFrom(table)
    })

    mockSupabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'u-alice', email: 'alice@example.com' } },
      error: null,
    })

    const room = useChatRoom()
    const group = await room.createGroup('Alpha', ['u-bob'])
    await room.initializeChat()
    expect(capturedReadsInIds).toEqual([group.id])
  })

  it('suppresses automatic markConversationRead on incoming message when document is not focused', async () => {
    mockSupabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'u-alice', email: 'alice@example.com' } },
      error: null,
    })
    let insertCallback: any = null
    mockSupabase.channel = vi.fn().mockImplementation((channelName: string) => {
      const channelObj: any = {
        on: vi.fn().mockImplementation((event: string, filter: any, cb: any) => {
          if (event === 'postgres_changes' && filter?.table === 'messages' && filter?.event === 'INSERT') {
            insertCallback = cb
          }
          return channelObj
        }),
        subscribe: vi.fn().mockImplementation((cb?: any) => {
          if (cb) cb('SUBSCRIBED')
          return channelObj
        }),
        send: vi.fn(),
        track: vi.fn().mockResolvedValue('ok'),
      }
      return channelObj
    })

    const room = useChatRoom()
    await room.initializeChat()
    const group = await room.createGroup('Focus Test', ['u-bob'])
    await room.selectConversation(group.id)

    // Mock document.hasFocus = false and visibilityState = 'hidden'
    const origHasFocus = document.hasFocus
    const origVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.hasFocus = () => false

    // Record initial read timestamp from conversation creation
    const initialRead = room.activeConversationReads.value['u-alice']

    // Wait 10ms so next timestamp is distinctly different
    await new Promise(r => setTimeout(r, 15))

    const encrypted = await encryptContent(testKey, 'Background message', group.id)
    await insertCallback({
      new: {
        id: 'msg-bg-1',
        client_id: 'c-bg-1',
        conversation_id: group.id,
        user_id: 'u-bob',
        content: encrypted,
        created_at: new Date().toISOString(),
      },
    })

    // Expect markConversationRead NOT to have been called for alice while unfocused
    expect(room.activeConversationReads.value['u-alice']).toBe(initialRead)

    // Restore focus and trigger window focus / visibilitychange
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.hasFocus = () => true
    window.dispatchEvent(new Event('focus'))

    // Now it should be updated to a newer timestamp
    expect(room.activeConversationReads.value['u-alice']).not.toBe(initialRead)

    // Cleanup
    document.hasFocus = origHasFocus
    if (origVisibilityState) {
      Object.defineProperty(document, 'visibilityState', origVisibilityState)
    }
  })
})
