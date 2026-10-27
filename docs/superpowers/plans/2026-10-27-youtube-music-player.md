# YouTube Shared Music Player ("Listen Together") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users in any direct or group conversation to search YouTube inside the app, select a video, and play its audio in real-time sync ("Listen Together") with a persistent mini-player bar.

**Architecture:**
1. **Keyless Server Search (`/api/youtube/search`)**: Nuxt Nitro server endpoint that queries YouTube Data API v3 when `YOUTUBE_API_KEY` is present, and falls back to keyless YouTube InnerTube/HTML search extraction so search works out-of-the-box with zero config.
2. **Realtime Sync (`useMusicPlayer.ts` + `useChatRoom.ts`)**: Uses Supabase Realtime Broadcast (`music_sync` events on the conversation channel) plus E2EE system messages (`event: 'music_play'`) to synchronize track selection, play/pause, seek, and stop across conversation members without requiring any Postgres DDL migration.
3. **Persistent Audio Engine (`MusicPlayerBar.vue` + `YouTubeSearchModal.vue`)**: Uses the official YouTube IFrame Player API (`YT.Player`) in a persistent hidden container inside `app/pages/index.vue` so audio continues seamlessly when switching conversations.

**Tech Stack:** Nuxt 4 (Nitro server routes, Vue 3 Composition API), Supabase Realtime Broadcast, YouTube IFrame Player API, Tailwind CSS, `@lucide/vue`, Vitest + `@vue/test-utils`.

**Spec:** Self-contained in this plan (`docs/superpowers/plans/2026-10-27-youtube-music-player.md`).

## Global Constraints

- Zero new npm dependencies (`@lucide/vue`, Nuxt Nitro `$fetch`/`fetch`, and YouTube IFrame API cover all needs).
- Zero Postgres schema migrations required (avoids PostgREST `PGRST204` schema cache errors; uses existing E2EE `messages` table for `system` messages and Supabase Realtime Broadcast for live playback state).
- Theme token discipline (`--ap-text-primary`, `--ap-text-secondary`, `--ap-text-muted`, dark/light adaptive classes) on all new UI elements.
- SSR & Vitest safety: guard `window` / `document` / `YT` globals so all unit and component tests pass in `happy-dom`.

## Review Focus

1. **Empty or special-character search queries**: `/api/youtube/search?q=` with blank or whitespace input returns `{ items: [] }` with HTTP 200 instead of throwing or making upstream requests.
2. **Upstream YouTube fetch failure or malformed payload**: `/api/youtube/search` catches network/parse errors and returns `{ items: [], error: 'Failed to search YouTube' }` without crashing the Nitro worker.
3. **Browser autoplay policy block on remote sync**: When a peer starts a song and the local browser blocks uninitiated `player.playVideo()`, the player sets `autoplayBlocked = true` and shows a one-click "Tune in" button in `MusicPlayerBar.vue`.
4. **Switching conversations while music plays**: Selecting another conversation keeps `MusicPlayerBar.vue` playing the active track globally until the user stops it or starts a new track in another conversation.
5. **Echo loop prevention in Realtime Broadcast**: Incoming `music_sync` broadcast events update local player state with an `isApplyingRemoteSync` guard so applying remote play/pause does not re-broadcast the same event back to the room.

---

### Task 1: Domain Types, System Message Format & YouTube Search Parser

**Files:**
- Modify: `app/types/chat.ts`
- Modify: `app/utils/chat.ts`
- Create: `app/utils/youtube.ts`
- Test: `tests/utils/youtube.test.ts`

**Interfaces:**
- Produces in `app/types/chat.ts`:
  - `SystemEventType = 'buzz' | 'group_rename' | 'background_change' | 'background_reset' | 'music_play'`
  - `YouTubeSearchResult { videoId: string; title: string; channelTitle: string; thumbnail: string; durationText?: string }`
  - `MusicPlaybackState { conversationId: string; videoId: string; title: string; channelTitle: string; thumbnail: string; isPlaying: boolean; positionSec: number; updatedAt: number; startedBy: string; actorId?: string }`
  - `MusicSyncEvent { type: 'play' | 'pause' | 'seek' | 'stop' | 'request_state' | 'sync_state'; state: MusicPlaybackState | null; senderId: string; conversationId: string }`
- Produces in `app/utils/youtube.ts`:
  - `parseYouTubeInitialData(htmlOrJson: string | Record<string, any>): YouTubeSearchResult[]`
  - `parseYouTubeApiResponse(data: Record<string, any>): YouTubeSearchResult[]`
  - `formatDurationSeconds(seconds: number): string`
- Produces in `app/utils/chat.ts`:
  - Updated `formatSystemMessageText(payload: SystemMessagePayload): string` handling `event === 'music_play'` -> `"${payload.actorName} started playing 🎵 ${payload.detail || 'a track'}"`

