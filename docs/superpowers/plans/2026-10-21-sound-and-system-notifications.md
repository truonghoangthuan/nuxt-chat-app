# Sound & System (Windows) Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide audio chimes, native Windows desktop notifications, and in-app toast alerts for incoming chat messages so users never miss messages when multitasking.

**Architecture:** A standalone, pure composable (`useNotification.ts`) wraps the browser Web Audio API (synthesized chime) and Web Notifications API with SSR guards and localStorage persistence. It is hooked directly into `useChatRoom.ts`'s incoming message stream, accompanied by an accessible `<NotificationToastContainer />` and a sidebar footer Bell toggle.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Web Audio API (`AudioContext`), Web Notifications API, Lucide Vue icons (`Bell`, `BellOff`), Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-21-sound-and-system-notifications-design.md`

## Global Constraints
- No external audio binary files; synthesize audio via Web Audio API.
- All Web APIs (`window`, `Notification`, `AudioContext`, `localStorage`) must be SSR-safe with Vitest fallback.
- Never notify on own messages (`row.user_id === currentUserId`).
- Never show Windows desktop toast if user is actively focused on the target conversation.
- All vitest test suites must pass (`npm test`).

## Review Focus
- Web Audio API un-initialized or blocked before first user gesture: must catch errors and fail silently.
- `Notification` API not supported (e.g. in insecure HTTP or unsupported browser): must guard `'Notification' in window`.
- Rapid incoming messages: sound and toasts must throttle or handle overlapping gracefully without audio distortion or memory leaks.
- E2EE images: content formatting must display `[1 Image]` or image count instead of raw envelope.
- Windows Action Center click: clicking notification brings window to focus and navigates to the sender's conversation.

---

### Task 1: Notification Types and Sound Utility
**Files:**
- Create: `app/types/notification.ts`
- Create: `app/utils/sound.ts`
- Test: `tests/utils/sound.test.ts`

- [ ] Write unit tests for `playNotificationChime(audioContextMock)` in `tests/utils/sound.test.ts`.
- [ ] Define `NotificationToastItem` and `NotificationSettings` in `app/types/notification.ts`.
- [ ] Implement `playNotificationChime()` in `app/utils/sound.ts` with Web Audio API (graceful fallback when blocked or audioContext null).
- [ ] Run `npm test` to verify sound utility passes.

---

### Task 2: Core Notification Composable (`useNotification`)
**Files:**
- Create: `app/composables/useNotification.ts`
- Test: `tests/composables/useNotification.test.ts`

- [ ] Write unit tests in `tests/composables/useNotification.test.ts` testing:
  - `soundEnabled` and `desktopEnabled` toggles and persistence in `localStorage`.
  - `requestPermission()` handling for `'granted'`, `'denied'`, and unsupported environments.
  - `notifyIncomingMessage()`:
    - skips own messages.
    - skips desktop notification if conversation is active and document visible.
    - triggers sound and desktop notification when tab hidden or different conversation.
    - enqueues in-app toast for different conversation.
  - `dismissToast(id)` removes toast from queue.
- [ ] Implement `app/composables/useNotification.ts` with SSR guards and full test coverage.
- [ ] Run `npm test` to verify all tests pass.

---

### Task 3: In-App Toast Notification Component
**Files:**
- Create: `app/components/NotificationToastContainer.vue`
- Test: `tests/components/NotificationToast.test.ts`

- [ ] Write component tests in `tests/components/NotificationToast.test.ts` testing rendering of toasts, click-to-navigate, and dismiss button.
- [ ] Implement `app/components/NotificationToastContainer.vue` with Tailwind styles matching the app's visual system (avatar, title, preview, smooth fade/slide, close button).
- [ ] Run `npm test` to verify component test passes.

---

### Task 4: UI Controls & Realtime Chat Integration
**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Modify: `app/composables/useChatRoom.ts`
- Modify: `app/pages/index.vue`
- Test: `tests/components/chatUi.test.ts`
- Test: `tests/composables/useChatRoom.test.ts`

- [ ] Update `ChatSidebar.vue` footer to add Bell / BellOff notification toggle button with accessible tooltip and click handler.
- [ ] Hook `useNotification().notifyIncomingMessage()` into `useChatRoom.ts` inside `handleIncomingRealtimeMessage` (or wire from `index.vue`).
- [ ] Mount `<NotificationToastContainer />` in `app/pages/index.vue`.
- [ ] Update existing tests in `tests/components/chatUi.test.ts` and `tests/composables/useChatRoom.test.ts` to assert notification controls and realtime hooks.
- [ ] Run full test suite `npm test` to verify complete green build across all test suites.
