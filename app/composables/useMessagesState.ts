import { ref } from 'vue'
import type { ChatMessage, MessageEncryptionState, MessageReaction, Profile, ReplyTarget } from '~/types/chat'
import { isValidMessageContent } from '~/utils/chat'
import { isImagePayload } from '~/utils/image'

export function createMessagesStore() {
  const messages = ref<ChatMessage[]>([])

  function compareConfirmed(a: ChatMessage, b: ChatMessage): number {
    const tA = Date.parse(a.created_at)
    const tB = Date.parse(b.created_at)
    if (!Number.isNaN(tA) && !Number.isNaN(tB)) {
      if (tA !== tB) return tA - tB
      if (a.created_at.length === b.created_at.length) {
        const timeComp = a.created_at.localeCompare(b.created_at)
        if (timeComp !== 0) return timeComp
      }
      return a.id.localeCompare(b.id)
    }
    const timeComp = a.created_at.localeCompare(b.created_at)
    if (timeComp !== 0) return timeComp
    return a.id.localeCompare(b.id)
  }

  function reorderMessages(): void {
    const confirmed: ChatMessage[] = []
    const pending: ChatMessage[] = []
    const seenIds = new Set<string>()
    const seenClientIds = new Set<string>()

    for (const msg of messages.value) {
      if (msg.status === 'sent') {
        if (seenIds.has(msg.id) || (msg.client_id && seenClientIds.has(msg.client_id))) {
          continue
        }
        seenIds.add(msg.id)
        if (msg.client_id) seenClientIds.add(msg.client_id)
        confirmed.push(msg)
      } else {
        pending.push(msg)
      }
    }

    confirmed.sort(compareConfirmed)
    messages.value = [...confirmed, ...pending]
  }

  function addOptimisticMessage(params: {
    clientId: string
    conversationId?: string
    /**
     * @deprecated transitional alias for conversationId
     */
    channelId?: string
    user: Profile
    content: string
    createdAt?: string
    replyToId?: string | null
    replyTo?: ReplyTarget | null
    encryption?: MessageEncryptionState
  }): ChatMessage | null {
    if (!isValidMessageContent(params.content) && !isImagePayload(params.content)) {
      return null
    }

    const existing = messages.value.find(m => m.client_id === params.clientId)
    if (existing) {
      return existing
    }

    const conversationId = params.conversationId || params.channelId || ''

    const newMessage: ChatMessage = {
      id: params.clientId,
      client_id: params.clientId,
      conversation_id: conversationId,
      channel_id: conversationId,
      user_id: params.user.id,
      content: params.content,
      created_at: params.createdAt || new Date().toISOString(),
      status: 'sending',
      author: params.user,
      reply_to_id: params.replyToId || null,
      reply_to: params.replyTo || null,
      edited_at: null,
      deleted_at: null,
      reactions: [],
      encryption: params.encryption || 'e2ee',
    }

    messages.value.push(newMessage)
    return newMessage
  }

  function markMessageSent(
    clientId: string,
    serverRowOrId: Omit<ChatMessage, 'status'> | string,
    createdAt?: string,
  ): void {
    const id = typeof serverRowOrId === 'string' ? serverRowOrId : serverRowOrId.id
    const idx = messages.value.findIndex(m => m.client_id === clientId || m.id === id)
    if (idx !== -1) {
      const current = messages.value[idx]
      current.id = id
      current.status = 'sent'
      if (typeof serverRowOrId === 'string') {
        if (createdAt) {
          current.created_at = createdAt
        }
      } else {
        const convId = serverRowOrId.conversation_id || serverRowOrId.channel_id || current.conversation_id
        current.client_id = serverRowOrId.client_id
        current.conversation_id = convId
        current.channel_id = convId
        current.user_id = serverRowOrId.user_id
        current.content = serverRowOrId.content
        current.created_at = serverRowOrId.created_at
        if (serverRowOrId.author) {
          current.author = serverRowOrId.author
        }
        if (serverRowOrId.reply_to_id !== undefined) {
          current.reply_to_id = serverRowOrId.reply_to_id
        }
        if (serverRowOrId.reply_to !== undefined) {
          current.reply_to = serverRowOrId.reply_to
        }
        if (serverRowOrId.edited_at !== undefined) {
          current.edited_at = serverRowOrId.edited_at
        }
        if (serverRowOrId.deleted_at !== undefined) {
          current.deleted_at = serverRowOrId.deleted_at
        }
        if (serverRowOrId.reactions !== undefined) {
          current.reactions = serverRowOrId.reactions
        }
        if (serverRowOrId.encryption !== undefined) {
          current.encryption = serverRowOrId.encryption
        }
      }
    } else {
      if (typeof serverRowOrId !== 'string') {
        const convId = serverRowOrId.conversation_id || serverRowOrId.channel_id || ''
        messages.value.push({
          ...serverRowOrId,
          conversation_id: convId,
          channel_id: convId,
          status: 'sent',
        })
      }
    }
    reorderMessages()
  }

  function markMessageFailed(clientId: string): void {
    const msg = messages.value.find(m => m.client_id === clientId)
    if (msg) {
      msg.status = 'failed'
    }
  }

  function markMessageRetrying(clientId: string): ChatMessage | null {
    const msg = messages.value.find(m => m.client_id === clientId)
    if (msg) {
      msg.status = 'sending'
      return msg
    }
    return null
  }

  function dismissMessage(clientId: string): void {
    messages.value = messages.value.filter(m => m.client_id !== clientId)
  }

  function reconcileIncomingMessage(serverRow: Omit<ChatMessage, 'status'>): 'updated' | 'appended' | 'ignored' {
    const existingById = messages.value.find(m => m.id === serverRow.id)
    if (existingById && existingById.status === 'sent') {
      return 'ignored'
    }

    const convId = serverRow.conversation_id || serverRow.channel_id || ''

    const existingByClientId = messages.value.find(m => m.client_id === serverRow.client_id)
    if (existingByClientId) {
      existingByClientId.id = serverRow.id
      existingByClientId.conversation_id = convId || existingByClientId.conversation_id
      existingByClientId.channel_id = convId || existingByClientId.channel_id
      existingByClientId.content = serverRow.content
      existingByClientId.created_at = serverRow.created_at
      existingByClientId.status = 'sent'
      if (serverRow.author) {
        existingByClientId.author = serverRow.author
      }
      if (serverRow.reply_to_id !== undefined) {
        existingByClientId.reply_to_id = serverRow.reply_to_id
      }
      if (serverRow.reply_to !== undefined) {
        existingByClientId.reply_to = serverRow.reply_to
      }
      if (serverRow.edited_at !== undefined) {
        existingByClientId.edited_at = serverRow.edited_at
      }
      if (serverRow.deleted_at !== undefined) {
        existingByClientId.deleted_at = serverRow.deleted_at
      }
      if (serverRow.reactions !== undefined) {
        existingByClientId.reactions = serverRow.reactions
      }
      if (serverRow.encryption !== undefined) {
        existingByClientId.encryption = serverRow.encryption
      }
      reorderMessages()
      return 'updated'
    }

    messages.value.push({
      ...serverRow,
      conversation_id: convId,
      channel_id: convId,
      status: 'sent',
    })
    reorderMessages()
    return 'appended'
  }

  function reconcileUpdatedMessage(
    serverRow: Partial<ChatMessage> & { id: string },
  ): boolean {
    let found = false
    messages.value = messages.value.map((msg) => {
      let updated = msg
      if (msg.id === serverRow.id) {
        found = true
        updated = {
          ...msg,
          content: serverRow.content !== undefined ? serverRow.content : msg.content,
          edited_at: serverRow.edited_at !== undefined ? serverRow.edited_at : msg.edited_at,
          deleted_at: serverRow.deleted_at !== undefined ? serverRow.deleted_at : msg.deleted_at,
          encryption: serverRow.encryption !== undefined ? serverRow.encryption : msg.encryption,
        }
      }
      if (updated.reply_to_id === serverRow.id && updated.reply_to) {
        updated = {
          ...updated,
          reply_to: {
            ...updated.reply_to,
            content: serverRow.content !== undefined ? serverRow.content : updated.reply_to.content,
            deleted_at: serverRow.deleted_at !== undefined ? serverRow.deleted_at : updated.reply_to.deleted_at,
            encryption: serverRow.encryption !== undefined ? serverRow.encryption : updated.reply_to.encryption,
          },
        }
      }
      return updated
    })
    return found
  }

  function applyReactionAdded(reaction: MessageReaction): boolean {
    const idx = messages.value.findIndex(m => m.id === reaction.message_id)
    if (idx === -1) return false

    const target = messages.value[idx]
    const currentReactions = target.reactions || []
    const exists = currentReactions.some(
      r => r.user_id === reaction.user_id && r.emoji === reaction.emoji,
    )
    if (exists) return false

    const convId = reaction.conversation_id || reaction.channel_id || ''
    const normalizedReaction: MessageReaction = {
      ...reaction,
      conversation_id: convId,
      channel_id: convId,
    }

    const copy = [...messages.value]
    copy[idx] = {
      ...target,
      reactions: [...currentReactions, normalizedReaction],
    }
    messages.value = copy
    return true
  }

  function applyReactionRemoved(target: {
    message_id: string
    user_id: string
    emoji: string
  }): boolean {
    const idx = messages.value.findIndex(m => m.id === target.message_id)
    if (idx === -1) return false

    const msg = messages.value[idx]
    const currentReactions = msg.reactions || []
    const nextReactions = currentReactions.filter(
      r => !(r.user_id === target.user_id && r.emoji === target.emoji),
    )
    if (nextReactions.length === currentReactions.length) {
      return false
    }

    const copy = [...messages.value]
    copy[idx] = {
      ...msg,
      reactions: nextReactions,
    }
    messages.value = copy
    return true
  }

  function setInitialHistory(
    rows: Array<Omit<ChatMessage, 'status'>>,
    currentConversationId?: string,
  ): void {
    const pending = messages.value.filter(m => {
      const isPending = m.status === 'sending' || m.status === 'failed'
      if (!isPending) return false
      const mConvId = m.conversation_id || m.channel_id
      return currentConversationId ? mConvId === currentConversationId : true
    })

    // Retain any confirmed messages that arrived during history fetch
    const existingConfirmed = messages.value.filter(m => {
      if (m.status !== 'sent') return false
      const mConvId = m.conversation_id || m.channel_id
      if (currentConversationId && mConvId !== currentConversationId) return false
      return true
    })

    const mapped: ChatMessage[] = rows.map(r => {
      const convId = r.conversation_id || r.channel_id || ''
      return {
        ...r,
        conversation_id: convId,
        channel_id: convId,
        status: 'sent',
      }
    })
    messages.value = [...mapped, ...existingConfirmed, ...pending]
    reorderMessages()
  }

  function prependHistoryPage(olderRows: Array<Omit<ChatMessage, 'status'>>): number {
    const seenIds = new Set(messages.value.map(m => m.id))
    const seenClientIds = new Set(messages.value.map(m => m.client_id))

    const newRows = olderRows.filter(r => !seenIds.has(r.id) && !seenClientIds.has(r.client_id))
    if (newRows.length === 0) {
      return 0
    }

    const pending = messages.value.filter(m => m.status === 'sending' || m.status === 'failed')
    const existingConfirmed = messages.value.filter(m => m.status === 'sent')
    const newlyAdded: ChatMessage[] = newRows.map(r => {
      const convId = r.conversation_id || r.channel_id || ''
      return {
        ...r,
        conversation_id: convId,
        channel_id: convId,
        status: 'sent',
      }
    })

    messages.value = [...newlyAdded, ...existingConfirmed, ...pending]
    reorderMessages()
    return newRows.length
  }

  function mergeGapMessages(missedRows: Array<Omit<ChatMessage, 'status'>>): number {
    let count = 0
    for (const r of missedRows) {
      const outcome = reconcileIncomingMessage(r)
      if (outcome !== 'ignored') {
        count += 1
      }
    }
    return count
  }

  function getOldestCursor(): { created_at: string; id: string } | null {
    const confirmed = messages.value.filter(m => m.status === 'sent')
    if (confirmed.length === 0) {
      return null
    }
    return {
      created_at: confirmed[0].created_at,
      id: confirmed[0].id,
    }
  }

  function getLastConfirmedTimestamp(): string | null {
    const confirmed = messages.value.filter(m => m.status === 'sent')
    if (confirmed.length === 0) {
      return null
    }
    return confirmed[confirmed.length - 1].created_at
  }

  function updateAuthorProfile(profile: Profile): number {
    let count = 0
    messages.value = messages.value.map((msg) => {
      let updated = msg
      if (msg.user_id === profile.id) {
        count += 1
        updated = {
          ...updated,
          author: { ...profile },
        }
      }
      if (updated.reply_to?.user_id === profile.id) {
        updated = {
          ...updated,
          reply_to: {
            ...updated.reply_to,
            author: { ...profile },
          },
        }
      }
      return updated
    })
    return count
  }

  return {
    messages,
    addOptimisticMessage,
    markMessageSent,
    markMessageFailed,
    markMessageRetrying,
    dismissMessage,
    reconcileIncomingMessage,
    reconcileUpdatedMessage,
    applyReactionAdded,
    applyReactionRemoved,
    setInitialHistory,
    prependHistoryPage,
    mergeGapMessages,
    getOldestCursor,
    getLastConfirmedTimestamp,
    updateAuthorProfile,
  }
}
