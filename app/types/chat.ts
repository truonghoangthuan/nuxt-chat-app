export type MessageStatus = 'sending' | 'sent' | 'failed'
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface Profile {
  id: string
  email: string
  display_name: string
  avatar_color: string
  avatar_url?: string | null
  bank_qr_url?: string | null
  created_at?: string
}

export type ConversationType = 'direct' | 'group'

export interface ConversationMember {
  conversation_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  profile?: Profile | null
}

export interface ChatBackgroundPreset {
  id: string
  value: string
  label: string
  cssBackground: string
}

export interface Conversation {
  id: string
  type: ConversationType
  title: string | null
  created_by: string | null
  created_at: string
  updated_at?: string
  members?: ConversationMember[]
  peer?: Profile | null            // For direct conversations
  lastMessage?: ChatMessage | null  // For sidebar snippet
  unreadCount?: number
  background_url?: string | null
  confetti_words?: string[]
}

export interface Contact {
  user_id: string
  contact_user_id: string
  created_at: string
  profile?: Profile | null
}

/**
 * @deprecated Legacy Channel interface retained during gradual migration to Conversation.
 */
export interface Channel {
  id: string
  slug?: string
  description?: string | null
  created_by: string | null
  created_at: string
  is_dm?: boolean
  dm_user_a?: string | null
  dm_user_b?: string | null
  peer?: Profile | null
  type?: ConversationType
  title?: string | null
  background_url?: string | null
}

export interface MessageReaction {
  id?: string
  message_id: string
  conversation_id: string
  /**
   * @deprecated transitional alias for conversation_id
   */
  channel_id?: string
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
  conversation_id: string
  /**
   * @deprecated transitional alias for conversation_id
   */
  channel_id?: string
  user_id: string
  content: string
  created_at: string
  status: MessageStatus
  author?: Profile
  reply_to_id?: string | null
  reply_to?: ReplyTarget | null
  edited_at?: string | null
  deleted_at?: string | null
  pinned_at?: string | null
  pinned_by?: string | null
  reactions?: MessageReaction[]
  encryption?: MessageEncryptionState
}

export interface ConversationRead {
  user_id: string
  conversation_id: string
  last_read_at: string
}

/**
 * @deprecated Legacy alias during migration to ConversationRead.
 */
export type ChannelRead = ConversationRead

export interface MentionSegment {
  text: string
  isMention: boolean
  isMe: boolean
  isLink?: boolean
  isCode?: boolean
  href?: string
}

export interface ActiveMentionQuery {
  query: string
  startIndex: number
  endIndex: number
}

export interface TimelineMessageItem {
  type?: 'message'
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isCompact?: boolean
  isSender?: boolean
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  showSenderHeader?: boolean
  showUnreadDivider?: boolean
  isMentioningMe?: boolean
  imagePayload?: ImageMessagePayload | null
  systemPayload?: SystemMessagePayload | null
  mentionSegments?: MentionSegment[]
  captionMentionSegments?: MentionSegment[]
}

export interface TypingUser {
  user_id: string
  display_name: string
  expires_at: number
}

export interface EncryptedImageMetadata {
  path: string
  mimeType: string
  width: number
  height: number
  size: number
}

export interface ImageMessagePayload {
  type: 'images'
  images: EncryptedImageMetadata[]
  caption?: string
}

export interface LocalImageAttachment {
  file: File
  localUrl: string
  width: number
  height: number
}

export interface ExtractedMediaItem {
  id: string
  messageId: string
  image: EncryptedImageMetadata
  caption?: string
  createdAt: string
  author?: Profile
  userId: string
}

export interface ExtractedLinkItem {
  id: string
  messageId: string
  url: string
  domain: string
  createdAt: string
  author?: Profile
  userId: string
}

export type SystemEventType =
  | 'buzz'
  | 'group_rename'
  | 'background_change'
  | 'background_reset'
  | 'music_play'
  | 'music_pause'
  | 'music_stop'
  | 'music_skip'

export interface SystemMessagePayload {
  type: 'system'
  event: SystemEventType
  actorName: string
  detail?: string
  track?: YouTubeSearchResult
}

export interface YouTubeSearchResult {
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
  durationText?: string
}

export interface MusicQueueItem extends YouTubeSearchResult {
  id: string
  addedBy: string
}

export type MusicQueueOp =
  | { op: 'add'; item: MusicQueueItem; position: 'end' | 'next' }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; toIndex: number }
  | { op: 'clear' }

export interface MusicPlaybackState {
  conversationId: string
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
  isPlaying: boolean
  positionSec: number
  updatedAt: number
  startedBy: string
  actorId?: string
  queueItemId?: string
}

export interface MusicSyncEvent {
  type: 'play' | 'pause' | 'seek' | 'stop' | 'request_state' | 'sync_state' | 'queue'
  state: MusicPlaybackState | null
  senderId: string
  conversationId: string
  queueOp?: MusicQueueOp
  queue?: MusicQueueItem[]
}


