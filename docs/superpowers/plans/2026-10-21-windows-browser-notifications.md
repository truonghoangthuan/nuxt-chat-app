# Windows Web Browser Desktop Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reliable native Windows OS notifications (Action Center toasts) for the web chat application running in modern Windows browsers (Chrome, Edge, Firefox).

**Architecture:** A lightweight client Service Worker (`public/sw.js`) handles reliable background toast display via `registration.showNotification()` and click-to-focus navigation. `useNotification.ts` manages service worker registration, absolute icon resolution, and fallback to `window.Notification` with reference retention to prevent GC. A non-intrusive `NotificationPermissionBanner.vue` prompts the user for browser permission via user gesture.

**Tech Stack:** Nuxt 4, Vue 3, Service Worker API (`ServiceWorkerRegistration.showNotification`), Web Notifications API, Lucide Vue icons, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-21-windows-browser-notifications-design.md`

## Global Constraints
- Must function reliably in standard modern web browsers on Windows (Chrome, Edge, Firefox).
- All browser Web APIs (`navigator.serviceWorker`, `window.Notification`, `AudioContext`, `localStorage`) must be SSR-safe with Vitest fallbacks.
- Never notify on own messages (`row.user_id === currentUserId`).
- Never show Windows desktop toast if user is actively focused on the target conversation.
- No external audio binary files; sound remains synthesized via Web Audio API.
- All vitest test suites must pass (`npm test`).

## Review Focus
- Browser without Service Worker support (e.g. happy-dom or insecure HTTP): must fall back to `new window.Notification()` cleanly without throwing.
- Service Worker registration failure: must not crash or degrade realtime messaging.
- Rapid incoming messages: multiple notifications must coalesce or use unique tags without blowing up Action Center.
- Inactive tab clicked in Action Center: window must focus and navigate to the target conversation.
- Relative icon URLs: must be converted to absolute URLs matching current origin.

---

### Task 1: Service Worker Script for Background Notifications
**Files:**
- Create: `public/sw.js`

- [x] Create `public/sw.js` implementing:
  - `install` with `self.skipWaiting()`
  - `activate` with `self.clients.claim()`
  - `notificationclick` closing toast, focusing open client window, and posting `{ type: 'NAVIGATE_CONVERSATION', conversationId }`, or opening `/` if no client exists.
- [x] Verify file is accessible as a static asset in the Nuxt environment.

---

### Task 2: Enhance `useNotification` with Service Worker & Retention
**Files:**
- Modify: `app/composables/useNotification.ts`
- Test: `tests/composables/useNotification.test.ts`

- [x] Write failing unit tests in `tests/composables/useNotification.test.ts` for:
  - Invoking `serviceWorker.showNotification` when service worker registration is available.
  - Retaining `Notification` instance in `activeNotifications` Set until closed or clicked when falling back to `window.Notification`.
  - Formatting icon path as absolute URL using `origin` or window location.
  - Setting notification data payload with `conversationId`.
- [x] Run `npm test tests/composables/useNotification.test.ts` to confirm test failure.
- [x] Implement service worker registration and fallback logic in `app/composables/useNotification.ts`.
- [x] Run `npm test tests/composables/useNotification.test.ts` to verify tests pass.

---

### Task 3: Notification Permission Banner Component
**Files:**
- Create: `app/components/NotificationPermissionBanner.vue`
- Test: `tests/components/NotificationPermissionBanner.test.ts`

- [x] Write unit tests in `tests/components/NotificationPermissionBanner.test.ts` for:
  - Rendering when `permission === 'default'` and not dismissed.
  - Hiding when `permission !== 'default'`.
  - Emitting `requestPermission` when clicking "Enable".
  - Hiding when clicking "Dismiss".
- [x] Implement `app/components/NotificationPermissionBanner.vue` styled with Tailwind and Lucide icons (`Bell`, `X`).
- [x] Run `npm test tests/components/NotificationPermissionBanner.test.ts` to verify tests pass.

---

### Task 4: UI Integration in Page & Sidebar
**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/chatUi.test.ts`

- [x] In `ChatSidebar.vue`:
  - Show visual badge / state when `notificationPermission === 'default'` (e.g. amber dot or hint) so user knows notifications are awaiting browser approval.
- [x] In `app/pages/index.vue`:
  - Mount `<NotificationPermissionBanner />` above chat viewport when permission is `'default'`.
  - Handle `requestPermission` callback.
  - Listen for service worker postMessage `{ type: 'NAVIGATE_CONVERSATION', conversationId }` and trigger `selectConversation(conversationId)`.
- [x] Update `tests/components/chatUi.test.ts` and `tests/components/indexPage.test.ts` to reflect the updated banner and controls.
- [x] Run full test suite `npm test` to verify all 21+ test files pass cleanly.
