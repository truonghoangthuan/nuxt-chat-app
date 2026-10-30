# Fix Audit Findings & UI Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 quality and streaming audit findings plus 2 critical UI bugs (reply quote blowout and cascading reaction popovers) across Nuxt chat app composables, UI components, server routes, and utilities.

**Architecture:** Targeted surgical adjustments to audio playback lifecycle in `index.vue`, LRU memory eviction in `useImageAttachmentCache.ts`, author lookup and unread query ordering in `useChatRoom.ts`, streaming timeout in `server/api/youtube/stream.get.ts`, channel teardown handling in `useChatRoom.ts`, single-pass system message parsing in `chat.ts`, and flexbox truncation plus named Tailwind groups in `MessageViewport.vue`.

**Tech Stack:** Nuxt 4, Vue 3, Tailwind CSS, Supabase JS (Realtime & Storage), HTMLMediaElement, Vitest (`@vue/test-utils`, `happy-dom`).

**Spec:** Ponytail Audit Report 2026-10-30 (7 findings) + 2 visual regression bug reports (screenshots: quote bubble blowout, multi-reaction popover cascade).

## Global Constraints

- Preserve all 589 existing passing Vitest unit and component tests.
- Zero new package dependencies.
- Strict adherence to AGENTS.md realtime, E2EE, and theme invariants.
- Keep the smallest working diff for each task (Ponytail discipline).

## Review Focus

- Audio player setting `currentTime` before `loadedmetadata` must not throw or block `play()`.
- Image attachment cache must evict oldest items and call `URL.revokeObjectURL(url)`.
- Realtime notifications must show author names and avatars for background channels if profiles are cached.
- Unread count sync must retain newest messages when more than 1,000 messages exist since oldest read.
- Audio streaming proxy timeout must not abort 2MB chunk transfers on slow connections.
- Reply quote preview with unbroken URLs must truncate with ellipsis (`...`) without blowing bubble to full viewport width.
- Hovering message row must not trigger reaction popovers; only hovering individual reaction pill opens that specific popover.

---

### Task 1: Fix mid-song audio playback state transition

**Files:**
- Modify: `app/pages/index.vue:185-215`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `onPlayerAction(action: 'load' | 'play' | 'pause' | 'seek', payload?: any)`
- Produces: Resilient `audioPlayerRef` media element seek handling using `pendingAudioSeekSec`

- [ ] **Step 1: Write the failing test**

In `tests/components/indexPage.test.ts`, add a test verifying that calling `onPlayerAction('load', { videoId: 'abc', startSeconds: 45, autoplay: true })` does not throw when `readyState === 0` and defers seek to metadata loaded:

```ts
it('defers setting currentTime on audio load until metadata loaded', async () => {
  const wrapper = await mountIndexPage()
  const audio = wrapper.find<HTMLAudioElement>('#youtube-hidden-player').element
  // Simulate readyState 0 (HAVE_NOTHING) throwing InvalidStateError on currentTime assignment
  Object.defineProperty(audio, 'readyState', { value: 0, configurable: true })
  let currentTimeAssigned = 0
  Object.defineProperty(audio, 'currentTime', {
    get: () => currentTimeAssigned,
    set: (val: number) => {
      if (audio.readyState === 0) throw new DOMException('The element is not ready', 'InvalidStateError')
      currentTimeAssigned = val
    },
    configurable: true,
  })
  const playSpy = vi.spyOn(audio, 'play').mockResolvedValue(undefined)

  const vm = wrapper.vm as any
  expect(() => {
    vm.onPlayerAction?.('load', { videoId: 'test1234567', startSeconds: 45, autoplay: true })
  }).not.toThrow()
  expect(playSpy).toHaveBeenCalled()

  Object.defineProperty(audio, 'readyState', { value: 2, configurable: true })
  Object.defineProperty(audio, 'duration', { value: 180, configurable: true })
  await wrapper.find('#youtube-hidden-player').trigger('loadedmetadata')
  expect(audio.currentTime).toBe(45)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/indexPage.test.ts`
Expected: FAIL (thrown `InvalidStateError` stops `play()` call).

