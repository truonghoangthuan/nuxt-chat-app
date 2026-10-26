import { type Ref, isRef } from 'vue'
import type { ChatMessage, Conversation } from '~/types/chat'
import { doesMessageMentionUser } from '~/utils/chat'
import { isImagePayload, parseImagePayload, formatImageMessageSummary } from '~/utils/image'

export function computeUnreadSnapshot(params: {
  messages: Array<Pick<ChatMessage, 'id' | 'conversation_id' | 'channel_id' | 'user_id' | 'content' | 'created_at' | 'deleted_at' | 'reply_to_id'>>
  lastReadByConversation?: Record<string, string>
  lastReadByChannel?: Record<string, string>
  activeConversationId?: string | null
  activeChannelId?: string | null
  currentUserId: string
  currentDisplayName?: string | null
}): {
  unreadCounts: Record<string, number>
  unreadMentions: Record<string, number>
} {
  const unreadCounts: Record<string, number> = {}
  const unreadMentions: Record<string, number> = {}
  const activeId = params.activeConversationId !== undefined ? params.activeConversationId : (params.activeChannelId || null)
  const lastReadMap = params.lastReadByConversation || params.lastReadByChannel || {}

  for (const msg of params.messages) {
    if (!msg || msg.deleted_at) continue
    const targetId = msg.conversation_id || msg.channel_id || ''
    if (!targetId || targetId === activeId) continue
    if (params.currentUserId && msg.user_id === params.currentUserId) continue

    const lastReadIso = lastReadMap[targetId]
    if (lastReadIso && Date.parse(msg.created_at) <= Date.parse(lastReadIso)) {
      continue
    }

    unreadCounts[targetId] = (unreadCounts[targetId] || 0) + 1
    const textToCheck = isImagePayload(msg.content)
      ? (parseImagePayload(msg.content)?.caption || formatImageMessageSummary(parseImagePayload(msg.content)?.images.length || 1))
      : msg.content
    if (doesMessageMentionUser(textToCheck, params.currentDisplayName)) {
      unreadMentions[targetId] = (unreadMentions[targetId] || 0) + 1
    }
  }

  return { unreadCounts, unreadMentions }
}

export const computeInitialUnreadSnapshot = computeUnreadSnapshot

export function computeOldestReadTimestamp(timestamps: string[]): string | null {
  if (timestamps.length === 0) return null
  return timestamps.reduce((a, b) => {
    const tA = Date.parse(a)
    const tB = Date.parse(b)
    if (!Number.isNaN(tA) && !Number.isNaN(tB)) {
      return tA < tB ? a : b
    }
    return a < b ? a : b
  })
}

export function computeConversationReadMap(params: {
  conversations?: Array<{ id: string }>
  channels?: Array<{ id: string }>
  readRows?: Array<{ conversation_id?: string; channel_id?: string; last_read_at: string }> | null
  existingMap?: Record<string, string>
  defaultReadTimestamp: string
}): Record<string, string> {
  const map: Record<string, string> = {}
  if (params.readRows) {
    for (const r of params.readRows) {
      const id = r.conversation_id || r.channel_id
      if (id) {
        map[id] = r.last_read_at
      }
    }
  }
  const list = params.conversations || params.channels || []
  for (const item of list) {
    if (!map[item.id]) {
      map[item.id] = params.existingMap?.[item.id] || params.defaultReadTimestamp
    }
  }
  return map
}

export const computeChannelReadMap = computeConversationReadMap

export function createConversationReadDebouncer(
  upsertFn: (conversationId: string, timestamp: string) => Promise<any>,
  delayMs = 2000,
) {
  const timers = new Map<string, any>()
  const pendingTimestamps = new Map<string, string>()

  function schedule(conversationId: string, timestamp: string, immediate = false): Promise<void> | void {
    pendingTimestamps.set(conversationId, timestamp)
    const existing = timers.get(conversationId)
    if (existing) {
      clearTimeout(existing)
      timers.delete(conversationId)
    }

    const flush = async () => {
      timers.delete(conversationId)
      const ts = pendingTimestamps.get(conversationId) || timestamp
      pendingTimestamps.delete(conversationId)
      try {
        await upsertFn(conversationId, ts)
      } catch {
        // Ignored
      }
    }

    if (immediate) {
      return flush()
    }

    const timer = setTimeout(flush, delayMs)
    timers.set(conversationId, timer)
  }

  function cancelAll() {
    for (const t of timers.values()) {
      clearTimeout(t)
    }
    timers.clear()
    pendingTimestamps.clear()
  }

  return { schedule, cancelAll, timers }
}

export const createChannelReadDebouncer = createConversationReadDebouncer
export const createReadReceiptDebouncer = createConversationReadDebouncer

export function applyIncomingUnreadIncrement(params: {
  unreadCounts: Record<string, number>
  unreadMentions?: Record<string, number>
  targetId: string
  isMention?: boolean
}): void {
  params.unreadCounts[params.targetId] = (params.unreadCounts[params.targetId] || 0) + 1
  if (params.isMention && params.unreadMentions) {
    params.unreadMentions[params.targetId] = (params.unreadMentions[params.targetId] || 0) + 1
  }
}

export function applyActiveChannelReadReset(params: {
  conversationId: string
  unreadCounts: Record<string, number>
  unreadMentions: Record<string, number>
}): void {
  params.unreadCounts[params.conversationId] = 0
  params.unreadMentions[params.conversationId] = 0
}

export function applyCrossTabReadTimestamp(params: {
  conversationReadsByConv: Record<string, Record<string, string>>
  lastReadByConversation: Record<string, string>
  conversationId: string
  userId: string
  lastReadAt: string
  currentUserId?: string
}): void {
  const existing = params.conversationReadsByConv[params.conversationId] || {}
  params.conversationReadsByConv[params.conversationId] = {
    ...existing,
    [params.userId]: params.lastReadAt,
  }
  if (params.currentUserId && params.userId === params.currentUserId) {
    params.lastReadByConversation[params.conversationId] = params.lastReadAt
  }
}
