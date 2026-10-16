export const AVATAR_PALETTE = [
  '#0284c7', // Sky 600
  '#7c3aed', // Violet 600
  '#059669', // Emerald 600
  '#d97706', // Amber 600
  '#e11d48', // Rose 600
  '#4f46e5', // Indigo 600
  '#0891b2', // Cyan 600
  '#c026d3', // Fuchsia 600
] as const

export function normalizeChannelSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isValidChannelSlug(slug: string): boolean {
  if (slug.length < 2 || slug.length > 32) {
    return false
  }
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}

export function getAvatarInitials(displayName: string): string {
  const clean = displayName.trim()
  if (!clean) return '?'

  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0][0] || ''
    const second = parts[1][0] || ''
    return `${first}${second}`.toUpperCase()
  }

  const single = parts[0] || ''
  if (single.length >= 2) {
    return single.slice(0, 2).toUpperCase()
  }
  return single.toUpperCase()
}

export function getAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[index]
}

export function calculateBackoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000)
}

export function isValidMessageContent(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.length > 0 && content.length <= 4000
}

export function shouldSendOnKeydown(event: {
  key: string
  shiftKey: boolean
  isComposing?: boolean
}): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing
}
