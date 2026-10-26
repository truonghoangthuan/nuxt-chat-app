import type {
  ChatMessage,
  TimelineMessageItem,
  MessageReaction,
  ReactionSummary,
  MentionSegment,
  ActiveMentionQuery,
  Channel,
  Conversation,
  Profile,
  ChatBackgroundPreset,
  ExtractedMediaItem,
  ExtractedLinkItem,
  SystemMessagePayload,
} from '~/types/chat'
import { isImagePayload, parseImagePayload } from '~/utils/image'

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

export function getAvatarInitials(displayName: string): string {
  const clean = displayName.trim()
  if (!clean) return '?'

  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = Array.from(parts[0])[0] || ''
    const second = Array.from(parts[1])[0] || ''
    return `${first}${second}`.toUpperCase()
  }

  const singleChars = Array.from(parts[0] || '')
  if (singleChars.length >= 2) {
    return singleChars.slice(0, 2).join('').toUpperCase()
  }
  return singleChars.join('').toUpperCase()
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

export function isValidAvatarUrl(value: string): boolean {
  const url = value.trim()
  if (!url) return true
  if (url.length > 2048) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
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

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractActiveMentionQuery(
  text: string,
  cursorIndex: number,
): ActiveMentionQuery | null {
  if (!text || cursorIndex < 0) return null
  const prefix = text.slice(0, cursorIndex)
  const match = prefix.match(/(?:^|\s)@([^\s@]{0,40})$/)
  if (!match) return null

  const query = match[1] || ''
  const startIndex = cursorIndex - query.length - 1
  return {
    query,
    startIndex,
    endIndex: cursorIndex,
  }
}

export function applyMentionAutocomplete(
  text: string,
  activeQuery: ActiveMentionQuery,
  displayName: string,
): string {
  const before = text.slice(0, activeQuery.startIndex)
  const after = text.slice(activeQuery.endIndex)
  return `${before}@${displayName} ${after}`
}

export function doesMessageMentionUser(
  content: string,
  displayName?: string | null,
): boolean {
  const cleanName = displayName?.trim()
  if (!content || !cleanName) return false

  const escaped = escapeRegExp(cleanName)
  const regex = new RegExp(`(?:^|\\s)@${escaped}(?=$|\\s|[.,!?:;])`, 'i')
  return regex.test(content)
}

export function tokenizeMessageMentions(
  content: string,
  currentDisplayName?: string | null,
  knownDisplayNames: string[] = [],
): MentionSegment[] {
  if (!content) return []

  const cleanCurrent = currentDisplayName?.trim() || ''
  const namesSet = new Set<string>()
  if (cleanCurrent) namesSet.add(cleanCurrent)
  for (const name of knownDisplayNames) {
    if (name && name.trim()) namesSet.add(name.trim())
  }

  // Sort longer names first so "@Alice Wonderland" matches before "@Alice"
  const sortedNames = Array.from(namesSet).sort((a, b) => b.length - a.length)
  const escapedKnown = sortedNames.map(escapeRegExp)
  const patternParts = [...escapedKnown, '[A-Za-z0-9_.-]+']
  const mentionPattern = '(@(?:' + patternParts.join('|') + '))(?=$|\\s|[.,!?:;])'
  const urlPattern = '(https?:\\/\\/[^\\s<>"\'`{}|\\\\^]+)'

  // Split by inline code blocks first: `code`
  const codeRegex = /`([^`\n]+)`/g
  const rawSegments: { text: string; isCode: boolean }[] = []
  let lastIdx = 0
  let codeMatch: RegExpExecArray | null

  while ((codeMatch = codeRegex.exec(content)) !== null) {
    if (codeMatch.index > lastIdx) {
      rawSegments.push({ text: content.slice(lastIdx, codeMatch.index), isCode: false })
    }
    rawSegments.push({ text: codeMatch[1], isCode: true })
    lastIdx = codeMatch.index + codeMatch[0].length
  }
  if (lastIdx < content.length) {
    rawSegments.push({ text: content.slice(lastIdx), isCode: false })
  }

  const result: MentionSegment[] = []

  for (const seg of rawSegments) {
    if (seg.isCode) {
      result.push({
        text: seg.text,
        isMention: false,
        isMe: false,
        isCode: true,
      })
      continue
    }

    const subText = seg.text
    const combinedRegex = new RegExp(mentionPattern + '|' + urlPattern, 'gi')
    let subLastIdx = 0
    let match: RegExpExecArray | null

    while ((match = combinedRegex.exec(subText)) !== null) {
      const matchIndex = match.index
      const mentionToken = match[1]
      const urlToken = match[2]

      if (mentionToken) {
        const prevChar = matchIndex > 0 ? subText[matchIndex - 1] : ''
        if (prevChar && !/\s/.test(prevChar)) {
          continue
        }

        if (matchIndex > subLastIdx) {
          result.push({
            text: subText.slice(subLastIdx, matchIndex),
            isMention: false,
            isMe: false,
          })
        }

        const rawName = mentionToken.slice(1)
        const isMe = Boolean(cleanCurrent && rawName.toLowerCase() === cleanCurrent.toLowerCase())
        result.push({
          text: mentionToken,
          isMention: true,
          isMe,
        })
        subLastIdx = matchIndex + mentionToken.length
      } else if (urlToken) {
        let cleanUrl = urlToken
        while (/[.,!?:;)\]]$/.test(cleanUrl)) {
          cleanUrl = cleanUrl.slice(0, -1)
        }

        if (matchIndex > subLastIdx) {
          result.push({
            text: subText.slice(subLastIdx, matchIndex),
            isMention: false,
            isMe: false,
          })
        }

        result.push({
          text: cleanUrl,
          isMention: false,
          isMe: false,
          isLink: true,
          href: cleanUrl,
        })

        subLastIdx = matchIndex + cleanUrl.length
        combinedRegex.lastIndex = subLastIdx
      }
    }

    if (subLastIdx < subText.length) {
      result.push({
        text: subText.slice(subLastIdx),
        isMention: false,
        isMe: false,
      })
    }
  }

  // Merge consecutive plain text segments if any
  const merged: MentionSegment[] = []
  for (const item of result) {
    const prev = merged[merged.length - 1]
    if (prev && !prev.isMention && !prev.isLink && !prev.isCode && !item.isMention && !item.isLink && !item.isCode) {
      prev.text += item.text
    } else {
      merged.push({ ...item })
    }
  }

  return merged.length > 0 ? merged : [{ text: content, isMention: false, isMe: false }]
}

export function buildMessageTimeline(
  messages: ChatMessage[],
  now: Date = new Date(),
  options?: {
    lastReadAt?: string | null
    currentUserId?: string
    currentDisplayName?: string | null
    isGroup?: boolean
  },
): TimelineMessageItem[] {
  const lastReadMs = options?.lastReadAt ? Date.parse(options.lastReadAt) : Number.NaN
  const hasValidLastRead = !Number.isNaN(lastReadMs)
  let unreadDividerPlaced = false

  return messages.map((msg, index) => {
    const currDate = new Date(msg.created_at)
    const currTimeMs = currDate.getTime()
    const currDayKey = Number.isNaN(currTimeMs) ? '' : getLocalDayKey(currDate)
    const dateLabel = formatDateDivider(msg.created_at, now)

    const isFromOtherUser = !options?.currentUserId || msg.user_id !== options.currentUserId
    let showUnreadDivider = false
    if (
      !unreadDividerPlaced
      && hasValidLastRead
      && !msg.deleted_at
      && isFromOtherUser
      && !Number.isNaN(currTimeMs)
      && currTimeMs > lastReadMs
    ) {
      showUnreadDivider = true
      unreadDividerPlaced = true
    }

    const isMentioningMe = Boolean(
      !msg.deleted_at
      && isFromOtherUser
      && (
        doesMessageMentionUser(msg.content, options?.currentDisplayName)
        || (options?.currentUserId && msg.reply_to?.user_id === options.currentUserId)
      ),
    )

    const isSender = Boolean(options?.currentUserId && msg.user_id === options.currentUserId)

    let showDateDivider = true
    let isCompact = false
    let isFirstInGroup = true

    if (index > 0) {
      const prev = messages[index - 1]
      const prevDate = new Date(prev.created_at)
      const prevTimeMs = prevDate.getTime()
      const prevDayKey = Number.isNaN(prevTimeMs) ? '' : getLocalDayKey(prevDate)
      showDateDivider = currDayKey !== prevDayKey

      const timeDiffMs = Math.abs(currTimeMs - prevTimeMs)
      const sameUser = prev.user_id === msg.user_id
      const withinWindow = !Number.isNaN(timeDiffMs) && timeDiffMs <= GROUPING_WINDOW_MS
      const sameDay = !showDateDivider

      isCompact = !showDateDivider
        && !showUnreadDivider
        && !msg.reply_to_id
        && sameUser
        && withinWindow

      const continuesPrevGroup = sameUser && sameDay && withinWindow
      isFirstInGroup = !continuesPrevGroup
    }

    let isLastInGroup = true
    if (index < messages.length - 1) {
      const next = messages[index + 1]
      const nextDate = new Date(next.created_at)
      const nextTimeMs = nextDate.getTime()
      const nextDayKey = Number.isNaN(nextTimeMs) ? '' : getLocalDayKey(nextDate)
      const nextDateDivider = currDayKey !== nextDayKey

      const nextDiffMs = Math.abs(nextTimeMs - currTimeMs)
      const nextSameUser = next.user_id === msg.user_id
      const nextWithinWindow = !Number.isNaN(nextDiffMs) && nextDiffMs <= GROUPING_WINDOW_MS
      const nextSameDay = !nextDateDivider

      const nextContinuesThisGroup = nextSameUser && nextSameDay && nextWithinWindow
      isLastInGroup = !nextContinuesThisGroup
    }

    const showSenderHeader = Boolean(!isSender && options?.isGroup && isFirstInGroup)

    return {
      message: msg,
      showDateDivider,
      dateLabel,
      isCompact,
      isSender,
      isFirstInGroup,
      isLastInGroup,
      showSenderHeader,
      showUnreadDivider,
      isMentioningMe,
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

export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false
  const trimmed = email.trim()
  if (!trimmed) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export function getDirectPeer(
  conversation: Conversation,
  currentUserId?: string | null,
): Profile | null {
  if (conversation.type !== 'direct') {
    return null
  }

  if (conversation.peer) {
    if (!currentUserId || conversation.peer.id !== currentUserId) {
      return conversation.peer
    }
  }

  if (conversation.members && conversation.members.length > 0) {
    const peerMember = conversation.members.find(
      m => currentUserId ? m.user_id !== currentUserId : true,
    )
    if (peerMember?.profile) {
      return peerMember.profile
    }
  }

  return null
}

export function formatConversationTitle(
  conversation: Conversation,
  currentUserId?: string | null,
): string {
  if (conversation.type === 'direct') {
    const peer = getDirectPeer(conversation, currentUserId)
    if (peer?.display_name) {
      return peer.display_name
    }
    if (peer?.email) {
      return peer.email
    }
    return conversation.title || 'Direct Message'
  }

  return conversation.title || 'Group Chat'
}

export function formatConversationTime(
  conv: Conversation,
  now: Date = new Date(),
): string {
  const timestamp = conv.lastMessage?.created_at || conv.updated_at || conv.created_at
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const targetDay = getLocalDayKey(date)
  const today = getLocalDayKey(now)
  if (targetDay === today) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (targetDay === getLocalDayKey(yesterday)) {
    return 'Yesterday'
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export interface HighlightSegment {
  text: string
  isMatch: boolean
}

export function filterMessagesByKeyword(
  messages: ChatMessage[],
  query: string,
): ChatMessage[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return messages.filter((msg) => {
    if (msg.deleted_at || msg.encryption === 'undecryptable') {
      return false
    }

    if (isImagePayload(msg.content)) {
      const payload = parseImagePayload(msg.content)
      return Boolean(payload?.caption && payload.caption.toLowerCase().includes(q))
    }

    return msg.content.toLowerCase().includes(q)
  })
}

export function highlightTextSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const q = query.trim()
  if (!q || !text) {
    return [{ text, isMatch: false }]
  }

  const escaped = escapeRegExp(q)
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts
    .filter(Boolean)
    .map((part) => ({
      text: part,
      isMatch: part.toLowerCase() === q.toLowerCase(),
    }))
}

export const MAX_BACKGROUND_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = [
  {
    id: 'aurora',
    value: 'preset:aurora',
    label: 'Aurora Borealis',
    cssBackground: 'linear-gradient(135deg, #09203f 0%, #537895 100%)',
  },
  {
    id: 'sunset',
    value: 'preset:sunset',
    label: 'Sunset Glow',
    cssBackground: 'linear-gradient(135deg, #2b1055 0%, #7597de 100%)',
  },
  {
    id: 'midnight',
    value: 'preset:midnight',
    label: 'Midnight Sky',
    cssBackground: 'radial-gradient(ellipse at top, #1e293b 0%, #090d16 100%)',
  },
  {
    id: 'ocean',
    value: 'preset:ocean',
    label: 'Deep Ocean',
    cssBackground: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  },
  {
    id: 'cyberpunk',
    value: 'preset:cyberpunk',
    label: 'Neon Dream',
    cssBackground: 'linear-gradient(135deg, #240b36 0%, #c31432 100%)',
  },
  {
    id: 'forest',
    value: 'preset:forest',
    label: 'Misty Forest',
    cssBackground: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  },
]

export function validateBackgroundFile(file: { type: string; size: number }): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'File is required.' }
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowed.includes(file.type)) {
    return { valid: false, error: 'Only JPEG, PNG, WebP, or GIF images are allowed.' }
  }
  if (file.size > MAX_BACKGROUND_FILE_SIZE) {
    return { valid: false, error: 'Image size must be 5MB or less.' }
  }
  return { valid: true }
}

export function resolveChatBackgroundStyle(backgroundUrl?: string | null): Record<string, string> | null {
  if (!backgroundUrl || typeof backgroundUrl !== 'string') return null
  const trimmed = backgroundUrl.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('preset:')) {
    const preset = CHAT_BACKGROUND_PRESETS.find(p => p.value === trimmed)
    if (preset) {
      return {
        backgroundImage: preset.cssBackground,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const escaped = trimmed.replace(/"/g, '\\"')
    return {
      backgroundImage: `url("${escaped}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }

  return null
}

