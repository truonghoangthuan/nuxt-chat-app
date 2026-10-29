# Chat App Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver 8 chat application enhancements: louder notification chime, mobile background conversation indicator, idle tab read receipt protection, reaction author inspection, user bank QR code upload/display, song queue attribution, and per-conversation music sessions with join/leave controls.

**Architecture:** Extend existing pure state machines (`useMusicPlayer`, `useChatRoom`) and UI components without adding server dependencies or new DB tables. Music sessions remain client-orchestrated via Supabase Realtime broadcast channels keyed by conversation ID. Read receipts couple to document focus/visibility state. QR codes use existing storage upload patterns.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Supabase Realtime/Storage, Tailwind CSS, Web Audio API, Vitest.

**Spec:** User request (8 enhancements: join/leave music, queue attribution, bank QR code, per-conv music sessions, mobile unread indicator, louder chime, prevent idle auto-seen, show reaction authors).

## Global Constraints

- Preserve all existing tests and functional `data-test` attributes (`data-test="music-player-bar"`, `data-test="seen-by-..."`, `data-test="reaction-pill-..."`).
- Never introduce new DB tables for ephemeral room music state; keep session states mapped in memory and synchronized over `typing:${conversationId}` broadcast channels.
- Keep Vitest and SSR state fallbacks intact (`typeof window !== 'undefined'` and `typeof useState !== 'undefined'`).
- PostgREST column projection discipline: only query existing columns in Supabase queries.

## Review Focus

1. Mobile viewport width < 380px: Notification toast container and hamburger badge must not cause horizontal scroll or overlap header titles.
2. Background tab / locked OS: Incoming messages while tab is hidden or window is unfocused must not trigger `markConversationRead` until the user returns.
3. Rapid conversation switching: Switching between conversations must cleanly pause local audio, swap to the target conversation's music state, and prevent audio bleed between chats.
4. Reaction author resolution: Unknown or departed member IDs in reaction sets must gracefully fall back to "Someone" without crashing `summarizeReactions` or tooltip generation.
5. Large bank QR image uploads: Image file upload must be validated for type and size, uploaded to storage, and displayed cleanly inside `UserProfileModal`.

---

### Task 1: Louder Notification Chime & Mobile Unread Alert (Requirements 5 & 6)

**Files:**
- Modify: `app/utils/sound.ts`
- Modify: `app/components/NotificationToastContainer.vue`
- Modify: `app/pages/index.vue:944-955`
- Test: `tests/utils/sound.test.ts`
- Test: `tests/components/NotificationToast.test.ts`

**Interfaces:**
- `playNotificationChime(customContext?: AudioContext | null): void` (gain ramped from `0.5` instead of `0.15`).
- Mobile menu button: displays badge when `totalOtherUnreads > 0`.

- [ ] **Step 1: Write failing unit test for boosted chime gain and mobile toast layout**

In `tests/utils/sound.test.ts`:
```typescript
it('uses a gain ceiling of 0.5 for louder audible notification', () => {
  const mockGain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const mockCtx = {
    state: 'running',
    currentTime: 10,
    createGain: vi.fn(() => mockGain),
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    destination: {},
  } as any

  playNotificationChime(mockCtx)
  expect(mockGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 10)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/sound.test.ts`  
Expected: FAIL with `expected 0.15 to be 0.5`

- [ ] **Step 3: Implement sound gain boost and mobile layout fixes**

