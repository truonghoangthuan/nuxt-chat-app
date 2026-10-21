import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playNotificationChime } from '~/utils/sound'

describe('sound utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('safely handles missing AudioContext in SSR or unsupported environments', () => {
    expect(() => playNotificationChime(null)).not.toThrow()
  })

  it('creates oscillator and gain nodes and schedules audio parameters', () => {
    const mockGainNode = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }

    const mockOscNode1 = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }

    const mockOscNode2 = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
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
})
