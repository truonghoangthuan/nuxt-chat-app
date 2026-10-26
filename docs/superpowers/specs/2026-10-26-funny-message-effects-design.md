# Bigger Confetti & Random Funny Message Effects — Design Spec

**Date:** 2026-10-26  
**Topic:** Stronger/bigger Raycast confetti cannon + random funny canvas effects (`confetti`, `pets`, `water`, `party`) on every message

## 1. Goals & Requirements

1. **Bigger, Stronger Confetti (`confetti`):**
   - Increase default particle density from `45` to `80` per cannon (`160` total per wave).
   - Double particle dimensions from `7–12px` to `12–22px`.
   - Boost launch impulse from `25–47 px/frame` to `42–76 px/frame` with higher drag retention (`0.92–0.94`) and wider cone (`±32°`) so confetti blasts across the full viewport.
2. **More Funny Effects on Every Message (`pets`, `water`, `party`):**
   - **`pets` (Walking Dogs & Cats Stampede):** Dogs, cats, and paw prints (`🐕`, `🐩`, `🐈`, `🐈‍⬛`, `🐶`, `🐱`, `🐾`, `🦴`, `🐟`) trot across horizontal lanes from both screen edges with a bouncy walk cycle (`drag = 1`, `gravity = 0`, sine-wave vertical hop + waddle tilt) and directional sprite flip (`scale(-1, 1)` when walking right).
   - **`water` (Screen Water Splash & Drips):** Dual-corner water splash launching custom glossy 2D canvas teardrops (`shape: 'droplet'` with translucent aqua fill and white specular highlight) plus `🌊`, `💧`, `🫧`, `🦆` sprites that splash up and drip down the screen.
   - **`party` (Chaos Meme Cannon):** Dual-corner cannon blasting oversized tumbling funny emojis (`🐸`, `🦆`, `🚀`, `🌮`, `🍕`, `🎉`, `🦄`, `🦖`, `🪩`, `🔥`) mixed with giant confetti ribbons.
3. **Random Trigger on Every Message:**
   - Every outgoing text/image message and every newly arrived realtime incoming message in the active conversation triggers `ConfettiOverlay`, which randomly picks one of `['confetti', 'pets', 'water', 'party']` via `pickRandomCelebrationEffect()`.
   - Historical messages loaded on initial open or cursor pagination remain suppressed (Invariant #26).

## 2. Architecture & Component Boundaries (Ponytail Minimalist)

- **Zero New Dependencies / Single Canvas Overlay:** Extend `app/utils/confetti.ts` and `app/components/ConfettiOverlay.vue` in-place rather than mounting separate DOM overlays.
- **`app/utils/confetti.ts`:**
  - `CelebrationEffect = 'confetti' | 'pets' | 'water' | 'party'`
  - `ConfettiShape = 'rect' | 'circle' | 'strip' | 'droplet' | 'emoji'`
  - `ConfettiParticle` adds optional `effect?: CelebrationEffect` and `emoji?: string`.
  - `pickRandomCelebrationEffect(rng?: () => number): CelebrationEffect` selects a random effect.
  - `createRaycastConfettiBurst(width, height, countPerCannon = 80, effect: CelebrationEffect = 'confetti'): ConfettiParticle[]` spawns the requested effect wave (preserving default `'confetti'` and explicit `countPerCannon` for existing tests).
  - `stepConfettiParticles` advances standard ballistic physics plus pet trotting bob/waddle when `p.effect === 'pets'`.
  - `drawConfettiParticles` renders geometric confetti, glossy water teardrops (`'droplet'`), and direction-aware emoji sprites (`'emoji'`).
- **`app/components/ConfettiOverlay.vue`:**
  - Accepts optional `effect?: CelebrationEffect` prop; when omitted, picks a random effect via `pickRandomCelebrationEffect()` on each burst wave.
- **`app/pages/index.vue`:**
  - Removes the keyword-only filter on incoming active-chat messages so every non-deleted, decryptable incoming realtime message triggers a random celebration burst alongside outgoing messages.
