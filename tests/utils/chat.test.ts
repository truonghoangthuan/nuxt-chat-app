import { describe, it, expect } from 'vitest'
import {
  normalizeChannelSlug,
  isValidChannelSlug,
  getAvatarInitials,
  getAvatarColor,
  calculateBackoffMs,
  isValidMessageContent,
  shouldSendOnKeydown,
  AVATAR_PALETTE,
} from '~/utils/chat'

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
})