- [ ] **Step 1: Write the failing unit tests in `tests/utils/youtube.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  parseYouTubeInitialData,
  parseYouTubeApiResponse,
  formatDurationSeconds,
} from '~/utils/youtube'
import { formatSystemMessageText } from '~/utils/chat'

describe('youtube utils', () => {
  it('parses YouTube Data API v3 items into YouTubeSearchResult[]', () => {
    const raw = {
      items: [
        {
          id: { videoId: 'jfKfPfyJRdk' },
          snippet: {
            title: 'lofi hip hop radio',
            channelTitle: 'Lofi Girl',
            thumbnails: { medium: { url: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg' } },
          },
        },
      ],
    }
    expect(parseYouTubeApiResponse(raw)).toEqual([
      {
        videoId: 'jfKfPfyJRdk',
        title: 'lofi hip hop radio',
        channelTitle: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg',
      },
    ])
  })

  it('extracts videoRenderer items from YouTube initial data JSON or HTML', () => {
    const mockHtml = `var ytInitialData = {"contents":{"twoColumnSearchResultsRenderer":{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[{"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":{"runs":[{"text":"Never Gonna Give You Up"}]},"ownerText":{"runs":[{"text":"Rick Astley"}]},"lengthText":{"simpleText":"3:33"},"thumbnail":{"thumbnails":[{"url":"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"}]}}}]}}]}}}}};</script>`
    const results = parseYouTubeInitialData(mockHtml)
    expect(results).toEqual([
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        durationText: '3:33',
      },
    ])
  })

  it('returns empty array on malformed or empty input', () => {
    expect(parseYouTubeInitialData('')).toEqual([])
    expect(parseYouTubeInitialData('not json')).toEqual([])
    expect(parseYouTubeApiResponse({})).toEqual([])
  })

  it('formats duration seconds as m:ss or h:mm:ss', () => {
    expect(formatDurationSeconds(0)).toBe('0:00')
    expect(formatDurationSeconds(65)).toBe('1:05')
    expect(formatDurationSeconds(3661)).toBe('1:01:01')
  })

  it('formats music_play system message', () => {
    expect(
      formatSystemMessageText({
        type: 'system',
        event: 'music_play',
        actorName: 'Alice',
        detail: 'Lofi Beats',
      }),
    ).toBe('Alice started playing 🎵 Lofi Beats')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/youtube.test.ts`
Expected: FAIL with module `~/utils/youtube` not found.

- [ ] **Step 3: Implement types in `app/types/chat.ts`, parser in `app/utils/youtube.ts`, and system text in `app/utils/chat.ts`**

In `app/utils/youtube.ts`, recursively walk objects for `videoRenderer` nodes (supporting both `var ytInitialData = {...};` HTML and direct InnerTube JSON objects) and deduplicate by `videoId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/youtube.test.ts`
Expected: PASS (5 passed).

---

### Task 2: Nuxt Server Endpoint for YouTube Search (`/api/youtube/search`)

**Files:**
- Create: `server/api/youtube/search.get.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Test: `tests/utils/youtubeServer.test.ts`

**Interfaces:**
- Consumes: `parseYouTubeInitialData`, `parseYouTubeApiResponse` from `~/utils/youtube`
- Produces:
  - `searchYouTubeVideos(query: string, options?: { apiKey?: string; fetchFn?: typeof fetch }): Promise<{ items: YouTubeSearchResult[]; error?: string }>`
  - Nitro GET handler `server/api/youtube/search.get.ts` accepting `?q=<search>` and returning `{ items: YouTubeSearchResult[], error?: string }`

- [ ] **Step 1: Write the failing unit tests in `tests/utils/youtubeServer.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { searchYouTubeVideos } from '~/utils/youtube'