export function extractMediaFromMessages(messages: ChatMessage[]): ExtractedMediaItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const items: ExtractedMediaItem[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.deleted_at || msg.encryption === 'undecryptable') continue
    if (!isImagePayload(msg.content)) continue

    const payload = parseImagePayload(msg.content)
    if (!payload || !Array.isArray(payload.images)) continue

    payload.images.forEach((img, idx) => {
      items.push({
        id: `${msg.id || msg.client_id}-img-${idx}`,
        messageId: msg.id || msg.client_id,
        image: img,
        caption: payload.caption,
        createdAt: msg.created_at,
        author: msg.author,
        userId: msg.user_id,
      })
    })
  }

  return items
}

export function extractDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./i, '') || url
  } catch {
    return url
  }
}

export function extractLinksFromMessages(messages: ChatMessage[]): ExtractedLinkItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const items: ExtractedLinkItem[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.deleted_at || msg.encryption === 'undecryptable') continue

    const text = isImagePayload(msg.content)
      ? (parseImagePayload(msg.content)?.caption || '')
      : msg.content
    if (!text) continue

    const segments = tokenizeMessageMentions(text)
    let linkIdx = 0
    for (const seg of segments) {
      if (seg.isLink && seg.href) {
        items.push({
          id: `${msg.id || msg.client_id}-link-${linkIdx++}`,
          messageId: msg.id || msg.client_id,
          url: seg.href,
          domain: extractDomainFromUrl(seg.href),
          createdAt: msg.created_at,
          author: msg.author,
          userId: msg.user_id,
        })
      }
    }
  }

  return items
}

