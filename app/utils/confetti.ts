export type CelebrationEffect = 'confetti' | 'pets' | 'water' | 'party'
export type ConfettiShape = 'rect' | 'circle' | 'strip' | 'droplet' | 'emoji'

export const CELEBRATION_EFFECTS: CelebrationEffect[] = ['confetti', 'pets', 'water', 'party']

export interface ConfettiParticle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  shape: ConfettiShape
  size: number
  aspect: number
  gravity: number
  drag: number
  wobble: number
  wobbleSpeed: number
  tiltAngle: number
  tiltSpeed: number
  rotation: number
  rotationSpeed: number
  opacity: number
  ticks: number
  maxTicks: number
  effect?: CelebrationEffect
  emoji?: string
}

export const RAYCAST_CONFETTI_COLORS = [
  '#FF6363', // coral red
  '#FF9F43', // amber orange
  '#FECA57', // warm yellow
  '#1DD1A1', // mint green
  '#48DBFB', // cyan
  '#54A0FF', // electric blue
  '#A29BFE', // soft purple
  '#FF78C4', // hot pink
]

export const WATER_COLORS = [
  '#38BDF8', // light sky blue
  '#0EA5E9', // ocean blue
  '#7DD3FC', // pale cyan
  '#BAE6FD', // crisp droplet blue
  '#0284C7', // deep water
]

const PET_EMOJIS = ['🐕', '🐩', '🐈', '🐈‍⬛', '🐶', '🐱', '🐾', '🦴', '🐟']
const WATER_EMOJIS = ['🌊', '💧', '🫧', '🦆', '🐳']
const PARTY_EMOJIS = ['🐸', '🦆', '🚀', '🌮', '🍕', '🎉', '🦄', '🦖', '🪩', '🔥']

export function pickRandomCelebrationEffect(rng: () => number = Math.random): CelebrationEffect {
  const index = Math.min(CELEBRATION_EFFECTS.length - 1, Math.floor(rng() * CELEBRATION_EFFECTS.length))
  return CELEBRATION_EFFECTS[index]
}

