import { describe, it, expect } from 'vitest'
import { isImagePayload } from '~/utils/image'
import {
  normalizeChannelSlug,
  isValidChannelSlug,
  getAvatarInitials,
  getAvatarColor,
  calculateBackoffMs,
  isValidMessageContent,
  shouldSendOnKeydown,
  isValidDisplayName,
  isValidAvatarColor,
  formatDateDivider,
  buildMessageTimeline,
  AVATAR_PALETTE,
  REACTION_EMOJIS,
  isValidReactionEmoji,
  summarizeReactions,
  extractActiveMentionQuery,
  applyMentionAutocomplete,
  doesMessageMentionUser,
  tokenizeMessageMentions,
  normalizeDmPair,
  getDmPeerId,
  canUserAccessChannel,
} from '~/utils/chat'
import type { ChatMessage } from '~/types/chat'

describe('chat utils', () => {
  it('normalizes channel names into lowercase hyphenated slugs', () => {
    expect(normalizeChannelSlug('  Movie Night! 2026 ')).toBe('movie-night-2026')
    expect(normalizeChannelSlug('#General___Chat')).toBe('general-chat')
  })

  it('validates channel slugs between 2 and 32 chars', () => {
    expect(isValidChannelSlug('general')).toBe(true)
    expect(isValidChannelSlug('a')).toBe(false)
    expect(isValidChannelSlug('a'.repeat(33))).toBe(false)
    expect(isValidChannelSlug('Invalid_Slug')).toBe(false)
  })

  it('extracts 1-2 uppercase initials and deterministic palette color', () => {
    expect(getAvatarInitials('Alice Wonderland')).toBe('AW')
    expect(getAvatarInitials('bob')).toBe('BO')
    expect(getAvatarInitials('🚀 Space')).toBe('🚀S')
    expect(getAvatarInitials('🚀')).toBe('🚀')
    expect(getAvatarInitials('𠮷野 家')).toBe('𠮷家')
    expect(getAvatarInitials('𠮷')).toBe('𠮷')
    const color = getAvatarColor('user-123')
    expect(AVATAR_PALETTE).toContain(color)
    expect(getAvatarColor('user-123')).toBe(color)
  })

  it('calculates exponential backoff capped at 30000ms', () => {
    expect(calculateBackoffMs(0)).toBe(1000)
    expect(calculateBackoffMs(1)).toBe(2000)
    expect(calculateBackoffMs(2)).toBe(4000)
    expect(calculateBackoffMs(3)).toBe(8000)
    expect(calculateBackoffMs(4)).toBe(16000)
    expect(calculateBackoffMs(5)).toBe(30000)
    expect(calculateBackoffMs(9)).toBe(30000)
  })

  it('validates plain text message length (1..4000 trimmed)', () => {
    expect(isValidMessageContent('   ')).toBe(false)
    expect(isValidMessageContent('hello')).toBe(true)
    expect(isValidMessageContent('a'.repeat(4001))).toBe(false)
  })

  it('sends on Enter without Shift and ignores IME composition Enter', () => {
    expect(shouldSendOnKeydown({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true)
    expect(shouldSendOnKeydown({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false)
    expect(shouldSendOnKeydown({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
  })

  it('validates display names (1..40 trimmed chars) and palette avatar colors', () => {
    expect(isValidDisplayName('   ')).toBe(false)
    expect(isValidDisplayName('Alice')).toBe(true)
    expect(isValidDisplayName('a'.repeat(40))).toBe(true)
    expect(isValidDisplayName('a'.repeat(41))).toBe(false)

    expect(isValidAvatarColor('#0284c7')).toBe(true)
    expect(isValidAvatarColor('#ffffff')).toBe(false)
  })

  it('formats date dividers as Today, Yesterday, or formatted date', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0) // Oct 18, 2026 local
    const todayIso = new Date(2026, 9, 18, 9, 30, 0).toISOString()
    const yesterdayIso = new Date(2026, 9, 17, 22, 15, 0).toISOString()
    const olderIso = new Date(2026, 9, 10, 12, 0, 0).toISOString()

    expect(formatDateDivider(todayIso, now)).toBe('Today')
    expect(formatDateDivider(yesterdayIso, now)).toBe('Yesterday')
    expect(formatDateDivider(olderIso, now)).toBe('Oct 10, 2026')
  })

  it('builds message timeline with date dividers and 5-minute same-author compact grouping', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0)
    const messages: ChatMessage[] = [
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Yesterday msg',
        created_at: new Date(2026, 9, 17, 23, 58, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Today first msg (only 4m later, but across midnight)',
        created_at: new Date(2026, 9, 18, 0, 2, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-3',
        client_id: 'c-3',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Today second msg (2m later, same author -> compact)',
        created_at: new Date(2026, 9, 18, 0, 4, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-4',
        client_id: 'c-4',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Today third msg (6m later -> not compact)',
        created_at: new Date(2026, 9, 18, 0, 10, 1).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-5',
        client_id: 'c-5',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Bob replies 30s later -> not compact',
        created_at: new Date(2026, 9, 18, 0, 10, 31).toISOString(),
        status: 'sent',
      },
    ]

    const timeline = buildMessageTimeline(messages, now)
    expect(timeline).toHaveLength(5)

    expect(timeline[0]).toMatchObject({ showDateDivider: true, dateLabel: 'Yesterday', isCompact: false })
    expect(timeline[1]).toMatchObject({ showDateDivider: true, dateLabel: 'Today', isCompact: false })
    expect(timeline[2]).toMatchObject({ showDateDivider: false, dateLabel: 'Today', isCompact: true })
    expect(timeline[3]).toMatchObject({ showDateDivider: false, dateLabel: 'Today', isCompact: false })
    expect(timeline[4]).toMatchObject({ showDateDivider: false, dateLabel: 'Today', isCompact: false })
  })

  it('validates reaction emojis against the 8-emoji palette and summarizes reactions per emoji', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '👀'])
    expect(isValidReactionEmoji('👍')).toBe(true)
    expect(isValidReactionEmoji('🔥')).toBe(true)
    expect(isValidReactionEmoji('💩')).toBe(false)

    const summary = summarizeReactions(
      [
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-alice', emoji: '👍' },
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-bob', emoji: '👍' },
        // Duplicate from same user should be deduplicated
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-bob', emoji: '👍' },
        { message_id: 'm-1', channel_id: 'ch-1', user_id: 'u-alice', emoji: '❤️' },
      ],
      'u-bob',
    )

    expect(summary).toEqual([
      {
        emoji: '👍',
        count: 2,
        userIds: ['u-alice', 'u-bob'],
        reactedByMe: true,
      },
      {
        emoji: '❤️',
        count: 1,
        userIds: ['u-alice'],
        reactedByMe: false,
      },
    ])
  })

  it('forces isCompact to false when a consecutive message is a quote-reply (reply_to_id is set)', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0)
    const messages: ChatMessage[] = [
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'First message',
        created_at: new Date(2026, 9, 18, 10, 0, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Replying 30s later to an older message',
        created_at: new Date(2026, 9, 18, 10, 0, 30).toISOString(),
        status: 'sent',
        reply_to_id: 'm-1',
      },
    ]

    const timeline = buildMessageTimeline(messages, now)
    expect(timeline[1].isCompact).toBe(false)
  })

  it('detects active @mention query at cursor and replaces it with selected display name', () => {
    const text = 'Hey @ali how are you?'
    const active = extractActiveMentionQuery(text, 8) // cursor right after "@ali"
    expect(active).toEqual({
      query: 'ali',
      startIndex: 4,
      endIndex: 8,
    })

    const replaced = applyMentionAutocomplete(text, active!, 'Alice Wonderland')
    expect(replaced).toBe('Hey @Alice Wonderland  how are you?')

    // Email address should not trigger @mention autocomplete
    expect(extractActiveMentionQuery('contact me@example.com', 18)).toBeNull()
  })

  it('detects whether a message mentions a display name and tokenizes mention segments', () => {
    expect(doesMessageMentionUser('Hello @Alice!', 'Alice')).toBe(true)
    expect(doesMessageMentionUser('Hey @Alice Wonderland, ready?', 'Alice Wonderland')).toBe(true)
    expect(doesMessageMentionUser('Hello @Alicia', 'Alice')).toBe(false)

    const segments = tokenizeMessageMentions(
      'Hey @Alice Wonderland and @Bob!',
      'Alice Wonderland',
      ['Alice Wonderland', 'Bob'],
    )
    expect(segments).toEqual([
      { text: 'Hey ', isMention: false, isMe: false },
      { text: '@Alice Wonderland', isMention: true, isMe: true },
      { text: ' and ', isMention: false, isMe: false },
      { text: '@Bob', isMention: true, isMe: false },
      { text: '!', isMention: false, isMe: false },
    ])
  })

  it('places showUnreadDivider on the first unread message from another user and flags isMentioningMe', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0)
    const lastReadAt = new Date(2026, 9, 18, 10, 0, 30).toISOString()

    const messages: ChatMessage[] = [
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Already read message',
        created_at: new Date(2026, 9, 18, 10, 0, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'First unread message mentioning @Alice',
        created_at: new Date(2026, 9, 18, 10, 1, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-3',
        client_id: 'c-3',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Second unread message 30s later',
        created_at: new Date(2026, 9, 18, 10, 1, 30).toISOString(),
        status: 'sent',
      },
    ]

    const timeline = buildMessageTimeline(messages, now, {
      lastReadAt,
      currentUserId: 'u-alice',
      currentDisplayName: 'Alice',
    })

    expect(timeline[0].showUnreadDivider).toBe(false)
    expect(timeline[1].showUnreadDivider).toBe(true)
    expect(timeline[1].isCompact).toBe(false) // Unread boundary breaks compact grouping
    expect(timeline[1].isMentioningMe).toBe(true)
    expect(timeline[2].showUnreadDivider).toBe(false)
    expect(timeline[2].isCompact).toBe(true)
    expect(timeline[2].isMentioningMe).toBe(false)
  })

  describe('direct message (DM) pure helpers (Sub-Project 4)', () => {
    it('normalizeDmPair sorts two distinct user IDs lexicographically regardless of input order', () => {
      const ab = normalizeDmPair('user-222', 'user-111')
      const ba = normalizeDmPair('user-111', 'user-222')

      expect(ab).toEqual({
        dm_user_a: 'user-111',
        dm_user_b: 'user-222',
        slug: 'dm:user-111:user-222',
      })
      expect(ba).toEqual(ab)
    })

    it('normalizeDmPair returns null for identical or empty user IDs', () => {
      expect(normalizeDmPair('user-111', 'user-111')).toBeNull()
      expect(normalizeDmPair('', 'user-111')).toBeNull()
      expect(normalizeDmPair('   ', 'user-111')).toBeNull()
    })

    it('getDmPeerId returns the other participant ID for a DM channel and null otherwise', () => {
      const dmChannel = {
        is_dm: true,
        dm_user_a: 'user-111',
        dm_user_b: 'user-222',
      }
      expect(getDmPeerId(dmChannel, 'user-111')).toBe('user-222')
      expect(getDmPeerId(dmChannel, 'user-222')).toBe('user-111')
      expect(getDmPeerId(dmChannel, 'user-333')).toBeNull()
      expect(getDmPeerId({ is_dm: false, dm_user_a: null, dm_user_b: null }, 'user-111')).toBeNull()
    })

    it('normalizeDmPair normalizes case-insensitively and trims whitespace', () => {
      const res = normalizeDmPair('  USER-222  ', '  user-111  ')
      expect(res).toEqual({
        dm_user_a: 'user-111',
        dm_user_b: 'user-222',
        slug: 'dm:user-111:user-222',
      })
      expect(normalizeDmPair('USER-111', 'user-111')).toBeNull()
      expect(normalizeDmPair(null as any, 'user-111')).toBeNull()
    })

    it('getDmPeerId handles case-insensitive participant comparisons', () => {
      const dmChannel = {
        is_dm: true,
        dm_user_a: 'user-111',
        dm_user_b: 'user-222',
      }
      expect(getDmPeerId(dmChannel, 'USER-111')).toBe('user-222')
      expect(getDmPeerId(dmChannel, 'USER-222')).toBe('user-111')
      expect(getDmPeerId(dmChannel, '  user-111  ')).toBe('user-222')
      expect(getDmPeerId(dmChannel, undefined as any)).toBeNull()
    })

    it('canUserAccessChannel handles case-insensitive comparisons and invalid inputs safely', () => {
      const publicCh = { is_dm: false, dm_user_a: null, dm_user_b: null }
      const dmCh = { is_dm: true, dm_user_a: 'user-111', dm_user_b: 'user-222' }

      expect(canUserAccessChannel(publicCh, 'USER-999')).toBe(true)
      expect(canUserAccessChannel(dmCh, 'USER-111')).toBe(true)
      expect(canUserAccessChannel(dmCh, 'USER-222')).toBe(true)
      expect(canUserAccessChannel(dmCh, 'USER-333')).toBe(false)
      expect(canUserAccessChannel(dmCh, null)).toBe(false)
      expect(canUserAccessChannel(dmCh, undefined)).toBe(false)
    })
  })

  describe('isImagePayload', () => {
    it('returns true for valid image message JSON structure', () => {
      const valid = JSON.stringify({
        type: 'images',
        images: [{ path: 'channels/1/0.enc', mimeType: 'image/jpeg', width: 800, height: 600, size: 1024 }],
      })
      expect(isImagePayload(valid)).toBe(true)
    })

    it('returns false for regular text or malformed JSON', () => {
      expect(isImagePayload('Hello world')).toBe(false)
      expect(isImagePayload('{"type":"text"}')).toBe(false)
    })
  })
})

