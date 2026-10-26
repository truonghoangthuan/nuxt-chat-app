# Bigger Confetti & Random Funny Message Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Raycast confetti effect bigger and fire stronger, add funny canvas effects (`pets` walking dogs/cats, `water` screen splash/drips, `party` meme cannon), and randomly trigger an effect on every sent or received realtime message.

**Architecture:** Extend `app/utils/confetti.ts` with stronger/larger confetti physics (`size: 12..22`, `speed: 42..76`, default `countPerCannon = 80`) and three additional pure particle generators (`pets`, `water`, `party`) plus canvas renderers (`droplet` glossy teardrops and direction-flipped `emoji` sprites). Update `ConfettiOverlay.vue` to pick a random effect per burst wave (`pickRandomCelebrationEffect`) and `app/pages/index.vue` to trigger on every active-chat realtime message.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), HTML5 2D Canvas API, Tailwind CSS, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-26-funny-message-effects-design.md`

## Global Constraints

- Zero external npm dependencies (Ponytail + Invariant #28: pure TS physics + HTML5 2D Canvas).
- Preserve existing `createRaycastConfettiBurst(width, height, countPerCannon)` signature compatibility so existing unit tests and spies pass.
- Preserve history boundary guard (`isLoadingHistory` / `hasLoadedHistoryForConv`, Invariant #26) so loading or paginating history never triggers effects.
- Respect `prefers-reduced-motion: reduce` and headless test environments (`happy-dom` where `canvas.getContext('2d')` is `null`).

## Review Focus

- Calling `createRaycastConfettiBurst(1200, 800, 30)` without an `effect` argument: must still return `60` `'confetti'` particles within `24px` of bottom corners (`vx > 0` left, `vx < 0` right, `vy < 0`).
- Pet walkers (`effect === 'pets'`): must have `drag = 1` and `gravity = 0` so dogs/cats walk all the way across the viewport instead of stopping after 20px or falling off the bottom immediately.
- Rapid consecutive messages: must stack additive waves on the same canvas (could mix confetti + walking dogs + water splashes simultaneously) and reset the safety completion timer.
- Incoming soft-deleted (`deleted_at`) or `undecryptable` messages: must not trigger effects.
- Headless canvas draw test with mocked `CanvasRenderingContext2D`: `drawConfettiParticles` must cleanly render `'droplet'` and `'emoji'` shapes without throwing.

---

### Task 1: Stronger/Bigger Confetti & Funny Effect Generators (`app/utils/confetti.ts`)

**Files:**
- Modify: `app/utils/confetti.ts`
- Modify: `tests/utils/confetti.test.ts`

**Interfaces:**
- Produces:
  - `export type CelebrationEffect = 'confetti' | 'pets' | 'water' | 'party'`
  - `export type ConfettiShape = 'rect' | 'circle' | 'strip' | 'droplet' | 'emoji'`
  - `export const CELEBRATION_EFFECTS: CelebrationEffect[]`
  - `export function pickRandomCelebrationEffect(rng?: () => number): CelebrationEffect`
  - `export function createRaycastConfettiBurst(width: number, height: number, countPerCannon?: number, effect?: CelebrationEffect): ConfettiParticle[]`
  - `export function stepConfettiParticles(particles: ConfettiParticle[], width: number, height: number, dtScale?: number): ConfettiParticle[]`
  - `export function drawConfettiParticles(ctx: CanvasRenderingContext2D, particles: ConfettiParticle[]): void`

- [ ] **Step 1: Write the failing unit tests in `tests/utils/confetti.test.ts`**

Add tests in `tests/utils/confetti.test.ts` asserting:
1. Default `createRaycastConfettiBurst(1200, 800)` spawns `160` particles (`80` per cannon) with bigger size (`p.size >= 12` and `p.size <= 22`) and stronger speed (`Math.hypot(p.vx, p.vy) >= 42`).
2. `pickRandomCelebrationEffect` deterministically maps RNG values across `['confetti', 'pets', 'water', 'party']`.
3. `createRaycastConfettiBurst(1200, 800, undefined, 'pets')` spawns walking dog/cat emoji particles (`shape === 'emoji'`, `effect === 'pets'`, `drag === 1`, `gravity === 0`) that walk horizontally and bob vertically in `stepConfettiParticles`.
4. `createRaycastConfettiBurst(1200, 800, undefined, 'water')` spawns glossy `'droplet'` and water `'emoji'` particles (`🌊`, `💧`, `🫧`, `🦆`).
5. `createRaycastConfettiBurst(1200, 800, undefined, 'party')` spawns funny `'emoji'` particles and confetti strips.
6. `drawConfettiParticles` renders `'droplet'` and `'emoji'` particles onto a mocked 2D context (`fillText`, `quadraticCurveTo`, `arc`).

- [ ] **Step 2: Run Vitest on `tests/utils/confetti.test.ts` to verify failure**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: FAIL (`pickRandomCelebrationEffect` not exported, default burst count is 90 instead of 160, size < 12).

- [ ] **Step 3: Implement bigger confetti & funny effects in `app/utils/confetti.ts`**

Update `app/utils/confetti.ts`:
- Export `CelebrationEffect = 'confetti' | 'pets' | 'water' | 'party'`, `CELEBRATION_EFFECTS = ['confetti', 'pets', 'water', 'party']`, and `pickRandomCelebrationEffect(rng = Math.random)`.
- In `createRaycastConfettiBurst(width, height, countPerCannon = 80, effect: CelebrationEffect = 'confetti')`:
  - `'confetti'`: `size: 12 + Math.random() * 10`, `speed: 42 + Math.random() * 34`, `angleDeg: 60 ± 32` (left) / `120 ± 32` (right), `drag: 0.92 + Math.random() * 0.02`, `maxTicks: 150 + Math.floor(Math.random() * 70)`.
  - `'pets'`: spawn `28` walking dogs/cats/paw prints (`['🐕', '🐩', '🐈', '🐈‍⬛', '🐶', '🐱', '🐾', '🦴', '🐟']`) from left (`x: -40..20`, `vx: 4.5..9.5`) and right (`x: safeW - 20..safeW + 40`, `vx: -4.5..-9.5`) across vertical lanes (`y: safeH * 0.25 .. safeH * 0.92`), `size: 32 + Math.random() * 22`, `drag: 1`, `gravity: 0`, `wobbleSpeed: 0.22 + Math.random() * 0.12`, `maxTicks: 180 + Math.floor(Math.random() * 60)`.
  - `'water'`: spawn `90` water splash particles from bottom cannons and top/mid splash (`shape: 'droplet'` in `#38BDF8`, `#0EA5E9`, `#7DD3FC`, `#BAE6FD` with `size: 14 + Math.random() * 14`, plus `'emoji'` splashes `['🌊', '💧', '🫧', '🦆', '🐳']` with `size: 26 + Math.random() * 16`, `speed: 36 + Math.random() * 32`, `gravity: 0.55 + Math.random() * 0.2`, `drag: 0.93`).
  - `'party'`: spawn dual-cannon funny emoji & oversized ribbon blast (`['🐸', '🦆', '🚀', '🌮', '🍕', '🎉', '🦄', '🦖', '🪩', '🔥']`, `size: 26 + Math.random() * 18`, `speed: 40 + Math.random() * 34`).
