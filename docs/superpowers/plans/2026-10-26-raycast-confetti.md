# Raycast-Style Confetti Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `animate-ping` confetti placeholder with a zero-dependency Raycast-style dual bottom-corner `<canvas>` physics confetti effect.

**Architecture:** Extract pure, deterministic testable dual-cannon particle creation and frame-step physics into `app/utils/confetti.ts` (`createRaycastConfettiBurst`, `stepConfettiParticles`, `drawConfettiParticle`). Wrap the `requestAnimationFrame` `<canvas>` lifecycle in `app/components/ConfettiOverlay.vue` (preserving `data-test="confetti-overlay"`) and wire additive burst keys in `app/pages/index.vue`.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), HTML5 2D Canvas API, Tailwind CSS, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-26-raycast-confetti-design.md`

## Global Constraints

- Zero new npm dependencies (Ponytail rule: native HTML5 `<canvas>` + pure TS math).
- Preserve `[data-test="confetti-overlay"]` and existing trigger rules (`shouldTriggerConfetti` on outgoing and incoming active-conversation messages).
- Guard `HTMLCanvasElement.prototype.getContext` and `window.requestAnimationFrame` so Vitest (`happy-dom`) tests run without canvas errors.
- Respect `prefers-reduced-motion: reduce` by reducing particle count/duration or skipping motion loop gracefully.

## Review Focus

- Rapid consecutive trigger messages (`ok` followed immediately by `cool`): must spawn an additive dual-cannon burst wave (`burstKey` increment) and reset the safety cleanup timer rather than cutting off mid-flight particles after 200ms.
- Headless test environment (`happy-dom` where `canvas.getContext('2d')` returns `null`): component must still render `[data-test="confetti-overlay"]` when `active` is true and auto-complete via fallback timer without throwing.
- Window resize during an active burst: canvas dimensions update without throwing or stretching particles.
- Component unmount while `requestAnimationFrame` is running: must cancel pending animation frame and timeout to prevent memory leaks.
- Zero/negative viewport dimensions (`width <= 0` or `height <= 0`): `createRaycastConfettiBurst` must clamp to sensible defaults (`1280x800`) instead of producing `NaN` coordinates.

---

### Task 1: Pure Dual-Cannon Physics Engine (`app/utils/confetti.ts`)

**Files:**
- Create: `app/utils/confetti.ts`
- Create: `tests/utils/confetti.test.ts`

**Interfaces:**
- Produces:
  - `ConfettiParticle` interface
  - `createRaycastConfettiBurst(width: number, height: number, countPerCannon?: number): ConfettiParticle[]`
  - `stepConfettiParticles(particles: ConfettiParticle[], width: number, height: number, dtScale?: number): ConfettiParticle[]`
  - `drawConfettiParticles(ctx: CanvasRenderingContext2D, particles: ConfettiParticle[]): void`

- [ ] **Step 1: Write the failing unit tests in `tests/utils/confetti.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run Vitest on `tests/utils/confetti.test.ts` to verify failure**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: FAIL (`Cannot find module '~/utils/confetti'`).

- [ ] **Step 3: Implement `app/utils/confetti.ts`**

Create `app/utils/confetti.ts` with `RAYCAST_CONFETTI_COLORS = ['#FF6363', '#FF9F43', '#FECA57', '#1DD1A1', '#48DBFB', '#54A0FF', '#A29BFE', '#FF78C4']`, `createRaycastConfettiBurst`, `stepConfettiParticles`, and `drawConfettiParticles` using 2D canvas transforms (`translate`, `rotate`, `scale(Math.cos(p.tiltAngle), ...)` for 3D paper tumble).

- [ ] **Step 4: Run Vitest on `tests/utils/confetti.test.ts` to verify pass**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: PASS.

---

### Task 2: `ConfettiOverlay.vue` Component & Additive Burst Wiring (`app/components/ConfettiOverlay.vue`, `app/pages/index.vue`)

**Files:**
- Create: `app/components/ConfettiOverlay.vue`
- Modify: `app/pages/index.vue`
- Modify: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `createRaycastConfettiBurst`, `stepConfettiParticles`, `drawConfettiParticles` from `~/utils/confetti`
- Produces: `ConfettiOverlay.vue` with `props: { active: boolean; burstKey?: number }` and `emit('complete')`, mounted in `app/pages/index.vue`.

- [ ] **Step 1: Write failing tests in `tests/components/indexPage.test.ts`**

Update confetti tests in `tests/components/indexPage.test.ts` to assert:
1. `[data-test="confetti-overlay"]` mounts `[data-test="confetti-canvas"]` when triggered.
2. Sending two consecutive celebration messages (`ok` then `cool`) increments the burst key and keeps `[data-test="confetti-overlay"]` active across rapid triggers.

- [ ] **Step 2: Run Vitest on `tests/components/indexPage.test.ts` to verify failure**

Run: `npx vitest run tests/components/indexPage.test.ts`  
Expected: FAIL (`[data-test="confetti-canvas"]` not found).

- [ ] **Step 3: Create `app/components/ConfettiOverlay.vue` and wire in `app/pages/index.vue`**

1. Create `app/components/ConfettiOverlay.vue` rendering `div[data-test="confetti-overlay"] > canvas[data-test="confetti-canvas"]`, spawning `createRaycastConfettiBurst` on activation and whenever `props.burstKey` increments, running a `requestAnimationFrame` loop (`stepConfettiParticles` + `drawConfettiParticles`), and cleaning up on unmount.
2. In `app/pages/index.vue`, add `confettiBurstKey = ref(0)`, increment `confettiBurstKey.value++` in `triggerConfetti()`, and replace the static `animate-ping` overlay block with `<ConfettiOverlay :active="isConfettiActive" :burst-key="confettiBurstKey" @complete="isConfettiActive = false" />`.

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`  
Expected: All test suites PASS.
