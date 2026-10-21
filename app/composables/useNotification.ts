import { ref, type Ref } from 'vue'
import type { ChatMessage } from '~/types/chat'
import type { NotificationToastItem } from '~/types/notification'
import { playNotificationChime } from '~/utils/sound'
import { isImagePayload, parseImagePayload, formatImageMessageSummary } from '~/utils/image'

export const STORAGE_KEY_SOUND = 'nuxt-chat-sound-enabled'
export const STORAGE_KEY_DESKTOP = 'nuxt-chat-desktop-enabled'

export interface NotificationManagerOptions {
  notificationApi?: {
    permission: NotificationPermission
    requestPermission: () => Promise<NotificationPermission>
  } | null
  notificationConstructor?: (title: string, options?: NotificationOptions) => any
  playSound?: () => void
  isDocumentVisible?: () => boolean
}

export function createNotificationManager(options?: NotificationManagerOptions) {
  const getInitialSound = (): boolean => {
    if (typeof localStorage === 'undefined') return true
    const val = localStorage.getItem(STORAGE_KEY_SOUND)
    return val !== 'false'
  }

  const getInitialDesktop = (): boolean => {
    if (typeof localStorage === 'undefined') return true
    const val = localStorage.getItem(STORAGE_KEY_DESKTOP)
    return val !== 'false'
  }

  const getInitialPermission = (): NotificationPermission => {
    if (options?.notificationApi) {
      return options.notificationApi.permission
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return window.Notification.permission
    }
    return 'default'
  }

  const soundEnabled = ref(getInitialSound())
  const desktopEnabled = ref(getInitialDesktop())
  const permission = ref<NotificationPermission>(getInitialPermission())
  const toasts = ref<NotificationToastItem[]>([])

  const toggleSound = () => {
    soundEnabled.value = !soundEnabled.value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SOUND, String(soundEnabled.value))
    }
  }

  const toggleDesktop = () => {
    desktopEnabled.value = !desktopEnabled.value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DESKTOP, String(desktopEnabled.value))
    }
  }

  const requestPermission = async (): Promise<NotificationPermission> => {
    try {
      const api = options?.notificationApi || (typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null)
      if (api && typeof api.requestPermission === 'function') {
        const result = await api.requestPermission()
        if (result) {
          permission.value = result
        }
        return result
      }
    } catch {
      // ignore rejection or blocked permission
    }
    return permission.value
  }

  const addToast = (item: Omit<NotificationToastItem, 'id' | 'timestamp'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const toast: NotificationToastItem = {
      ...item,
      id,
      timestamp: Date.now(),
    }
    toasts.value = [toast, ...toasts.value.slice(0, 4)]

    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        dismissToast(id)
      }, 5000)
    }
    return id
  }

  const dismissToast = (id: string) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  const notifyIncomingMessage = (params: {
    message: Pick<ChatMessage, 'id' | 'conversation_id' | 'channel_id' | 'user_id' | 'content' | 'author' | 'deleted_at'>
    activeConversationId?: string | null
    currentUserId?: string
    onNavigate?: (convId: string) => void
  }) => {
    const { message, activeConversationId, currentUserId, onNavigate } = params
    if (message.deleted_at) return
    if (currentUserId && message.user_id === currentUserId) return

    const targetId = message.conversation_id || message.channel_id || ''

    const isFocused = options?.isDocumentVisible
      ? options.isDocumentVisible()
      : typeof document !== 'undefined'
        ? document.visibilityState === 'visible' && (typeof document.hasFocus === 'function' ? document.hasFocus() : true)
        : true

    const isVisible = options?.isDocumentVisible
      ? options.isDocumentVisible()
      : typeof document !== 'undefined'
        ? document.visibilityState === 'visible'
        : true

    const isViewingSameConv = isFocused && Boolean(targetId && targetId === activeConversationId)

    // Suppress all notifications if user is already actively viewing the conversation
    if (isViewingSameConv) return

    // 1. Play Sound if enabled
    if (soundEnabled.value) {
      if (options?.playSound) {
        options.playSound()
      } else {
        playNotificationChime()
      }
    }

    // Prepare message preview snippet safely without ciphertext leaks
    let snippet = (message.content || '').trim()
    if (snippet.startsWith('e2ee:v1:')) {
      snippet = '🔒 Encrypted message'
    } else if (isImagePayload(snippet)) {
      const parsed = parseImagePayload(snippet)
      snippet = formatImageMessageSummary(parsed?.images.length || 1)
    } else if (!snippet) {
      snippet = 'New message'
    } else if (snippet.length > 100) {
      snippet = snippet.slice(0, 97) + '...'
    }

    const title = message.author?.display_name || 'New Message'

    // 2. In-App Toast (when window is visible and message is for another channel)
    if (isVisible && targetId !== activeConversationId) {
      addToast({
        conversationId: targetId,
        title,
        snippet,
        avatarUrl: message.author?.avatar_url,
        avatarColor: message.author?.avatar_color,
      })
    }

    // 3. Desktop Notification (Windows toast) when tab is not focused or message is in another channel
    if (desktopEnabled.value && (!isFocused || targetId !== activeConversationId)) {
      const hasPermission = permission.value === 'granted' || (
        typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted'
      )

      if (hasPermission) {
        try {
          const createNotif = options?.notificationConstructor || (
            typeof window !== 'undefined' && 'Notification' in window
              ? (t: string, opts?: NotificationOptions) => new window.Notification(t, opts)
              : null
          )

          if (createNotif) {
            const notif = createNotif(title, {
              body: snippet,
              icon: '/favicon.ico',
              tag: `chat-${targetId || 'default'}`,
            })

            if (notif) {
              notif.onclick = () => {
                try {
                  if (typeof window !== 'undefined' && typeof window.focus === 'function') {
                    window.focus()
                  }
                } catch {}
                if (targetId && onNavigate) {
                  onNavigate(targetId)
                }
                if (typeof notif.close === 'function') {
                  notif.close()
                }
              }
            }
          }
        } catch {
          // Ignore desktop notification errors
        }
      }
    }
  }

  return {
    soundEnabled,
    desktopEnabled,
    permission,
    toasts,
    toggleSound,
    toggleDesktop,
    requestPermission,
    addToast,
    dismissToast,
    notifyIncomingMessage,
  }
}

let globalNotificationManager: ReturnType<typeof createNotificationManager> | null = null

export function useNotification() {
  if (!globalNotificationManager) {
    globalNotificationManager = createNotificationManager()
  }
  return globalNotificationManager
}