- In `stepConfettiParticles`:
  - When `p.effect === 'pets'`, advance `p.x += p.vx * dtScale`, `p.y += Math.sin(p.wobble) * 2.2 * dtScale`, and `p.rotation = Math.sin(p.wobble) * 0.16`.
- In `drawConfettiParticles`:
  - Handle `p.shape === 'emoji'` with `ctx.font = "${Math.round(p.size)}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"`, flipping `ctx.scale(-1, 1)` when `p.effect === 'pets' && p.vx > 0`, and calling `ctx.fillText(p.emoji || '🎉', 0, 0)`.
  - Handle `p.shape === 'droplet'` with a teardrop bezier path (`beginPath`, `moveTo(0, -r * 1.35)`, `quadraticCurveTo(r, -r * 0.2, r, r * 0.45)`, `arc(0, r * 0.45, r, 0, Math.PI)`, `quadraticCurveTo(-r, -r * 0.2, 0, -r * 1.35)`, `fill`) and a translucent white highlight oval.

- [ ] **Step 4: Run Vitest on `tests/utils/confetti.test.ts` to verify pass**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: PASS.

---

### Task 2: Random Funny Effect Selection in `ConfettiOverlay.vue` & Every-Message Trigger in `app/pages/index.vue`

**Files:**
- Modify: `app/components/ConfettiOverlay.vue`
- Modify: `app/pages/index.vue`
- Modify: `tests/components/confettiOverlay.test.ts`
- Modify: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `pickRandomCelebrationEffect`, `createRaycastConfettiBurst`, `CelebrationEffect` from `~/utils/confetti`
- Produces:
  - `ConfettiOverlay.vue` with optional `effect?: CelebrationEffect` prop (defaults to random effect per burst wave via `pickRandomCelebrationEffect()`).
  - `app/pages/index.vue` triggering `triggerConfetti()` on every non-deleted, decryptable incoming realtime message in addition to every outgoing message.

- [ ] **Step 1: Write failing tests in `tests/components/confettiOverlay.test.ts` and `tests/components/indexPage.test.ts`**

1. In `tests/components/confettiOverlay.test.ts`:
   - Verify `ConfettiOverlay` passes a randomly chosen effect (or explicit `effect` prop when provided) to `createRaycastConfettiBurst`.
2. In `tests/components/indexPage.test.ts`:
   - Verify that a normal incoming realtime message without special keywords (e.g. `'Just a regular everyday message'`) from another user in the active conversation triggers `[data-test="confetti-overlay"]`.

- [ ] **Step 2: Run Vitest on `confettiOverlay.test.ts` and `indexPage.test.ts` to verify failure**

Run: `npx vitest run tests/components/confettiOverlay.test.ts tests/components/indexPage.test.ts`  
Expected: FAIL on the new incoming regular-message test and `effect` prop forwarding test.

- [ ] **Step 3: Update `app/components/ConfettiOverlay.vue` and `app/pages/index.vue`**

1. In `app/components/ConfettiOverlay.vue`:
   - Add optional `effect?: CelebrationEffect` to `defineProps`.
   - In `spawnBurst()`, resolve `const effect = props.effect || pickRandomCelebrationEffect()` and call `createRaycastConfettiBurst(width, height, undefined, effect)`.
   - Increase safety timer from `3200` to `3600` ms to give bigger blasts and walking pets full screen traversal time.
2. In `app/pages/index.vue`:
   - In the `messages` watcher (line 371), trigger `triggerConfetti()` whenever `newest.user_id !== currentProfile.value?.id && !newest.deleted_at && newest.encryption !== 'undecryptable'` (removing the keyword-only restriction so every incoming message gets a random funny effect).

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`  
Expected: All test suites PASS.
