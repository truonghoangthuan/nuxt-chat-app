# Sub-Project 1: Core Resiliency, Viewport Grouping & Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three core realtime/scroll resiliency bugs (`MessageViewport` channel-switch scroll/unread bug, `useConnectionManager` static countdown & 3-channel reconnect, and redundant profile queries) while adding Slack-style 5-minute message grouping, date dividers, and live-synced Profile Settings (`display_name` + 8-color `avatar_color`).

**Architecture:** Keep `createMessagesStore` as a flat, deterministic `ChatMessage[]` store and project date dividers (`Today`, `Yesterday`, `Oct 18, 2026`) plus 5-minute same-author compact grouping via a pure helper `buildMessageTimeline(messages)`. Add an in-memory `profilesCache` and `public.profiles` `UPDATE` subscription in `useChatRoom`, step `nextRetryMs` down every `1000ms` in `createConnectionManager`, and introduce `ProfileSettingsModal.vue` wired to `useAuthProfile.updateProfile` and `useChatRoom.syncOwnProfile`.

**Tech Stack:** Nuxt 4 (`app/` directory), Vue 3 (`<script setup lang="ts">`), Supabase (`@nuxtjs/supabase`, `@supabase/supabase-js`), Tailwind CSS, Vitest + `@vue/test-utils` (`happy-dom`).

## Global Constraints

- Always resolve the user ID via `extractAuthUserId(authUser)` (with fallback to `supabase.auth.getUser()` or `currentProfile.value?.id`) before reading or writing `profiles`, `channels`, or `messages` so Postgres RLS checks (`auth.uid() = id`) succeed.
- Preserve Vitest / SSR state fallback (`typeof useState !== 'undefined'`) in `useAuthProfile.ts` and `useTheme.ts`.
- Confirmed messages (`status === 'sent'`) remain deduplicated by `id` and `client_id` and sorted by `(created_at ASC, id ASC)`, with pending (`sending` / `failed`) messages appended at the end.
- Display names must be `1..40` trimmed characters (`isValidDisplayName`); avatar colors must belong to the 8-color `AVATAR_PALETTE` (`isValidAvatarColor`).
- Consecutive messages are grouped (`isCompact: true`) if and only if they share the same local calendar day, the same `user_id`, and `Math.abs(Date.parse(curr.created_at) - Date.parse(prev.created_at)) <= 5 * 60 * 1000` (`300,000 ms`).

---

### Task 1: Pure Timeline, Date Divider & Profile Validators

**Files:**
- Modify: `app/types/chat.ts:1-35`
- Modify: `app/utils/chat.ts:1-71`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` from `~/types/chat`, `AVATAR_PALETTE` from `~/utils/chat`
- Produces:
  - `TimelineMessageItem` in `~/types/chat`:
    ```ts
    export interface TimelineMessageItem {
      message: ChatMessage
      showDateDivider: boolean
      dateLabel: string
      isCompact: boolean
    }
    ```
  - `isValidDisplayName(name: string): boolean` in `~/utils/chat`
  - `isValidAvatarColor(color: string): boolean` in `~/utils/chat`
  - `formatDateDivider(isoString: string, now?: Date): string` in `~/utils/chat`
  - `buildMessageTimeline(messages: ChatMessage[], now?: Date): TimelineMessageItem[]` in `~/utils/chat`

- [ ] **Step 1: Write the failing test in `tests/utils/chat.test.ts`**

Add tests for `isValidDisplayName`, `isValidAvatarColor`, `formatDateDivider`, and `buildMessageTimeline` to `tests/utils/chat.test.ts`:

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
  isValidDisplayName,
  isValidAvatarColor,
  formatDateDivider,
  buildMessageTimeline,
  AVATAR_PALETTE,
} from '~/utils/chat'
import type { ChatMessage } from '~/types/chat'

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

  it('validates display names (1..40 trimmed chars) and palette avatar colors', () => {
    expect(isValidDisplayName('   ')).toBe(false)
    expect(isValidDisplayName('Alice')).toBe(true)
    expect(isValidDisplayName('a'.repeat(40))).toBe(true)
    expect(isValidDisplayName('a'.repeat(41))).toBe(false)

    expect(isValidAvatarColor('#0284c7')).toBe(true)
    expect(isValidAvatarColor('#ffffff')).toBe(false)
  })

  it('formats date dividers as Today, Yesterday, or formatted date', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0) // Oct 18, 2026 local
    const todayIso = new Date(2026, 9, 18, 9, 30, 0).toISOString()
    const yesterdayIso = new Date(2026, 9, 17, 22, 15, 0).toISOString()
    const olderIso = new Date(2026, 9, 10, 12, 0, 0).toISOString()

    expect(formatDateDivider(todayIso, now)).toBe('Today')
    expect(formatDateDivider(yesterdayIso, now)).toBe('Yesterday')
    expect(formatDateDivider(olderIso, now)).toBe('Oct 10, 2026')
  })

  it('builds message timeline with date dividers and 5-minute same-author compact grouping', () => {
    const now = new Date(2026, 9, 18, 15, 0, 0)
    const messages: ChatMessage[] = [
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Yesterday msg',
        created_at: new Date(2026, 9, 17, 23, 58, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Today first msg (only 4m later, but across midnight)',
        created_at: new Date(2026, 9, 18, 0, 2, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-3',
        client_id: 'c-3',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Today second msg (2m later, same author -> compact)',
        created_at: new Date(2026, 9, 18, 0, 4, 0).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-4',
        client_id: 'c-4',
        channel_id: 'ch-1',
        user_id: 'u-alice',
        content: 'Today third msg (6m later -> not compact)',
        created_at: new Date(2026, 9, 18, 0, 10, 1).toISOString(),
        status: 'sent',
      },
      {
        id: 'm-5',
        client_id: 'c-5',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Bob replies 30s later -> not compact',
        created_at: new Date(2026, 9, 18, 0, 10, 31).toISOString(),
        status: 'sent',
      },
    ]

    const timeline = buildMessageTimeline(messages, now)
    expect(timeline).toHaveLength(5)

    expect(timeline[0]).toMatchObject({ showDateDivider: true, dateLabel: 'Yesterday', isCompact: false })
    expect(timeline[1]).toMatchObject({ showDateDivider: true, dateLabel: 'Today', isCompact: false })
    expect(timeline[2]).toMatchObject({ showDateDivider: false, dateLabel: 'Today', isCompact: true })
    expect(timeline[3]).toMatchObject({ showDateDivider: false, dateLabel: 'Today', isCompact: false })
    expect(timeline[4]).toMatchObject({ showDateDivider: false, dateLabel: 'Today', isCompact: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL (`isValidDisplayName`, `isValidAvatarColor`, `formatDateDivider`, `buildMessageTimeline` are not exported from `~/utils/chat`).

- [ ] **Step 3: Implement `TimelineMessageItem` in `app/types/chat.ts` and pure helpers in `app/utils/chat.ts`**

Update `app/types/chat.ts`:

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

export interface TimelineMessageItem {
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isCompact: boolean
}

export interface TypingUser {
  user_id: string
  display_name: string
  expires_at: number
}
```

