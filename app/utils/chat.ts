import type { ChatMessage, TimelineMessageItem, MessageReaction, ReactionSummary } from '~/types/chat'

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

export const GROUPING_WINDOW_MS = 5 * 60 * 1000

export const REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '🔥',
  '😮',
  '😢',
  '👀',
] as const

export function isValidReactionEmoji(emoji: string): boolean {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji)
}

export function summarizeReactions(
  reactions: MessageReaction[] | undefined,
  currentUserId?: string,
): ReactionSummary[] {
  if (!reactions || reactions.length === 0) {
    return []
  }

  const map = new Map<string, Set<string>>()
  for (const r of reactions) {
    if (!r || !r.emoji || !r.user_id) continue
    let set = map.get(r.emoji)
    if (!set) {
      set = new Set<string>()
      map.set(r.emoji, set)
    }
    set.add(r.user_id)
  }

  const summaries: ReactionSummary[] = []
  for (const [emoji, userSet] of map.entries()) {
    const userIds = Array.from(userSet)
    summaries.push({
      emoji,
      count: userIds.length,
      userIds,
      reactedByMe: Boolean(currentUserId && userSet.has(currentUserId)),
    })
  }
  return summaries
}

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

export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 40
}

export function isValidAvatarColor(color: string): boolean {
  return (AVATAR_PALETTE as readonly string[]).includes(color)
}

function getLocalDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateDivider(isoString: string, now: Date = new Date()): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const targetKey = getLocalDayKey(date)
  const todayKey = getLocalDayKey(now)
  if (targetKey === todayKey) {
    return 'Today'
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (targetKey === getLocalDayKey(yesterday)) {
    return 'Yesterday'
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function buildMessageTimeline(
  messages: ChatMessage[],
  now: Date = new Date(),
): TimelineMessageItem[] {
  return messages.map((msg, index) => {
    const currDate = new Date(msg.created_at)
    const currDayKey = Number.isNaN(currDate.getTime()) ? '' : getLocalDayKey(currDate)
    const dateLabel = formatDateDivider(msg.created_at, now)

    if (index === 0) {
      return {
        message: msg,
        showDateDivider: true,
        dateLabel,
        isCompact: false,
      }
    }

    const prev = messages[index - 1]
    const prevDate = new Date(prev.created_at)
    const prevDayKey = Number.isNaN(prevDate.getTime()) ? '' : getLocalDayKey(prevDate)
    const showDateDivider = currDayKey !== prevDayKey

    const timeDiffMs = Math.abs(currDate.getTime() - prevDate.getTime())
    const isCompact = !showDateDivider
      && !msg.reply_to_id
      && prev.user_id === msg.user_id
      && !Number.isNaN(timeDiffMs)
      && timeDiffMs <= GROUPING_WINDOW_MS

    return {
      message: msg,
      showDateDivider,
      dateLabel,
      isCompact,
    }
  })
}

export function shouldSendOnKeydown(event: {
  key: string
  shiftKey: boolean
  isComposing?: boolean
}): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing
}
