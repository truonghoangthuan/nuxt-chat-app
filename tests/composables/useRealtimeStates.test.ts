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

  it.each([
    ['disposed', false], ['disposed', true], ['disposed', 'reject'],
    ['connected', false], ['connected', true], ['connected', 'reject'],
    ['disconnected', false], ['disconnected', true], ['disconnected', 'reject'],
  ] as const)('ignores a stale %s attempt completing with %s', async (transition, outcome) => {
    let finishAttempt!: (success: boolean) => void
    let rejectAttempt!: (error: Error) => void
    const reconnect = vi.fn(() => new Promise<boolean>((resolve, reject) => {
      finishAttempt = resolve
      rejectAttempt = reject
    }))
    const manager = createConnectionManager(reconnect)
    manager.handleDisconnect()
    const pending = manager.retryNow()

    if (transition === 'disposed') manager.dispose()
    if (transition === 'connected') manager.handleConnected()
    if (transition === 'disconnected') manager.handleDisconnect()
    const expectedState = {
      status: manager.status.value,
      attempt: manager.attempt.value,
      nextRetryMs: manager.nextRetryMs.value,
    }

    if (outcome === 'reject') rejectAttempt(new Error('Connection failed'))
    else finishAttempt(outcome)
    await pending

    expect({
      status: manager.status.value,
      attempt: manager.attempt.value,
      nextRetryMs: manager.nextRetryMs.value,
    }).toEqual(expectedState)
    expect(vi.getTimerCount()).toBe(transition === 'disconnected' ? 2 : 0)
    if (transition !== 'disconnected') {
      await vi.advanceTimersByTimeAsync(10000)
      expect(reconnect).toHaveBeenCalledTimes(1)
    }
    manager.dispose()
  })

  it.each([false, true])('ignores an older manual retry completing with %s', async (outcome) => {
    let finishAttempt!: (success: boolean) => void
    const reconnect = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
        finishAttempt = resolve
      }))
      .mockResolvedValue(false)
    const manager = createConnectionManager(reconnect)
    manager.handleDisconnect()
    const pending = manager.retryNow()
    await manager.retryNow()
    expect(manager.attempt.value).toBe(1)
    expect(manager.nextRetryMs.value).toBe(2000)

    finishAttempt(outcome)
    await pending

    expect(manager.status.value).toBe('reconnecting')
    expect(manager.attempt.value).toBe(1)
    expect(manager.nextRetryMs.value).toBe(2000)
    expect(vi.getTimerCount()).toBe(2)
    manager.dispose()
  })

  it('allows an explicit new retry after disposing the previous cycle', async () => {
    const reconnect = vi.fn().mockResolvedValue(false)
    const manager = createConnectionManager(reconnect)
    manager.handleDisconnect()
    manager.dispose()

    await manager.retryNow()

    expect(reconnect).toHaveBeenCalledTimes(1)
    expect(manager.attempt.value).toBe(1)
    expect(manager.nextRetryMs.value).toBe(2000)
    expect(vi.getTimerCount()).toBe(2)
    manager.dispose()
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