Update `app/utils/chat.ts`:

```ts
import type { ChatMessage, TimelineMessageItem } from '~/types/chat'

export const AVATAR_PALETTE = [
  '#0284c7', // Sky 600
  '#7c3aed', // Violet 600
  '#059669', // Emerald 600
  '#d97706', // Amber 600
  '#e11d48', // Rose 600
  '#4f46e5', // Indigo 600
  '#0891b2', // Cyan 600
  '#c026d3', // Fuchsia 600
] as const

export const GROUPING_WINDOW_MS = 5 * 60 * 1000

export function normalizeChannelSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isValidChannelSlug(slug: string): boolean {
  if (slug.length < 2 || slug.length > 32) {
    return false
  }
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}

export function getAvatarInitials(displayName: string): string {
  const clean = displayName.trim()
  if (!clean) return '?'

  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const first = parts[0][0] || ''
    const second = parts[1][0] || ''
    return `${first}${second}`.toUpperCase()
  }

  const single = parts[0] || ''
  if (single.length >= 2) {
    return single.slice(0, 2).toUpperCase()
  }
  return single.toUpperCase()
}

export function getAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[index]
}

export function calculateBackoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000)
}

export function isValidMessageContent(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.length > 0 && content.length <= 4000
}

export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 40
}

export function isValidAvatarColor(color: string): boolean {
  return (AVATAR_PALETTE as readonly string[]).includes(color)
}

function getLocalDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateDivider(isoString: string, now: Date = new Date()): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const targetKey = getLocalDayKey(date)
  const todayKey = getLocalDayKey(now)
  if (targetKey === todayKey) {
    return 'Today'
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (targetKey === getLocalDayKey(yesterday)) {
    return 'Yesterday'
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function buildMessageTimeline(
  messages: ChatMessage[],
  now: Date = new Date(),
): TimelineMessageItem[] {
  return messages.map((msg, index) => {
    const currDate = new Date(msg.created_at)
    const currDayKey = Number.isNaN(currDate.getTime()) ? '' : getLocalDayKey(currDate)
    const dateLabel = formatDateDivider(msg.created_at, now)

    if (index === 0) {
      return {
        message: msg,
        showDateDivider: true,
        dateLabel,
        isCompact: false,
      }
    }

    const prev = messages[index - 1]
    const prevDate = new Date(prev.created_at)
    const prevDayKey = Number.isNaN(prevDate.getTime()) ? '' : getLocalDayKey(prevDate)
    const showDateDivider = currDayKey !== prevDayKey

    const timeDiffMs = Math.abs(currDate.getTime() - prevDate.getTime())
    const isCompact = !showDateDivider
      && prev.user_id === msg.user_id
      && !Number.isNaN(timeDiffMs)
      && timeDiffMs <= GROUPING_WINDOW_MS

    return {
      message: msg,
      showDateDivider,
      dateLabel,
      isCompact,
    }
  })
}

export function shouldSendOnKeydown(event: {
  key: string
  shiftKey: boolean
  isComposing?: boolean
}): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS (9 passed).

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(utils): add message timeline grouping, date dividers, and profile validators"
```

---

### Task 2: Store Author Profile Patching & Live 1-Second Reconnect Countdown