- [ ] **Step 3: Implement deferred seek in `app/pages/index.vue`**

Add `let pendingAudioSeekSec = 0`.
In `onPlayerAction('load')`:
1. Assign `audio.src = ...`.
2. Save `pendingAudioSeekSec = payload.startSeconds || 0`.
3. If `audio.readyState >= 1 && pendingAudioSeekSec > 0`, safely apply `try { audio.currentTime = pendingAudioSeekSec; pendingAudioSeekSec = 0 } catch {}`.
4. Keep `audio.play()` call protected from seek exceptions.
5. In `handleAudioMetadata()`, if `audioPlayerRef.value && pendingAudioSeekSec > 0`, safely apply `try { audioPlayerRef.value.currentTime = pendingAudioSeekSec } catch {}` and reset `pendingAudioSeekSec = 0`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/indexPage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue tests/components/indexPage.test.ts
git commit -m "fix(audio): defer initial seek until audio metadata loaded"
```

---

### Task 2: Cap attachment cache with LRU eviction and cleanup

**Files:**
- Modify: `app/composables/useImageAttachmentCache.ts:40-140`
- Test: `tests/composables/useImageAttachmentCache.test.ts`

**Interfaces:**
- Consumes: `createImageAttachmentCache()`, `getOrFetchImage(path, mimeType, channelId)`
- Produces: Constant `MAX_CACHED_ATTACHMENTS = 50`, automated LRU eviction, and `URL.revokeObjectURL` on evicted entries

- [ ] **Step 1: Write the failing test**

In `tests/composables/useImageAttachmentCache.test.ts`, add a test verifying LRU eviction when cache exceeds max entries:

```ts
it('evicts oldest blob URL and calls revokeObjectURL when cache exceeds capacity', async () => {
  const cache = useImageAttachmentCache()
  const urls: string[] = []

  for (let i = 1; i <= 51; i++) {
    const url = await cache.getOrFetchImage(`path/${i}.enc`, 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
    urls.push(url)
  }

  expect(URL.revokeObjectURL).toHaveBeenCalledWith(urls[0])
  expect(cache.getCachedUrl('path/1.enc')).toBeUndefined()
  expect(cache.getCachedUrl('path/51.enc')).toBe(urls[50])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useImageAttachmentCache.test.ts`
Expected: FAIL (`URL.revokeObjectURL` not called for `urls[0]`).

- [ ] **Step 3: Implement LRU eviction in `app/composables/useImageAttachmentCache.ts`**

Export `MAX_CACHED_ATTACHMENTS = 50`.
In `createImageAttachmentCache`:
1. In `getCachedUrl(path)`: if `cachedUrls.has(path)`, refresh LRU order (`const val = cachedUrls.get(path)!; cachedUrls.delete(path); cachedUrls.set(path, val); return val`).
2. In `getOrFetchImage`: before setting `cachedUrls.set(path, objectUrl)`:
   - While `cachedUrls.size >= MAX_CACHED_ATTACHMENTS`:
     - Extract oldest key: `const oldestKey = cachedUrls.keys().next().value`.
     - Revoke blob: `if (oldestKey) { const oldUrl = cachedUrls.get(oldestKey); if (oldUrl && typeof URL !== 'undefined') URL.revokeObjectURL(oldUrl); cachedUrls.delete(oldestKey); }`
   - Store new entry: `cachedUrls.set(path, objectUrl)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useImageAttachmentCache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useImageAttachmentCache.ts tests/composables/useImageAttachmentCache.test.ts
git commit -m "fix(media): bound image attachment cache with LRU eviction"
```

---

### Task 3: Check cached profiles prior to inactive channel filter

**Files:**
- Modify: `app/composables/useChatRoom.ts:338-366`
- Test: `tests/composables/useChatRoom.test.ts:153-186`

**Interfaces:**
- Consumes: `resolveMessageAuthor({ userId, existingAuthor, conversationId, activeConversationId, profilesCache, fetchProfile })`
- Produces: `Profile | undefined` with cache check preceding inactive channel suppression

- [ ] **Step 1: Write the failing test**

In `tests/composables/useChatRoom.test.ts`, add a test verifying `resolveMessageAuthor` returns a cached profile even when the message is for an inactive channel:

```ts
it('returns cached profile for inactive channel without calling fetchProfile', async () => {
  const cache = new Map<string, Profile>()
  cache.set('u-bob', { id: 'u-bob', email: 'b@b.c', display_name: 'Bob', avatar_color: '#7c3aed' })
  const fetchProfile = vi.fn().mockResolvedValue(undefined)

  const author = await resolveMessageAuthor({
    userId: 'u-bob',
    channelId: 'ch-other',
    activeChannelId: 'ch-general',
    profilesCache: cache,
    fetchProfile,
  })

  expect(author?.display_name).toBe('Bob')
  expect(fetchProfile).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL (`author` is `undefined`).

- [ ] **Step 3: Implement cache check before inactive filter in `app/composables/useChatRoom.ts`**

In `resolveMessageAuthor`:
```ts
export async function resolveMessageAuthor(params: {
  userId: string
  existingAuthor?: Profile
  conversationId?: string
  channelId?: string
  activeConversationId?: string | null
  activeChannelId?: string | null
  profilesCache: Map<string, Profile>
  fetchProfile: (userId: string) => Promise<Profile | undefined>
}): Promise<Profile | undefined> {
  if (params.existingAuthor) {
    params.profilesCache.set(params.existingAuthor.id, params.existingAuthor)
    return params.existingAuthor
  }

  const cached = params.profilesCache.get(params.userId)
  if (cached) {
    return cached
  }

  const targetId = params.conversationId || params.channelId
  const activeId = params.activeConversationId !== undefined ? params.activeConversationId : params.activeChannelId
  if (targetId && activeId && targetId !== activeId) {
    return undefined
  }

  const fetched = await params.fetchProfile(params.userId)
  if (fetched) {
    params.profilesCache.set(fetched.id, fetched)
  }
  return fetched
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(notifications): check profiles cache before skipping author resolution"
```

---

### Task 4: Invert unread query pagination order to preserve new messages

**Files:**
- Modify: `app/composables/useChatRoom.ts:586-615`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: Supabase messages query ordered by `created_at desc` with `.limit(1000)`
- Produces: Chronologically reversed messages for unread calculation

- [ ] **Step 1: Write the failing test**

In `tests/composables/useChatRoom.test.ts`, add a test verifying `loadConversationReadsAndUnreads` fetches newest messages when more than 1000 messages exist:

```ts
it('orders unread messages query by created_at desc to preserve newest unreads', async () => {
  let orderDirection = ''
  const mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn((_col: string, options: any) => {
            orderDirection = options.ascending ? 'asc' : 'desc'
            return {
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }
          }),
        }
      }
      return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) }
    }),
  }
  // Call helper verifying order is created_at descending
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL (query is currently `ascending: true`).

- [ ] **Step 3: Invert order in `app/composables/useChatRoom.ts`**

Change lines 594-603:
```ts
query = query.order('created_at', { ascending: false })
if (typeof query.limit === 'function') {
  query = query.limit(1000)
}

let { data: recentMessages } = await query

if (recentMessages) {
  const chronologicalRecent = [...recentMessages].reverse()
  const decryptedRecent = await decryptMessageRows(chronologicalRecent as any, e2ee.key.value)
  const snapshot = computeUnreadSnapshot({
    messages: decryptedRecent as any,
    lastReadByConversation: map,
    activeConversationId: activeConversationId.value,
    currentUserId: current.id,
    currentDisplayName: current.display_name,
  })
  unreadCounts.value = snapshot.unreadCounts
  unreadMentions.value = snapshot.unreadMentions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(chat): order unread history descending to preserve recent messages"
```

---

### Task 5: Extend audio chunk streaming timeout on proxy endpoint

**Files:**
- Modify: `server/api/youtube/stream.get.ts:20-27`
- Test: `tests/utils/youtubeStreamTimeout.test.ts:50-65`

**Interfaces:**
- Consumes: `streamHandler(event)`
- Produces: 15-second timeout for binary audio body fetch

- [ ] **Step 1: Write the failing test**

In `tests/utils/youtubeStreamTimeout.test.ts`, update the timeout expectation to 15,000ms:

```ts
await vi.advanceTimersByTimeAsync(15000)
if (retryStalls) await vi.advanceTimersByTimeAsync(15000)
expect(completed).toBe(true)
expect(timeoutSpy.mock.calls.filter(([delay]) => delay === 15000)).toHaveLength(2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/youtubeStreamTimeout.test.ts`
Expected: FAIL (mock expected 15000, received 3500).

- [ ] **Step 3: Update `server/api/youtube/stream.get.ts`**

In `fetchStream`:
```ts
async function fetchStream(url: string) {
  return await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Range: rangeHeader,
    },
  }).catch(() => null)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/youtubeStreamTimeout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/youtube/stream.get.ts tests/utils/youtubeStreamTimeout.test.ts
git commit -m "fix(audio): increase stream proxy timeout to 15s for slow mobile networks"
```

---

### Task 6: Await asynchronous channel teardown on reconnect

**Files:**
- Modify: `app/composables/useChatRoom.ts:828-868`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `supabase.removeChannel(channel)`
- Produces: Clean async channel disposal before allocating replacement Realtime channels

- [ ] **Step 1: Write the failing test**

In `tests/composables/useChatRoom.test.ts`, verify that `setupDbChangesSubscription` awaits `supabase.removeChannel`:

```ts
it('removes and waits for old dbChangesChannel before creating a replacement', async () => {
  let removed = false
  const mockSupabase = {
    removeChannel: vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 10))
      removed = true
    }),
    channel: vi.fn().mockImplementation(() => {
      expect(removed).toBe(true)
      return { on: vi.fn().mockReturnThis(), subscribe: vi.fn() }
    }),
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL (`removeChannel` is not awaited).

- [ ] **Step 3: Implement async channel removal in `app/composables/useChatRoom.ts`**

Define helper inside `useChatRoom`:
```ts
async function removeRealtimeChannel(ch: RealtimeChannel | null): Promise<void> {
  if (!ch) return
  try {
    await supabase.removeChannel(ch)
  } catch {}
}
```
Update `setupDbChangesSubscription` and `setupPresenceSubscription`:
```ts
async function setupDbChangesSubscription(): Promise<void> {
  if (dbChangesChannel) {
    const prev = dbChangesChannel
    dbChangesChannel = null
    await removeRealtimeChannel(prev)
  }
  dbChangesChannel = supabase.channel('chat:db_changes')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(realtime): await channel removal before instantiating new channels"
```

---

### Task 7: Streamline system payload parsing to single pass

**Files:**
- Modify: `app/utils/chat.ts:801-825`
- Test: `tests/utils/chat.test.ts:850-888`

**Interfaces:**
- Consumes: `isSystemPayload(content)`, `parseSystemPayload(content)`
- Produces: Single-pass JSON parse with zero double-serialization overhead

- [ ] **Step 1: Write the failing test**

In `tests/utils/chat.test.ts`, add a spy on `JSON.parse` verifying it is invoked only once per `parseSystemPayload` call:

```ts
it('invokes JSON.parse only once during parseSystemPayload', () => {
  const jsonSpy = vi.spyOn(JSON, 'parse')
  const payloadStr = JSON.stringify({ type: 'system', event: 'buzz', actorName: 'Dan' })

  const parsed = parseSystemPayload(payloadStr)
  expect(parsed?.actorName).toBe('Dan')
  expect(jsonSpy).toHaveBeenCalledTimes(1)
  jsonSpy.mockRestore()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL (`JSON.parse` called 2 times).

- [ ] **Step 3: Refactor `app/utils/chat.ts` to single-pass parse**

```ts
export function parseSystemPayload(content?: string | null): SystemMessagePayload | null {
  if (!content || typeof content !== 'string') return null
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && parsed.type === 'system' && parsed.event && parsed.actorName) {
      return parsed as SystemMessagePayload
    }
    return null
  } catch {
    return null
  }
}

export function isSystemPayload(content?: string | null): boolean {
  return parseSystemPayload(content) !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "perf(chat): optimize system payload parsing to single pass"
```

---

### Task 8: Fix reply quote width blowout and add jump-to-message on click

**Files:**
- Modify: `app/components/MessageViewport.vue:726-760`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `item.message.reply_to_id`, `item.message.reply_to`
- Produces: Capped quote container (`max-w-[420px] w-full min-w-0`), inner `min-w-0 flex-1 truncate` with ellipsis on long URLs, bubble `min-w-0 max-w-full`, and `@click="jumpToMessage(item.message.reply_to_id)"`

- [ ] **Step 1: Write the failing test**

In `tests/components/chatUi.test.ts`, add a test verifying that a message bubble with a reply quote containing a long URL has `min-w-0` on its quote span and jumps to the parent message on click:

```ts
it('MessageViewport reply quote has min-w-0, truncates long URLs, and jumps to parent on click', async () => {
  const wrapper = mount(MessageViewport, {
    props: {
      channelId: 'ch-1',
      currentUserId: 'u-1',
      messages: [
        {
          id: 'm-parent',
          client_id: 'c-parent',
          channel_id: 'ch-1',
          user_id: 'u-2',
          content: 'Event link: https://event-planner-pi-olive.vercel.app/e/3300?join=d9d176bbd997407a9f0019f4aea11f2e&ts=123456789',
          created_at: '2026-10-30T01:00:00Z',
          status: 'sent',
          author: { id: 'u-2', display_name: 'Vua hải tặc', avatar_color: '#0284c7' },
        },
        {
          id: 'm-reply',
          client_id: 'c-reply',
          channel_id: 'ch-1',
          user_id: 'u-2',
          content: 'Nhớ tuần sau có hẹn nha @all',
          reply_to_id: 'm-parent',
          reply_to: {
            id: 'm-parent',
            user_id: 'u-2',
            content: 'Event link: https://event-planner-pi-olive.vercel.app/e/3300?join=d9d176bbd997407a9f0019f4aea11f2e&ts=123456789',
            author: { id: 'u-2', display_name: 'Vua hải tặc', avatar_color: '#0284c7' },
          },
          created_at: '2026-10-30T01:01:00Z',
          status: 'sent',
          author: { id: 'u-2', display_name: 'Vua hải tặc', avatar_color: '#0284c7' },
        },
      ],
    },
  })

  const quote = wrapper.find('[data-test="reply-quote-m-reply"]')
  expect(quote.exists()).toBe(true)
  expect(quote.classes()).toContain('cursor-pointer')
  expect(quote.classes()).toContain('max-w-[420px]')
  const quoteTextSpan = quote.find('span.truncate.italic')
  expect(quoteTextSpan.classes()).toContain('min-w-0')
  expect(quoteTextSpan.classes()).toContain('flex-1')

  const jumpSpy = vi.spyOn(document, 'getElementById')
  await quote.trigger('click')
  expect(jumpSpy).toHaveBeenCalledWith('message-m-parent')
  jumpSpy.mockRestore()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (`max-w-[420px]`, `cursor-pointer`, `min-w-0`, and `flex-1` classes missing on quote span, click handler missing).

- [ ] **Step 3: Implement quote bounding and jump click in `app/components/MessageViewport.vue`**

1. On `.chat-message-bubble` (line 729), add `min-w-0 max-w-full`.
2. On `.chat-reply-quote` (line 748):
   ```html
   <div
     v-if="item.message.reply_to_id"
     :data-test="`reply-quote-${item.message.id}`"
     class="chat-reply-quote mb-2 px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 max-w-[420px] w-full min-w-0 backdrop-blur-xs cursor-pointer select-none hover:opacity-85 transition-opacity"
     :class="item.isSender ? 'bg-white/15 border-l-2 border-white/70 text-white/90' : 'bg-black/5 dark:bg-white/5 border-l-2 border-blue-500 dark:border-blue-400 text-[var(--ap-text-secondary)]'"
     @click="item.message.reply_to_id && jumpToMessage(item.message.reply_to_id)"
   >
     <span class="font-semibold shrink-0" :class="item.isSender ? 'text-white' : 'text-blue-600 dark:text-blue-300'">
       @{{ item.message.reply_to?.author?.display_name || 'Friend' }}
     </span>
     <span class="truncate italic min-w-0 flex-1">
       {{ item.message.reply_to?.deleted_at ? 'Original message was deleted' : (item.message.reply_to?.encryption === 'undecryptable' ? '🔒 Unable to decrypt this message' : (isImagePayload(item.message.reply_to?.content) ? formatImageMessageSummary(parseImagePayload(item.message.reply_to?.content)?.images.length || 1) : (parseStickerPayload(item.message.reply_to?.content) ? `[Sticker] ${parseStickerPayload(item.message.reply_to?.content)!.emoji} ${parseStickerPayload(item.message.reply_to?.content)!.label}` : (item.message.reply_to?.content || 'Message')))) }}
     </span>
   </div>
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue tests/components/chatUi.test.ts
git commit -m "fix(ui): cap reply quote width, enable flex text truncation, and add jump-to-message"
```

---

### Task 9: Scope reaction popovers to individual pill hover using named Tailwind groups

**Files:**
- Modify: `app/components/MessageViewport.vue:1025-1060`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `summary in summarizeReactions(item.message.reactions, currentUserId)`
- Produces: Scoped Tailwind group `group/pill` and `group-hover/pill:block group-focus-within/pill:block` ensuring row hover never triggers reaction popovers

- [ ] **Step 1: Write the failing test**

In `tests/components/chatUi.test.ts`, add a test verifying that each reaction popover is scoped to `group/pill` so row hover does not open popovers:

```ts
it('MessageViewport reaction popover uses group/pill scoping to prevent multi-popover cascade', () => {
  const wrapper = mount(MessageViewport, {
    props: {
      channelId: 'ch-1',
      currentUserId: 'u-1',
      messages: [
        {
          id: 'm-multi-react',
          client_id: 'c-multi',
          channel_id: 'ch-1',
          user_id: 'u-2',
          content: 'High-five everyone',
          created_at: '2026-10-30T02:00:00Z',
          status: 'sent',
          author: { id: 'u-2', display_name: 'Alice', avatar_color: '#0284c7' },
          reactions: [
            { id: 'r1', message_id: 'm-multi-react', user_id: 'u-1', emoji: '❤️' },
            { id: 'r2', message_id: 'm-multi-react', user_id: 'u-2', emoji: '👍' },
            { id: 'r3', message_id: 'm-multi-react', user_id: 'u-3', emoji: '🎉' },
          ],
        },
      ],
    },
  })

  // The wrapper around the reaction pill must have group/pill
  const pillWrappers = wrapper.findAll('.relative.group\\/pill')
  expect(pillWrappers.length).toBe(3)

  // Popover must use group-hover/pill:block instead of generic group-hover:block
  const popover = wrapper.find('[data-test="reaction-popover-m-multi-react-❤️"]')
  expect(popover.exists()).toBe(true)
  expect(popover.classes()).toContain('group-hover/pill:block')
  expect(popover.classes()).not.toContain('group-hover:block')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (`.relative.group/pill` not found, `group-hover:block` found instead).

- [ ] **Step 3: Update reaction pill and popover classes in `app/components/MessageViewport.vue`**

Lines 1025-1045:
1. Change pill container class from `class="relative group"` to `class="relative group/pill"`.
2. Change popover classes from:
   `group-hover:block group-focus-within:block`
   to:
   `group-hover/pill:block group-focus-within/pill:block`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue tests/components/chatUi.test.ts
git commit -m "fix(ui): scope reaction popovers to individual pill hover using named groups"
```

---

### Task 10: Full regression suite verification

**Files:**
- Test: Entire Vitest test suite (`tests/**/*.test.ts`)

- [ ] **Step 1: Run full Vitest suite**

Run: `npm test`
Expected: 52 test files passed, 591+ tests passed, 0 failures.

- [ ] **Step 2: Verify git status and clean working tree**

Run: `git status`
Expected: All modified files committed.
