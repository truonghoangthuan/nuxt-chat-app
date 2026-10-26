import { describe, it, expect, vi } from 'vitest'
import {
  createRaycastConfettiBurst,
  stepConfettiParticles,
  drawConfettiParticles,
  pickRandomCelebrationEffect,
  CELEBRATION_EFFECTS,
  STORAGE_KEY_CONFETTI,
  getConfettiEnabled,
  setConfettiEnabled,
  normalizeConfettiWord,
  sanitizeConfettiWords,
  matchesConfettiDictionary,
} from '~/utils/confetti'

describe('Raycast confetti physics (app/utils/confetti.ts)', () => {
  it('spawns dual-cannon particles from bottom-left (vx > 0, vy < 0) and bottom-right (vx < 0, vy < 0)', () => {
    const particles = createRaycastConfettiBurst(1200, 800, 30)
    expect(particles).toHaveLength(60)

    const leftCannon = particles.slice(0, 30)
    const rightCannon = particles.slice(30, 60)

    for (const p of leftCannon) {
      expect(p.x).toBeLessThanOrEqual(24)
      expect(p.y).toBeGreaterThanOrEqual(750)
      expect(p.vx).toBeGreaterThan(0)
      expect(p.vy).toBeLessThan(0)
    }

    for (const p of rightCannon) {
      expect(p.x).toBeGreaterThanOrEqual(1176)
      expect(p.y).toBeGreaterThanOrEqual(750)
      expect(p.vx).toBeLessThan(0)
      expect(p.vy).toBeLessThan(0)
    }
  })

  it('clamps non-positive viewport dimensions to safe defaults', () => {
    const particles = createRaycastConfettiBurst(0, -100, 5)
    expect(particles).toHaveLength(10)
    expect(particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })

  it('applies air drag, gravity, 3D tilt progression, and culls off-screen or faded particles', () => {
    const [initial] = createRaycastConfettiBurst(1000, 800, 1)
    const initialVx = initial.vx
    const initialVy = initial.vy
    const initialTilt = initial.tiltAngle

    const stepped = stepConfettiParticles([initial], 1000, 800, 1)
    expect(stepped).toHaveLength(1)
    const next = stepped[0]

    // Air drag reduces horizontal speed magnitude
    expect(Math.abs(next.vx)).toBeLessThan(Math.abs(initialVx))
    // Gravity pulls vertical velocity downward (less negative / more positive)
    expect(next.vy).toBeGreaterThan(initialVy)
    // 3D tilt angle advances
    expect(next.tiltAngle).not.toBe(initialTilt)

    // Culls particles that have faded out or fallen below the bottom edge
    const dead = { ...next, opacity: 0.01, ticks: 500, maxTicks: 100 }
    const offscreen = { ...next, y: 900, vy: 5 }
    expect(stepConfettiParticles([dead, offscreen], 1000, 800, 1)).toHaveLength(0)
  })

  it('spawns bigger, stronger confetti by default (count=160, size=12..22, launch speed >= 42)', () => {
    const particles = createRaycastConfettiBurst(1200, 800)
    expect(particles).toHaveLength(160) // default 80 per cannon
    expect(particles.every(p => p.size >= 12 && p.size <= 22)).toBe(true)
    expect(particles.every(p => Math.hypot(p.vx, p.vy) >= 42)).toBe(true)
  })

  it('provides pickRandomCelebrationEffect and CELEBRATION_EFFECTS catalog', () => {
    expect(CELEBRATION_EFFECTS).toEqual(['confetti', 'pets', 'water', 'party'])
    expect(pickRandomCelebrationEffect(() => 0.05)).toBe('confetti')
    expect(pickRandomCelebrationEffect(() => 0.35)).toBe('pets')
    expect(pickRandomCelebrationEffect(() => 0.65)).toBe('water')
    expect(pickRandomCelebrationEffect(() => 0.95)).toBe('party')
  })

  it('spawns walking dog and cat pets (effect="pets", drag=1, gravity=0) that trot across the screen', () => {
    const pets = createRaycastConfettiBurst(1200, 800, undefined, 'pets')
    expect(pets.length).toBeGreaterThanOrEqual(20)
    expect(pets.every(p => p.effect === 'pets' && p.shape === 'emoji' && Boolean(p.emoji))).toBe(true)
    expect(pets.every(p => p.drag === 1 && p.gravity === 0)).toBe(true)

    // stepConfettiParticles preserves horizontal speed and adds trotting vertical bob
    const stepped = stepConfettiParticles([pets[0]], 1200, 800, 1)
    expect(stepped).toHaveLength(1)
    expect(stepped[0].vx).toBe(pets[0].vx)
  })

  it('spawns water splash effect with droplets and water emojis', () => {
    const waterParticles = createRaycastConfettiBurst(1200, 800, undefined, 'water')
    expect(waterParticles.length).toBeGreaterThan(0)
    expect(waterParticles.some(p => p.shape === 'droplet')).toBe(true)
    expect(waterParticles.some(p => p.shape === 'emoji')).toBe(true)
  })

  it('spawns party chaos effect with funny emojis and ribbons', () => {
    const partyParticles = createRaycastConfettiBurst(1200, 800, undefined, 'party')
    expect(partyParticles.length).toBeGreaterThan(0)
    expect(partyParticles.some(p => p.shape === 'emoji')).toBe(true)
  })

  it('draws confetti, droplet, and emoji particles without throwing', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      ellipse: vi.fn(),
      fillText: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D

    const sampleParticles = [
      ...createRaycastConfettiBurst(1200, 800, 2, 'confetti'),
      ...createRaycastConfettiBurst(1200, 800, 2, 'pets'),
      ...createRaycastConfettiBurst(1200, 800, 2, 'water'),
    ]

    expect(() => drawConfettiParticles(mockCtx, sampleParticles)).not.toThrow()
    expect(mockCtx.save).toHaveBeenCalled()
    expect(mockCtx.restore).toHaveBeenCalled()
  })

  it('batches canvas state into a single save/restore pair per frame when setTransform is supported', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D

    const sampleParticles = createRaycastConfettiBurst(1200, 800, 10, 'confetti')
    drawConfettiParticles(mockCtx, sampleParticles)

    expect(mockCtx.save).toHaveBeenCalledTimes(1)
    expect(mockCtx.restore).toHaveBeenCalledTimes(1)
    expect(mockCtx.setTransform).toHaveBeenCalledTimes(sampleParticles.length)
  })

  it('provides getConfettiEnabled and setConfettiEnabled with localStorage persistence', () => {
    localStorage.clear()
    expect(getConfettiEnabled()).toBe(true)
    setConfettiEnabled(false)
    expect(localStorage.getItem(STORAGE_KEY_CONFETTI)).toBe('false')
    expect(getConfettiEnabled()).toBe(false)
    setConfettiEnabled(true)
    expect(localStorage.getItem(STORAGE_KEY_CONFETTI)).toBe('true')
    expect(getConfettiEnabled()).toBe(true)
  })
})