**Files:**
- Modify: `app/composables/useMessagesState.ts:190-225`
- Modify: `app/composables/useConnectionManager.ts:1-79`
- Test: `tests/composables/useMessagesState.test.ts`
- Test: `tests/composables/useRealtimeStates.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ChatMessage`, `ConnectionStatus` from `~/types/chat`
- Produces:
  - `updateAuthorProfile(profile: Profile): number` on `createMessagesStore()`
  - Live 1-second decrementing `nextRetryMs` in `createConnectionManager()`

- [ ] **Step 1: Write failing tests in `tests/composables/useMessagesState.test.ts` and `tests/composables/useRealtimeStates.test.ts`**

Append to `tests/composables/useMessagesState.test.ts`:

```ts
  it('updates author profile in-place across all matching messages when a user edits their profile', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'First from Alice',
        created_at: '2026-10-16T10:00:00Z',
        author: alice,
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'From Bob',
        created_at: '2026-10-16T10:01:00Z',
        author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
      },
    ])

    const updatedCount = store.updateAuthorProfile({
      id: alice.id,
      display_name: 'Alice Updated',
      avatar_color: '#e11d48',
    })

    expect(updatedCount).toBe(1)
    expect(store.messages.value[0].author).toEqual({
      id: alice.id,
      display_name: 'Alice Updated',
      avatar_color: '#e11d48',
    })
    expect(store.messages.value[1].author?.display_name).toBe('Bob')
  })
```

Update the backoff test in `tests/composables/useRealtimeStates.test.ts` to verify 1-second countdown ticking:

```ts
  it('schedules exponential backoff on disconnect, ticks nextRetryMs every second, and resets on connect or retryNow', async () => {
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

    // After 1000ms of waiting, nextRetryMs ticks down from 2000ms to 1000ms
    await vi.advanceTimersByTimeAsync(1000)
    expect(manager.nextRetryMs.value).toBe(1000)

    // Manual retryNow triggers immediately
    await manager.retryNow()
    expect(attempts).toHaveLength(2)

    manager.handleConnected()
    expect(manager.status.value).toBe('connected')
    expect(manager.attempt.value).toBe(0)
    expect(manager.nextRetryMs.value).toBe(0)
    manager.dispose()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/composables/useMessagesState.test.ts tests/composables/useRealtimeStates.test.ts`
Expected: FAIL (`store.updateAuthorProfile is not a function` and `expected 2000 to be 1000`).

- [ ] **Step 3: Implement `updateAuthorProfile` in `app/composables/useMessagesState.ts` and countdown interval in `app/composables/useConnectionManager.ts`**

In `app/composables/useMessagesState.ts`, add `updateAuthorProfile` before `return`:

```ts
  function updateAuthorProfile(profile: Profile): number {
    let count = 0
    messages.value = messages.value.map((msg) => {
      if (msg.user_id === profile.id) {
        count += 1
        return {
          ...msg,
          author: { ...profile },
        }
      }
      return msg
    })
    return count
  }
```

And expose `updateAuthorProfile` in the returned object of `createMessagesStore()`.

Update `app/composables/useConnectionManager.ts`:

```ts
import { ref } from 'vue'
import type { ConnectionStatus } from '~/types/chat'
import { calculateBackoffMs } from '~/utils/chat'

export function createConnectionManager(
  onReconnectAttempt: () => Promise<boolean> | boolean,
) {
  const status = ref<ConnectionStatus>('connected')
  const attempt = ref<number>(0)
  const nextRetryMs = ref<number>(0)
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null

  function clearTimer(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (countdownTimer !== null) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }

  function scheduleRetry(delayMs: number): void {
    clearTimer()
    nextRetryMs.value = delayMs
    countdownTimer = setInterval(() => {
      nextRetryMs.value = Math.max(0, nextRetryMs.value - 1000)
    }, 1000)
    retryTimer = setTimeout(async () => {
      await executeAttempt()
    }, delayMs)
  }

  async function executeAttempt(): Promise<void> {
    clearTimer()
    let success = false
    try {
      success = Boolean(await onReconnectAttempt())
    } catch {
      success = false
    }

    if (success) {
      handleConnected()
    } else {
      attempt.value += 1
      scheduleRetry(calculateBackoffMs(attempt.value))
    }
  }

  function handleDisconnect(): void {
    if (status.value === 'reconnecting' && retryTimer !== null) {
      return
    }

    status.value = 'reconnecting'
    scheduleRetry(calculateBackoffMs(attempt.value))
  }

  function handleConnected(): void {
    clearTimer()
    status.value = 'connected'
    attempt.value = 0
    nextRetryMs.value = 0
  }

  async function retryNow(): Promise<void> {
    clearTimer()
    await executeAttempt()
  }

  function dispose(): void {
    clearTimer()
  }

  return {
    status,
    attempt,
    nextRetryMs,
    handleDisconnect,
    handleConnected,
    retryNow,
    dispose,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useMessagesState.test.ts tests/composables/useRealtimeStates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMessagesState.ts app/composables/useConnectionManager.ts tests/composables/useMessagesState.test.ts tests/composables/useRealtimeStates.test.ts
git commit -m "feat(composables): add store author profile patching and live 1s reconnect countdown"
```

---

### Task 3: Profile Update Action, Realtime Profile Cache & 3-Channel Reconnect

