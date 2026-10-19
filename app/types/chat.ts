export type MessageStatus = 'sending' | 'sent' | 'failed'
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface Profile {
  id: string
  display_name: string
  avatar_color: string
  avatar_url?: string | null
  created_at?: string
}

export interface Channel {
  id: string
  slug: string
  description: string | null
  created_by: string | null
  created_at: string
  is_dm?: boolean
  dm_user_a?: string | null
  dm_user_b?: string | null
  peer?: Profile | null
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

export type MessageEncryptionState = 'e2ee' | 'legacy' | 'undecryptable'

export interface E2eeConfig {
  id: number
  salt: string
  iterations: number
  verifier: string
  created_at?: string
}

export interface ReplyTarget {
  id: string
  user_id: string
  content: string
  deleted_at?: string | null
  author?: Profile
  encryption?: MessageEncryptionState
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
  encryption?: MessageEncryptionState
}

export interface ChannelRead {
  user_id: string
  channel_id: string
  last_read_at: string
}

export interface MentionSegment {
  text: string
  isMention: boolean
  isMe: boolean
}

export interface ActiveMentionQuery {
  query: string
  startIndex: number
  endIndex: number
}

export interface TimelineMessageItem {
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isCompact: boolean
  showUnreadDivider?: boolean
  isMentioningMe?: boolean
}

export interface TypingUser {
  user_id: string
  display_name: string
  expires_at: number
}
