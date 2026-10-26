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
  const rect = canvas.getBoundingClientRect()
  cachedWidth = rect.width || window?.innerWidth || 1280
  cachedHeight = rect.height || window?.innerHeight || 800
  cachedDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

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
  const newWave = createRaycastConfettiBurst(width, height, undefined, chosenEffect)
  particles.push(...newWave)

  // Cap particles to prevent frame drops on rapid typing
  if (particles.length > 140) {
    particles = particles.slice(-140)
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
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(cachedDpr, cachedDpr)

    particles = stepConfettiParticles(particles, cachedWidth, cachedHeight, dtScale)
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