const CONFETTI_KEYWORD_REGEX = /(?<=^|[^\p{L}\p{N}_])(congratulations?|rõ\s+ràng|ok|cool)(?=$|[^\p{L}\p{N}_])/iu

export function shouldTriggerConfetti(content: string): boolean {
  if (!content || typeof content !== 'string') return false
  const text = isImagePayload(content)
    ? (parseImagePayload(content)?.caption || '')
    : content
  if (!text.trim()) return false
  return CONFETTI_KEYWORD_REGEX.test(text)
}

export function serializeSystemMessage(payload: SystemMessagePayload): string {
  return JSON.stringify(payload)
}

export function isSystemPayload(content?: string | null): boolean {
  if (!content || typeof content !== 'string') return false
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false
  try {
    const parsed = JSON.parse(trimmed)
    return Boolean(parsed && parsed.type === 'system' && parsed.event && parsed.actorName)
  } catch {
    return false
  }
}

export function parseSystemPayload(content?: string | null): SystemMessagePayload | null {
  if (!content || !isSystemPayload(content)) return null
  try {
    const parsed = JSON.parse(content.trim())
    if (parsed && parsed.type === 'system' && parsed.event && parsed.actorName) {
      return parsed as SystemMessagePayload
    }
    return null
  } catch {
    return null
  }
}

