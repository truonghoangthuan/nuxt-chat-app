import { describe, it, expect } from 'vitest'
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
})