export function createRaycastConfettiBurst(
  width: number,
  height: number,
  countPerCannon = 80,
  effect: CelebrationEffect = 'confetti',
): ConfettiParticle[] {
  const safeW = width > 0 ? width : 1280
  const safeH = height > 0 ? height : 800
  const particles: ConfettiParticle[] = []

  if (effect === 'pets') {
    // Walking dogs & cats stampede trotting across horizontal screen lanes
    const petCount = 28
    for (let i = 0; i < petCount; i++) {
      const fromLeft = i % 2 === 0
      const emoji = PET_EMOJIS[Math.floor(Math.random() * PET_EMOJIS.length)]
      const speed = 4.5 + Math.random() * 5
      const vx = fromLeft ? speed : -speed
      const x = fromLeft ? -30 + Math.random() * 50 : safeW + 30 - Math.random() * 50
      const laneProgress = (i + 0.5) / petCount
      const y = safeH * (0.2 + laneProgress * 0.72)

      particles.push({
        x,
        y,
        vx,
        vy: 0,
        color: '#FFFFFF',
        shape: 'emoji',
        size: 32 + Math.random() * 20,
        aspect: 1,
        gravity: 0,
        drag: 1,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.22 + Math.random() * 0.12,
        tiltAngle: 0,
        tiltSpeed: 0,
        rotation: 0,
        rotationSpeed: 0,
        opacity: 1,
        ticks: 0,
        maxTicks: 240 + Math.floor(Math.random() * 60),
        effect: 'pets',
        emoji,
      })
    }
    return particles
  }

  if (effect === 'water') {
    // Water splash & glossy teardrop spray
    const waterCount = Math.max(30, countPerCannon)
    for (let i = 0; i < waterCount; i++) {
      const fromLeft = i % 2 === 0
      const angleDeg = fromLeft
        ? 55 + (Math.random() - 0.5) * 45
        : 125 + (Math.random() - 0.5) * 45
      const angleRad = (angleDeg * Math.PI) / 180
      const speed = 36 + Math.random() * 32
      const isEmoji = Math.random() < 0.35
      const emoji = isEmoji ? WATER_EMOJIS[Math.floor(Math.random() * WATER_EMOJIS.length)] : undefined

      particles.push({
        x: fromLeft ? Math.random() * 30 : safeW - Math.random() * 30,
        y: safeH * 0.98 + Math.random() * 10,
        vx: Math.cos(angleRad) * speed,
        vy: -Math.sin(angleRad) * speed,
        color: WATER_COLORS[Math.floor(Math.random() * WATER_COLORS.length)],
        shape: isEmoji ? 'emoji' : 'droplet',
        size: isEmoji ? 26 + Math.random() * 18 : 14 + Math.random() * 14,
        aspect: 1,
        gravity: 0.55 + Math.random() * 0.2,
        drag: 0.93,
        wobble: Math.random() * 10,
        wobbleSpeed: 0.08 + Math.random() * 0.08,
        tiltAngle: Math.random() * Math.PI,
        tiltSpeed: 0.05 + Math.random() * 0.05,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        opacity: 1,
        ticks: 0,
        maxTicks: 160 + Math.floor(Math.random() * 50),
        effect: 'water',
        emoji,
      })
    }
    return particles
  }

  if (effect === 'party') {
    // Chaos meme cannon with dancing funny emojis & oversized ribbons
    const partyCount = Math.max(30, countPerCannon)
    for (let i = 0; i < partyCount; i++) {
      const fromLeft = i % 2 === 0
      const angleDeg = fromLeft
        ? 60 + (Math.random() - 0.5) * 58
        : 120 + (Math.random() - 0.5) * 58
      const angleRad = (angleDeg * Math.PI) / 180
      const speed = 40 + Math.random() * 34
      const isEmoji = Math.random() < 0.7
      const emoji = isEmoji ? PARTY_EMOJIS[Math.floor(Math.random() * PARTY_EMOJIS.length)] : undefined

      particles.push({
        x: fromLeft ? Math.random() * 30 : safeW - Math.random() * 30,
        y: safeH * 0.98 + Math.random() * 10,
        vx: Math.cos(angleRad) * speed,
        vy: -Math.sin(angleRad) * speed,
        color: RAYCAST_CONFETTI_COLORS[Math.floor(Math.random() * RAYCAST_CONFETTI_COLORS.length)],
        shape: isEmoji ? 'emoji' : 'strip',
        size: isEmoji ? 28 + Math.random() * 18 : 16 + Math.random() * 8,
        aspect: isEmoji ? 1 : 2.8 + Math.random() * 1.5,
        gravity: 0.58 + Math.random() * 0.15,
        drag: 0.925 + Math.random() * 0.015,
        wobble: Math.random() * 10,
        wobbleSpeed: 0.08 + Math.random() * 0.08,
        tiltAngle: Math.random() * Math.PI,
        tiltSpeed: 0.08 + Math.random() * 0.12,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.15,
        opacity: 1,
        ticks: 0,
        maxTicks: 160 + Math.floor(Math.random() * 60),
        effect: 'party',
        emoji,
      })
    }
    return particles
  }

  // Default: Mega Raycast Dual-Cannon Confetti (Bigger size, stronger launch speed)
  // Left Cannon (fires up and right: angle ~60deg +/- 26deg)
  for (let i = 0; i < countPerCannon; i++) {
    const angleDeg = 60 + (Math.random() - 0.5) * 52
    const angleRad = (angleDeg * Math.PI) / 180
    const speed = 42 + Math.random() * 34
    const shapeRoll = Math.random()
    const shape: ConfettiShape = shapeRoll < 0.6 ? 'rect' : shapeRoll < 0.85 ? 'strip' : 'circle'

    particles.push({
      x: Math.random() * 24,
      y: safeH * 0.98 + Math.random() * 10,
      vx: Math.cos(angleRad) * speed,
      vy: -Math.sin(angleRad) * speed,
      color: RAYCAST_CONFETTI_COLORS[Math.floor(Math.random() * RAYCAST_CONFETTI_COLORS.length)],
      shape,
      size: 12 + Math.random() * 10,
      aspect: shape === 'strip' ? 2.6 + Math.random() * 1.4 : 1,
      gravity: 0.6 + Math.random() * 0.15,
      drag: 0.92 + Math.random() * 0.02,
      wobble: Math.random() * 10,
      wobbleSpeed: 0.06 + Math.random() * 0.08,
      tiltAngle: Math.random() * Math.PI,
      tiltSpeed: 0.08 + Math.random() * 0.12,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.12,
      opacity: 1,
      ticks: 0,
      maxTicks: 150 + Math.floor(Math.random() * 70),
      effect: 'confetti',
    })
  }

  // Right Cannon (fires up and left: angle ~120deg +/- 26deg)
  for (let i = 0; i < countPerCannon; i++) {
    const angleDeg = 120 + (Math.random() - 0.5) * 52
    const angleRad = (angleDeg * Math.PI) / 180
    const speed = 42 + Math.random() * 34
    const shapeRoll = Math.random()
    const shape: ConfettiShape = shapeRoll < 0.6 ? 'rect' : shapeRoll < 0.85 ? 'strip' : 'circle'

    particles.push({
      x: safeW - Math.random() * 24,
      y: safeH * 0.98 + Math.random() * 10,
      vx: Math.cos(angleRad) * speed,
      vy: -Math.sin(angleRad) * speed,
      color: RAYCAST_CONFETTI_COLORS[Math.floor(Math.random() * RAYCAST_CONFETTI_COLORS.length)],
      shape,
      size: 12 + Math.random() * 10,
      aspect: shape === 'strip' ? 2.6 + Math.random() * 1.4 : 1,
      gravity: 0.6 + Math.random() * 0.15,
      drag: 0.92 + Math.random() * 0.02,
      wobble: Math.random() * 10,
      wobbleSpeed: 0.06 + Math.random() * 0.08,
      tiltAngle: Math.random() * Math.PI,
      tiltSpeed: 0.08 + Math.random() * 0.12,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.12,
      opacity: 1,
      ticks: 0,
      maxTicks: 150 + Math.floor(Math.random() * 70),
      effect: 'confetti',
    })
  }

  return particles
}

