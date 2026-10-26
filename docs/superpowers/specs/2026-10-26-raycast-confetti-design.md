# Raycast-Style Dual-Cannon Confetti Effect — Design Spec

**Date:** 2026-10-26  
**Topic:** Replace static `animate-ping` confetti placeholder with Raycast-style dual bottom-corner physics confetti

## 1. Investigation Findings

### Current Implementation (`app/pages/index.vue:835-856`)
- Renders 36 static `<span>` squares at fixed `top`/`left` percentages across the middle of the screen with Tailwind `animate-ping`.
- Particles pulse in place like radar blips rather than launching, arcing, tumbling, or falling.
- Fixed 2500ms timer resets `isConfettiActive` and abruptly cuts off the DOM node if re-triggered.

### How Raycast's Confetti Works
1. **Dual Bottom-Corner Cannons:**
   - Two emitters positioned at the bottom-left (`x = 0, y = H * 0.98`) and bottom-right (`x = W, y = H * 0.98`) corners of the viewport.
   - Left cannon launches diagonally up-and-right (`~60°` elevation, `±26°` spread cone); right cannon launches diagonally up-and-left (`~120°` elevation, `±26°` spread cone), intersecting near the upper-center of the screen.
2. **Explosive Impulse + Air Drag + Parabolic Gravity:**
   - High initial launch speed (`24–48 px/frame` normalized to 60fps) propels confetti 65%–85% up the viewport.
   - Exponential air resistance (`drag ≈ 0.91`) rapidly slows the initial cannon blast so confetti hangs briefly at the apex before fluttering down under gravity (`g ≈ 0.65`) and lateral sine-wave wobble.
3. **3D Paper Tumble & Raycast Palette:**
   - Mix of confetti ribbons (`strip`), rectangles (`rect`), and discs (`circle`) in Raycast's vibrant palette (`#FF6363`, `#FF9F43`, `#FECA57`, `#1DD1A1`, `#48DBFB`, `#54A0FF`, `#A29BFE`, `#FF78C4`).
   - 2D canvas affine scaling (`scale(cos(tiltAngle), ...)`) + rotation creates a 3D paper-flipping illusion at 60–120fps.
4. **Zero-Dependency `<canvas>` Overlay & Additive Bursts:**
   - Full-viewport `<canvas>` (`pointer-events-none fixed inset-0 z-50`) scaled by `window.devicePixelRatio`.
   - Re-triggering while active appends a new dual-cannon burst wave into the active particle list instead of wiping in-flight confetti.
   - Automatically stops `requestAnimationFrame` and unmounts when all particles finish or fall off-screen (with a deterministic timer fallback for headless test environments).

## 2. Architecture & Component Boundaries

### 2.1 Pure Physics Helper (`app/utils/confetti.ts`)
- `ConfettiParticle` interface: position (`x`, `y`), velocity (`vx`, `vy`), physics (`gravity`, `drag`, `wobble`, `wobbleSpeed`, `tiltAngle`, `tiltSpeed`, `rotation`, `rotationSpeed`), appearance (`color`, `shape`, `width`, `height`, `opacity`, `decay`).
- `createRaycastConfettiBurst(width: number, height: number, countPerCannon?: number): ConfettiParticle[]`:
  - Spawns `countPerCannon` (default `45`, total `90`) particles from bottom-left and bottom-right cannons with randomized speed, spread cone, color, and shape.
- `stepConfettiParticles(particles: ConfettiParticle[], width: number, height: number, dtScale?: number): ConfettiParticle[]`:
  - Advances positions, applies air drag, gravity, wobble, 3D tilt, rotation, and late-stage opacity decay; filters out dead particles (`opacity <= 0` or `y > height + 40`).

### 2.2 Canvas Component (`app/components/ConfettiOverlay.vue`)
- **Props:** `active: boolean`, `burstKey?: number`
- **Emits:** `complete`
- **DOM Hooks:** Root wrapper preserves `data-test="confetti-overlay"` and `pointer-events-none fixed inset-0 z-50` so all existing integration tests in `tests/components/indexPage.test.ts` continue to pass, while rendering `<canvas data-test="confetti-canvas" class="w-full h-full block" />`.
- **SSR / Happy-DOM Guard:** Safely checks `canvas.getContext?.('2d')` and `requestAnimationFrame`; falls back to a clean timeout in unit tests where 2D canvas context is unavailable.

### 2.3 Wiring in `app/pages/index.vue`
- Replace inline `animate-ping` spans with `<ConfettiOverlay :active="isConfettiActive" :burst-key="confettiBurstKey" @complete="isConfettiActive = false" />`.
- Increment `confettiBurstKey` inside `triggerConfetti()` so rapid consecutive celebration messages stack cannon bursts smoothly.
