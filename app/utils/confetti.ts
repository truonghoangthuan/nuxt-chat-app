export type ConfettiShape = 'rect' | 'circle' | 'strip'

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

export function createRaycastConfettiBurst(
  width: number,
  height: number,
  countPerCannon = 45,
): ConfettiParticle[] {
  const safeW = width > 0 ? width : 1280
  const safeH = height > 0 ? height : 800
  const particles: ConfettiParticle[] = []

  // Left Cannon (fires up and right: angle ~60deg +/- 26deg)
  for (let i = 0; i < countPerCannon; i++) {
    const angleDeg = 60 + (Math.random() - 0.5) * 52
    const angleRad = (angleDeg * Math.PI) / 180
    const speed = 25 + Math.random() * 22
    const shapeRoll = Math.random()
    const shape: ConfettiShape = shapeRoll < 0.6 ? 'rect' : shapeRoll < 0.85 ? 'strip' : 'circle'

    particles.push({
      x: Math.random() * 24,
      y: safeH * 0.98 + Math.random() * 10,
      vx: Math.cos(angleRad) * speed,
      vy: -Math.sin(angleRad) * speed,
      color: RAYCAST_CONFETTI_COLORS[Math.floor(Math.random() * RAYCAST_CONFETTI_COLORS.length)],
      shape,
      size: 7 + Math.random() * 5,
      aspect: shape === 'strip' ? 2.6 + Math.random() * 1.4 : 1,
      gravity: 0.6 + Math.random() * 0.15,
      drag: 0.905 + Math.random() * 0.015,
      wobble: Math.random() * 10,
      wobbleSpeed: 0.06 + Math.random() * 0.08,
      tiltAngle: Math.random() * Math.PI,
      tiltSpeed: 0.08 + Math.random() * 0.12,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.12,
      opacity: 1,
      ticks: 0,
      maxTicks: 130 + Math.floor(Math.random() * 60),
    })
  }

  // Right Cannon (fires up and left: angle ~120deg +/- 26deg)
  for (let i = 0; i < countPerCannon; i++) {
    const angleDeg = 120 + (Math.random() - 0.5) * 52
    const angleRad = (angleDeg * Math.PI) / 180
    const speed = 25 + Math.random() * 22
    const shapeRoll = Math.random()
    const shape: ConfettiShape = shapeRoll < 0.6 ? 'rect' : shapeRoll < 0.85 ? 'strip' : 'circle'

    particles.push({
      x: safeW - Math.random() * 24,
      y: safeH * 0.98 + Math.random() * 10,
      vx: Math.cos(angleRad) * speed,
      vy: -Math.sin(angleRad) * speed,
      color: RAYCAST_CONFETTI_COLORS[Math.floor(Math.random() * RAYCAST_CONFETTI_COLORS.length)],
      shape,
      size: 7 + Math.random() * 5,
      aspect: shape === 'strip' ? 2.6 + Math.random() * 1.4 : 1,
      gravity: 0.6 + Math.random() * 0.15,
      drag: 0.905 + Math.random() * 0.015,
      wobble: Math.random() * 10,
      wobbleSpeed: 0.06 + Math.random() * 0.08,
      tiltAngle: Math.random() * Math.PI,
      tiltSpeed: 0.08 + Math.random() * 0.12,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.12,
      opacity: 1,
      ticks: 0,
      maxTicks: 130 + Math.floor(Math.random() * 60),
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
  const active: ConfettiParticle[] = []

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.ticks += dtScale

    // Drag damping & gravity
    const dragFactor = Math.pow(p.drag, dtScale)
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
      active.push(p)
    }
  }

  return active
}

export function drawConfettiParticles(
  ctx: CanvasRenderingContext2D,
  particles: ConfettiParticle[],
): void {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation)

    // 3D paper flip transformation
    const scaleX = Math.cos(p.tiltAngle)
    const scaleY = Math.abs(Math.sin(p.tiltAngle * 0.8)) || 0.35
    ctx.scale(scaleX, scaleY)

    ctx.globalAlpha = p.opacity
    ctx.fillStyle = p.color

    if (p.shape === 'circle') {
      ctx.beginPath()
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const w = p.size
      const h = p.size * p.aspect
      ctx.fillRect(-w / 2, -h / 2, w, h)
    }

    ctx.restore()
  }
}