describe('searchYouTubeVideos', () => {
  it('returns empty items without calling fetch when query is blank', async () => {
    const fetchFn = vi.fn()
    const res = await searchYouTubeVideos('   ', { fetchFn: fetchFn as any })
    expect(res).toEqual({ items: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('uses YouTube Data API v3 when apiKey is provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: { videoId: 'abc12345678' },
            snippet: { title: 'Test Song', channelTitle: 'Test Artist' },
          },
        ],
      }),
    })
    const res = await searchYouTubeVideos('test song', {
      apiKey: 'AIza-mock',
      fetchFn: fetchFn as any,
    })
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('https://www.googleapis.com/youtube/v3/search'),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].videoId).toBe('abc12345678')
  })

  it('uses keyless YouTube InnerTube POST search when no apiKey is provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contents: {
          sectionListRenderer: {
            contents: [
              {
                videoRenderer: {
                  videoId: 'xyz98765432',
                  title: { runs: [{ text: 'Keyless Track' }] },
                  ownerText: { runs: [{ text: 'Indie Channel' }] },
                  lengthText: { simpleText: '4:20' },
                },
              },
            ],
          },
        },
      }),
    })
    const res = await searchYouTubeVideos('keyless track', { fetchFn: fetchFn as any })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(res.items[0]?.videoId).toBe('xyz98765432')
  })

  it('handles upstream fetch errors gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network down'))
    const res = await searchYouTubeVideos('lofi', { fetchFn: fetchFn as any })
    expect(res).toEqual({ items: [], error: 'Failed to search YouTube' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/youtubeServer.test.ts`
Expected: FAIL with `searchYouTubeVideos` not exported.

- [ ] **Step 3: Implement `searchYouTubeVideos` in `app/utils/youtube.ts` and `server/api/youtube/search.get.ts`**

Add `youtubeApiKey: process.env.YOUTUBE_API_KEY || ''` to `runtimeConfig` in `nuxt.config.ts` and document optional `YOUTUBE_API_KEY=` in `.env.example`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/youtubeServer.test.ts`
Expected: PASS (4 passed).

---

### Task 3: Music Player State Store & Composable (`useMusicPlayer.ts`)

**Files:**
- Create: `app/composables/useMusicPlayer.ts`
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useMusicPlayer.test.ts`

**Interfaces:**
- Consumes: `MusicPlaybackState`, `MusicSyncEvent`, `YouTubeSearchResult` from `~/types/chat`
- Produces in `app/composables/useMusicPlayer.ts`:
  - `createMusicController(options?: { onBroadcast?: (event: MusicSyncEvent) => void; getCurrentUserId?: () => string | undefined; getCurrentUserName?: () => string | undefined })` returning:
    - `currentTrack: Ref<MusicPlaybackState | null>`
    - `currentTimeSec: Ref<number>`
    - `durationSec: Ref<number>`
    - `volume: Ref<number>`
    - `isMuted: Ref<boolean>`
    - `autoplayBlocked: Ref<boolean>`
    - `playTrack(track: YouTubeSearchResult, conversationId: string): void`
    - `togglePlayPause(): void`
    - `seekTo(seconds: number): void`
    - `stopPlayback(broadcast?: boolean): void`
    - `applyRemoteSyncEvent(event: MusicSyncEvent): void`
    - `computeSyncedPosition(state: MusicPlaybackState, nowMs?: number): number`
- Produces in `app/composables/useChatRoom.ts`:
  - Wires `music_sync` broadcast listener onto `typingChannel` (and `presenceChannel` for cross-conversation sync) plus `sendMusicPlaySystemMessage(trackTitle: string, conversationId?: string)`

- [ ] **Step 1: Write the failing unit tests in `tests/composables/useMusicPlayer.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createMusicController, computeSyncedPosition } from '~/composables/useMusicPlayer'

describe('useMusicPlayer controller', () => {
  it('starts playing a selected track and broadcasts play event', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      getCurrentUserId: () => 'user-1',
      getCurrentUserName: () => 'Alice',
    })

    ctrl.playTrack(
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      },
      'conv-1',
    )

    expect(ctrl.currentTrack.value?.videoId).toBe('dQw4w9WgXcQ')
    expect(ctrl.currentTrack.value?.isPlaying).toBe(true)
    expect(ctrl.currentTrack.value?.conversationId).toBe('conv-1')
    expect(onBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'play',
        conversationId: 'conv-1',
        senderId: 'user-1',
      }),
    )
  })

  it('applies remote sync events without re-broadcasting (echo prevention)', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      getCurrentUserId: () => 'user-2',
    })

    ctrl.applyRemoteSyncEvent({
      type: 'play',
      senderId: 'user-1',
      conversationId: 'conv-1',
      state: {
        conversationId: 'conv-1',
        videoId: 'jfKfPfyJRdk',
        title: 'Lofi Radio',
        channelTitle: 'Lofi Girl',
        thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/mqdefault.jpg',
        isPlaying: true,
        positionSec: 12,
        updatedAt: Date.now(),
        startedBy: 'Alice',
        actorId: 'user-1',
      },
    })

    expect(ctrl.currentTrack.value?.videoId).toBe('jfKfPfyJRdk')
    expect(onBroadcast).not.toHaveBeenCalled()
  })

  it('computes elapsed position for playing tracks', () => {
    const pos = computeSyncedPosition(
      {
        conversationId: 'conv-1',
        videoId: 'abc',
        title: 'Song',
        channelTitle: 'Artist',
        thumbnail: '',
        isPlaying: true,
        positionSec: 10,
        updatedAt: 1000,
        startedBy: 'Alice',
      },
      6000,
    )
    expect(pos).toBe(15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useMusicPlayer.test.ts`
Expected: FAIL with module `~/composables/useMusicPlayer` not found.

- [ ] **Step 3: Implement `app/composables/useMusicPlayer.ts` and wire realtime broadcast in `app/composables/useChatRoom.ts`**

Ensure `selectConversation` does NOT stop `currentTrack` (preserving global playback per `A4`), while requesting room music state if no track is currently playing locally.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useMusicPlayer.test.ts`
Expected: PASS (3 passed).

---

### Task 4: YouTube Search Modal & Persistent Music Player Bar UI

**Files:**
- Create: `app/components/YouTubeSearchModal.vue`
- Create: `app/components/MusicPlayerBar.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/musicUi.test.ts`

**Interfaces:**
- `YouTubeSearchModal.vue`:
  - Props: `{ open: boolean; conversationTitle?: string }`
  - Emits: `close`, `select(track: YouTubeSearchResult)`
  - Hook: `data-test="youtube-search-modal"`, `data-test="youtube-search-input"`, `data-test="youtube-result-item"`
- `MusicPlayerBar.vue`:
  - Props: `{ track: MusicPlaybackState | null; currentTimeSec: number; durationSec: number; isMuted: boolean; autoplayBlocked: boolean; conversationName?: string }`
  - Emits: `toggle-play`, `seek(sec: number)`, `toggle-mute`, `stop`, `unblock-autoplay`, `open-search`
  - Hook: `data-test="music-player-bar"`, `data-test="music-toggle-play"`, `data-test="music-stop-btn"`, `data-test="music-unblock-btn"`
- `app/pages/index.vue`:
  - Header button `data-test="open-music-search-btn"` with `Music` icon from `@lucide/vue`
  - Mounts `MusicPlayerBar` above stage tabs and `YouTubeSearchModal` in modals section

- [ ] **Step 1: Write the failing component tests in `tests/components/musicUi.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MusicPlayerBar from '~/components/MusicPlayerBar.vue'
import YouTubeSearchModal from '~/components/YouTubeSearchModal.vue'

describe('Music UI components', () => {
  it('renders MusicPlayerBar when track is active and emits controls', async () => {
    const wrapper = mount(MusicPlayerBar, {
      props: {
        track: {
          conversationId: 'conv-1',
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          channelTitle: 'Rick Astley',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
          isPlaying: true,
          positionSec: 45,
          updatedAt: Date.now(),
          startedBy: 'Alice',
        },
        currentTimeSec: 45,
        durationSec: 213,
        isMuted: false,
        autoplayBlocked: false,
      },
    })

    expect(wrapper.find('[data-test="music-player-bar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Never Gonna Give You Up')
    expect(wrapper.text()).toContain('Alice')

    await wrapper.find('[data-test="music-toggle-play"]').trigger('click')
    expect(wrapper.emitted('toggle-play')).toBeTruthy()

    await wrapper.find('[data-test="music-stop-btn"]').trigger('click')
    expect(wrapper.emitted('stop')).toBeTruthy()
  })

  it('shows Tune In button when browser autoplay is blocked', async () => {
    const wrapper = mount(MusicPlayerBar, {
      props: {
        track: {
          conversationId: 'conv-1',
          videoId: 'dQw4w9WgXcQ',
          title: 'Test Song',
          channelTitle: 'Artist',
          thumbnail: '',
          isPlaying: true,
          positionSec: 0,
          updatedAt: Date.now(),
          startedBy: 'Bob',
        },
        currentTimeSec: 0,
        durationSec: 120,
        isMuted: false,
        autoplayBlocked: true,
      },
    })

    const unblockBtn = wrapper.find('[data-test="music-unblock-btn"]')
    expect(unblockBtn.exists()).toBe(true)
    await unblockBtn.trigger('click')
    expect(wrapper.emitted('unblock-autoplay')).toBeTruthy()
  })

  it('renders YouTubeSearchModal and emits select when a result is clicked', async () => {
    const wrapper = mount(YouTubeSearchModal, {
      props: {
        open: true,
        initialResults: [
          {
            videoId: 'jfKfPfyJRdk',
            title: 'lofi hip hop radio',
            channelTitle: 'Lofi Girl',
            thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg',
            durationText: 'LIVE',
          },
        ],
      },
    })

    const item = wrapper.find('[data-test="youtube-result-item"]')
    expect(item.exists()).toBe(true)
    await item.trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual(
      expect.objectContaining({ videoId: 'jfKfPfyJRdk' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/musicUi.test.ts`
Expected: FAIL with missing component files.

- [ ] **Step 3: Implement `YouTubeSearchModal.vue`, `MusicPlayerBar.vue`, and wire into `app/pages/index.vue`**

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npm test`
Expected: PASS across all test suites with zero regressions.
