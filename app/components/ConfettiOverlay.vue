<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
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

function resizeCanvas(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number } {
  const rect = canvas.getBoundingClientRect()
  const width = rect.width || window?.innerWidth || 1280
  const height = rect.height || window?.innerHeight || 800
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr
    canvas.height = height * dpr
  }

  return { width, height, dpr }
}

function spawnBurst() {
  if (isReducedMotion()) {
    emit('complete')
    return
  }

  const canvas = canvasRef.value
  let width = 1280
  let height = 800

  if (canvas) {
    const info = resizeCanvas(canvas)
    width = info.width
    height = info.height
  } else if (typeof window !== 'undefined') {
    width = window.innerWidth || 1280
    height = window.innerHeight || 800
  }

  const chosenEffect = props.effect || pickRandomCelebrationEffect()
  const newWave = createRaycastConfettiBurst(width, height, undefined, chosenEffect)
  particles.push(...newWave)

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

    const { width, height, dpr } = resizeCanvas(canvas)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)

    particles = stepConfettiParticles(particles, width, height, dtScale)
    drawConfettiParticles(ctx, particles)

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

onBeforeUnmount(() => {
  stopAnimation()
})
</script>

<template>
  <div
    v-if="active"
    data-test="confetti-overlay"
    class="pointer-events-none fixed inset-0 z-50 overflow-hidden select-none"
    aria-hidden="true"
  >
    <canvas
      ref="canvasRef"
      data-test="confetti-canvas"
      class="w-full h-full block"
    />
  </div>
</template>
