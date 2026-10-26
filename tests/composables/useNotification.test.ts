import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNotificationManager } from '~/composables/useNotification'
import type { ChatMessage } from '~/types/chat'

describe('useNotification composable', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('initializes default settings and allows toggling sound and desktop', () => {
    const manager = createNotificationManager()
    expect(manager.soundEnabled.value).toBe(true)
    expect(manager.desktopEnabled.value).toBe(true)

    manager.toggleSound()
    expect(manager.soundEnabled.value).toBe(false)
    expect(localStorage.getItem('nuxt-chat-sound-enabled')).toBe('false')

    manager.toggleDesktop()
    expect(manager.desktopEnabled.value).toBe(false)
    expect(localStorage.getItem('nuxt-chat-desktop-enabled')).toBe('false')
  })

  it('restores persisted settings from localStorage', () => {
    localStorage.setItem('nuxt-chat-sound-enabled', 'false')
    localStorage.setItem('nuxt-chat-desktop-enabled', 'false')

    const manager = createNotificationManager()
    expect(manager.soundEnabled.value).toBe(false)
    expect(manager.desktopEnabled.value).toBe(false)
  })

  it('handles requestPermission when Notification is supported', async () => {
    const requestPermissionMock = vi.fn().mockResolvedValue('granted')
    const fakeNotification = {
      permission: 'default',
      requestPermission: requestPermissionMock,
    }

    const manager = createNotificationManager({ notificationApi: fakeNotification as any })
    expect(manager.permission.value).toBe('default')

    const res = await manager.requestPermission()
    expect(res).toBe('granted')
    expect(manager.permission.value).toBe('granted')
  })

  it('ignores own messages', () => {
    const playSoundMock = vi.fn()
    const manager = createNotificationManager({ playSound: playSoundMock })

    const ownMsg: Partial<ChatMessage> = {
      id: 'm1',
      conversation_id: 'conv-1',
      user_id: 'user-me',
      content: 'Hello myself',
    }

    manager.notifyIncomingMessage({
      message: ownMsg as any,
      currentUserId: 'user-me',
      activeConversationId: 'conv-2',
    })

    expect(playSoundMock).not.toHaveBeenCalled()
    expect(manager.toasts.value.length).toBe(0)
  })

  it('suppresses notifications when user is viewing the active conversation', () => {
    const playSoundMock = vi.fn()
    const notificationConstructor = vi.fn()
    const fakeNotification = {
      permission: 'granted',
      requestPermission: vi.fn(),
    }

    const manager = createNotificationManager({
      playSound: playSoundMock,
      notificationApi: fakeNotification as any,
      notificationConstructor,
      isDocumentVisible: () => true,
    })

    const msg: Partial<ChatMessage> = {
      id: 'm1',
      conversation_id: 'conv-active',
      user_id: 'user-other',
      content: 'Hello in active room',
    }

    manager.notifyIncomingMessage({
      message: msg as any,
      currentUserId: 'user-me',
      activeConversationId: 'conv-active',
    })

    expect(playSoundMock).not.toHaveBeenCalled()
    expect(notificationConstructor).not.toHaveBeenCalled()
    expect(manager.toasts.value.length).toBe(0)
  })

  it('triggers sound, desktop notification, and in-app toast when in different channel', () => {
    const playSoundMock = vi.fn()
    const notifInstance = {
      onclick: null as any,
      close: vi.fn(),
    }
    const notificationConstructor = vi.fn().mockReturnValue(notifInstance)
    const fakeNotification = {
      permission: 'granted',
      requestPermission: vi.fn(),
    }
    const onNavigateMock = vi.fn()

    const manager = createNotificationManager({
      playSound: playSoundMock,
      notificationApi: fakeNotification as any,
      notificationConstructor,
      isDocumentVisible: () => true,
    })

    const msg: Partial<ChatMessage> = {
      id: 'm2',
      conversation_id: 'conv-inactive',
      user_id: 'user-other',
      content: 'Hey are you there?',
      author: {
        id: 'user-other',
        display_name: 'Bob',
        email: 'bob@example.com',
        avatar_color: '#3b82f6',
      },
    }

    manager.notifyIncomingMessage({
      message: msg as any,
      currentUserId: 'user-me',
      activeConversationId: 'conv-active',
      onNavigate: onNavigateMock,
    })

    expect(playSoundMock).toHaveBeenCalledTimes(1)
    expect(notificationConstructor).toHaveBeenCalledWith('Bob', expect.objectContaining({
      body: 'Hey are you there?',
    }))
    expect(manager.toasts.value.length).toBe(1)
    expect(manager.toasts.value[0].title).toBe('Bob')
    expect(manager.toasts.value[0].snippet).toBe('Hey are you there?')

    // Simulate clicking desktop notification
    notifInstance.onclick()
    expect(onNavigateMock).toHaveBeenCalledWith('conv-inactive')
    expect(notifInstance.close).toHaveBeenCalled()
  })

  it('triggers desktop notification and sound when document is hidden even for active conversation', () => {
    const playSoundMock = vi.fn()
    const notificationConstructor = vi.fn().mockReturnValue({ close: vi.fn() })
    const fakeNotification = {
      permission: 'granted',
      requestPermission: vi.fn(),
    }

    const manager = createNotificationManager({
      playSound: playSoundMock,
      notificationApi: fakeNotification as any,
      notificationConstructor,
      isDocumentVisible: () => false, // Tab hidden / minimized
    })

    const msg: Partial<ChatMessage> = {
      id: 'm3',
      conversation_id: 'conv-active',
      user_id: 'user-other',
      content: 'Message while you are away',
      author: {
        id: 'user-other',
        display_name: 'Alice',
        email: 'alice@example.com',
      },
    }

    manager.notifyIncomingMessage({
      message: msg as any,
      currentUserId: 'user-me',
      activeConversationId: 'conv-active',
    })

    expect(playSoundMock).toHaveBeenCalledTimes(1)
    expect(notificationConstructor).toHaveBeenCalledWith('Alice', expect.objectContaining({
      body: 'Message while you are away',
    }))
    // In-app toast not queued when window is hidden
    expect(manager.toasts.value.length).toBe(0)
  })

  it('masks raw e2ee ciphertext and empty content to safe previews', () => {
    const encryptedMsg: Partial<ChatMessage> = {
      id: 'm-enc',
      conversation_id: 'conv-1',
      user_id: 'user-other',
      content: 'e2ee:v1:YWJj:eHl6',
      author: { id: 'u2', display_name: 'Alice', email: 'a@b.com' },
    }

    const notificationConstructor = vi.fn().mockReturnValue({ close: vi.fn() })
    const managerWithNotif = createNotificationManager({
      notificationApi: { permission: 'granted', requestPermission: vi.fn() } as any,
      notificationConstructor,
      isDocumentVisible: () => false,
    })

    managerWithNotif.notifyIncomingMessage({
      message: encryptedMsg as any,
      activeConversationId: 'conv-other',
    })

    expect(notificationConstructor).toHaveBeenCalledWith('Alice', expect.objectContaining({
      body: '🔒 Encrypted message',
      tag: 'chat-conv-1',
    }))
  })

  it('manages toast dismissal', () => {
    const manager = createNotificationManager()
    manager.addToast({
      conversationId: 'c1',
      title: 'Alice',
      snippet: 'Hello',
    })

    expect(manager.toasts.value.length).toBe(1)
    const id = manager.toasts.value[0].id

    manager.dismissToast(id)
    expect(manager.toasts.value.length).toBe(0)
  })

  it('prefers serviceWorker showNotification with absolute icon and conversation data when available', async () => {
    const showNotificationMock = vi.fn().mockResolvedValue(undefined)
    const swMock = { showNotification: showNotificationMock }
    const fakeNotification = {
      permission: 'granted',
      requestPermission: vi.fn(),
    }

    const manager = createNotificationManager({
      notificationApi: fakeNotification as any,
      serviceWorkerRegistration: swMock as any,
      origin: 'https://chat.example.com',
      isDocumentVisible: () => false,
    })

    const msg: Partial<ChatMessage> = {
      id: 'm-sw',
      conversation_id: 'conv-sw-1',
      user_id: 'user-other',
      content: 'Hello via SW',
      author: { id: 'u2', display_name: 'Carol', email: 'c@example.com' },
    }

    manager.notifyIncomingMessage({
      message: msg as any,
      activeConversationId: 'conv-other',
    })

    expect(showNotificationMock).toHaveBeenCalledWith('Carol', expect.objectContaining({
      body: 'Hello via SW',
      icon: 'https://chat.example.com/favicon.ico',
      tag: 'chat-conv-sw-1',
      data: { conversationId: 'conv-sw-1' },
    }))
  })

  it('retains Notification instances in activeNotifications until closed to prevent GC', () => {
    const notifInstance: any = {
      onclose: null,
      onclick: null,
      close: vi.fn(),
    }
    const notificationConstructor = vi.fn().mockReturnValue(notifInstance)
    const fakeNotification = {
      permission: 'granted',
      requestPermission: vi.fn(),
    }

    const manager = createNotificationManager({
      notificationApi: fakeNotification as any,
      notificationConstructor,
      isDocumentVisible: () => false,
    })

    const msg: Partial<ChatMessage> = {
      id: 'm-gc',
      conversation_id: 'conv-gc-1',
      user_id: 'user-other',
      content: 'GC prevention check',
      author: { id: 'u3', display_name: 'Dave', email: 'd@example.com' },
    }

    manager.notifyIncomingMessage({
      message: msg as any,
      activeConversationId: 'conv-other',
    })

    expect(manager.activeNotifications.size).toBe(1)
    expect(manager.activeNotifications.has(notifInstance)).toBe(true)

    // Trigger onclose callback
    notifInstance.onclose()
    expect(manager.activeNotifications.size).toBe(0)
  })

  it('formats system payloads via formatSystemMessageText for toast and notification snippets', () => {
    const manager = createNotificationManager({
      isDocumentVisible: () => true,
    })

    const buzzMsg: Partial<ChatMessage> = {
      id: 'm-sys-1',
      conversation_id: 'conv-sys-1',
      user_id: 'user-other',
      content: JSON.stringify({ type: 'system', event: 'buzz', actorName: 'Alice' }),
      author: { id: 'u-alice', display_name: 'Alice', email: 'alice@example.com' },
    }

    manager.notifyIncomingMessage({
      message: buzzMsg as any,
      activeConversationId: 'conv-other',
    })

    expect(manager.toasts.value[0].snippet).toBe('⚡ Alice buzzed the chat!')
  })
})
