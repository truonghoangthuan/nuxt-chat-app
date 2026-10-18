import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTypingTracker } from '~/composables/useTypingState'
import { deduplicatePresenceState } from '~/composables/usePresenceState'
import { createConnectionManager } from '~/composables/useConnectionManager'

describe('realtime state managers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks typing users, ignores self, clears on message send, and expires after 3000ms', () => {
    const tracker = createTypingTracker(() => 'u-self', 3000)

    tracker.recordTyping({ user_id: 'u-self', display_name: 'Me' })
    expect(tracker.typingLabel.value).toBe('')

    tracker.recordTyping({ user_id: 'u-alice', display_name: 'Alice' })
    expect(tracker.typingLabel.value).toBe('Alice is typing...')

    tracker.recordTyping({ user_id: 'u-bob', display_name: 'Bob' })
    expect(tracker.typingLabel.value).toBe('Alice and Bob are typing...')

    // Alice sends a message -> her indicator clears immediately
    tracker.clearUserTyping('u-alice')
    expect(tracker.typingLabel.value).toBe('Bob is typing...')

    // 3000ms elapses -> Bob expires
    vi.advanceTimersByTime(3000)
    expect(tracker.typingLabel.value).toBe('')
  })

  it('deduplicates multi-tab presence entries by user_id and sorts alphabetically', () => {
    const online = deduplicatePresenceState({
      'conn-1': [{ user_id: 'u-2', display_name: 'Bob', avatar_color: '#7c3aed' }],
      'conn-2': [
        { user_id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
        { user_id: 'u-2', display_name: 'Bob', avatar_color: '#7c3aed' },
      ],
    })
    expect(online.map(u => u.display_name)).toEqual(['Alice', 'Bob'])
  })

  it('schedules exponential backoff on disconnect, ticks nextRetryMs every second, and resets on connect or retryNow', async () => {
    const attempts: number[] = []
    const manager = createConnectionManager(() => {
      attempts.push(Date.now())
      return false
    })

    manager.handleDisconnect()
    expect(manager.status.value).toBe('reconnecting')
    expect(manager.nextRetryMs.value).toBe(1000)

    // 1st attempt at 1000ms -> fails -> schedules 2000ms
    await vi.advanceTimersByTimeAsync(1000)
    expect(attempts).toHaveLength(1)
    expect(manager.attempt.value).toBe(1)
    expect(manager.nextRetryMs.value).toBe(2000)

    // After 1000ms of waiting, nextRetryMs ticks down from 2000ms to 1000ms
    await vi.advanceTimersByTimeAsync(1000)
    expect(manager.nextRetryMs.value).toBe(1000)

    // Manual retryNow triggers immediately
    await manager.retryNow()
    expect(attempts).toHaveLength(2)

    manager.handleConnected()
    expect(manager.status.value).toBe('connected')
    expect(manager.attempt.value).toBe(0)
    expect(manager.nextRetryMs.value).toBe(0)
    manager.dispose()
  })

})