describe('Confetti dictionary helpers (app/utils/confetti.ts)', () => {
  it('normalizes and deduplicates confetti words including comma-separated entries', () => {
    expect(normalizeConfettiWord('  Chúc Mừng!  ')).toBe('chúc mừng!')
    expect(sanitizeConfettiWords(['  Party ', 'PARTY', 'congrats,  hooray ', '', '   '])).toEqual([
      'party',
      'congrats',
      'hooray',
    ])
  })

  it('returns false when dictionary or text is empty', () => {
    expect(matchesConfettiDictionary('congrats on the release!', [])).toBe(false)
    expect(matchesConfettiDictionary('congrats on the release!', null)).toBe(false)
    expect(matchesConfettiDictionary('', ['congrats'])).toBe(false)
    expect(matchesConfettiDictionary(undefined, ['congrats'])).toBe(false)
  })

  it('matches case-insensitively when message contains any dictionary word or phrase', () => {
    const dict = ['congrats', 'rõ ràng', 'ship it']
    expect(matchesConfettiDictionary('Big CONGRATS team!', dict)).toBe(true)
    expect(matchesConfettiDictionary('Rõ ràng là tuyệt vời', dict)).toBe(true)
    expect(matchesConfettiDictionary('Let us SHIP IT today', dict)).toBe(true)
    expect(matchesConfettiDictionary('Just a normal message', dict)).toBe(false)
  })
})
