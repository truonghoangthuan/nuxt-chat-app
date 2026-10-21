# Sound & System (Windows) Notifications Design

## 1. Problem & Intent
When users switch away from the browser (e.g. to VS Code, Excel, or another desktop app) or view a different chat channel, incoming messages are missed because there is currently no audio chime and no OS-level notification.

This feature adds:
1. **Windows System Notifications (Web Notifications API):** Triggers native Windows Action Center toasts when messages arrive while the chat tab is unfocused/minimized. Clicking the toast brings the browser tab into focus and opens the relevant conversation.
2. **Audio Chime (Web Audio API):** Plays an instant, synthesized 2-tone chime when a message arrives from another user while the tab is in background or the user is looking at another channel. No external audio files or downloads required.
3. **In-App Toast Popup:** When the app is in the foreground and a message arrives for an inactive channel/conversation, a clean, subtle floating toast card appears in the top-right corner with sender info and message preview, allowing 1-click navigation.
4. **User Control & Permissions:** A bell icon toggle in the sidebar footer and in Profile Settings allows enabling/disabling sounds and desktop notifications, with graceful handling of browser notification permissions.

---

## 2. Invariants & Decision Log

- **Privacy & E2EE:** Decryption happens client-side before notifying. Notifications display the sender's display name and decrypted content snippet (or image indicator `[1 Image]`). Ciphertext is never displayed raw.
- **Self-Message Suppression:** Messages sent by the current user (`row.user_id === currentUserId`) NEVER trigger sound, desktop notifications, or in-app toasts.
- **Focus Suppression:** When the user is actively viewing the active channel (`document.visibilityState === 'visible'` and `targetId === activeConversationId`), no desktop notification is spawned (since the message is already rendering in the viewport).
- **Zero External Dependencies:** Sound is synthesized dynamically using Web Audio API (`AudioContext` sine-wave chime). No `.mp3` assets to 404 or fail to load.
- **Graceful Fallbacks:** In environments without `window.Notification` or when permissions are denied, desktop notifications fail silently without throwing or breaking realtime message handling.
- **SSR & Vitest Safe:** All browser Web APIs (`window`, `Notification`, `AudioContext`, `localStorage`) are guarded for SSR and mocked cleanly in Vitest.

---

## 3. Architecture & State Design

### Composable: `app/composables/useNotification.ts`
- **State:**
  - `soundEnabled: Ref<boolean>` (persisted in `localStorage['nuxt-chat-sound-enabled']`, default `true`)
  - `desktopEnabled: Ref<boolean>` (persisted in `localStorage['nuxt-chat-desktop-enabled']`, default `true`)
  - `permission: Ref<NotificationPermission>` (`'default' | 'granted' | 'denied'`)
  - `toasts: Ref<NotificationToastItem[]>` (reactive queue of active in-app notification toasts, auto-dismiss after 5s)
- **Functions:**
  - `requestPermission(): Promise<NotificationPermission>`
  - `playNotificationSound(): void`
  - `showInAppToast(toast: NotificationToastItem): void`
  - `dismissToast(id: string): void`
  - `notifyIncomingMessage(params: { message: ChatMessage; activeConversationId: string | null; currentUserId?: string; onNavigate?: (convId: string) => void })`

### Component: `app/components/NotificationToastContainer.vue`
- Renders queued in-app notification toasts in the top-right corner (z-50).
- Displays sender avatar/initials, sender display name, message snippet, and close button.
- Clicking the toast navigates to the conversation and dismisses the toast.

### UI Integration:
- **`ChatSidebar.vue` footer:** Adds a Bell toggle button next to Settings & Theme.
  - Clicking requests notification permission if `default`, or toggles mute/unmute if granted.
- **`app/pages/index.vue`:**
  - Mounts `<NotificationToastContainer />`.
  - Connects `notifyIncomingMessage` inside realtime `handleIncomingRealtimeMessage` in `useChatRoom.ts`.
