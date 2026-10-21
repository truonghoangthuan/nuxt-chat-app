let sharedAudioContext: AudioContext | null = null

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new AudioCtx()
    } catch {
      return null
    }
  }
  return sharedAudioContext
}

export function playNotificationChime(customContext?: AudioContext | null): void {
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
  } catch {
    // Gracefully ignore audio errors (e.g. autoplay policy restrictions)
  }
}