1. In `app/utils/sound.ts:59`: change `gainNode.gain.setValueAtTime(0.15, now)` to `0.5`.
2. In `app/components/NotificationToastContainer.vue:29`: change container positioning from `fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0` to `fixed top-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:w-96 z-50 flex flex-col gap-2.5 pointer-events-none`.
3. In `app/pages/index.vue:944`: compute `totalOtherUnreads = computed(() => Object.entries(unreadCounts.value).reduce((sum, [id, count]) => id !== activeConversationId.value ? sum + count : sum, 0))` and display a notification red badge pill over the hamburger `<Menu>` icon if `totalOtherUnreads > 0`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/sound.test.ts tests/components/NotificationToast.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/sound.ts app/components/NotificationToastContainer.vue app/pages/index.vue tests/utils/sound.test.ts
git commit -m "feat(notifications): boost chime volume and add mobile unread indicator"
```

---

### Task 2: Prevent Auto-Seen on Inactive / Background Tab (Requirement 7)

**Files:**
- Modify: `app/composables/useChatRoom.ts:506-525,950-955`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `document.visibilityState`, `document.hasFocus()`
- Produces: Deferred read receipt scheduler in `useChatRoom` that only calls `markConversationRead` when user is actively looking at the window.

- [ ] **Step 1: Write failing test for inactive tab read suppression**

In `tests/composables/useChatRoom.test.ts`:
```typescript
it('suppresses automatic markConversationRead on incoming message when document is not focused', async () => {
  // Test scenario where activeConversationId === convId but document.hasFocus() returns false
  // Expect markConversationRead not to be scheduled until window focus event fires
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "suppresses automatic markConversationRead"`  
Expected: FAIL

- [ ] **Step 3: Implement window focus check and delayed read receipt flush**

In `app/composables/useChatRoom.ts`:
1. Check `const isWindowActive = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && (typeof document.hasFocus === 'function' ? document.hasFocus() : true)`.
2. In Realtime `postgres_changes` handler for incoming messages (`useChatRoom.ts:950`):
   ```typescript
   if (convId === activeConversationId.value) {
     if (isWindowActive()) {
       markConversationRead(convId, false)
     } else {
       pendingReadOnActiveConv = true
     }
   }
   ```
3. Add window listener for `focus` and `visibilitychange` to trigger `markConversationRead(activeConversationId.value, true)` if `pendingReadOnActiveConv` is true.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(presence): prevent auto-marking messages as seen when tab is idle or backgrounded"
```

---

### Task 3: Show Reaction Authors in Tooltip and Popover (Requirement 8)

**Files:**
- Modify: `app/utils/chat.ts`
- Modify: `app/components/MessageViewport.vue:1008-1028`
- Test: `tests/utils/chat.test.ts`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Produces: `formatReactionAuthors(userIds: string[], members: Profile[], currentUserId?: string): string` in `app/utils/chat.ts`.
- Updates `MessageViewport.vue` reaction pills to bind `:title="formatReactionAuthors(summary.userIds, members, currentUserId)"` and support an interactive dialog/popover showing avatar + name of each reactor.

- [ ] **Step 1: Write failing test for reaction authors formatter**

In `tests/utils/chat.test.ts`:
```typescript
it('formatReactionAuthors formats list of member names including You', () => {
  const members = [
    { id: 'u1', display_name: 'Alice', avatar_color: 'bg-red-500' },
    { id: 'u2', display_name: 'Bob', avatar_color: 'bg-blue-500' },
  ] as any[]
  expect(formatReactionAuthors(['u1'], members, 'u1')).toBe('You')
  expect(formatReactionAuthors(['u1', 'u2'], members, 'u1')).toBe('You, Bob')
  expect(formatReactionAuthors(['u2'], members, 'u1')).toBe('Bob')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts -t "formatReactionAuthors"`  
Expected: FAIL with `formatReactionAuthors is not defined`

- [ ] **Step 3: Implement `formatReactionAuthors` and update `MessageViewport.vue`**

1. Implement `formatReactionAuthors(userIds: string[], members: Profile[] = [], currentUserId?: string): string` in `app/utils/chat.ts`.
2. In `app/components/MessageViewport.vue:1018`: bind `:title="`${summary.emoji} reacted by ${formatReactionAuthors(summary.userIds, members, currentUserId)}`"`.
3. Add a small popover or click details modal when clicking or hovering a reaction pill showing reactor avatars and names.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/chat.test.ts tests/components/chatUi.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/chat.ts app/components/MessageViewport.vue tests/utils/chat.test.ts
git commit -m "feat(reactions): show users who reacted to message on pills and tooltips"
```

---

### Task 4: Bank QR Code Upload and Profile Display (Requirement 3)

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `supabase/schema.sql`
- Modify: `app/components/ProfileSettingsModal.vue`
- Modify: `app/components/UserProfileModal.vue`
- Test: `tests/components/UserProfileModal.test.ts`

**Interfaces:**
- Profile schema: `bank_qr_url?: string | null`
- `ProfileSettingsModal.vue`: emits `save` with `bankQrUrl?: string | null`
- `UserProfileModal.vue`: renders `<img :src="profile.bank_qr_url" />` with copy/zoom controls if present.

- [ ] **Step 1: Write failing test for UserProfileModal rendering bank QR**

In `tests/components/UserProfileModal.test.ts`:
```typescript
it('renders bank QR code section when profile has bank_qr_url', () => {
  const wrapper = mount(UserProfileModal, {
    props: {
      isOpen: true,
      profile: {
        id: 'u-1',
        display_name: 'Tam',
        email: 'tam@example.com',
        avatar_color: 'bg-emerald-500',
        bank_qr_url: 'https://example.com/qr.png',
      },
    },
  })
  expect(wrapper.find('[data-test="user-bank-qr"]').exists()).toBe(true)
  expect(wrapper.find('[data-test="user-bank-qr"] img').attributes('src')).toBe('https://example.com/qr.png')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/UserProfileModal.test.ts -t "renders bank QR code section"`  
Expected: FAIL with `user-bank-qr not found`

- [ ] **Step 3: Implement bank QR field, settings upload, and user modal display**

1. In `app/types/chat.ts`: add `bank_qr_url?: string | null` to `Profile`.
2. In `supabase/schema.sql`: add `alter table public.profiles add column if not exists bank_qr_url text;`.
3. In `app/components/ProfileSettingsModal.vue`: add an image file input for Bank QR Code, upload to `chat-backgrounds` bucket (`profiles/${userId}/bank-qr-${Date.now()}.${ext}`), and save `bank_qr_url`.
4. In `app/components/UserProfileModal.vue`: render a collapsible or dedicated Bank QR Code card with click-to-enlarge.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/UserProfileModal.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/types/chat.ts supabase/schema.sql app/components/ProfileSettingsModal.vue app/components/UserProfileModal.vue tests/components/UserProfileModal.test.ts
git commit -m "feat(profile): support uploading and viewing bank QR codes in user dialog"
```

---

### Task 5: Fix Music Queue Attribution (Requirement 2)

**Files:**
- Modify: `app/composables/useMusicPlayer.ts:257-266`
- Modify: `app/pages/index.vue:226-231`
- Test: `tests/composables/useMusicPlayer.test.ts`

**Interfaces:**
- Consumes: `MusicQueueItem.addedBy`
- Produces: `MusicPlaybackState.startedBy` properly inheriting `item.addedBy` when advancing the queue via `skipToNext()`.

- [ ] **Step 1: Write failing test for queue item attribution**

In `tests/composables/useMusicPlayer.test.ts`:
```typescript
it('preserves addedBy user as startedBy when auto-advancing queue via skipToNext', () => {
  const player = createMusicController({
    getCurrentUserName: () => 'TriggerUser',
  })
  player.playTrack({ videoId: 'v1', title: 'Song 1', channelTitle: 'Artist 1' }, 'conv-1')
  player.enqueue({ videoId: 'v2', title: 'Song 2', channelTitle: 'Artist 2', addedBy: 'SongAdder' } as any, 'conv-1')
  player.skipToNext()
  expect(player.currentTrack.value?.startedBy).toBe('SongAdder')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useMusicPlayer.test.ts -t "preserves addedBy user as startedBy"`  
Expected: FAIL with `expected 'TriggerUser' to be 'SongAdder'`

- [ ] **Step 3: Update `skipToNext` and system message to preserve original adder**

1. In `app/composables/useMusicPlayer.ts`: update `playTrackInternal` signature to accept `startedByOverride?: string`. In `skipToNext`: pass `nextItem.addedBy` as `startedByOverride`.
2. In `app/pages/index.vue:226`: ensure `onTrackStarted` receives `startedBy` and passes it to `sendMusicPlaySystemMessage(track, convId, startedBy)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useMusicPlayer.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useMusicPlayer.ts app/pages/index.vue tests/composables/useMusicPlayer.test.ts
git commit -m "fix(music): attribute queue track playback to user who added song"
```

---

### Task 6: Per-Conversation Music Sessions & Join / Leave (Requirements 1 & 4)

**Files:**
- Modify: `app/composables/useMusicPlayer.ts`
- Modify: `app/components/MusicPlayerBar.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/composables/useMusicPlayer.test.ts`
- Test: `tests/components/musicUi.test.ts`

**Interfaces:**
- `useMusicPlayer`:
  - `sessions: Ref<Record<string, { track: MusicPlaybackState | null; queue: MusicQueueItem[] }>>`
  - `isTunedIn: Ref<boolean>`
  - `activeConversationId: Ref<string | null>`
  - `joinSession(conversationId: string): void`
  - `leaveSession(): void`
- `MusicPlayerBar.vue`:
  - New props: `isTunedIn: boolean`
  - New emits: `(e: 'join'): void`, `(e: 'leave'): void`
  - Renders "Join" / "Leave" button. When left, local audio stops without sending room stop broadcast.

- [ ] **Step 1: Write failing tests for per-conversation music isolation and join/leave**

In `tests/composables/useMusicPlayer.test.ts`:
```typescript
it('isolates music state per conversation and allows joining and leaving session locally', () => {
  const player = createMusicController()
  player.switchConversation('conv-A')
  player.playTrack({ videoId: 'v1', title: 'Song A' }, 'conv-A')
  expect(player.currentTrack.value?.title).toBe('Song A')

  // Switch to conv-B
  player.switchConversation('conv-B')
  expect(player.currentTrack.value).toBeNull()

  // Leave session locally in conv-A
  player.switchConversation('conv-A')
  expect(player.isTunedIn.value).toBe(true)
  player.leaveSession()
  expect(player.isTunedIn.value).toBe(false)
  // verify room track is still present
  expect(player.currentTrack.value?.title).toBe('Song A')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useMusicPlayer.test.ts -t "isolates music state per conversation"`  
Expected: FAIL with `switchConversation is not a function`

- [ ] **Step 3: Implement per-conversation sessions and join/leave in controller & UI**

1. In `app/composables/useMusicPlayer.ts`:
   - Store sessions map `sessions: Ref<Record<string, ConversationMusicSession>>`.
   - Add `switchConversation(conversationId: string)`: if leaving a conversation, pause audio player locally. Point `currentTrack` and `queue` computed/refs to active conversation session.
   - Add `joinSession()`: sets `isTunedIn.value = true`, computes synced position, triggers `onPlayerAction('load')` / `onPlayerAction('play')`.
   - Add `leaveSession()`: sets `isTunedIn.value = false`, calls `onPlayerAction('pause')`. Never broadcasts `stop`.
2. In `app/components/MusicPlayerBar.vue`:
   - Display `isTunedIn` status.
   - When not tuned in: show "Join Session" (`<button @click="emit('join')">`).
   - When tuned in: show "Leave" (`<button @click="emit('leave')">`) so user can opt out of listening without stopping playback for friends.
3. In `app/pages/index.vue`:
   - Watch `activeConversationId` and call `musicPlayer.switchConversation(newConvId)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/composables/useMusicPlayer.test.ts tests/components/musicUi.test.ts`  
Expected: PASS

- [ ] **Step 5: Run complete test suite**

Run: `npm test`  
Expected: All 51 test suites pass cleanly.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useMusicPlayer.ts app/components/MusicPlayerBar.vue app/pages/index.vue tests/composables/useMusicPlayer.test.ts tests/components/musicUi.test.ts
git commit -m "feat(music): implement per-conversation music sessions and join/leave controls"
```
