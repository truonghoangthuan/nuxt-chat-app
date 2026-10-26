# Confetti Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate UI frame drops and main-thread lag when celebratory/funny canvas effects fire on sent and received messages.

**Architecture:** Pre-render emoji particles into cached offscreen `<canvas>` sprites (`drawImage` instead of per-frame rotated `fillText`), replace per-particle `ctx.save()`/`ctx.restore()` stack churn with a single frame-level save/restore and direct affine transforms (`setTransform`), compact particle arrays in-place in `stepConfettiParticles`, cap overlay HiDPI scaling (`dpr <= 1.25`) with balanced `80`-particle waves and zero layout reflow in `ConfettiOverlay.vue`, and replace the `deep: true, flush: 'sync'` `messages` watcher in `app/pages/index.vue` with an O(1) tail-message selector.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), HTML5 2D Canvas API, Vitest + `@vue/test-utils`.

**Spec:** Inline investigation (2026-10-26)

## Global Constraints

- Zero external npm dependencies (Invariant #28 & Ponytail: pure TypeScript physics + native HTML5 2D Canvas).
- Preserve all existing function signatures and default return counts (`createRaycastConfettiBurst(1200, 800)` must still return `160` particles when called directly; `ConfettiOverlay.vue` must still call `createRaycastConfettiBurst(width, height, undefined, chosenEffect)`).
- Maintain headless test compatibility (`happy-dom` where `canvas.getContext('2d')` returns `null`, and partial `mockCtx` objects in `tests/utils/confetti.test.ts`).
- Preserve Invariant #26 (never trigger confetti on initial conversation history load or cursor pagination).

## Review Focus

- Emoji font bug from `476fce9`: `ctx.font` was configured inside `ctx.save() ... ctx.restore()` only on the first emoji particle (`fontConfigured = true`), causing subsequent emoji particles to revert to default `10px sans-serif` while still re-running slow `fillText` shaping every frame.
- Partial `CanvasRenderingContext2D` mocks in unit tests: `tests/utils/confetti.test.ts` passes a mock context without `setTransform` or `drawImage` and asserts `mockCtx.save` and `mockCtx.restore` were called; `drawConfettiParticles` must guard optional methods and still call `save()`/`restore()` at the frame boundary.
- Asymmetric cannon truncation in `ConfettiOverlay.vue`: `particles.slice(-140)` on a `160`-particle dual-cannon wave dropped 20 particles from the left cannon; downsampling/capping must preserve left/right cannon symmetry.
- HiDPI canvas fill-rate: `devicePixelRatio` of `2`–`3` creates an 8M–14M pixel buffer over `backdrop-blur-xl` layers; capping `dpr` to `1.25` cuts pixel fill-rate by up to 75% without visible blur on moving particles.
- Synchronous deep watcher in `app/pages/index.vue`: `watch(() => messages.value, ..., { deep: true, flush: 'sync' })` walks the entire message array on every reaction, edit, or optimistic update; replacing the source with an O(1) tail-message selector keeps `flush: 'sync'` history-boundary semantics without deep traversal.

---

### Task 1: Optimize Canvas Renderer & Physics Loop (`app/utils/confetti.ts`)

**Files:**
- Modify: `app/utils/confetti.ts`
- Modify: `tests/utils/confetti.test.ts`

**Interfaces:**
- Produces:
  - `export function stepConfettiParticles(particles: ConfettiParticle[], width: number, height: number, dtScale?: number): ConfettiParticle[]` (in-place compaction)
  - `export function drawConfettiParticles(ctx: CanvasRenderingContext2D, particles: ConfettiParticle[], dpr?: number): void` (single `save`/`restore`, `setTransform` fast path, cached offscreen emoji sprites)

- [ ] **Step 1: Write failing performance & regression tests in `tests/utils/confetti.test.ts`**

Add tests in `tests/utils/confetti.test.ts` asserting:
1. `drawConfettiParticles` calls `ctx.save()` and `ctx.restore()` only once per frame (instead of once per particle) when `ctx.setTransform` is available.
2. `stepConfettiParticles` compacts surviving particles in-place without dropping active particles or failing culling invariants.

```ts
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
```

- [ ] **Step 2: Run Vitest on `tests/utils/confetti.test.ts` to verify failure**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: FAIL (`mockCtx.save` called 20 times instead of 1).

- [ ] **Step 3: Implement emoji sprite cache, single save/restore `setTransform` batching, and in-place compaction in `app/utils/confetti.ts`**

Update `app/utils/confetti.ts`:
1. In `stepConfettiParticles(particles, width, height, dtScale = 1)`:
   - Mutate and compact `particles` in-place with a `writeIndex` cursor (`particles[writeIndex++] = p; ... particles.length = writeIndex; return particles`).
   - Avoid `Math.pow(p.drag, dtScale)` when `dtScale === 1` (`const dragFactor = dtScale === 1 ? p.drag : Math.pow(p.drag, dtScale)`).
2. Add an offscreen emoji sprite cache `getEmojiSprite(emoji: string): HTMLCanvasElement | null`:
   - In browser environments (`typeof document !== 'undefined'`), render each unique emoji once onto a `64x64` `<canvas>` (`font = EMOJI_FONT`, `textAlign = 'center'`, `textBaseline = 'middle'`, `fillText(emoji, 32, 32)`). If `getContext('2d')` returns `null` (e.g. `happy-dom`), cache `null` and fall back to `ctx.fillText`.
3. In `drawConfettiParticles(ctx, particles, dpr = 1)`:
   - Return early if `particles.length === 0`.
   - Call `ctx.save()` once before the loop and `ctx.restore()` once after the loop.
   - Pre-configure `ctx.font = EMOJI_FONT`, `ctx.textAlign = 'center'`, `ctx.textBaseline = 'middle'` once after `ctx.save()`.
   - Track `lastFillStyle = ''` and `lastAlpha = -1` to skip redundant context property assignments (quantize `opacity` to 2 decimal places `Math.round(p.opacity * 100) / 100`).
   - When `typeof ctx.setTransform === 'function'`, compute `cos = Math.cos(p.rotation) * dpr`, `sin = Math.sin(p.rotation) * dpr`, and call `ctx.setTransform(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, p.x * dpr, p.y * dpr)` directly per particle instead of `save`/`translate`/`rotate`/`scale`/`restore`. Fall back to per-particle `save`/`restore` only if `ctx.setTransform` is undefined.
   - For `p.shape === 'emoji'`, if `getEmojiSprite(emoji)` and `typeof ctx.drawImage === 'function'` exist, draw with `ctx.drawImage(sprite, -BASE_EMOJI_FONT_SIZE / 2, -BASE_EMOJI_FONT_SIZE / 2, BASE_EMOJI_FONT_SIZE, BASE_EMOJI_FONT_SIZE)`; otherwise call `ctx.fillText(p.emoji || '🎉', 0, 0)`.

- [ ] **Step 4: Run Vitest on `tests/utils/confetti.test.ts` to verify pass**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add app/utils/confetti.ts tests/utils/confetti.test.ts
git commit -m "perf(confetti): cache emoji sprites and eliminate per-particle canvas state churn"
```

---

### Task 2: Optimize Overlay DPI, Balanced Particle Cap & O(1) Message Watcher (`app/components/ConfettiOverlay.vue`, `app/pages/index.vue`)

**Files:**
- Modify: `app/components/ConfettiOverlay.vue`
- Modify: `app/pages/index.vue:353-377`
- Modify: `tests/components/confettiOverlay.test.ts`

**Interfaces:**
- Consumes: `createRaycastConfettiBurst`, `stepConfettiParticles`, `drawConfettiParticles`, `pickRandomCelebrationEffect` from `~/utils/confetti`
- Produces:
  - `ConfettiOverlay.vue` with capped `dpr <= 1.25`, reflow-free viewport sizing, balanced `MAX_ACTIVE_PARTICLES = 80` cap, and compositor layer isolation.
  - `app/pages/index.vue` with O(1) non-deep `messages` watcher.

- [ ] **Step 1: Write failing test in `tests/components/confettiOverlay.test.ts`**

Add a test in `tests/components/confettiOverlay.test.ts` asserting that `ConfettiOverlay` caps high `window.devicePixelRatio` (e.g. `dpr = 3`) to at most `1.25` when sizing the `<canvas>` backing store:

```ts
  it('caps canvas devicePixelRatio at 1.25 on HiDPI displays to prevent fill-rate lag', async () => {
    const origDpr = window.devicePixelRatio
    const origInnerW = window.innerWidth
    const origInnerH = window.innerHeight
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })

    const wrapper = mount(ConfettiOverlay, {
      props: {
        active: true,
        burstKey: 1,
      },
    })
    await wrapper.vm.$nextTick()

    const canvas = wrapper.find('[data-test="confetti-canvas"]').element as HTMLCanvasElement
    expect(canvas.width).toBeLessThanOrEqual(1250)
    expect(canvas.height).toBeLessThanOrEqual(1000)

    Object.defineProperty(window, 'devicePixelRatio', { value: origDpr, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: origInnerW, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: origInnerH, configurable: true })
  })
