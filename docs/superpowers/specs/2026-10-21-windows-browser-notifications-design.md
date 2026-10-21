# Windows Web Browser Desktop Notifications Design

## 1. Problem & Intent
When users run this chat web application on Windows in modern web browsers (Chrome, Edge, Firefox), OS-level notifications (Windows Action Center toasts) fail to display.
The failure stems from four concrete browser/OS integration gaps:
1. **Unprompted Permission:** `Notification.permission` remains `'default'` on first visit. The UI shows an active bell icon, masking that browser permission was never granted.
2. **Background Tab Throttling:** Modern Chromium on Windows throttles or drops `new window.Notification()` calls from background/minimized tabs. `ServiceWorkerRegistration.showNotification()` is the standard, reliable W3C method for Windows Action Center toasts.
3. **Garbage Collection (GC):** Transient JavaScript notification instances (`new Notification(...)`) without retained references are garbage-collected by V8 before the Windows Notification Platform IPC finishes rendering the toast.
4. **Relative Icon Path:** `/favicon.ico` is relative and `.ico` format. Windows Toast XML requires an absolute URL and prefers PNG/SVG.

This feature resolves these gaps so that any incoming message while the tab is blurred, minimized, or in another channel reliably produces a native Windows Action Center banner with sound and click-to-focus navigation.

---

## 2. Invariants & Decision Log
- **Reliable Windows Delivery:** Use `ServiceWorkerRegistration.showNotification()` whenever a service worker is registered and ready. Fall back to `new window.Notification()` if unsupported or in test/SSR environments.
- **Reference Retention:** Keep active notification instances in a module-level `Set<Notification>` until closed or clicked, preventing premature V8 GC.
- **Absolute Icon URL:** Construct absolute icon URLs (`${window.location.origin}/favicon.ico` or SVG badge) so Windows Toast XML parsers never reject relative paths.
- **Proactive Permission Banner:** If `notificationPermission === 'default'`, display a non-intrusive, dismissible banner above the chat viewport with an "Enable Notifications" button that triggers `requestNotificationPermission()` via a clean user gesture.
- **Action Center Click Navigation:** Clicking a Windows notification focuses the browser window (`window.focus()` or Service Worker `clients.matchAll() -> client.focus()`) and selects the sender conversation via message bus / callback.
- **E2EE & Privacy:** Content snippet is sanitized and decrypted client-side prior to invoking `showNotification`. Ciphertext is never leaked into Windows Notification logs.
- **Self & Active Chat Suppression:** Messages sent by the current user or messages arriving in the currently focused active room do NOT spawn desktop notifications.
- **Vitest & SSR Safe:** All browser Web APIs (`navigator.serviceWorker`, `window.Notification`, `localStorage`) are guarded and unit-tested without live network or browser dependencies.

---

## 3. Architecture & State Design

### Service Worker: `public/sw.js`
- Handles `install` (`self.skipWaiting()`) and `activate` (`clients.claim()`).
- Listens for `notificationclick` events:
  - Closes the notification (`event.notification.close()`).
  - Matches open window clients and focuses the matching tab.
  - Sends a postMessage `{ type: 'NAVIGATE_CONVERSATION', conversationId }` so the Vue app switches to the correct room.
  - If no client is open, opens `/`.

### Composable: `app/composables/useNotification.ts`
- **Service Worker Lifecycle:**
  - Registers `/sw.js` upon initialization when `navigator.serviceWorker` is present.
  - Listens for `navigator.serviceWorker.onmessage` for navigation events.
- **Desktop Toast Dispatch:**
  - `showDesktopNotification(title, options, onNavigate)`:
    - Resolves absolute icon URL.
    - Checks `navigator.serviceWorker?.ready`. If available, calls `reg.showNotification(title, options)`.
    - If service worker is unavailable, instantiates `new window.Notification(title, options)` and adds it to `activeNotifications: Set<Notification>`.
- **Permission Sync:**
  - `requestPermission()` prompts via user gesture, updates `permission.value`, and registers service worker if granted.

### Component: `app/components/NotificationPermissionBanner.vue`
- Renders a clean banner at the top of the chat area when `permission === 'default'` and not dismissed in session.
- Offers "Enable notifications" (calls `requestPermission()`) and "Dismiss" (sets local session state).

### UI Controls:
- **`ChatSidebar.vue`:**
  - If `permission === 'default'`, displays amber indicator or tooltip indicating permissions are not yet configured.
- **`app/pages/index.vue`:**
  - Integrates `NotificationPermissionBanner.vue`.
  - Listens for service worker navigation events to select the conversation.

---

## 4. Testing Strategy
- Unit tests in `tests/composables/useNotification.test.ts`:
  - Service worker `showNotification` branch.
  - Fallback `window.Notification` branch with instance retention in `activeNotifications`.
  - Absolute icon resolution.
  - Click-through navigation payload.
- Component tests in `tests/components/NotificationPermissionBanner.test.ts`:
  - Renders when permission is `'default'`.
  - Emits request-permission on click.
  - Dismiss hides banner.
- Regression verification: `npm test` passes all test suites.
