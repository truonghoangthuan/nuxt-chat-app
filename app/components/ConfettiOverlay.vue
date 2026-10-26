<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  createRaycastConfettiBurst,
  stepConfettiParticles,
  drawConfettiParticles,
  pickRandomCelebrationEffect,
  type ConfettiParticle,
  type CelebrationEffect,
} from '~/utils/confetti'

const props = withDefaults(
  defineProps<{
    active: boolean
    burstKey?: number
    effect?: CelebrationEffect
  }>(),
  {
    burstKey: 0,
  },
)

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let particles: ConfettiParticle[] = []
let animationFrameId: number | null = null
let safetyTimer: any = null
let lastTimestamp = 0
let lastSpawnedBurstKey = props.burstKey

function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
}

function stopAnimation() {
  if (animationFrameId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  if (safetyTimer) {
    clearTimeout(safetyTimer)
    safetyTimer = null
  }
  particles = []
}

let cachedWidth = 1280
let cachedHeight = 800
let cachedDpr = 1

function updateCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number } {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 0
  const winH = typeof window !== 'undefined' ? window.innerHeight : 0

  if (winW > 0 && winH > 0) {
    cachedWidth = winW
    cachedHeight = winH
  } else {
    const rect = canvas.getBoundingClientRect()
    cachedWidth = rect.width || 1280
    cachedHeight = rect.height || 800
  }

  // Cap DPR at 1.25 to prevent fill-rate saturation on HiDPI displays
  cachedDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1

  const targetW = Math.round(cachedWidth * cachedDpr)
  const targetH = Math.round(cachedHeight * cachedDpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }

  return { width: cachedWidth, height: cachedHeight, dpr: cachedDpr }
}

function handleWindowResize() {
  if (canvasRef.value) {
    updateCanvasSize(canvasRef.value)
  }
}

function spawnBurst() {
  if (isReducedMotion()) {
    emit('complete')
    return
  }

  const canvas = canvasRef.value
  let width = cachedWidth
  let height = cachedHeight

  if (canvas) {
    const info = updateCanvasSize(canvas)
    width = info.width
    height = info.height
  } else if (typeof window !== 'undefined') {
    width = window.innerWidth || 1280
    height = window.innerHeight || 800
  }

  const chosenEffect = props.effect || pickRandomCelebrationEffect()
  const rawWave = createRaycastConfettiBurst(width, height, undefined, chosenEffect)
  // Downsample waves with > 80 particles symmetrically to balance left and right cannons
  const newWave = rawWave.length > 80
    ? rawWave.filter((_, idx) => idx % 2 === 0)
    : rawWave
  particles.push(...newWave)

  // Cap particles to prevent frame drops on rapid bursts
  if (particles.length > 80) {
    particles = particles.slice(-80)
  }

  // Reset safety timer on every burst wave
  if (safetyTimer) clearTimeout(safetyTimer)
  safetyTimer = setTimeout(() => {
    stopAnimation()
    emit('complete')
  }, 3800)

  startLoop()
}

function startLoop() {
  if (animationFrameId !== null) return
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return
  }

  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext?.('2d')
  if (!ctx) return

  lastTimestamp = performance.now()

  const frame = (now: number) => {
    if (!props.active || particles.length === 0) {
      stopAnimation()
      emit('complete')
      return
    }

    const dtMs = Math.max(0, Math.min(now - lastTimestamp, 50))
    lastTimestamp = now
    const dtScale = dtMs / (1000 / 60)

    // Render using cached dimensions - zero forced layout reflow during animation loop
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (typeof ctx.setTransform !== 'function') {
      ctx.scale(cachedDpr, cachedDpr)
    }

    particles = stepConfettiParticles(particles, cachedWidth, cachedHeight, dtScale)
    drawConfettiParticles(ctx, particles, cachedDpr)

    if (particles.length > 0) {
      animationFrameId = window.requestAnimationFrame(frame)
    } else {
      stopAnimation()
      emit('complete')
    }
  }

  animationFrameId = window.requestAnimationFrame(frame)
}

watch(
  () => props.active,
  async (isActive) => {
    if (isActive) {
      lastSpawnedBurstKey = props.burstKey
      await nextTick()
      spawnBurst()
    } else {
      stopAnimation()
    }
  },
  { immediate: true },
)

watch(
  () => props.burstKey,
  async (newKey) => {
    if (props.active && newKey !== lastSpawnedBurstKey) {
      lastSpawnedBurstKey = newKey
      await nextTick()
      spawnBurst()
    }
  },
)

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize)
  }
  stopAnimation()
})
</script>

<template>
  <div
    v-if="active"
    data-test="confetti-overlay"
    class="pointer-events-none fixed inset-0 z-50 overflow-hidden select-none will-change-transform"
    aria-hidden="true"
  >
    <canvas
      ref="canvasRef"
      data-test="confetti-canvas"
      class="w-full h-full block"
    />
  </div>
</template>
