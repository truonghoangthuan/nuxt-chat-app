export type MessageStatus = 'sending' | 'sent' | 'failed'
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface Profile {
  id: string
  display_name: string
  avatar_color: string
  created_at?: string
}

export interface Channel {
  id: string
  slug: string
  description: string | null
  created_by: string | null
  created_at: string
}

export interface MessageReaction {
  id?: string
  message_id: string
  channel_id: string
  user_id: string
  emoji: string
  created_at?: string
}

export interface ReactionSummary {
  emoji: string
  count: number
  userIds: string[]
  reactedByMe: boolean
}

export interface ReplyTarget {
  id: string
  user_id: string
  content: string
  deleted_at?: string | null
  author?: Profile
}

export interface ChatMessage {
  id: string
  client_id: string
  channel_id: string
  user_id: string
  content: string
  created_at: string
  status: MessageStatus
  author?: Profile
  reply_to_id?: string | null
  reply_to?: ReplyTarget | null
  edited_at?: string | null
  deleted_at?: string | null
  reactions?: MessageReaction[]
}

export interface TimelineMessageItem {
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isCompact: boolean
}

export interface TypingUser {
  user_id: string
  display_name: string
  expires_at: number
}
