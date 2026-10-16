import { ref } from 'vue'
import type { ChatMessage, Profile } from '~/types/chat'
import { isValidMessageContent } from '~/utils/chat'

export function createMessagesStore() {
  const messages = ref<ChatMessage[]>([])

  function compareConfirmed(a: ChatMessage, b: ChatMessage): number {
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
    channelId: string
    user: Profile
    content: string
    createdAt?: string
  }): ChatMessage | null {
    if (!isValidMessageContent(params.content)) {
      return null
    }

    const existing = messages.value.find(m => m.client_id === params.clientId)
    if (existing) {
      return existing
    }

    const newMessage: ChatMessage = {
      id: params.clientId,
      client_id: params.clientId,
      channel_id: params.channelId,
      user_id: params.user.id,
      content: params.content,
      created_at: params.createdAt || new Date().toISOString(),
      status: 'sending',
      author: params.user,
    }

    messages.value.push(newMessage)
    return newMessage
  }

  function markMessageSent(clientId: string, serverRow: Omit<ChatMessage, 'status'>): void {
    const idx = messages.value.findIndex(m => m.client_id === clientId || m.id === serverRow.id)
    if (idx !== -1) {
      const current = messages.value[idx]
      current.id = serverRow.id
      current.client_id = serverRow.client_id
      current.channel_id = serverRow.channel_id
      current.user_id = serverRow.user_id
      current.content = serverRow.content
      current.created_at = serverRow.created_at
      current.status = 'sent'
      if (serverRow.author) {
        current.author = serverRow.author
      }
    } else {
      messages.value.push({
        ...serverRow,
        status: 'sent',
      })
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

    const existingByClientId = messages.value.find(m => m.client_id === serverRow.client_id)
    if (existingByClientId) {
      existingByClientId.id = serverRow.id
      existingByClientId.content = serverRow.content
      existingByClientId.created_at = serverRow.created_at
      existingByClientId.status = 'sent'
      if (serverRow.author) {
        existingByClientId.author = serverRow.author
      }
      reorderMessages()
      return 'updated'
    }

    messages.value.push({
      ...serverRow,
      status: 'sent',
    })
    reorderMessages()
    return 'appended'
  }

  function setInitialHistory(rows: Array<Omit<ChatMessage, 'status'>>): void {
    const pending = messages.value.filter(m => m.status === 'sending' || m.status === 'failed')
    const mapped: ChatMessage[] = rows.map(r => ({ ...r, status: 'sent' }))
    messages.value = [...mapped, ...pending]
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
    const newlyAdded: ChatMessage[] = newRows.map(r => ({ ...r, status: 'sent' }))

    messages.value = [...newlyAdded, ...existingConfirmed, ...pending]
    reorderMessages()
    return newRows.length
  }

  function mergeGapMessages(missedRows: Array<Omit<ChatMessage, 'status'>>): number {
    const seenIds = new Set(messages.value.map(m => m.id))
    const seenClientIds = new Set(messages.value.map(m => m.client_id))

    const newRows = missedRows.filter(r => !seenIds.has(r.id) && !seenClientIds.has(r.client_id))
    if (newRows.length === 0) {
      return 0
    }

    for (const r of newRows) {
      messages.value.push({ ...r, status: 'sent' })
    }
    reorderMessages()
    return newRows.length
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

  return {
    messages,
    addOptimisticMessage,
    markMessageSent,
    markMessageFailed,
    markMessageRetrying,
    dismissMessage,
    reconcileIncomingMessage,
    setInitialHistory,
    prependHistoryPage,
    mergeGapMessages,
    getOldestCursor,
    getLastConfirmedTimestamp,
  }
}