export function stepConfettiParticles(
  particles: ConfettiParticle[],
  width: number,
  height: number,
  dtScale = 1,
): ConfettiParticle[] {
  const safeW = width > 0 ? width : 1280
  const safeH = height > 0 ? height : 800
  let writeIdx = 0
  const isDtOne = Math.abs(dtScale - 1) < 0.001

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.ticks += dtScale

    if (p.effect === 'pets') {
      // Walking pets trotting across screen
      p.x += p.vx * dtScale
      p.wobble += p.wobbleSpeed * dtScale
      p.y += Math.sin(p.wobble) * 2.2 * dtScale
      p.rotation = Math.sin(p.wobble) * 0.16

      // Late fadeout near exit
      const fadeStart = p.maxTicks * 0.75
      if (p.ticks > fadeStart) {
        const remainingProgress = (p.ticks - fadeStart) / (p.maxTicks - fadeStart)
        p.opacity = Math.max(0, 1 - remainingProgress)
      }

      if (
        p.opacity > 0.01 &&
        p.ticks < p.maxTicks &&
        ((p.vx > 0 && p.x <= safeW + 80) || (p.vx < 0 && p.x >= -80))
      ) {
        particles[writeIdx++] = p
      }
      continue
    }

    // Drag damping & gravity
    const dragFactor = isDtOne ? p.drag : Math.pow(p.drag, dtScale)
    p.vx *= dragFactor
    p.vy = p.vy * dragFactor + p.gravity * dtScale

    // Position updates with subtle lateral flutter
    p.x += (p.vx + Math.sin(p.wobble) * 1.2) * dtScale
    p.y += p.vy * dtScale

    // Oscillations
    p.wobble += p.wobbleSpeed * dtScale
    p.tiltAngle += p.tiltSpeed * dtScale
    p.rotation += p.rotationSpeed * dtScale

    // Late-stage opacity fadeout
    const fadeStart = p.maxTicks * 0.65
    if (p.ticks > fadeStart) {
      const remainingProgress = (p.ticks - fadeStart) / (p.maxTicks - fadeStart)
      p.opacity = Math.max(0, 1 - remainingProgress)
    }

    // Cull dead particles
    if (p.opacity > 0.01 && p.y <= safeH + 40 && p.x >= -120 && p.x <= safeW + 120) {
      particles[writeIdx++] = p
    }
  }

  particles.length = writeIdx
  return particles
}

const BASE_EMOJI_FONT_SIZE = 32
const EMOJI_FONT = "32px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"

const emojiSpriteCache = new Map<string, HTMLCanvasElement | null>()