**Files:**
- Modify: `supabase/schema.sql:111-122`
- Modify: `app/composables/useAuthProfile.ts:1-137`
- Modify: `app/composables/useChatRoom.ts:1-525`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `isValidDisplayName`, `isValidAvatarColor` from `~/utils/chat`, `updateAuthorProfile` from `~/composables/useMessagesState`
- Produces:
  - `updateProfile(displayName: string, avatarColor: string): Promise<{ profile: Profile | null; error: string | null }>` on `useAuthProfile()`
  - `resolveMessageAuthor(params)` and `applyRealtimeProfileUpdate(params)` exported helpers in `~/composables/useChatRoom`
  - `syncOwnProfile(profile: Profile): Promise<void>` on `useChatRoom()`

- [ ] **Step 1: Write failing tests in `tests/composables/useChatRoom.test.ts`**

Update `tests/composables/useChatRoom.test.ts` to test `resolveMessageAuthor` (skipping inactive channels and using `profilesCache` before hitting Supabase) and `applyRealtimeProfileUpdate`:

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  handleIncomingRealtimeMessage,
  isDuplicateKeyError,
  resolveMessageAuthor,
  applyRealtimeProfileUpdate,
} from '~/composables/useChatRoom'
import { extractAuthUserId } from '~/composables/useAuthProfile'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'
import type { Profile } from '~/types/chat'

