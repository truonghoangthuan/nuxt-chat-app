import { ref } from 'vue'
import type { ConnectionStatus } from '~/types/chat'
import { calculateBackoffMs } from '~/utils/chat'

export function createConnectionManager(
  onReconnectAttempt: () => Promise<boolean> | boolean,
) {
  const status = ref<ConnectionStatus>('connected')
  const attempt = ref<number>(0)
  const nextRetryMs = ref<number>(0)
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  function clearTimer(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (countdownTimer !== null) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  function scheduleRetry(delayMs: number): void {
    clearTimer()
    nextRetryMs.value = delayMs
    countdownTimer = setInterval(() => {
      nextRetryMs.value = Math.max(0, nextRetryMs.value - 1000)
    }, 1000)
    retryTimer = setTimeout(async () => {
      await executeAttempt()
    }, delayMs)
  }

  async function executeAttempt(): Promise<void> {
    clearTimer()
    let success = false
    try {
      success = Boolean(await onReconnectAttempt())
    } catch {
      success = false
    }

    if (success) {
      handleConnected()
    } else {
      attempt.value += 1
      scheduleRetry(calculateBackoffMs(attempt.value))
    }
  }

  function handleDisconnect(): void {
    if (status.value === 'reconnecting' && retryTimer !== null) {
      return
    }

    status.value = 'reconnecting'
    scheduleRetry(calculateBackoffMs(attempt.value))
  }

  function handleConnected(): void {
    clearTimer()
    status.value = 'connected'
    attempt.value = 0
    nextRetryMs.value = 0
  }

  async function retryNow(): Promise<void> {
    clearTimer()
    await executeAttempt()
  }

  function dispose(): void {
    clearTimer()
  }

  return {
    status,
    attempt,
    nextRetryMs,
    handleDisconnect,
    handleConnected,
    retryNow,
    dispose,
  }
}