function getEmojiSprite(emoji: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const cached = emojiSpriteCache.get(emoji)
  if (cached !== undefined) return cached

  try {
    const spriteCanvas = document.createElement('canvas')
    spriteCanvas.width = 64
    spriteCanvas.height = 64
    const sCtx = spriteCanvas.getContext('2d')
    if (!sCtx) {
      emojiSpriteCache.set(emoji, null)
      return null
    }
    sCtx.font = EMOJI_FONT
    sCtx.textAlign = 'center'
    sCtx.textBaseline = 'middle'
    sCtx.fillText(emoji, 32, 32)
    emojiSpriteCache.set(emoji, spriteCanvas)
    return spriteCanvas
  } catch {
    emojiSpriteCache.set(emoji, null)
    return null
  }
}

export function drawConfettiParticles(
  ctx: CanvasRenderingContext2D,
  particles: ConfettiParticle[],
  dpr = 1,
): void {
  if (particles.length === 0) return

  const hasSetTransform = typeof ctx.setTransform === 'function'

  // Pre-configure font & baseline once to avoid font-parser thrashing
  ctx.font = EMOJI_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (hasSetTransform) {
    ctx.save()
  }

  let lastFillStyle = ''
  let lastAlpha = -1

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    let scaleX = 1
    let scaleY = 1

    if (p.shape === 'emoji') {
      const scale = p.size / BASE_EMOJI_FONT_SIZE
      scaleX = (p.effect === 'pets' && p.vx > 0) ? -scale : scale
      scaleY = scale
    } else if (p.shape === 'confetti' || p.shape === 'rect' || p.shape === 'circle' || p.shape === 'strip') {
      scaleX = Math.cos(p.tiltAngle)
      scaleY = Math.abs(Math.sin(p.tiltAngle * 0.8)) || 0.35
    }

    if (hasSetTransform) {
      const cos = Math.cos(p.rotation)
      const sin = Math.sin(p.rotation)
      ctx.setTransform(
        cos * scaleX * dpr,
        sin * scaleX * dpr,
        -sin * scaleY * dpr,
        cos * scaleY * dpr,
        p.x * dpr,
        p.y * dpr,
      )
    } else {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.scale(scaleX, scaleY)
    }

    if (lastAlpha !== p.opacity) {
      ctx.globalAlpha = p.opacity
      lastAlpha = p.opacity
    }

    if (p.shape === 'emoji') {
      const sprite = getEmojiSprite(p.emoji || '🎉')
      if (sprite && typeof ctx.drawImage === 'function') {
        const half = BASE_EMOJI_FONT_SIZE / 2
        ctx.drawImage(sprite, -half, -half, BASE_EMOJI_FONT_SIZE, BASE_EMOJI_FONT_SIZE)
      } else {
        ctx.fillText(p.emoji || '🎉', 0, 0)
      }
      if (!hasSetTransform) ctx.restore()
      continue
    }

    if (p.shape === 'droplet') {
      const r = p.size / 2
      if (lastFillStyle !== p.color) {
        ctx.fillStyle = p.color
        lastFillStyle = p.color
      }
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      lastFillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.beginPath()
      ctx.arc(-r * 0.22, -r * 0.22, r * 0.25, 0, Math.PI * 2)
      ctx.fill()
      if (!hasSetTransform) ctx.restore()
      continue
    }

    if (lastFillStyle !== p.color) {
      ctx.fillStyle = p.color
      lastFillStyle = p.color
    }

    if (p.shape === 'circle') {
      ctx.beginPath()
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const w = p.size
      const h = p.size * p.aspect
      ctx.fillRect(-w / 2, -h / 2, w, h)
    }

    if (!hasSetTransform) {
      ctx.restore()
    }
  }

  if (hasSetTransform) {
    ctx.restore()
  }
}

export const STORAGE_KEY_CONFETTI = 'nuxt-chat-confetti-enabled'

export function getConfettiEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  const val = localStorage.getItem(STORAGE_KEY_CONFETTI)
  return val !== 'false'
}

export function setConfettiEnabled(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_CONFETTI, String(enabled))
  }
}

export function normalizeConfettiWord(word: string): string {
  return word.trim().toLowerCase()
}

export function sanitizeConfettiWords(words: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of words) {
    for (const part of raw.split(',')) {
      const normalized = normalizeConfettiWord(part)
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        result.push(normalized)
      }
    }
  }
  return result
}

export function matchesConfettiDictionary(
  text: string | null | undefined,
  dictionary: string[] | null | undefined,
): boolean {
  if (!text || !dictionary || dictionary.length === 0) return false
  const haystack = text.toLowerCase()
  for (const entry of dictionary) {
    const needle = normalizeConfettiWord(entry)
    if (needle && haystack.includes(needle)) {
      return true
    }
  }
  return false
}