describe('useChatRoom realtime message routing & profile caching', () => {
  it('increments unread count for inactive channels and reconciles messages for active channel', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-me', 3000)
    const unreadCounts: Record<string, number> = {}

    typing.recordTyping({ user_id: 'u-alice', display_name: 'Alice' })

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

  it('skips profile query for inactive channel messages and caches fetched profiles', async () => {
    const cache = new Map<string, Profile>()
    const fetchProfile = vi.fn().mockResolvedValue({
      id: 'u-alice',
      display_name: 'Alice',
      avatar_color: '#0284c7',
    })

    // Inactive channel -> should not call fetchProfile
    const inactiveAuthor = await resolveMessageAuthor({
      userId: 'u-alice',
      channelId: 'ch-random',
      activeChannelId: 'ch-general',
      profilesCache: cache,
      fetchProfile,
    })
    expect(inactiveAuthor).toBeUndefined()
    expect(fetchProfile).not.toHaveBeenCalled()

    // Active channel (cache miss) -> calls fetchProfile once and populates cache
    const firstActiveAuthor = await resolveMessageAuthor({
      userId: 'u-alice',
      channelId: 'ch-general',
      activeChannelId: 'ch-general',
      profilesCache: cache,
      fetchProfile,
    })
    expect(firstActiveAuthor?.display_name).toBe('Alice')
    expect(fetchProfile).toHaveBeenCalledTimes(1)

    // Active channel (cache hit) -> returns cached profile without calling fetchProfile again
    const secondActiveAuthor = await resolveMessageAuthor({
      userId: 'u-alice',
      channelId: 'ch-general',
      activeChannelId: 'ch-general',
      profilesCache: cache,
      fetchProfile,
    })
    expect(secondActiveAuthor?.display_name).toBe('Alice')
    expect(fetchProfile).toHaveBeenCalledTimes(1)
  })

  it('propagates realtime profile updates to cache, messagesStore, and onlineFriends', () => {
    const cache = new Map<string, Profile>()
    const store = createMessagesStore()
    const onlineFriends: Profile[] = [
      { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
    ]

    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: 'Hello',
        created_at: '2026-10-16T10:00:00Z',
        author: onlineFriends[0],
      },
    ])

    const updatedAlice: Profile = {
      id: 'u-alice',
      display_name: 'Alice Cooper',
      avatar_color: '#e11d48',
    }

    const updatedFriends = applyRealtimeProfileUpdate({
      profile: updatedAlice,
      profilesCache: cache,
      messagesStore: store,
      onlineFriends,
    })

    expect(cache.get('u-alice')).toEqual(updatedAlice)
    expect(store.messages.value[0].author).toEqual(updatedAlice)
    expect(updatedFriends[0]).toEqual(updatedAlice)
  })

  it('detects Postgres 23505 duplicate key unique constraint error for idempotent retry', () => {
    expect(isDuplicateKeyError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isDuplicateKeyError({ message: 'duplicate key value violates unique constraint "messages_client_id_key"' })).toBe(true)
    expect(isDuplicateKeyError({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    expect(isDuplicateKeyError(null)).toBe(false)
  })

  it('extracts user UUID from either JwtPayload.sub (@nuxtjs/supabase v2) or User.id', () => {
    expect(extractAuthUserId({ sub: 'uuid-from-jwt-sub' })).toBe('uuid-from-jwt-sub')
    expect(extractAuthUserId({ id: 'uuid-from-user-id' })).toBe('uuid-from-user-id')
    expect(extractAuthUserId(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL (`resolveMessageAuthor` and `applyRealtimeProfileUpdate` are not exported from `~/composables/useChatRoom`).

- [ ] **Step 3: Update `supabase/schema.sql`, `app/composables/useAuthProfile.ts`, and `app/composables/useChatRoom.ts`**

Update the Realtime Publication section at the bottom of `supabase/schema.sql` (`lines 111-122`):

```sql
-- Realtime Publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.channels;
  end if;
exception when duplicate_object then
  -- tables already in publication
  null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when duplicate_object then
  -- table already in publication
  null;
end;
$$;
```

In `app/composables/useAuthProfile.ts`, import `isValidDisplayName` and `isValidAvatarColor` from `~/utils/chat` and add `updateProfile`:

```ts
import { ref } from 'vue'
import type { Profile } from '~/types/chat'
import { getAvatarColor, isValidDisplayName, isValidAvatarColor } from '~/utils/chat'
```

And inside `useAuthProfile()` before `signOut`:

```ts
  async function updateProfile(
    displayName: string,
    avatarColor: string,
  ): Promise<{ profile: Profile | null; error: string | null }> {
    const cleanName = displayName.trim()
    if (!isValidDisplayName(cleanName)) {
      return { profile: null, error: 'Display name must be between 1 and 40 characters.' }
    }
    if (!isValidAvatarColor(avatarColor)) {
      return { profile: null, error: 'Please select a valid avatar color.' }
    }

    let authUser: any = user.value
    let userId = extractAuthUserId(authUser) || currentProfile.value?.id || null

    if (!userId && supabase?.auth?.getUser) {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user) {
          authUser = data.user
          userId = extractAuthUserId(authUser)
        }
      } catch {
        // Ignore auth lookup error
      }
    }

    if (!userId) {
      return { profile: null, error: 'You must be signed in to update your profile.' }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: cleanName,
        avatar_color: avatarColor,
      })
      .eq('id', userId)
      .select('*')
      .single()

    if (error) {
      return { profile: null, error: error.message }
    }

    const updated = (data as Profile) || {
      id: userId,
      display_name: cleanName,
      avatar_color: avatarColor,
    }
    currentProfile.value = updated
    return { profile: updated, error: null }
  }
```

And include `updateProfile` in the return object of `useAuthProfile()`.

In `app/composables/useChatRoom.ts`, add `resolveMessageAuthor`, `applyRealtimeProfileUpdate`, profile caching, `profiles` `UPDATE` subscription, `syncOwnProfile`, 3-channel reconnect, and empty-channel gap healing:

```ts
export async function resolveMessageAuthor(params: {
  userId: string
  existingAuthor?: Profile
  channelId: string
  activeChannelId: string | null
  profilesCache: Map<string, Profile>
  fetchProfile: (userId: string) => Promise<Profile | undefined>
}): Promise<Profile | undefined> {
  if (params.existingAuthor) {
    params.profilesCache.set(params.existingAuthor.id, params.existingAuthor)
    return params.existingAuthor
  }
  if (params.channelId !== params.activeChannelId) {
    return undefined
  }
  const cached = params.profilesCache.get(params.userId)
  if (cached) {
    return cached
  }
  const fetched = await params.fetchProfile(params.userId)
  if (fetched) {
    params.profilesCache.set(fetched.id, fetched)
  }
  return fetched
}

export function applyRealtimeProfileUpdate(params: {
  profile: Profile
  profilesCache: Map<string, Profile>
  messagesStore: ReturnType<typeof createMessagesStore>
  onlineFriends: Profile[]
}): Profile[] {
  params.profilesCache.set(params.profile.id, params.profile)
  params.messagesStore.updateAuthorProfile(params.profile)

  const updatedFriends = params.onlineFriends.map(friend =>
    friend.id === params.profile.id ? { ...friend, ...params.profile } : friend,
  )
  updatedFriends.sort((a, b) => a.display_name.localeCompare(b.display_name))
  return updatedFriends
}
```

Inside `useChatRoom()`:
- Add `const profilesCache = new Map<string, Profile>()` and helper `cacheProfilesFromMessages(rows: Array<{ author?: Profile }>)`:
  ```ts
  function cacheProfilesFromMessages(rows: Array<{ author?: Profile }>): void {
    for (const row of rows) {
      if (row.author?.id) {
        profilesCache.set(row.author.id, row.author)
      }
    }
  }
  ```
- In `fetchGapMessages()`:
  ```ts
  async function fetchGapMessages(): Promise<void> {
    if (!activeChannelId.value) return
    const lastTimestamp = messagesStore.getLastConfirmedTimestamp()

    try {
      let query = supabase
        .from('messages')
        .select('*, author:profiles(id, display_name, avatar_color)')
        .eq('channel_id', activeChannelId.value)

      if (lastTimestamp) {
        query = query.gt('created_at', lastTimestamp).order('created_at', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: true }).limit(PAGE_SIZE)
      }

      const { data, error } = await query

      if (data && !error && data.length > 0) {
        cacheProfilesFromMessages(data)
        messagesStore.mergeGapMessages(data)
      }
    } catch {
      // Ignored
    }
  }
  ```
- In `reconnectChat()`:
  ```ts
  async function reconnectChat(): Promise<boolean> {
    try {
      const p1 = subscribeWithPromise(presenceChannel)
      const p2 = subscribeWithPromise(dbChangesChannel)
      const p3 = activeChannelId.value ? subscribeWithPromise(typingChannel) : Promise.resolve(true)
      const results = await Promise.all([p1, p2, p3])
      const ok = results.every(Boolean)
      if (ok) {
        await fetchGapMessages()
        return true
      }
      return false
    } catch {
      return false
    }
  }
  ```
- In `setupDbChangesSubscription()`:
  - Use `resolveMessageAuthor` on `messages` `INSERT` so inactive channels never query `profiles` and active channels use `profilesCache`.
  - Add `.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => { ... })` calling `applyRealtimeProfileUpdate`.
- Add `syncOwnProfile(profile: Profile)`:
  ```ts
  async function syncOwnProfile(profile: Profile): Promise<void> {
    onlineFriends.value = applyRealtimeProfileUpdate({
      profile,
      profilesCache,
      messagesStore,
      onlineFriends: onlineFriends.value,
    })
    if (presenceChannel) {
      try {
        await presenceChannel.track({
          user_id: profile.id,
          display_name: profile.display_name,
          avatar_color: profile.avatar_color,
          online_at: new Date().toISOString(),
        })
      } catch {
        // Ignore presence track error
      }
    }
  }
  ```
- Export `syncOwnProfile` from `useChatRoom()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql app/composables/useAuthProfile.ts app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(chat): add profile update, realtime profile cache, and 3-channel reconnect"
```

---

### Task 4: Viewport Grouping, Date Dividers, Channel-Switch Scroll Reset & Profile Settings Modal

**Files:**
- Modify: `app/components/MessageViewport.vue:1-228`
- Create: `app/components/ProfileSettingsModal.vue`
- Modify: `app/components/ChatSidebar.vue:1-187`
- Modify: `app/pages/index.vue:1-153`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `buildMessageTimeline`, `AVATAR_PALETTE`, `isValidDisplayName`, `isValidAvatarColor` from `~/utils/chat`, `updateProfile` from `~/composables/useAuthProfile`, `syncOwnProfile` from `~/composables/useChatRoom`
- Produces:
  - `MessageViewport.vue` with `channelId?: string | null` prop, date dividers (`[data-test="date-divider"]`), and compact message rows (`[data-test="compact-message"]`)
  - `ProfileSettingsModal.vue` with `isOpen` and `profile` props and `close` / `save` emits
  - `ChatSidebar.vue` with `openProfileSettings` emit (`[data-test="open-profile-settings"]`)

- [ ] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

Append tests to `tests/components/chatUi.test.ts` for:
1. `MessageViewport` rendering date dividers and compact consecutive same-author rows within 5 minutes, plus resetting `unreadNewCount` on `channelId` change.
2. `ProfileSettingsModal` validating display name, picking an avatar color from `AVATAR_PALETTE`, and emitting `save`.

```ts
  it('MessageViewport groups consecutive same-author messages within 5m and resets unread pill on channel switch', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        channelId: 'ch-1',
        hasMoreHistory: false,
        isLoadingHistory: false,
        currentUserId: 'u-me',
        loadOlder: vi.fn().mockResolvedValue(0),
        messages: [
          {
            id: 'm-1',
            client_id: 'c-1',
            channel_id: 'ch-1',
            user_id: 'u-alice',
            content: 'First line',
            created_at: '2026-10-18T10:00:00.000Z',
            status: 'sent',
            author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
          },
          {
            id: 'm-2',
            client_id: 'c-2',
            channel_id: 'ch-1',
            user_id: 'u-alice',
            content: 'Second line 1 min later',
            created_at: '2026-10-18T10:01:00.000Z',
            status: 'sent',
            author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
          },
        ],
      },
    })

    expect(wrapper.findAll('[data-test="date-divider"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="compact-message"]')).toHaveLength(1)

    // Switch channelId -> should not show unread pill
    await wrapper.setProps({
      channelId: 'ch-2',
      messages: [
        {
          id: 'm-99',
          client_id: 'c-99',
          channel_id: 'ch-2',
          user_id: 'u-bob',
          content: 'Welcome to random',
          created_at: '2026-10-18T11:00:00.000Z',
          status: 'sent',
          author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
        },
      ],
    })
    expect(wrapper.find('button.animate-bounce').exists()).toBe(false)
  })

  it('ProfileSettingsModal allows editing display name and selecting an avatar color', async () => {
    const ProfileSettingsModal = (await import('~/components/ProfileSettingsModal.vue')).default
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: {
          id: 'u-1',
          display_name: 'Alice',
          avatar_color: '#0284c7',
        },
      },
    })

    const input = wrapper.find('input[type="text"]')
    await input.setValue('Alice Wonderland')

    const roseSwatch = wrapper.find('[data-test="color-swatch-#e11d48"]')
    await roseSwatch.trigger('click')

    await wrapper.find('form').trigger('submit')

    const saveEvents = wrapper.emitted('save')
    expect(saveEvents).toBeTruthy()
    const payload = saveEvents?.[0][0] as {
      displayName: string
      avatarColor: string
      onSuccess: () => void
    }
    expect(payload.displayName).toBe('Alice Wonderland')
    expect(payload.avatarColor).toBe('#e11d48')

    payload.onSuccess()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (`[data-test="date-divider"]` not found and `~/components/ProfileSettingsModal.vue` does not exist).

- [ ] **Step 3: Implement `MessageViewport.vue`, `ProfileSettingsModal.vue`, `ChatSidebar.vue`, and `app/pages/index.vue`**

Update `app/components/MessageViewport.vue` (`lines 1-228`) to accept `channelId?: string | null`, compute `timelineItems = computed(() => buildMessageTimeline(props.messages))`, reset scroll/unread state on channel switch, and render date dividers + compact rows:

```vue
<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import { buildMessageTimeline } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    channelId?: string | null
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    currentUserId?: string
    loadOlder: () => Promise<number>
  }>(),
  {
    channelId: null,
    hasMoreHistory: false,
    isLoadingHistory: false,
    currentUserId: '',
  },
)

const emit = defineEmits<{
  (e: 'retry', clientId: string): void
  (e: 'dismiss', clientId: string): void
}>()

const viewportRef = ref<HTMLDivElement | null>(null)
const unreadNewCount = ref(0)
const isNearBottom = ref(true)

const timelineItems = computed(() => buildMessageTimeline(props.messages))
```

And add the `channelId` watcher in `app/components/MessageViewport.vue`:

```ts
watch(
  () => props.channelId,
  () => {
    unreadNewCount.value = 0
    isNearBottom.value = true
    const newest = props.messages[props.messages.length - 1]
    prevNewestId.value = newest ? (newest.client_id || newest.id) : null
    scrollToBottom(false)
  },
)
```

And in the `<template>` of `app/components/MessageViewport.vue`, replace the `v-for="msg in messages"` block with `v-for="item in timelineItems"`:

```vue
      <!-- Messages List -->
      <template
        v-for="item in timelineItems"
        :key="item.message.client_id || item.message.id"
      >
        <!-- Date Divider -->
        <div
          v-if="item.showDateDivider"
          data-test="date-divider"
          class="flex items-center gap-3 my-4"
        >
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
          <span class="px-3 py-0.5 rounded-full text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            {{ item.dateLabel }}
          </span>
          <div class="flex-1 h-px bg-slate-200 dark:bg-slate-800"></div>
        </div>

        <!-- Compact Message Row (same author within 5m on same day) -->
        <div
          v-if="item.isCompact"
          data-test="compact-message"
          class="flex items-start gap-3 group -mt-2.5 py-0.5 hover:bg-slate-100/60 dark:hover:bg-slate-900/50 rounded-lg px-1 -mx-1 transition-colors"
        >
          <div class="w-9 shrink-0 text-right pr-1 select-none">
            <span class="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {{ formatTime(item.message.created_at) }}
            </span>
          </div>

          <div class="flex-1 min-w-0">
            <div
              class="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              {{ item.message.content }}
            </div>

            <div v-if="item.message.status !== 'sent'" class="mt-0.5 flex items-center gap-2">
              <span
                v-if="item.message.status === 'sending'"
                class="text-xs text-slate-400 italic"
              >
                Sending...
              </span>
              <span
                v-else-if="item.message.status === 'failed'"
                class="text-xs text-rose-500 font-medium flex items-center gap-1.5"
              >
                Failed to send
                <button
                  type="button"
                  :data-test="`retry-${item.message.client_id}`"
                  class="underline hover:text-rose-600 font-semibold cursor-pointer ml-1"
                  @click="emit('retry', item.message.client_id)"
                >
                  Retry
                </button>
                <button
                  type="button"
                  :data-test="`dismiss-${item.message.client_id}`"
                  class="underline hover:text-rose-600 cursor-pointer ml-1 text-slate-400"
                  @click="emit('dismiss', item.message.client_id)"
                >
                  Dismiss
                </button>
              </span>
            </div>
          </div>
        </div>

        <!-- Full Message Row -->
        <div
          v-else
          data-test="full-message"
          class="flex items-start gap-3 group hover:bg-slate-100/60 dark:hover:bg-slate-900/50 rounded-lg p-1 -mx-1 transition-colors"
        >
          <UserAvatar
            :display-name="item.message.author?.display_name || 'Friend'"
            :avatar-color="item.message.author?.avatar_color"
            size="md"
          />

          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-semibold text-slate-900 dark:text-white">
                {{ item.message.author?.display_name || 'Friend' }}
              </span>
              <span class="text-xs text-slate-400 dark:text-slate-500">
                {{ formatTime(item.message.created_at) }}
              </span>

              <span
                v-if="item.message.status === 'sending'"
                class="text-xs text-slate-400 italic flex items-center gap-1"
              >
                Sending...
              </span>

              <span
                v-else-if="item.message.status === 'failed'"
                class="text-xs text-rose-500 font-medium flex items-center gap-1.5"
              >
                Failed to send
                <button
                  type="button"
                  :data-test="`retry-${item.message.client_id}`"
                  class="underline hover:text-rose-600 font-semibold cursor-pointer ml-1"
                  @click="emit('retry', item.message.client_id)"
                >
                  Retry
                </button>
                <button
                  type="button"
                  :data-test="`dismiss-${item.message.client_id}`"
                  class="underline hover:text-rose-600 cursor-pointer ml-1 text-slate-400"
                  @click="emit('dismiss', item.message.client_id)"
                >
                  Dismiss
                </button>
              </span>
            </div>

            <div
              class="text-sm text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap break-words leading-relaxed"
              :class="{ 'opacity-60': item.message.status === 'sending', 'text-rose-400': item.message.status === 'failed' }"
            >
              {{ item.message.content }}
            </div>
          </div>
        </div>
      </template>
```

Create `app/components/ProfileSettingsModal.vue`:

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Profile } from '~/types/chat'
import { AVATAR_PALETTE, isValidDisplayName, isValidAvatarColor } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = defineProps<{
  isOpen: boolean
  profile: Profile | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'save',
    payload: {
      displayName: string
      avatarColor: string
      onSuccess: () => void
      onError: (message: string) => void
    }
  ): void
}>()

const displayName = ref(props.profile?.display_name || '')
const avatarColor = ref<string>(props.profile?.avatar_color || AVATAR_PALETTE[0])
const error = ref<string | null>(null)
const isSubmitting = ref(false)

watch(
  () => [props.isOpen, props.profile] as const,
  ([open, prof]) => {
    if (open && prof) {
      displayName.value = prof.display_name
      avatarColor.value = prof.avatar_color || AVATAR_PALETTE[0]
      error.value = null
      isSubmitting.value = false
    }
  },
  { immediate: true },
)

const isValid = computed(() => {
  return isValidDisplayName(displayName.value) && isValidAvatarColor(avatarColor.value)
})

function handleClose() {
  if (isSubmitting.value) return
  error.value = null
  isSubmitting.value = false
  emit('close')
}

function handleSave() {
  error.value = null
  if (!isValid.value) {
    error.value = 'Display name must be 1–40 characters and use a valid palette color.'
    return
  }

  isSubmitting.value = true
  emit('save', {
    displayName: displayName.value.trim(),
    avatarColor: avatarColor.value,
    onSuccess: () => {
      isSubmitting.value = false
      handleClose()
    },
    onError: (msg: string) => {
      isSubmitting.value = false
      error.value = msg
    },
  })
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white">
          Profile Settings
        </h3>
        <button
          type="button"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <div v-if="error" class="mb-4 p-3 rounded-lg text-xs bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300">
        {{ error }}
      </div>

      <form class="space-y-5" @submit.prevent="handleSave">
        <!-- Live Preview -->
        <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
          <UserAvatar
            :display-name="displayName || 'Friend'"
            :avatar-color="avatarColor"
            :show-online="true"
            size="lg"
          />
          <div class="min-w-0">
            <div class="text-sm font-bold text-slate-900 dark:text-white truncate">
              {{ displayName.trim() || 'Friend' }}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              Live preview
            </div>
          </div>
        </div>

        <!-- Display Name -->
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
            Display Name
          </label>
          <input
            v-model="displayName"
            type="text"
            required
            maxlength="40"
            placeholder="Your display name"
            class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <!-- Avatar Color Swatches -->
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
            Avatar Color
          </label>
          <div class="flex items-center gap-2.5 flex-wrap">
            <button
              v-for="color in AVATAR_PALETTE"
              :key="color"
              type="button"
              :data-test="`color-swatch-${color}`"
              class="w-8 h-8 rounded-full transition-transform flex items-center justify-center text-white text-xs font-bold"
              :class="avatarColor === color ? 'ring-2 ring-offset-2 ring-sky-500 dark:ring-offset-slate-800 scale-110' : 'opacity-80 hover:opacity-100 hover:scale-105'"
              :style="{ backgroundColor: color }"
              @click="avatarColor = color"
            >
              <span v-if="avatarColor === color">✓</span>
            </button>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium"
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="!isValid || isSubmitting"
            class="px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {{ isSubmitting ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
```

Update `app/components/ChatSidebar.vue` (`lines 16-23` and `159-183`) to add `(e: 'openProfileSettings'): void` to `defineEmits` and render a Profile Settings button in the footer:

```vue
          <!-- Profile Settings -->
          <button
            type="button"
            data-test="open-profile-settings"
            class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Profile Settings"
            @click="emit('openProfileSettings')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
          </button>
```

Update `app/pages/index.vue` to wire `syncOwnProfile`, `updateProfile`, `:channel-id="activeChannelId"`, and `<ProfileSettingsModal>`:

```ts
import ProfileSettingsModal from '~/components/ProfileSettingsModal.vue'
// Inside setup:
const isProfileSettingsModalOpen = ref(false)

async function handleSaveProfile(payload: {
  displayName: string
  avatarColor: string
  onSuccess?: () => void
  onError?: (message: string) => void
}) {
  const result = await updateProfile(payload.displayName, payload.avatarColor)
  if (result.error || !result.profile) {
    payload.onError?.(result.error || 'Failed to update profile')
  } else {
    await syncOwnProfile(result.profile)
    payload.onSuccess?.()
    isProfileSettingsModalOpen.value = false
  }
}
```

And in `<template>` of `app/pages/index.vue`:
- Pass `@open-profile-settings="isProfileSettingsModalOpen = true"` on `<ChatSidebar>`
- Pass `:channel-id="activeChannelId"` on `<MessageViewport>`
- Render:
  ```vue
    <!-- Profile Settings Modal -->
    <ProfileSettingsModal
      :is-open="isProfileSettingsModalOpen"
      :profile="currentProfile"
      @close="isProfileSettingsModalOpen = false"
      @save="handleSaveProfile"
    />
  ```

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`
Expected: PASS (all test files and suites pass).

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue app/components/ProfileSettingsModal.vue app/components/ChatSidebar.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): add message grouping, date dividers, channel scroll reset, and profile settings modal"
```
