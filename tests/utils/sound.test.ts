import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playNotificationChime, playBuzzSound, resetChimeThrottleForTest, resetBuzzThrottleForTest } from '~/utils/sound'

describe('sound utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetChimeThrottleForTest()
    resetBuzzThrottleForTest()
  })

  it('safely handles missing AudioContext in SSR or unsupported environments', () => {
    expect(() => playNotificationChime(null)).not.toThrow()
  })

  it('uses a gain ceiling of 0.5 for louder audible notification', () => {
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    const mockCtx = {
      state: 'running',
      currentTime: 10,
      createGain: vi.fn(() => mockGain),
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      destination: {},
    } as any

    playNotificationChime(mockCtx)
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 10)
  })

  it('creates oscillator and gain nodes and schedules audio parameters', () => {
    const mockGainNode = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }

    const mockOscNode1 = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }

    const mockOscNode2 = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as any,
    }

    let oscCount = 0
    const mockCtx = {
      state: 'running',
      currentTime: 10,
      resume: vi.fn().mockResolvedValue(undefined),
      destination: {},
      createGain: vi.fn().mockReturnValue(mockGainNode),
      createOscillator: vi.fn().mockImplementation(() => {
        oscCount++
        return oscCount === 1 ? mockOscNode1 : mockOscNode2
      }),
    } as unknown as AudioContext

    playNotificationChime(mockCtx)

    expect(mockCtx.createGain).toHaveBeenCalled()
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2)
    expect(mockOscNode1.start).toHaveBeenCalled()
    expect(mockOscNode2.start).toHaveBeenCalled()
    expect(mockGainNode.connect).toHaveBeenCalledWith(mockCtx.destination)

    // Simulate onended cleanup
    if (mockOscNode2.onended) {
      mockOscNode2.onended()
      expect(mockGainNode.disconnect).toHaveBeenCalled()
      expect(mockOscNode1.disconnect).toHaveBeenCalled()
      expect(mockOscNode2.disconnect).toHaveBeenCalled()
    }
  })

  it('attempts to resume suspended AudioContext', async () => {
    const mockCtx = {
      state: 'suspended',
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      createOscillator: vi.fn().mockReturnValue({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
    } as unknown as AudioContext

    playNotificationChime(mockCtx)

    expect(mockCtx.resume).toHaveBeenCalled()
  })

  it('catches and ignores autoplay errors without throwing', () => {
    const mockCtx = {
      state: 'suspended',
      currentTime: 0,
      resume: vi.fn().mockRejectedValue(new Error('Autoplay blocked')),
      destination: {},
      createGain: vi.fn().mockImplementation(() => {
        throw new Error('Audio disabled')
      }),
    } as unknown as AudioContext

    expect(() => playNotificationChime(mockCtx)).not.toThrow()
  })

  it('throttles rapid consecutive chime calls within cooldown period', () => {
    const mockCtx = {
      state: 'running',
      currentTime: 0,
      createGain: vi.fn().mockReturnValue({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      createOscillator: vi.fn().mockReturnValue({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
    } as unknown as AudioContext

    playNotificationChime(mockCtx)
    expect(mockCtx.createGain).toHaveBeenCalledTimes(1)

    // Call immediately again -> should be throttled
    playNotificationChime(mockCtx)
    expect(mockCtx.createGain).toHaveBeenCalledTimes(1)
  })

  it('safely handles playBuzzSound with null AudioContext or created mock', () => {
    expect(() => playBuzzSound(null)).not.toThrow()
    resetBuzzThrottleForTest()

    const mockCtx = {
      state: 'running',
      currentTime: 10,
      destination: {},
      createGain: vi.fn().mockReturnValue({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createOscillator: vi.fn().mockReturnValue({
        type: 'sawtooth',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
    } as unknown as AudioContext

    expect(() => playBuzzSound(mockCtx)).not.toThrow()
    expect(mockCtx.createGain).toHaveBeenCalled()
    expect(mockCtx.createOscillator).toHaveBeenCalled()
  })
})