export function formatSystemMessageText(payload: SystemMessagePayload): string {
  switch (payload.event) {
    case 'buzz':
      return `⚡ ${payload.actorName} buzzed the chat!`
    case 'group_rename':
      return `${payload.actorName} changed the group name to "${payload.detail || ''}"`
    case 'background_change':
      return `${payload.actorName} changed the chat wallpaper${payload.detail ? ` to ${payload.detail}` : ''}`
    case 'background_reset':
      return `${payload.actorName} reset the chat wallpaper`
    default:
      return `${payload.actorName} updated the conversation`
  }
}

export function computeSeenByMessageId(params: {
  messages: ChatMessage[]
  readsByUser?: Record<string, string>
  profiles: Profile[]
  currentUserId?: string
}): Record<string, Profile[]> {
  const result: Record<string, Profile[]> = {}
  if (!Array.isArray(params.messages) || params.messages.length === 0 || !params.readsByUser) {
    return result
  }

  const profilesById = new Map<string, Profile>()
  for (const p of params.profiles) {
    if (p && p.id) {
      profilesById.set(p.id, p)
    }
  }

  // Eligible confirmed messages sorted oldest to newest
  const validMessages = params.messages.filter(m => !m.deleted_at && m.status === 'sent')
  if (validMessages.length === 0) {
    return result
  }

  for (const [userId, readIso] of Object.entries(params.readsByUser)) {
    if (!readIso || (params.currentUserId && userId === params.currentUserId)) {
      continue
    }

    const readMs = Date.parse(readIso)
    if (Number.isNaN(readMs)) {
      continue
    }

    const profile = profilesById.get(userId) || {
      id: userId,
      email: '',
      display_name: 'Friend',
      avatar_color: '#0284c7',
    }

    // Find latest non-deleted confirmed message created_at <= readMs and not authored by user
    let latestReadMsg: ChatMessage | null = null
    for (let i = validMessages.length - 1; i >= 0; i--) {
      const msg = validMessages[i]
      const msgMs = Date.parse(msg.created_at)
      if (!Number.isNaN(msgMs) && msgMs <= readMs && msg.user_id !== userId) {
        latestReadMsg = msg
        break
      }
    }

    if (latestReadMsg) {
      const key = latestReadMsg.id || latestReadMsg.client_id
      if (!result[key]) {
        result[key] = []
      }
      result[key].push(profile)
    }
  }

  return result
}




