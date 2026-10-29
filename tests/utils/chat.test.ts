import { describe, it, expect } from 'vitest'
import { isImagePayload } from '~/utils/image'
import {
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
  isValidEmail,
  formatConversationTitle,
  formatConversationTime,
  getDirectPeer,
  filterMessagesByKeyword,
  highlightTextSegments,
  escapeRegExp,
  validateBackgroundFile,
  resolveChatBackgroundStyle,
  CHAT_BACKGROUND_PRESETS,
  extractMediaFromMessages,
  extractDomainFromUrl,
  extractLinksFromMessages,
  serializeSystemMessage,
  isSystemPayload,
  parseSystemPayload,
  formatSystemMessageText,
  computeSeenByMessageId,
  extractMusicHistory,
} from '~/utils/chat'
import type { ChatMessage, Conversation, Profile } from '~/types/chat'

describe('chat utils', () => {
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

  it("tokenizes URLs with http and https and strips trailing punctuation", () => {
    const text = "Check out https://nuxt.com/docs and http://example.org/test! Also visit https://site.com."
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: "Check out ", isMention: false, isMe: false },
      { text: "https://nuxt.com/docs", isMention: false, isMe: false, isLink: true, href: "https://nuxt.com/docs" },
      { text: " and ", isMention: false, isMe: false },
      { text: "http://example.org/test", isMention: false, isMe: false, isLink: true, href: "http://example.org/test" },
      { text: "! Also visit ", isMention: false, isMe: false },
      { text: "https://site.com", isMention: false, isMe: false, isLink: true, href: "https://site.com" },
      { text: ".", isMention: false, isMe: false },
    ])
  })

  it("rejects unsafe schemes like javascript: and data: from being linkified", () => {
    const text = "Run javascript:alert(1) or data:text/html,test"
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: "Run javascript:alert(1) or data:text/html,test", isMention: false, isMe: false },
    ])
  })

  it("tokenizes inline code spans wrapped in backticks", () => {
    const text = "Use `const x = 1` in code"
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: "Use ", isMention: false, isMe: false },
      { text: "const x = 1", isMention: false, isMe: false, isCode: true },
      { text: " in code", isMention: false, isMe: false },
    ])
  })

  it("handles unclosed backticks as normal plain text", () => {
    const text = "This is `unclosed code"
    const segments = tokenizeMessageMentions(text)

    expect(segments).toEqual([
      { text: "This is `unclosed code", isMention: false, isMe: false },
    ])
  })

  it("prioritizes inline code over internal @mentions or links", () => {
    const text = "Do not ping `@Alice` or open `https://evil.com` inside code"
    const segments = tokenizeMessageMentions(text, "Alice", ["Alice"])

    expect(segments).toEqual([
      { text: "Do not ping ", isMention: false, isMe: false },
      { text: "@Alice", isMention: false, isMe: false, isCode: true },
      { text: " or open ", isMention: false, isMe: false },
      { text: "https://evil.com", isMention: false, isMe: false, isCode: true },
      { text: " inside code", isMention: false, isMe: false },
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

describe('Conversation utilities', () => {
  it('validates email addresses accurately', () => {
    expect(isValidEmail('alice@example.com')).toBe(true)
    expect(isValidEmail('bob.smith+chat@domain.co.uk')).toBe(true)
    expect(isValidEmail('invalid-email')).toBe(false)
    expect(isValidEmail('@nodomain.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('formats conversation title for direct chats and groups', () => {
    const peer: Profile = { id: 'u2', email: 'bob@example.com', display_name: 'Bob', avatar_color: '#0284c7' }
    const directChat: Conversation = {
      id: 'c1',
      type: 'direct',
      title: null,
      created_by: 'u1',
      created_at: new Date().toISOString(),
      peer,
    }
    expect(formatConversationTitle(directChat, 'u1')).toBe('Bob')

    const groupChat: Conversation = {
      id: 'c2',
      type: 'group',
      title: 'Project Alpha',
      created_by: 'u1',
      created_at: new Date().toISOString(),
    }
    expect(formatConversationTitle(groupChat, 'u1')).toBe('Project Alpha')
  })

  it('falls back to email when peer display_name is empty or missing in direct chat title', () => {
    const peerEmptyName: Profile = { id: 'u2', email: 'bob@example.com', display_name: '', avatar_color: '#0284c7' }
    const directChatEmpty: Conversation = {
      id: 'c1',
      type: 'direct',
      title: null,
      created_by: 'u1',
      created_at: new Date().toISOString(),
      peer: peerEmptyName,
    }
    expect(formatConversationTitle(directChatEmpty, 'u1')).toBe('bob@example.com')

    const peerMissingName = { id: 'u3', email: 'alice@example.com', avatar_color: '#0284c7' } as Profile
    const directChatMissing: Conversation = {
      id: 'c2',
      type: 'direct',
      title: null,
      created_by: 'u1',
      created_at: new Date().toISOString(),
      peer: peerMissingName,
    }
    expect(formatConversationTitle(directChatMissing, 'u1')).toBe('alice@example.com')
  })

  it('resolves direct peer correctly', () => {
    const me: Profile = { id: 'u1', email: 'me@example.com', display_name: 'Me', avatar_color: '#0284c7' }
    const peer: Profile = { id: 'u2', email: 'peer@example.com', display_name: 'Peer', avatar_color: '#10b981' }
    const conv: Conversation = {
      id: 'c1',
      type: 'direct',
      title: null,
      created_by: 'u1',
      created_at: new Date().toISOString(),
      members: [
        { conversation_id: 'c1', user_id: 'u1', role: 'owner', joined_at: '', profile: me },
        { conversation_id: 'c1', user_id: 'u2', role: 'member', joined_at: '', profile: peer },
      ],
    }
    expect(getDirectPeer(conv, 'u1')?.id).toBe('u2')
    expect(getDirectPeer(conv, 'u2')?.id).toBe('u1')
  })

  it('returns null for getDirectPeer when given a group conversation', () => {
    const groupChat: Conversation = {
      id: 'c2',
      type: 'group',
      title: 'Project Alpha',
      created_by: 'u1',
      created_at: new Date().toISOString(),
      members: [
        { conversation_id: 'c2', user_id: 'u1', role: 'owner', joined_at: '' },
        { conversation_id: 'c2', user_id: 'u2', role: 'member', joined_at: '' },
      ],
    }
    expect(getDirectPeer(groupChat, 'u1')).toBeNull()
  })

  describe('Message bubble clustering (Telegram style)', () => {
    it('groups consecutive messages from the same sender within 5 minutes', () => {
      const t0 = new Date('2026-10-21T10:00:00Z').toISOString()
      const t1 = new Date('2026-10-21T10:02:00Z').toISOString()
      const t2 = new Date('2026-10-21T10:10:00Z').toISOString()

      const messages: ChatMessage[] = [
        { id: 'm1', client_id: 'c1', conversation_id: 'conv1', user_id: 'u1', content: 'e2ee:v1:test', created_at: t0, status: 'sent' },
        { id: 'm2', client_id: 'c2', conversation_id: 'conv1', user_id: 'u1', content: 'e2ee:v1:test', created_at: t1, status: 'sent' },
        { id: 'm3', client_id: 'c3', conversation_id: 'conv1', user_id: 'u2', content: 'e2ee:v1:test', created_at: t2, status: 'sent' },
      ]

      const timeline = buildMessageTimeline(messages, new Date('2026-10-21T12:00:00Z'), {
        currentUserId: 'u1',
        isGroup: true,
      })

      expect(timeline[0].isSender).toBe(true)
      expect(timeline[0].isFirstInGroup).toBe(true)
      expect(timeline[0].isLastInGroup).toBe(false)
      expect(timeline[0].showSenderHeader).toBe(false) // sender never shows name header

      expect(timeline[1].isSender).toBe(true)
      expect(timeline[1].isFirstInGroup).toBe(false)
      expect(timeline[1].isLastInGroup).toBe(true)

      expect(timeline[2].isSender).toBe(false)
      expect(timeline[2].isFirstInGroup).toBe(true)
      expect(timeline[2].isLastInGroup).toBe(true)
      expect(timeline[2].showSenderHeader).toBe(true) // other user in group shows header on first message
    })

    it('does not show sender header in direct chats (isGroup = false)', () => {
      const t0 = new Date('2026-10-21T10:00:00Z').toISOString()
      const messages: ChatMessage[] = [
        { id: 'm1', client_id: 'c1', conversation_id: 'conv1', user_id: 'u2', content: 'hello', created_at: t0, status: 'sent' },
      ]

      const timeline = buildMessageTimeline(messages, new Date('2026-10-21T12:00:00Z'), {
        currentUserId: 'u1',
        isGroup: false,
      })

      expect(timeline[0].isSender).toBe(false)
      expect(timeline[0].isFirstInGroup).toBe(true)
      expect(timeline[0].isLastInGroup).toBe(true)
      expect(timeline[0].showSenderHeader).toBe(false)
    })

    it('separates bubbles when same user sends messages across midnight or >5 minutes apart', () => {
      const now = new Date(2026, 9, 18, 12, 0, 0)
      const t0 = new Date(2026, 9, 17, 23, 58, 0).toISOString()
      const t1 = new Date(2026, 9, 18, 0, 1, 0).toISOString()
      const t2 = new Date(2026, 9, 18, 0, 10, 0).toISOString()

      const messages: ChatMessage[] = [
        { id: 'm1', client_id: 'c1', conversation_id: 'conv1', user_id: 'u1', content: 'msg1', created_at: t0, status: 'sent' },
        { id: 'm2', client_id: 'c2', conversation_id: 'conv1', user_id: 'u1', content: 'msg2', created_at: t1, status: 'sent' },
        { id: 'm3', client_id: 'c3', conversation_id: 'conv1', user_id: 'u1', content: 'msg3', created_at: t2, status: 'sent' },
      ]

      const timeline = buildMessageTimeline(messages, now, {
        currentUserId: 'u1',
        isGroup: true,
      })

      // m1 is on previous day -> first and last in its group
      expect(timeline[0].isFirstInGroup).toBe(true)
      expect(timeline[0].isLastInGroup).toBe(true)

      // m2 is on next day, 3 mins later -> first in group because day changed
      expect(timeline[1].isFirstInGroup).toBe(true)
      // m3 is 9 mins after m2 (>5m) -> m2 is last in group
      expect(timeline[1].isLastInGroup).toBe(true)

      // m3 is >5 mins after m2 -> first in group and last in group (end of list)
      expect(timeline[2].isFirstInGroup).toBe(true)
      expect(timeline[2].isLastInGroup).toBe(true)
    })
  })

  describe('formatConversationTime', () => {
    it('formats conversation timestamp for today, yesterday, earlier in year, and previous years', () => {
      const fixedNow = new Date(2026, 9, 21, 14, 0, 0) // Oct 21, 2026

      // 1. Today
      const convToday: Conversation = {
        id: 'c-today',
        type: 'direct',
        created_by: 'u1',
        lastMessage: {
          id: 'm1',
          client_id: 'c1',
          conversation_id: 'c-today',
          user_id: 'u1',
          content: 'Hi',
          created_at: new Date(2026, 9, 21, 10, 30, 0).toISOString(),
          status: 'sent',
        },
      }
      const todayStr = formatConversationTime(convToday, fixedNow)
      expect(todayStr).toBeTruthy()
      expect(todayStr).toMatch(/10[:.]30/)

      // 2. Yesterday
      const convYesterday: Conversation = {
        id: 'c-yesterday',
        type: 'direct',
        created_by: 'u1',
        lastMessage: {
          id: 'm2',
          client_id: 'c2',
          conversation_id: 'c-yesterday',
          user_id: 'u1',
          content: 'Hi',
          created_at: new Date(2026, 9, 20, 18, 0, 0).toISOString(),
          status: 'sent',
        },
      }
      expect(formatConversationTime(convYesterday, fixedNow)).toBe('Yesterday')

      // 3. Earlier this year
      const convEarlier: Conversation = {
        id: 'c-earlier',
        type: 'direct',
        created_by: 'u1',
        updated_at: new Date(2026, 7, 15, 12, 0, 0).toISOString(),
      }
      const earlierStr = formatConversationTime(convEarlier, fixedNow)
      expect(earlierStr).toMatch(/Aug\s+15/)

      // 4. Previous year
      const convOld: Conversation = {
        id: 'c-old',
        type: 'direct',
        created_by: 'u1',
        created_at: new Date(2025, 4, 10, 12, 0, 0).toISOString(),
      }
      const oldStr = formatConversationTime(convOld, fixedNow)
      expect(oldStr).toMatch(/2025/)

      // 5. Empty or missing
      const convEmpty: Conversation = {
        id: 'c-empty',
        type: 'direct',
        created_by: 'u1',
      }
      expect(formatConversationTime(convEmpty, fixedNow)).toBe('')
    })
  })

  describe('filterMessagesByKeyword', () => {
    const baseMessage: ChatMessage = {
      id: 'm1',
      client_id: 'c1',
      conversation_id: 'conv1',
      user_id: 'u1',
      content: 'Hello world from Nuxt chat',
      created_at: '2026-10-22T10:00:00Z',
      status: 'sent',
    }

    it('returns empty array when query is blank or whitespace', () => {
      expect(filterMessagesByKeyword([baseMessage], '')).toEqual([])
      expect(filterMessagesByKeyword([baseMessage], '   ')).toEqual([])
    })

    it('matches messages case-insensitively by content substring', () => {
      const m2 = { ...baseMessage, id: 'm2', content: 'Another message about cats' }
      const results = filterMessagesByKeyword([baseMessage, m2], 'WORLD')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('m1')
    })

    it('skips deleted messages', () => {
      const deleted = { ...baseMessage, id: 'm2', deleted_at: '2026-10-22T10:05:00Z' }
      const results = filterMessagesByKeyword([deleted], 'world')
      expect(results).toHaveLength(0)
    })

    it('skips undecryptable messages', () => {
      const undecryptable = { ...baseMessage, id: 'm2', encryption: 'undecryptable' as const }
      const results = filterMessagesByKeyword([undecryptable], 'world')
      expect(results).toHaveLength(0)
    })

    it('matches image caption if message content is an image payload', () => {
      const imageMsg: ChatMessage = {
        ...baseMessage,
        id: 'm3',
        content: JSON.stringify({
          images: [{ path: 'p1', iv: 'iv1' }],
          caption: 'Sunset at the beach',
        }),
      }
      const results = filterMessagesByKeyword([imageMsg], 'beach')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('m3')
    })
  })

  describe('highlightTextSegments', () => {
    it('returns entire text with isMatch false if query is blank', () => {
      expect(highlightTextSegments('Hello world', '')).toEqual([
        { text: 'Hello world', isMatch: false },
      ])
    })

    it('splits text into matching and non-matching segments', () => {
      expect(highlightTextSegments('Hello world, what a world!', 'world')).toEqual([
        { text: 'Hello ', isMatch: false },
        { text: 'world', isMatch: true },
        { text: ', what a ', isMatch: false },
        { text: 'world', isMatch: true },
        { text: '!', isMatch: false },
      ])
    })

    it('safely handles regex special characters in query', () => {
      expect(highlightTextSegments('Price is $100.00 today', '$100.00')).toEqual([
        { text: 'Price is ', isMatch: false },
        { text: '$100.00', isMatch: true },
        { text: ' today', isMatch: false },
      ])
    })
  })

  describe('Chat Background Helpers', () => {
    it('validates allowed image types and size limit', () => {
      expect(validateBackgroundFile({ type: 'image/png', size: 1024 } as any)).toEqual({ valid: true })
      expect(validateBackgroundFile({ type: 'application/pdf', size: 1024 } as any).valid).toBe(false)
      expect(validateBackgroundFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 } as any).valid).toBe(false)
    })

    it('resolves preset styles and custom URLs correctly', () => {
      expect(resolveChatBackgroundStyle(null)).toBeNull()
      expect(resolveChatBackgroundStyle('')).toBeNull()

      const presetStyle = resolveChatBackgroundStyle('preset:aurora')
      expect(presetStyle).not.toBeNull()
      expect(presetStyle?.backgroundImage).toContain('gradient')

      const urlStyle = resolveChatBackgroundStyle('https://example.com/bg.jpg')
      expect(urlStyle?.backgroundImage).toBe('url("https://example.com/bg.jpg")')
    })
  })

  describe('extractMediaFromMessages (#33)', () => {
    it('extracts images from decrypted image payloads in reverse chronological order and skips deleted or undecryptable messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'm1',
          client_id: 'c1',
          conversation_id: 'conv1',
          user_id: 'u1',
          content: JSON.stringify({
            type: 'images',
            images: [
              { path: 'conv1/img1.enc', mimeType: 'image/png', width: 800, height: 600, size: 1024 },
              { path: 'conv1/img2.enc', mimeType: 'image/jpeg', width: 400, height: 400, size: 512 },
            ],
            caption: 'First batch',
          }),
          created_at: '2026-10-22T10:00:00Z',
          status: 'sent',
          author: { id: 'u1', email: 'a@b.c', display_name: 'Alice', avatar_color: '#0284c7' },
        },
        {
          id: 'm2-deleted',
          client_id: 'c2',
          conversation_id: 'conv1',
          user_id: 'u1',
          content: JSON.stringify({
            type: 'images',
            images: [{ path: 'conv1/del.enc', mimeType: 'image/png', width: 100, height: 100, size: 100 }],
          }),
          created_at: '2026-10-22T10:01:00Z',
          deleted_at: '2026-10-22T10:02:00Z',
          status: 'sent',
        },
        {
          id: 'm3',
          client_id: 'c3',
          conversation_id: 'conv1',
          user_id: 'u2',
          content: JSON.stringify({
            type: 'images',
            images: [{ path: 'conv1/img3.enc', mimeType: 'image/webp', width: 1200, height: 900, size: 2048 }],
          }),
          created_at: '2026-10-22T10:05:00Z',
          status: 'sent',
          author: { id: 'u2', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' },
        },
      ]

      const media = extractMediaFromMessages(messages)
      expect(media).toHaveLength(3)
      expect(media.map(item => item.image.path)).toEqual([
        'conv1/img3.enc',
        'conv1/img1.enc',
        'conv1/img2.enc',
      ])
      expect(media[0].messageId).toBe('m3')
      expect(media[1].caption).toBe('First batch')
    })
  })

  describe('extractDomainFromUrl & extractLinksFromMessages (#34)', () => {
    it('extracts clean hostname from URLs and falls back safely', () => {
      expect(extractDomainFromUrl('https://www.github.com/nuxt/nuxt')).toBe('github.com')
      expect(extractDomainFromUrl('https://docs.astro.build/en/getting-started/')).toBe('docs.astro.build')
      expect(extractDomainFromUrl('not-a-valid-url')).toBe('not-a-valid-url')
    })

    it('extracts links from text messages and image captions in newest-first order, skipping inline code, deleted, and undecryptable messages', () => {
      const messages: ChatMessage[] = [
        {
          id: 'm1',
          client_id: 'c1',
          conversation_id: 'conv1',
          user_id: 'u1',
          content: 'Check https://github.com/truonghoangthuan/nuxt-chat-app and `https://ignored-in-code.com`!',
          created_at: '2026-10-22T10:00:00Z',
          status: 'sent',
          author: { id: 'u1', email: 'a@b.c', display_name: 'Alice', avatar_color: '#0284c7' },
        },
        {
          id: 'm2',
          client_id: 'c2',
          conversation_id: 'conv1',
          user_id: 'u2',
          content: JSON.stringify({
            type: 'images',
            images: [{ path: 'conv1/img1.enc', mimeType: 'image/png', width: 100, height: 100, size: 100 }],
            caption: 'Design ref: https://www.figma.com/file/123',
          }),
          created_at: '2026-10-22T10:05:00Z',
          status: 'sent',
          author: { id: 'u2', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' },
        },
        {
          id: 'm3-deleted',
          client_id: 'c3',
          conversation_id: 'conv1',
          user_id: 'u2',
          content: 'https://deleted.example.com',
          created_at: '2026-10-22T10:06:00Z',
          deleted_at: '2026-10-22T10:07:00Z',
          status: 'sent',
        },
      ]

      const links = extractLinksFromMessages(messages)
      expect(links).toHaveLength(2)
      expect(links[0]).toMatchObject({
        messageId: 'm2',
        url: 'https://www.figma.com/file/123',
        domain: 'figma.com',
      })
      expect(links[1]).toMatchObject({
        messageId: 'm1',
        url: 'https://github.com/truonghoangthuan/nuxt-chat-app',
        domain: 'github.com',
      })
    })
  })

  describe('SystemMessagePayload helpers & computeSeenByMessageId', () => {
    it('serializes, detects, parses, and formats system activity and buzz payloads', () => {
      const renameRaw = serializeSystemMessage({
        type: 'system',
        event: 'group_rename',
        actorName: 'Alice',
        detail: 'Weekend Trip',
      })
      expect(isSystemPayload(renameRaw)).toBe(true)
      expect(isSystemPayload('Hello world')).toBe(false)
      expect(formatSystemMessageText(parseSystemPayload(renameRaw)!)).toBe(
        'Alice changed the group name to "Weekend Trip"',
      )

      const bgRaw = serializeSystemMessage({
        type: 'system',
        event: 'background_change',
        actorName: 'Bob',
        detail: 'Aurora Borealis',
      })
      expect(formatSystemMessageText(parseSystemPayload(bgRaw)!)).toBe(
        'Bob changed the chat wallpaper to Aurora Borealis',
      )

      const resetRaw = serializeSystemMessage({
        type: 'system',
        event: 'background_reset',
        actorName: 'Bob',
      })
      expect(formatSystemMessageText(parseSystemPayload(resetRaw)!)).toBe(
        'Bob reset the chat wallpaper',
      )

      const buzzRaw = serializeSystemMessage({
        type: 'system',
        event: 'buzz',
        actorName: 'Charlie',
      })
      expect(formatSystemMessageText(parseSystemPayload(buzzRaw)!)).toBe(
        '⚡ Charlie buzzed the chat!',
      )
    })

    it('computes per-message seen-by profiles for the latest non-deleted message each peer has read', () => {
      const alice: Profile = { id: 'u-alice', email: 'a@b.c', display_name: 'Alice', avatar_color: '#0284c7' }
      const bob: Profile = { id: 'u-bob', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' }
      const charlie: Profile = { id: 'u-charlie', email: 'c@b.c', display_name: 'Charlie', avatar_color: '#059669' }

      const messages: ChatMessage[] = [
        {
          id: 'm-1',
          client_id: 'c-1',
          conversation_id: 'conv-1',
          user_id: 'u-alice',
          content: 'First message',
          created_at: '2026-10-26T10:00:00Z',
          status: 'sent',
        },
        {
          id: 'm-2',
          client_id: 'c-2',
          conversation_id: 'conv-1',
          user_id: 'u-alice',
          content: 'Second message',
          created_at: '2026-10-26T10:05:00Z',
          status: 'sent',
        },
      ]

      const seenMap = computeSeenByMessageId({
        messages,
        readsByUser: {
          'u-alice': '2026-10-26T10:06:00Z',
          'u-bob': '2026-10-26T10:02:00Z',
          'u-charlie': '2026-10-26T10:06:00Z',
        },
        profiles: [alice, bob, charlie],
        currentUserId: 'u-alice',
      })

      expect(seenMap['m-1']?.map(p => p.id)).toEqual(['u-bob'])
      expect(seenMap['m-2']?.map(p => p.id)).toEqual(['u-charlie'])
    })

    it('buildMessageTimeline pre-parses imagePayload and systemPayload once per message item', () => {
      const imgContent = JSON.stringify({
        type: 'images',
        images: [{ path: 'a.enc', mimeType: 'image/png', width: 10, height: 10, size: 50 }],
        caption: 'Hello @Alice Smith',
      })
      const items = buildMessageTimeline([
        {
          id: 'm-1',
          client_id: 'c-1',
          conversation_id: 'conv-1',
          channel_id: 'conv-1',
          user_id: 'u-1',
          content: imgContent,
          created_at: '2026-10-20T10:00:00Z',
          status: 'sent',
        },
      ])
      const msgItem = items.find(i => i.type === 'message') as any
      expect(msgItem?.imagePayload?.caption).toBe('Hello @Alice Smith')
      expect(msgItem?.systemPayload).toBeNull()
    })

    it('extractMusicHistory extracts music history sorted newest first, skipping deleted and capping limit', () => {
      const messages: ChatMessage[] = [
        {
          id: 'm-old',
          client_id: 'c-old',
          conversation_id: 'conv-1',
          user_id: 'u-1',
          content: JSON.stringify({
            type: 'system',
            event: 'music_play',
            actorName: 'Alice',
            detail: 'Old Song Title',
          }),
          created_at: '2026-10-20T10:00:00Z',
          status: 'sent',
        },
        {
          id: 'm-regular',
          client_id: 'c-reg',
          conversation_id: 'conv-1',
          user_id: 'u-2',
          content: 'Just chatting',
          created_at: '2026-10-20T10:05:00Z',
          status: 'sent',
        },
        {
          id: 'm-deleted',
          client_id: 'c-del',
          conversation_id: 'conv-1',
          user_id: 'u-1',
          content: JSON.stringify({
            type: 'system',
            event: 'music_play',
            actorName: 'Alice',
            detail: 'Deleted Song',
          }),
          created_at: '2026-10-20T10:10:00Z',
          deleted_at: '2026-10-20T10:11:00Z',
          status: 'sent',
        },
        {
          id: 'm-undecryptable',
          client_id: 'c-undec',
          conversation_id: 'conv-1',
          user_id: 'u-1',
          content: '🔒 Unable to decrypt this message',
          encryption: 'undecryptable',
          created_at: '2026-10-20T10:15:00Z',
          status: 'sent',
        },
        {
          id: 'm-new',
          client_id: 'c-new',
          conversation_id: 'conv-1',
          user_id: 'u-3',
          content: JSON.stringify({
            type: 'system',
            event: 'music_play',
            actorName: 'Charlie',
            detail: 'New Hit Song',
            track: {
              videoId: 'vid-new',
              title: 'New Hit Song',
              channelTitle: 'Hit Channel',
              thumbnail: 'thumb-url',
              durationText: '3:45',
            },
          }),
          created_at: '2026-10-20T10:20:00Z',
          status: 'sent',
        },
      ]

      const history = extractMusicHistory(messages)
      expect(history.length).toBe(2)

      // Newest first
      expect(history[0]).toEqual({
        messageId: 'm-new',
        title: 'New Hit Song',
        actorName: 'Charlie',
        createdAt: '2026-10-20T10:20:00Z',
        track: {
          videoId: 'vid-new',
          title: 'New Hit Song',
          channelTitle: 'Hit Channel',
          thumbnail: 'thumb-url',
          durationText: '3:45',
        },
      })

      // Old message without track
      expect(history[1]).toEqual({
        messageId: 'm-old',
        title: 'Old Song Title',
        actorName: 'Alice',
        createdAt: '2026-10-20T10:00:00Z',
        track: undefined,
      })

      // Limit check
      const limited = extractMusicHistory(messages, 1)
      expect(limited.length).toBe(1)
      expect(limited[0].messageId).toBe('m-new')
    })
  })
})