```

- [ ] **Step 2: Run Vitest on `tests/components/confettiOverlay.test.ts` to verify failure**

Run: `npx vitest run tests/components/confettiOverlay.test.ts`  
Expected: FAIL (`canvas.width` is `3000` instead of `<= 1250`).

- [ ] **Step 3: Update `app/components/ConfettiOverlay.vue` and `app/pages/index.vue`**

1. In `app/components/ConfettiOverlay.vue`:
   - In `updateCanvasSize(canvas)`:
     - Prefer `window.innerWidth` and `window.innerHeight` before falling back to `canvas.getBoundingClientRect()` so `spawnBurst()` does not force a synchronous DOM layout reflow right after message insertion.
     - Cap `cachedDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1`.
   - In `spawnBurst()`:
     - Keep `const newWave = createRaycastConfettiBurst(width, height, undefined, chosenEffect)`.
     - Downsample `newWave` when `newWave.length > 80` by taking every 2nd particle (`newWave.filter((_, idx) => idx % 2 === 0)`) so left and right cannons stay equally represented (`40` left + `40` right = `80`), and cap total `particles` at `MAX_ACTIVE_PARTICLES = 80`.
   - In `startLoop()`:
     - Pass `cachedDpr` to `drawConfettiParticles(ctx, particles, cachedDpr)` instead of calling `ctx.scale(cachedDpr, cachedDpr)` separately.
   - On `[data-test="confetti-overlay"]`, add `will-change-transform` class to isolate the overlay on its own compositor layer.
2. In `app/pages/index.vue` (lines 353–377):
   - Replace `watch(() => messages.value, (newMessages) => { ... }, { deep: true, flush: 'sync' })` with an O(1) watcher on the tail message identity and length:
     ```ts
     watch(
       () => {
         const len = messages.value.length
         if (len === 0) return ''
         const newest = messages.value[len - 1]
         return `${len}:${newest.client_id || newest.id}`
       },
       () => {
         const newMessages = messages.value
         if (!newMessages || newMessages.length === 0) {
           prevConfettiMessageId = null
           return
         }
         const newest = newMessages[newMessages.length - 1]
         const newestId = newest.client_id || newest.id

         if (isLoadingHistory.value || !hasLoadedHistoryForConv) {
           prevConfettiMessageId = newestId
           return
         }

         if (newestId !== prevConfettiMessageId) {
           prevConfettiMessageId = newestId
           if (newest.user_id !== currentProfile.value?.id && !newest.deleted_at && newest.encryption !== 'undecryptable') {
             triggerConfetti()
           }
         }
       },
       { flush: 'sync' },
     )
     ```

- [ ] **Step 4: Run Vitest across the full suite**

Run: `npm test`  
Expected: All test suites PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add app/components/ConfettiOverlay.vue app/pages/index.vue tests/components/confettiOverlay.test.ts
git commit -m "perf(effects): cap overlay dpr, balance particle budget, and drop deep message watcher"
```
