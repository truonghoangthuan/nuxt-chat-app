let sharedAudioContext: AudioContext | null = null
let lastChimeTime = 0
export const CHIME_THROTTLE_MS = 400

let hasSetupUserGestureListener = false

export function resetChimeThrottleForTest(): void {
  lastChimeTime = 0
}

export function primeAudioContext(): void {
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
}

export function setupAudioContextPriming(): void {
  if (typeof window === 'undefined' || hasSetupUserGestureListener) return
  hasSetupUserGestureListener = true

  const handleInteraction = () => {
    primeAudioContext()
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
    }
  }

  window.addEventListener('pointerdown', handleInteraction, { once: true, passive: true })
  window.addEventListener('keydown', handleInteraction, { once: true, passive: true })
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new AudioCtx()
      setupAudioContextPriming()
    } catch {
      return null
    }
  }
  return sharedAudioContext
}

export function playNotificationChime(customContext?: AudioContext | null): void {
  const nowMs = Date.now()
  if (nowMs - lastChimeTime < CHIME_THROTTLE_MS) return
  lastChimeTime = nowMs

  const ctx = customContext !== undefined ? customContext : getAudioContext()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(0.15, now)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    gainNode.connect(ctx.destination)

    // Note 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(659.25, now)
    osc1.connect(gainNode)
    osc1.start(now)
    osc1.stop(now + 0.15)

    // Note 2: B5 (987.77 Hz) slightly delayed for a crisp, modern 2-tone chime
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(987.77, now + 0.08)
    osc2.connect(gainNode)
    osc2.start(now + 0.08)
    osc2.stop(now + 0.35)

    osc2.onended = () => {
      try {
        osc1.disconnect()
        osc2.disconnect()
        gainNode.disconnect()
      } catch {}
    }
  } catch {
    // Gracefully ignore audio errors (e.g. autoplay policy restrictions)
  }
}
