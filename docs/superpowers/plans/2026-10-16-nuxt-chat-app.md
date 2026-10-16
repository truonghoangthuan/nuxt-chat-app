# Nuxt 4 Real-Time Friends Chat App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time multi-channel chat application for friends in Nuxt 4 backed by Supabase Auth, Postgres, and Realtime with optimistic messaging, global presence, typing indicators, cursor pagination, and exponential-backoff reconnection.

**Architecture:** Nuxt 4 SPA/SSR hybrid using `@nuxtjs/supabase` and `@nuxtjs/tailwindcss`. Pure state engines (`useMessagesState`, `useTypingState`, `usePresenceState`, `useConnectionManager`) handle optimistic deduplication, cursor pagination, typing timeouts, and backoff scheduling independently of the DOM, while `useChatRoom` binds them to Supabase Postgres queries and Realtime channels (`presence:global`, `postgres_changes`, and `broadcast`).

**Tech Stack:** Nuxt `^4.6.1`, Vue `^3.5.43`, `@nuxtjs/supabase`, `@nuxtjs/tailwindcss`, Vitest, `@vue/test-utils`, `happy-dom`.

**Spec:** [docs/superpowers/specs/2026-10-16-nuxt-chat-app-design.md](file:///c:/work/temp/playground/nuxt-chat-app/docs/superpowers/specs/2026-10-16-nuxt-chat-app-design.md)

## Global Constraints

- Framework: Nuxt `^4.6.1` with `app/` source directory structure.
- Backend: Supabase (`@nuxtjs/supabase`) for Email+Password Auth, Postgres (`profiles`, `channels`, `messages`), and Realtime (`postgres_changes`, `broadcast`, `presence`).
- Styling: Tailwind CSS (`@nuxtjs/tailwindcss`) with class-based dark mode (`dark` class on `<html>`), defaulting to Dark Slate with a persistent Light/Dark toggle in the sidebar footer.
- Default seeded channels: `#general` and `#random`; any authenticated user can create new public channels (`slug` normalized to lowercase alphanumeric + hyphens, `2–32` chars).
- Message constraints: Plain text only, `char_length(trim(content)) > 0` and `<= 4000` characters, `Enter` sends, `Shift+Enter` inserts newline.
- Pagination & Scroll: `40` messages per page via composite cursor `(created_at, id)`; upward scroll locks viewport offset; auto-scroll on new message when within `120px` of bottom (or own message), else show `"↓ X new messages"` pill.
- Reconnection backoff: `min(1000 * 2 ** attempt, 30000)` ms (`1s, 2s, 4s, 8s, 16s, max 30s`) with amber status banner, manual `"Retry now"` action, and missed-message catch-up fetch on reconnect.

## Review Focus

1. **Duplicate Realtime `INSERT` + HTTP ack race (`client_id` collision)**: When a user sends a message, the Realtime `INSERT` broadcast may arrive before or after the HTTP `insert` response; both must reconcile to a single `'sent'` message in the list without duplicating. (Tested in Task 2)
2. **Overlapping history page / reconnect gap catch-up rows**: Prepending older messages or merging missed messages after reconnect must deduplicate by `id` and `client_id` and maintain strict chronological order `(created_at ASC, id ASC)`. (Tested in Task 2)
3. **IME composition `Enter` key press**: Pressing `Enter` while composing CJK/accented characters (`event.isComposing === true`) must not prematurely send the message. (Tested in Task 1)
4. **Multi-tab presence duplication**: A friend logged in across multiple browser tabs emits multiple Supabase Presence entries under or across keys; the online friends list must deduplicate by `user_id`. (Tested in Task 3)
5. **Stale typing indicator after message send or timeout**: When a typing user sends a message or stops typing for `3000ms`, their `"is typing..."` indicator must clear immediately, and the current user's own typing events must never display locally. (Tested in Task 3)

---

## File Map

- `supabase/schema.sql` — Postgres tables (`profiles`, `channels`, `messages`), RLS policies, `on_auth_user_created` profile trigger, `#general` & `#random` seed rows, and `supabase_realtime` publication.
- `.env.example` — Template for `SUPABASE_URL` and `SUPABASE_KEY`.
- `vitest.config.ts` — Vitest configuration with `happy-dom` and `@` / `~` path aliases to `./app`.
- `app/types/chat.ts` — Shared TypeScript interfaces (`Profile`, `Channel`, `ChatMessage`, `MessageStatus`, `ConnectionStatus`, `TypingUser`).
- `app/utils/chat.ts` — Pure helpers for slug normalization, avatar initials/color hashing, exponential backoff calculation, and keyboard send detection.
- `app/composables/useMessagesState.ts` — Pure reactive message collection handling optimistic inserts, `client_id` reconciliation, failure/retry states, history prepending, and reconnect gap merging.
- `app/composables/useTypingState.ts` — Per-channel typing tracker with `3000ms` auto-expiry and human-readable label formatter.
- `app/composables/usePresenceState.ts` — Global presence normalizer and `user_id` deduplicator.
- `app/composables/useConnectionManager.ts` — Exponential backoff scheduler (`1s` to `30s`), countdown ticker, and manual retry handler.
- `app/composables/useTheme.ts` — Dark/Light theme state (`dark` default) persisted to `localStorage` and synced to `document.documentElement.classList`.
- `app/composables/useAuthProfile.ts` — Supabase email/password sign-up, login, logout, and current user `Profile` loader/creator.
- `app/composables/useChatRoom.ts` — Main orchestrator wiring Supabase queries and Realtime channels to state composables.
- `app/middleware/auth.global.ts` — Redirects unauthenticated users to `/login` and authenticated users away from `/login`.
- `app/pages/login.vue` — Email + password login and sign-up (with display name) screen.
- `app/pages/index.vue` — Option A chat layout combining sidebar, connection banner, message viewport, composer, and new-channel modal.
- `app/components/UserAvatar.vue` — Colored circle badge with 1–2 uppercase initials and optional online dot.
- `app/components/ChatSidebar.vue` — Unified left sidebar (mobile drawer + desktop fixed) with header, channels list, unread badges, online friends, and user footer (theme toggle + logout).
- `app/components/CreateChannelModal.vue` — Modal form to create a new public channel with live slug preview.
- `app/components/ConnectionBanner.vue` — Amber banner shown when `connectionStatus !== 'connected'` with countdown and `"Retry now"` button.
- `app/components/MessageViewport.vue` — Scrollable message list with top infinite-scroll trigger, scroll-height anchor lock, optimistic status actions (`Retry` / `Dismiss`), and `"↓ X new messages"` pill.
- `app/components/MessageComposer.vue` — Auto-resizing textarea (`Enter` to send, `Shift+Enter` for newline) with typing indicator bar above.

---

### Task 1: Project Setup, Database Schema & Pure Domain Helpers

**Files:**
- Modify: `package.json`, `nuxt.config.ts`
- Create: `.env.example`, `vitest.config.ts`, `supabase/schema.sql`, `app/types/chat.ts`, `app/utils/chat.ts`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Produces in `app/types/chat.ts`:
  ```ts
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
  ```
- Produces in `app/utils/chat.ts`:
  - `AVATAR_PALETTE: readonly string[]` (8 accessible Tailwind/hex colors)
  - `normalizeChannelSlug(input: string): string`
  - `isValidChannelSlug(slug: string): boolean`
  - `getAvatarInitials(displayName: string): string`
  - `getAvatarColor(seed: string): string`
  - `calculateBackoffMs(attempt: number): number`
  - ` isValidMessageContent(content: string): boolean`
  - `shouldSendOnKeydown(event: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean`

- [ ] **Step 1: Install dependencies and configure Nuxt & Vitest**

Run:
```bash
npm install @nuxtjs/supabase @nuxtjs/tailwindcss
npm install -D vitest @vue/test-utils happy-dom
```
Configure `nuxt.config.ts` to register `@nuxtjs/tailwindcss` and `@nuxtjs/supabase` (with `supabase: { redirectOptions: { login: '/login', callback: '/confirm', exclude: [] } }`), add `"test": "vitest run"` to `package.json`, create `.env.example` with `SUPABASE_URL=` and `SUPABASE_KEY=`, and create `vitest.config.ts` resolving `~` and `@` to `./app`.

- [ ] **Step 2: Create `supabase/schema.sql` with tables, RLS, trigger, seed data, and realtime publication**

Write `supabase/schema.sql` defining `public.profiles`, `public.channels`, `public.messages` (with `client_id uuid unique not null`, `content` check `1..4000` trimmed chars, and index `messages_channel_cursor_idx on public.messages (channel_id, created_at desc, id desc)`), RLS policies for `authenticated`, the `on_auth_user_created` trigger reading `raw_user_meta_data->>'display_name'` and `raw_user_meta_data->>'avatar_color'`, seed rows for `general` and `random`, and `alter publication supabase_realtime add table public.messages, public.channels;`.

- [ ] **Step 3: Write the failing unit tests in `tests/utils/chat.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeChannelSlug,
  isValidChannelSlug,
  getAvatarInitials,
  getAvatarColor,
  calculateBackoffMs,
  isValidMessageContent,
  shouldSendOnKeydown,
  AVATAR_PALETTE,
} from '~/utils/chat'

describe('chat utils', () => {
  it('normalizes channel names into lowercase hyphenated slugs', () => {
    expect(normalizeChannelSlug('  Movie Night! 2026 ')).toBe('movie-night-2026')
    expect(normalizeChannelSlug('#General___Chat')).toBe('general-chat')
  })

  it('validates channel slugs between 2 and 32 chars', () => {
    expect(isValidChannelSlug('general')).toBe(true)
    expect(isValidChannelSlug('a')).toBe(false)
    expect(isValidChannelSlug('a'.repeat(33))).toBe(false)
    expect(isValidChannelSlug('Invalid_Slug')).toBe(false)
  })

  it('extracts 1-2 uppercase initials and deterministic palette color', () => {
    expect(getAvatarInitials('Alice Wonderland')).toBe('AW')
    expect(getAvatarInitials('bob')).toBe('BO')
    const color = getAvatarColor('user-123')
    expect(AVATAR_PALETTE).toContain(color)
    expect(getAvatarColor('user-123')).toBe(color)
  })

  it('calculates exponential backoff capped at 30000ms', () => {
    expect(calculateBackoffMs(0)).toBe(1000)
    expect(calculateBackoffMs(1)).toBe(2000)
    expect(calculateBackoffMs(2)).toBe(4000)
    expect(calculateBackoffMs(3)).toBe(8000)
    expect(calculateBackoffMs(4)).toBe(16000)
    expect(calculateBackoffMs(5)).toBe(30000)
    expect(calculateBackoffMs(9)).toBe(30000)
  })

  it('validates plain text message length (1..4000 trimmed)', () => {
    expect(isValidMessageContent('   ')).toBe(false)
    expect(isValidMessageContent('hello')).toBe(true)
    expect(isValidMessageContent('a'.repeat(4001))).toBe(false)
  })

  it('sends on Enter without Shift and ignores IME composition Enter', () => {
    expect(shouldSendOnKeydown({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true)
    expect(shouldSendOnKeydown({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false)
    expect(shouldSendOnKeydown({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL with module `~/utils/chat` not found.

- [ ] **Step 5: Implement `app/types/chat.ts` and `app/utils/chat.ts`**

Implement the types and pure helper functions to satisfy all assertions in `tests/utils/chat.test.ts`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json nuxt.config.ts vitest.config.ts .env.example supabase/schema.sql app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat: add supabase schema, types, and pure chat utilities"
```

---

### Task 2: Message List State, Optimistic Deduplication, Retry & Gap Healing

**Files:**
- Create: `app/composables/useMessagesState.ts`
- Test: `tests/composables/useMessagesState.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `Profile` from `app/types/chat.ts`; `isValidMessageContent` from `app/utils/chat.ts`
- Produces in `app/composables/useMessagesState.ts`:
  ```ts
  export function createMessagesStore() {
    // messages: Ref<ChatMessage[]>
    // addOptimisticMessage(params: { clientId: string; channelId: string; user: Profile; content: string; createdAt?: string }): ChatMessage | null
    // markMessageSent(clientId: string, serverRow: Omit<ChatMessage, 'status'>): void
    // markMessageFailed(clientId: string): void
    // markMessageRetrying(clientId: string): ChatMessage | null
    // dismissMessage(clientId: string): void
    // reconcileIncomingMessage(serverRow: Omit<ChatMessage, 'status'>): 'updated' | 'appended' | 'ignored'
    // setInitialHistory(rows: Array<Omit<ChatMessage, 'status'>>): void
    // prependHistoryPage(olderRows: Array<Omit<ChatMessage, 'status'>>): number
    // mergeGapMessages(missedRows: Array<Omit<ChatMessage, 'status'>>): number
    // getOldestCursor(): { created_at: string; id: string } | null
    // getLastConfirmedTimestamp(): string | null
  }
  ```

- [ ] **Step 1: Write the failing tests in `tests/composables/useMessagesState.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { createMessagesStore } from '~/composables/useMessagesState'
import type { Profile } from '~/types/chat'

const alice: Profile = { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' }

describe('useMessagesState', () => {
  it('adds an optimistic message and deduplicates when Realtime INSERT arrives before HTTP ack', () => {
    const store = createMessagesStore()
    const opt = store.addOptimisticMessage({
      clientId: 'c-1',
      channelId: 'ch-1',
      user: alice,
      content: 'Hello friends!',
      createdAt: '2026-10-16T10:00:00.000Z',
    })
    expect(opt?.status).toBe('sending')
    expect(store.messages.value).toHaveLength(1)

    // Realtime arrives first
    const outcome = store.reconcileIncomingMessage({
      id: 'srv-1',
      client_id: 'c-1',
      channel_id: 'ch-1',
      user_id: alice.id,
      content: 'Hello friends!',
      created_at: '2026-10-16T10:00:01.000Z',
      author: alice,
    })
    expect(outcome).toBe('updated')
    expect(store.messages.value).toHaveLength(1)
    expect(store.messages.value[0].id).toBe('srv-1')
    expect(store.messages.value[0].status).toBe('sent')

    // HTTP ack arrives second — still 1 message
    store.markMessageSent('c-1', {
      id: 'srv-1',
      client_id: 'c-1',
      channel_id: 'ch-1',
      user_id: alice.id,
      content: 'Hello friends!',
      created_at: '2026-10-16T10:00:01.000Z',
      author: alice,
    })
    expect(store.messages.value).toHaveLength(1)
  })

  it('rejects whitespace-only or >4000 char optimistic messages', () => {
    const store = createMessagesStore()
    expect(store.addOptimisticMessage({ clientId: 'c-empty', channelId: 'ch-1', user: alice, content: '   ' })).toBeNull()
    expect(store.messages.value).toHaveLength(0)
  })

  it('transitions failed messages to retrying and allows dismissing failed messages', () => {
    const store = createMessagesStore()
    store.addOptimisticMessage({ clientId: 'c-2', channelId: 'ch-1', user: alice, content: 'Test retry' })
    store.markMessageFailed('c-2')
    expect(store.messages.value[0].status).toBe('failed')

    const retrying = store.markMessageRetrying('c-2')
    expect(retrying?.status).toBe('sending')

    store.markMessageFailed('c-2')
    store.dismissMessage('c-2')
    expect(store.messages.value).toHaveLength(0)
  })

  it('prepends older history pages and merges reconnect gap messages without duplicates in chronological order', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      { id: 'm-3', client_id: 'c-3', channel_id: 'ch-1', user_id: alice.id, content: 'Third', created_at: '2026-10-16T10:03:00Z' },
      { id: 'm-2', client_id: 'c-2', channel_id: 'ch-1', user_id: alice.id, content: 'Second', created_at: '2026-10-16T10:02:00Z' },
    ])
    expect(store.messages.value.map(m => m.id)).toEqual(['m-2', 'm-3'])

    const addedOlder = store.prependHistoryPage([
      { id: 'm-2', client_id: 'c-2', channel_id: 'ch-1', user_id: alice.id, content: 'Second', created_at: '2026-10-16T10:02:00Z' },
      { id: 'm-1', client_id: 'c-1', channel_id: 'ch-1', user_id: alice.id, content: 'First', created_at: '2026-10-16T10:01:00Z' },
    ])
    expect(addedOlder).toBe(1)
    expect(store.messages.value.map(m => m.id)).toEqual(['m-1', 'm-2', 'm-3'])
    expect(store.getOldestCursor()).toEqual({ created_at: '2026-10-16T10:01:00Z', id: 'm-1' })

    const addedGap = store.mergeGapMessages([
      { id: 'm-3', client_id: 'c-3', channel_id: 'ch-1', user_id: alice.id, content: 'Third', created_at: '2026-10-16T10:03:00Z' },
      { id: 'm-4', client_id: 'c-4', channel_id: 'ch-1', user_id: alice.id, content: 'Fourth', created_at: '2026-10-16T10:04:00Z' },
    ])
    expect(addedGap).toBe(1)
    expect(store.messages.value.map(m => m.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-4'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useMessagesState.test.ts`
Expected: FAIL with module `~/composables/useMessagesState` not found.

- [ ] **Step 3: Implement `createMessagesStore` in `app/composables/useMessagesState.ts`**

Sort confirmed messages by `created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)` and deduplicate by both `id` and `client_id`. Keep any pending `'sending'` / `'failed'` optimistic items anchored at the end until reconciled.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useMessagesState.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMessagesState.ts tests/composables/useMessagesState.test.ts
git commit -m "feat: add message state store with optimistic deduplication and pagination"
```

---

### Task 3: Typing Expiry, Global Presence Deduplication & Reconnection Manager

**Files:**
- Create: `app/composables/useTypingState.ts`, `app/composables/usePresenceState.ts`, `app/composables/useConnectionManager.ts`
- Test: `tests/composables/useRealtimeStates.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ConnectionStatus`, `TypingUser` from `app/types/chat.ts`; `calculateBackoffMs` from `app/utils/chat.ts`
- Produces:
  - `createTypingTracker(currentUserId: () => string | undefined, timeoutMs = 3000)` in `app/composables/useTypingState.ts`:
    - `typingUsers: ComputedRef<TypingUser[]>`
    - `typingLabel: ComputedRef<string>` (`""`, `"Alice is typing..."`, `"Alice and Bob are typing..."`, `"3 people are typing..."`)
    - `recordTyping(user: { user_id: string; display_name: string }): void`
    - `clearUserTyping(userId: string): void`
    - `clearAll(): void`
  - `deduplicatePresenceState(rawState: Record<string, Array<{ user_id: string; display_name: string; avatar_color: string; online_at?: string }>>): Profile[]` in `app/composables/usePresenceState.ts`
  - `createConnectionManager(onReconnectAttempt: () => Promise<boolean> | boolean)` in `app/composables/useConnectionManager.ts`:
    - `status: Ref<ConnectionStatus>`
    - `attempt: Ref<number>`
    - `nextRetryMs: Ref<number>`
    - `handleDisconnect(): void`
    - `handleConnected(): void`
    - `retryNow(): Promise<void>`
    - `dispose(): void`

- [ ] **Step 1: Write the failing tests in `tests/composables/useRealtimeStates.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTypingTracker } from '~/composables/useTypingState'
import { deduplicatePresenceState } from '~/composables/usePresenceState'
import { createConnectionManager } from '~/composables/useConnectionManager'

describe('realtime state managers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks typing users, ignores self, clears on message send, and expires after 3000ms', () => {
    const tracker = createTypingTracker(() => 'u-self', 3000)

    tracker.recordTyping({ user_id: 'u-self', display_name: 'Me' })
    expect(tracker.typingLabel.value).toBe('')

    tracker.recordTyping({ user_id: 'u-alice', display_name: 'Alice' })
    expect(tracker.typingLabel.value).toBe('Alice is typing...')

    tracker.recordTyping({ user_id: 'u-bob', display_name: 'Bob' })
    expect(tracker.typingLabel.value).toBe('Alice and Bob are typing...')

    // Alice sends a message -> her indicator clears immediately
    tracker.clearUserTyping('u-alice')
    expect(tracker.typingLabel.value).toBe('Bob is typing...')

    // 3000ms elapses -> Bob expires
    vi.advanceTimersByTime(3000)
    expect(tracker.typingLabel.value).toBe('')
  })

  it('deduplicates multi-tab presence entries by user_id and sorts alphabetically', () => {
    const online = deduplicatePresenceState({
      'conn-1': [{ user_id: 'u-2', display_name: 'Bob', avatar_color: '#7c3aed' }],
      'conn-2': [
        { user_id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
        { user_id: 'u-2', display_name: 'Bob', avatar_color: '#7c3aed' },
      ],
    })
    expect(online.map(u => u.display_name)).toEqual(['Alice', 'Bob'])
  })

  it('schedules exponential backoff on disconnect and resets on connect or retryNow', async () => {
    const attempts: number[] = []
    const manager = createConnectionManager(() => {
      attempts.push(Date.now())
      return false
    })

    manager.handleDisconnect()
    expect(manager.status.value).toBe('reconnecting')
    expect(manager.nextRetryMs.value).toBe(1000)

    // 1st attempt at 1000ms -> fails -> schedules 2000ms
    await vi.advanceTimersByTimeAsync(1000)
    expect(attempts).toHaveLength(1)
    expect(manager.attempt.value).toBe(1)
    expect(manager.nextRetryMs.value).toBe(2000)

    // Manual retryNow triggers immediately
    await manager.retryNow()
    expect(attempts).toHaveLength(2)

    manager.handleConnected()
    expect(manager.status.value).toBe('connected')
    expect(manager.attempt.value).toBe(0)
    manager.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useRealtimeStates.test.ts`
Expected: FAIL with modules not found.

- [ ] **Step 3: Implement `useTypingState.ts`, `usePresenceState.ts`, and `useConnectionManager.ts`**

Implement the three composables with per-user timers in `createTypingTracker`, `Map`-based `user_id` deduplication in `deduplicatePresenceState`, and exponential backoff timer scheduling in `createConnectionManager`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useRealtimeStates.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add app/composables/useTypingState.ts app/composables/usePresenceState.ts app/composables/useConnectionManager.ts tests/composables/useRealtimeStates.test.ts
git commit -m "feat: add typing expiry tracker, presence deduplicator, and backoff connection manager"
```

---

### Task 4: Supabase Auth Flow, Profile Hydration & Theme Toggle

**Files:**
- Create: `app/composables/useTheme.ts`, `app/composables/useAuthProfile.ts`, `app/middleware/auth.global.ts`, `app/pages/login.vue`
- Test: `tests/composables/useTheme.test.ts`

**Interfaces:**
- Consumes: `Profile` from `app/types/chat.ts`; `getAvatarColor`, `getAvatarInitials` from `app/utils/chat.ts`
- Produces:
  - `useTheme()` in `app/composables/useTheme.ts`:
    - `isDark: Ref<boolean>` (defaults to `true`)
    - `initTheme(): void` (reads `localStorage.getItem('nuxt-chat-theme')`, applies/removes `dark` class on `document.documentElement`)
    - `toggleTheme(): void` (flips `isDark`, persists `'dark' | 'light'` to `localStorage`, updates `document.documentElement.classList`)
  - `useAuthProfile()` in `app/composables/useAuthProfile.ts`:
    - `currentProfile: Ref<Profile | null>`
    - `ensureProfile(): Promise<Profile | null>`
    - `signInWithPassword(email: string, password: string): Promise<{ error: string | null }>`
    - `signUpWithProfile(email: string, password: string, displayName: string): Promise<{ error: string | null; needsEmailConfirmation: boolean }>`
    - `signOut(): Promise<void>`

- [ ] **Step 1: Write the failing test in `tests/composables/useTheme.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useTheme } from '~/composables/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('defaults to dark mode and toggles to light mode with localStorage persistence', () => {
    const theme = useTheme()
    theme.initTheme()
    expect(theme.isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    theme.toggleTheme()
    expect(theme.isDark.value).toBe(false)
    expect(localStorage.getItem('nuxt-chat-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useTheme.test.ts`
Expected: FAIL with `~/composables/useTheme` not found.

- [ ] **Step 3: Implement `useTheme.ts`, `useAuthProfile.ts`, `auth.global.ts`, and `login.vue`**

In `useAuthProfile.ts`, pass `options: { data: { display_name: displayName.trim(), avatar_color: getAvatarColor(email) } }` to `supabase.auth.signUp`, and in `ensureProfile()` query `public.profiles` by `user.id` (falling back to an `upsert` if the trigger hasn't populated it yet). In `app/pages/login.vue`, build a Tailwind card with a Sign In / Create Account tab toggle, `email`, `password`, and `displayName` (when signing up) fields, inline error/confirmation banners, and redirect to `/` on success.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useTheme.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add app/composables/useTheme.ts app/composables/useAuthProfile.ts app/middleware/auth.global.ts app/pages/login.vue tests/composables/useTheme.test.ts
git commit -m "feat: add supabase auth profile composable, route guard, login page, and dark/light theme toggle"
```

---

### Task 5: Supabase Realtime Orchestrator (`useChatRoom`)

**Files:**
- Create: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `createMessagesStore`, `createTypingTracker`, `deduplicatePresenceState`, `createConnectionManager`, `useAuthProfile`, `normalizeChannelSlug`, `isValidChannelSlug`, `isValidMessageContent`
- Produces in `app/composables/useChatRoom.ts`:
  ```ts
  export const PAGE_SIZE = 40

  export function useChatRoom() {
    // channels: Ref<Channel[]>
    // activeChannelId: Ref<string | null>
    // activeChannel: ComputedRef<Channel | null>
    // messages: Ref<ChatMessage[]>
    // hasMoreHistory: Ref<boolean>
    // isLoadingHistory: Ref<boolean>
    // unreadCounts: Ref<Record<string, number>>
    // onlineFriends: Ref<Profile[]>
    // typingLabel: ComputedRef<string>
    // connectionStatus: Ref<ConnectionStatus>
    // reconnectCountdownSec: ComputedRef<number>
    // initializeChat(): Promise<void>
    // selectChannel(channelId: string): Promise<void>
    // createChannel(name: string, description?: string): Promise<{ channel: Channel | null; error: string | null }>
    // sendMessage(content: string): Promise<void>
    // retryMessage(clientId: string): Promise<void>
    // dismissMessage(clientId: string): void
    // loadOlderMessages(): Promise<number>
    // notifyTyping(): void
    // retryConnectionNow(): Promise<void>
    // cleanupChat(): void
  }
  ```

- [ ] **Step 1: Write the failing tests in `tests/composables/useChatRoom.test.ts`**

Test channel creation slug validation, unread badge incrementing when an incoming `INSERT` arrives for a non-active `channel_id` (and clearing to `0` on `selectChannel`), and `sendMessage` / `retryMessage` invoking Supabase `from('messages').insert` with the same `client_id`.

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleIncomingRealtimeMessage } from '~/composables/useChatRoom'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'

describe('useChatRoom realtime message routing', () => {
  it('increments unread count for inactive channels and reconciles messages for active channel', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-me', 3000)
    const unreadCounts: Record<string, number> = {}

    typing.recordTyping({ user_id: 'u-alice', display_name: 'Alice' })

    // Message for inactive channel ch-random
    handleIncomingRealtimeMessage({
      row: {
        id: 'm-10',
        client_id: 'c-10',
        channel_id: 'ch-random',
        user_id: 'u-alice',
        content: 'Random thought',
        created_at: '2026-10-16T11:00:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
    })
    expect(unreadCounts['ch-random']).toBe(1)
    expect(store.messages.value).toHaveLength(0)

    // Message for active channel ch-general from Alice -> appends and clears Alice's typing
    handleIncomingRealtimeMessage({
      row: {
        id: 'm-11',
        client_id: 'c-11',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: 'Hello general',
        created_at: '2026-10-16T11:01:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
    })
    expect(store.messages.value).toHaveLength(1)
    expect(typing.typingLabel.value).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL with `~/composables/useChatRoom` not found.

- [ ] **Step 3: Implement `useChatRoom.ts`**

Wire:
1. `loadChannels()` querying `public.channels` ordered by `created_at ASC` and auto-selecting `#general` (or first channel).
2. `selectChannel(channelId)` resetting `unreadCounts[channelId] = 0`, fetching the latest `PAGE_SIZE` (`40`) messages with `select('*, author:profiles(id, display_name, avatar_color)')` ordered by `created_at DESC, id DESC`, and subscribing the typing broadcast channel `typing:${channelId}`.
3. `loadOlderMessages()` querying messages where `created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id)` ordered by `created_at DESC, id DESC` limit `40`, passing rows to `messagesStore.prependHistoryPage`, and updating `hasMoreHistory`.
4. `presence:global` channel tracking `{ user_id, display_name, avatar_color, online_at }` and updating `onlineFriends` via `deduplicatePresenceState`.
5. `postgres_changes` channel listening to `INSERT` on `public.messages` and `public.channels`, plus `createConnectionManager` handling `TIMED_OUT` / `CHANNEL_ERROR` / browser `offline` events and calling `fetchGapMessages()` (`created_at > getLastConfirmedTimestamp()`) on reconnect.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat: implement useChatRoom orchestrator for channels, messages, presence, typing, and reconnect"
```

---

### Task 6: Chat UI Components & Main Page Assembly (Option A Layout + Option C Theme)

**Files:**
- Create: `app/components/UserAvatar.vue`, `app/components/ChatSidebar.vue`, `app/components/CreateChannelModal.vue`, `app/components/ConnectionBanner.vue`, `app/components/MessageViewport.vue`, `app/components/MessageComposer.vue`, `app/pages/index.vue`
- Modify: `app/app.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `useChatRoom()`, `useAuthProfile()`, `useTheme()`, `shouldSendOnKeydown`, `getAvatarInitials`, `getAvatarColor`, `normalizeChannelSlug`, `isValidChannelSlug`
- Produces:
  - `UserAvatar.vue`: props `{ displayName: string; avatarColor?: string; showOnline?: boolean; size?: 'sm' | 'md' }`
  - `ConnectionBanner.vue`: props `{ status: ConnectionStatus; countdownSec: number }`, emits `retry`
  - `ChatSidebar.vue`: props `{ channels: Channel[]; activeChannelId: string | null; unreadCounts: Record<string, number>; onlineFriends: Profile[]; currentUser: Profile | null; isDark: boolean; connectionStatus: ConnectionStatus; isOpenMobile: boolean }`, emits `selectChannel`, `openCreateChannel`, `toggleTheme`, `logout`, `closeMobile`
  - `CreateChannelModal.vue`: props `{ isOpen: boolean }`, emits `close`, `create(payload: { name: string; description: string })`
  - `MessageViewport.vue`: props `{ messages: ChatMessage[]; hasMoreHistory: boolean; isLoadingHistory: boolean; currentUserId?: string; loadOlder: () => Promise<number> }`, emits `retry(clientId: string)`, `dismiss(clientId: string)`
  - `MessageComposer.vue`: props `{ channelSlug: string; typingLabel: string; disabled?: boolean }`, emits `send(content: string)`, `typing`

- [ ] **Step 1: Write the failing component tests in `tests/components/chatUi.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageComposer from '~/components/MessageComposer.vue'
import ConnectionBanner from '~/components/ConnectionBanner.vue'
import MessageViewport from '~/components/MessageViewport.vue'

describe('Chat UI components', () => {
  it('MessageComposer emits send on Enter, newline on Shift+Enter, and renders typingLabel', async () => {
    const wrapper = mount(MessageComposer, {
      props: { channelSlug: 'general', typingLabel: 'Alice is typing...' },
    })
    expect(wrapper.text()).toContain('Alice is typing...')

    const textarea = wrapper.find('textarea')
    await textarea.setValue('Hello world')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('send')).toBeFalsy()

    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })
    expect(wrapper.emitted('send')?.[0]).toEqual(['Hello world'])
  })

  it('ConnectionBanner shows countdown when reconnecting and emits retry when clicked', async () => {
    const wrapper = mount(ConnectionBanner, {
      props: { status: 'reconnecting', countdownSec: 4 },
    })
    expect(wrapper.text()).toContain('4s')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
  })

  it('MessageViewport renders optimistic Sending and Failed states with Retry and Dismiss buttons', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-1',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'c-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Pending msg',
            created_at: '2026-10-16T12:00:00Z',
            status: 'sending',
            author: { id: 'u-1', display_name: 'You', avatar_color: '#059669' },
          },
          {
            id: 'c-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-1',
            content: 'Failed msg',
            created_at: '2026-10-16T12:01:00Z',
            status: 'failed',
            author: { id: 'u-1', display_name: 'You', avatar_color: '#059669' },
          },
        ],
      },
    })
    expect(wrapper.text()).toContain('Sending...')
    expect(wrapper.text()).toContain('Failed to send')

    await wrapper.find('[data-test="retry-c-2"]').trigger('click')
    expect(wrapper.emitted('retry')?.[0]).toEqual(['c-2'])

    await wrapper.find('[data-test="dismiss-c-2"]').trigger('click')
    expect(wrapper.emitted('dismiss')?.[0]).toEqual(['c-2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL with component modules not found.

- [ ] **Step 3: Implement the UI components, `app/pages/index.vue`, and `app/app.vue`**

Implement `UserAvatar.vue`, `ConnectionBanner.vue`, `ChatSidebar.vue`, `CreateChannelModal.vue`, `MessageViewport.vue`, `MessageComposer.vue`, `app/pages/index.vue`, and update `app/app.vue` to render `<NuxtPage />` and initialize `useTheme().initTheme()` on mount. In `MessageViewport.vue`:
- When prepending older messages via `loadOlder()`, capture `prevScrollHeight` and `prevScrollTop` before the await and set `container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop` after `nextTick()`.
- Watch `messages.length`: if `scrollHeight - scrollTop - clientHeight <= 120` or the newest message is from `currentUserId`, scroll to bottom; otherwise increment `newMessagesCount` and display a floating `"↓ X new messages"` pill that scrolls to bottom when clicked.

- [ ] **Step 4: Run full test suite and typecheck/build verification**

Run:
```bash
npx vitest run
npm run build
```
Expected: All Vitest suites PASS and `nuxt build` completes with exit code `0`.

- [ ] **Step 5: Commit**

```bash
git add app/app.vue app/pages/index.vue app/components/ tests/components/chatUi.test.ts
git commit -m "feat: add Option A Slack-style chat UI components, scroll anchoring, and theme toggle"
```
