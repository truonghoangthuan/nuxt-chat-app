import { describe, it, expect } from 'vitest'
import {
  createRaycastConfettiBurst,
  stepConfettiParticles,
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
})
