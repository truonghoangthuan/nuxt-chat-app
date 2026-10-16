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

export interface ChatMessage {
  id: string
  client_id: string
  channel_id: string
  user_id: string
  content: string
  created_at: string
  status: MessageStatus
  author?: Profile
}

export interface TypingUser {
  user_id: string
  display_name: string
  expires_at: number
}
