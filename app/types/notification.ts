export interface NotificationToastItem {
  id: string
  conversationId: string
  title: string
  snippet: string
  avatarUrl?: string
  avatarColor?: string
  timestamp: number
}

export interface NotificationSettings {
  soundEnabled: boolean
  desktopEnabled: boolean
}
