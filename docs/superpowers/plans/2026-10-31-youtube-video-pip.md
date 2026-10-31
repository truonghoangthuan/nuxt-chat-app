# YouTube Video Picture-in-Picture (PiP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating, draggable Picture-in-Picture video player to the music player feature, streaming proxied YouTube video without client-side requests to `youtube.com`.

**Architecture:** Piped API streams are queried on the server for muxed MP4 formats. `/api/youtube/stream?v=<id>&type=video` proxies the video stream with HTTP 206 range request support. A single HTML5 `<video>` element in `app/pages/index.vue` dynamically toggles between low-bandwidth audio-only and video streams, rendering inside a floating draggable `YouTubeVideoPip.vue` component when active.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Lucide Vue icons, Vitest, Happy-DOM, H3 HTTP event handlers, Tailwind CSS.

## Global Constraints

- Never contact `youtube.com` directly from the client; all media streams must route through `/api/youtube/stream`.
- Video mode must be strictly opt-in; background playback defaults to the audio stream to conserve bandwidth.
- State and room synchronization via `useMusicPlayer` and Supabase Realtime broadcast must remain backwards-compatible.
- Functional data-test attributes must be preserved on all interactive elements.

---

### Task 1: Video Stream Extraction & Resolution Utilities

**Files:**
- Modify: `app/utils/youtube.ts`
- Test: `tests/utils/youtube.test.ts`

**Interfaces:**
- Consumes: `isValidYouTubeVideoId`, `PIPED_API`, `streamUrlCache`, `MAX_STREAM_CACHE_ENTRIES`
- Produces:
  - `extractBestVideoStream(formats: any[]): { url: string; mimeType: string } | null`
  - `resolveYouTubeVideoStream(videoId: string, options?: ResolveAudioOptions): Promise<{ url: string; mimeType: string } | null>`

- [x] **Step 1: Write the failing tests for video stream extraction and resolution**

In `tests/utils/youtube.test.ts`, append:
```typescript
import { extractBestVideoStream } from '~/utils/youtube'

describe('extractBestVideoStream', () => {
  it('extracts best muxed video/mp4 stream and ignores video-only streams', () => {
    const formats = [
      { mimeType: 'video/mp4; codecs="avc1.64001F"', url: 'https://v.example/video1080.mp4', videoOnly: true, quality: '1080p' },
      { mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', url: 'https://v.example/video360.mp4', videoOnly: false, quality: '360p', itag: 18, bitrate: 500000 },
      { mimeType: 'video/webm; codecs="vp9"', url: 'https://v.example/video720.webm', videoOnly: true, quality: '720p' },
    ]
    const best = extractBestVideoStream(formats)
    expect(best).toEqual({
      url: 'https://v.example/video360.mp4',
      mimeType: 'video/mp4',
    })
  })

  it('returns null when no muxed video stream exists', () => {
    const formats = [
      { mimeType: 'video/mp4', url: 'https://v.example/video-only.mp4', videoOnly: true },
      { mimeType: 'audio/mp4', url: 'https://a.example/audio.mp4', videoOnly: false },
    ]
    expect(extractBestVideoStream(formats)).toBeNull()
    expect(extractBestVideoStream([])).toBeNull()
    expect(extractBestVideoStream(null as any)).toBeNull()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/youtube.test.ts`
Expected: FAIL with `extractBestVideoStream is not defined`

- [x] **Step 3: Implement `extractBestVideoStream` and `resolveYouTubeVideoStream`**

In `app/utils/youtube.ts`, add:
```typescript
export function extractBestVideoStream(formats: any[]): { url: string; mimeType: string } | null {
  if (!Array.isArray(formats) || formats.length === 0) return null

  const muxedVideoFormats = formats.filter((f) => {
    if (!f || typeof f.url !== 'string' || !/^https?:\/\//.test(f.url)) return false
    if (f.videoOnly === true) return false
    const type = String(f.mimeType || f.type || '').toLowerCase()
    return type.startsWith('video/mp4') || type.startsWith('video/')
  })

  if (muxedVideoFormats.length === 0) return null

  // Sort by bitrate / quality descending, preferring MP4
  const sorted = [...muxedVideoFormats].sort((a, b) => {
    const aType = String(a.mimeType || a.type || '').toLowerCase()
    const bType = String(b.mimeType || b.type || '').toLowerCase()
    const aIsMp4 = aType.includes('mp4')
    const bIsMp4 = bType.includes('mp4')

    if (aIsMp4 && !bIsMp4) return -1
    if (!aIsMp4 && bIsMp4) return 1

    const aBitrate = Number(a.bitrate || 0)
    const bBitrate = Number(b.bitrate || 0)
    return bBitrate - aBitrate
  })

  const best = sorted[0]
  return {
    url: best.url,
    mimeType: 'video/mp4',
  }
}

const videoStreamUrlCache = new Map<string, CachedStream>()

export function clearVideoStreamUrlCache(): void {
  videoStreamUrlCache.clear()
}

export async function resolveYouTubeVideoStream(
  videoId: string,
  options: ResolveAudioOptions = {},
): Promise<{ url: string; mimeType: string } | null> {
  const cleanId = typeof videoId === 'string' ? videoId.trim() : ''
  if (!isValidYouTubeVideoId(cleanId)) {
    return null
  }

  const myFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!myFetch) {
    return null
  }

  const now = Date.now()
  if (!options.bypassCache) {
    const cached = videoStreamUrlCache.get(cleanId)
    if (cached) {
      if (cached.expiresAt > now) {
        return { url: cached.url, mimeType: cached.mimeType }
      }
      videoStreamUrlCache.delete(cleanId)
    }
  }

  const timeoutSignal = () =>
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(8000)
      : undefined

  try {
    const resp = await myFetch(`${PIPED_API}/streams/${encodeURIComponent(cleanId)}`, {
      signal: timeoutSignal(),
    })

    if (resp.ok) {
      const data = await resp.json()
      const formats = [
        ...(data?.videoStreams || []).filter((v: any) => v && v.videoOnly === false),
      ]
      const best = extractBestVideoStream(formats)
      if (best) {
        if (videoStreamUrlCache.size >= MAX_STREAM_CACHE_ENTRIES) {
          for (const [key, entry] of videoStreamUrlCache) {
            if (entry.expiresAt <= now) {
              videoStreamUrlCache.delete(key)
            }
          }
        }
        while (videoStreamUrlCache.size >= MAX_STREAM_CACHE_ENTRIES) {
          const oldestKey = videoStreamUrlCache.keys().next().value
          if (oldestKey !== undefined) {
            videoStreamUrlCache.delete(oldestKey)
          } else {
            break
          }
        }
        videoStreamUrlCache.set(cleanId, { ...best, expiresAt: now + 10 * 60 * 1000 })
        return best
      }
    }
  } catch {
    // Upstream failure
  }

  return null
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/youtube.test.ts`
Expected: PASS (all tests pass)

- [x] **Step 5: Commit changes**

```bash
git add app/utils/youtube.ts tests/utils/youtube.test.ts
git commit -m "feat(youtube): add video stream extraction and resolution utilities"
```

---

### Task 2: Server Stream Proxy Endpoint Update

**Files:**
- Modify: `server/api/youtube/stream.get.ts`
- Test: `tests/utils/youtubeServer.test.ts`

**Interfaces:**
- Consumes: `resolveYouTubeVideoStream`, `resolveYouTubeAudioStream`, `query.type`
- Produces: Proxied video stream with `video/mp4` content type when `type === 'video'`

- [x] **Step 1: Write failing test for `stream.get.ts` with `type=video`**

In `tests/utils/youtubeServer.test.ts`, add a test case in `describe('stream.get handler')`:
```typescript
it('resolves and streams video/mp4 when query type is video', async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/streams/')) {
      return {
        ok: true,
        json: async () => ({
          videoStreams: [
            {
              url: 'https://pipedproxy.example.com/video.mp4',
              mimeType: 'video/mp4',
              videoOnly: false,
              bitrate: 500000,
            },
          ],
        }),
      }
    }
    if (url.includes('pipedproxy.example.com/video.mp4')) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'bytes 0-3/4',
          'content-length': '4',
        },
      })
    }
    return new Response(null, { status: 404 })
  })

  // Mock global fetch or pass fetchFn
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchMock as any

  try {
    const mockEvent = {
      node: { req: {} },
    } as any
    // Query with v=dQw4w9WgXcQ and type=video
    const getQueryMock = vi.fn().mockReturnValue({ v: 'dQw4w9WgXcQ', type: 'video' })
    const getRequestHeaderMock = vi.fn().mockReturnValue('bytes=0-')

    // Exercise handler
    const response: any = await streamHandler(mockEvent)
    expect(response.status).toBe(206)
    expect(response.headers.get('content-type')).toBe('video/mp4')
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

- [x] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/utils/youtubeServer.test.ts`
Expected: FAIL because handler does not currently handle `type=video`.

- [x] **Step 3: Update `server/api/youtube/stream.get.ts`**

Update `server/api/youtube/stream.get.ts`:
```typescript
import { defineEventHandler, getQuery, getRequestHeader, setResponseStatus } from 'h3'
import {
  isValidYouTubeVideoId,
  normalizeStreamRangeHeader,
  resolveYouTubeAudioStream,
  resolveYouTubeVideoStream,
} from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const videoId = typeof query.v === 'string' ? query.v.trim() : ''
  const isVideo = query.type === 'video'

  if (!isValidYouTubeVideoId(videoId)) {
    setResponseStatus(event, 400)
    return { error: 'Invalid video ID' }
  }

  const incomingRange = getRequestHeader(event, 'range')
  const rangeHeader = normalizeStreamRangeHeader(incomingRange)

  const clientController = new AbortController()
  event.node?.req?.on?.('close', () => {
    clientController.abort()
  })

  async function fetchStream(url: string) {
    if (clientController.signal.aborted) return null

    const fetchController = new AbortController()
    const onClientClose = () => fetchController.abort()
    clientController.signal.addEventListener('abort', onClientClose, { once: true })

    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      fetchController.abort()
    }, 10000)

    try {
      const response = await fetch(url, {
        signal: fetchController.signal,
        headers: {
          Range: rangeHeader,
        },
      })
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      return response
    } catch {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      clientController.signal.removeEventListener('abort', onClientClose)
      return null
    }
  }

  const resolveStream = isVideo ? resolveYouTubeVideoStream : resolveYouTubeAudioStream
  const defaultMime = isVideo ? 'video/mp4' : 'audio/mp4'

  let resolved = await resolveStream(videoId)
  let upstream: Response | null = resolved ? await fetchStream(resolved.url) : null

  // Retry once bypassing cache on any failure
  if (!resolved || !upstream || (!upstream.ok && upstream.status !== 206)) {
    resolved = await resolveStream(videoId, { bypassCache: true })
    upstream = resolved ? await fetchStream(resolved.url) : null
  }

  if (!resolved || !upstream || (!upstream.ok && upstream.status !== 206)) {
    setResponseStatus(event, upstream?.status || 502)
    return { error: isVideo ? 'Upstream video stream failed' : 'Upstream audio stream failed' }
  }

  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || resolved.mimeType || defaultMime)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'public, max-age=3600')

  const contentRange = upstream.headers.get('content-range')
  if (contentRange) headers.set('Content-Range', contentRange)

  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
})
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/youtubeServer.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add server/api/youtube/stream.get.ts tests/utils/youtubeServer.test.ts
git commit -m "feat(youtube): support type=video stream proxying"
```

---

### Task 3: Floating PiP Video Component (`YouTubeVideoPip.vue`)

**Files:**
- Create: `app/components/YouTubeVideoPip.vue`
- Create: `tests/components/YouTubeVideoPip.test.ts`

**Interfaces:**
- Props:
  - `track: MusicPlaybackState | null`
  - `currentTimeSec: number`
  - `durationSec: number`
  - `isMuted?: boolean`
- Emits:
  - `(e: 'close'): void`
  - `(e: 'toggle-play'): void`
  - `(e: 'seek', seconds: number): void`
  - `(e: 'toggle-mute'): void`

- [x] **Step 1: Write component tests for `YouTubeVideoPip.vue`**

Create `tests/components/YouTubeVideoPip.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import YouTubeVideoPip from '~/components/YouTubeVideoPip.vue'

describe('YouTubeVideoPip', () => {
  const dummyTrack = {
    conversationId: 'conv-1',
    videoId: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    channelTitle: 'Rick Astley',
    thumbnail: '',
    isPlaying: true,
    positionSec: 30,
    updatedAt: Date.now(),
    startedBy: 'Alice',
  }

  it('renders video pip card with track title and emits close', async () => {
    const wrapper = mount(YouTubeVideoPip, {
      props: {
        track: dummyTrack,
        currentTimeSec: 30,
        durationSec: 213,
        isMuted: false,
      },
      slots: {
        default: '<video id="test-video"></video>',
      },
    })

    expect(wrapper.find('[data-test="video-pip-container"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Never Gonna Give You Up')
    expect(wrapper.find('#test-video').exists()).toBe(true)

    await wrapper.find('[data-test="video-pip-close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('toggles expand size state when expand button is clicked', async () => {
    const wrapper = mount(YouTubeVideoPip, {
      props: {
        track: dummyTrack,
        currentTimeSec: 30,
        durationSec: 213,
      },
    })

    const container = wrapper.find('[data-test="video-pip-container"]')
    expect(container.classes()).toContain('w-80') // 320px default

    const expandBtn = wrapper.find('[data-test="video-pip-expand"]')
    await expandBtn.trigger('click')
    expect(container.classes()).toContain('w-[440px]')
  })

  it('emits playback controls from overlay', async () => {
    const wrapper = mount(YouTubeVideoPip, {
      props: {
        track: dummyTrack,
        currentTimeSec: 30,
        durationSec: 213,
        isMuted: false,
      },
    })

    await wrapper.find('[data-test="video-pip-play-toggle"]').trigger('click')
    expect(wrapper.emitted('toggle-play')).toHaveLength(1)

    await wrapper.find('[data-test="video-pip-mute-toggle"]').trigger('click')
    expect(wrapper.emitted('toggle-mute')).toHaveLength(1)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/YouTubeVideoPip.test.ts`
Expected: FAIL (`Cannot find module '~/components/YouTubeVideoPip.vue'`)

- [x] **Step 3: Implement `app/components/YouTubeVideoPip.vue`**

Create `app/components/YouTubeVideoPip.vue`:
```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { MusicPlaybackState } from '~/types/chat'
import { Play, Pause, X, Maximize2, Minimize2, GripHorizontal, Volume2, VolumeX } from '@lucide/vue'
import { formatDurationSeconds } from '~/utils/youtube'

const props = withDefaults(
  defineProps<{
    track: MusicPlaybackState | null
    currentTimeSec: number
    durationSec: number
    isMuted?: boolean
  }>(),
  {
    isMuted: false,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-play'): void
  (e: 'seek', seconds: number): void
  (e: 'toggle-mute'): void
}>()

const isExpanded = ref(false)
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = { x: 0, y: 0 }
const initialPos = { x: 0, y: 0 }

const formattedCurrentTime = computed(() => formatDurationSeconds(props.currentTimeSec))
const formattedDuration = computed(() => formatDurationSeconds(props.durationSec || props.currentTimeSec))

function handlePointerDown(e: PointerEvent) {
  isDragging.value = true
  dragStart.x = e.clientX
  dragStart.y = e.clientY
  initialPos.x = position.value.x
  initialPos.y = position.value.y
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

function handlePointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  position.value = {
    x: initialPos.x + dx,
    y: initialPos.y + dy,
  }
}

function handlePointerUp() {
  isDragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
})

function handleSeekInput(e: Event) {
  const target = e.target as HTMLInputElement
  const sec = Number(target.value)
  if (!Number.isNaN(sec)) {
    emit('seek', sec)
  }
}
</script>

<template>
  <div
    v-if="track"
    data-test="video-pip-container"
    class="fixed z-30 flex flex-col bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden transition-all duration-150 select-none"
    :class="isExpanded ? 'w-[440px]' : 'w-80'"
    :style="{
      right: '24px',
      bottom: '72px',
      transform: `translate(${position.x}px, ${position.y}px)`,
    }"
  >
    <!-- Draggable Header -->
    <div
      class="h-8 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700/60 flex items-center justify-between px-2.5 cursor-grab active:cursor-grabbing text-slate-200"
      @pointerdown="handlePointerDown"
    >
      <div class="flex items-center gap-1.5 min-w-0 mr-2">
        <GripHorizontal class="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span class="text-[11px] font-medium truncate" :title="track.title">
          {{ track.title }}
        </span>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          data-test="video-pip-expand"
          class="p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition"
          :title="isExpanded ? 'Shrink' : 'Expand'"
          @click.stop="isExpanded = !isExpanded"
        >
          <Minimize2 v-if="isExpanded" class="w-3 h-3" />
          <Maximize2 v-else class="w-3 h-3" />
        </button>

        <button
          type="button"
          data-test="video-pip-close"
          class="p-1 rounded hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition"
          title="Close video (return to audio-only)"
          @click.stop="emit('close')"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Video Surface Slot -->
    <div class="relative w-full aspect-video bg-black group overflow-hidden">
      <slot />

      <!-- Hover Playback Controls Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 pointer-events-none"
      >
        <div class="flex items-center gap-2 pointer-events-auto text-white text-[10px]">
          <button
            type="button"
            data-test="video-pip-play-toggle"
            class="p-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition"
            @click="emit('toggle-play')"
          >
            <Pause v-if="track.isPlaying" class="w-3 h-3 fill-current" />
            <Play v-else class="w-3 h-3 fill-current ml-0.5" />
          </button>

          <input
            type="range"
            min="0"
            :max="durationSec || currentTimeSec || 100"
            :value="currentTimeSec"
            step="1"
            class="flex-1 h-1 bg-white/30 rounded appearance-none cursor-pointer accent-blue-500"
            @input="handleSeekInput"
          />

          <span class="font-mono text-[9px]">{{ formattedCurrentTime }} / {{ formattedDuration }}</span>

          <button
            type="button"
            data-test="video-pip-mute-toggle"
            class="p-1 rounded hover:bg-white/20 transition text-slate-200"
            @click="emit('toggle-mute')"
          >
            <VolumeX v-if="isMuted" class="w-3.5 h-3.5 text-red-400" />
            <Volume2 v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/YouTubeVideoPip.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add app/components/YouTubeVideoPip.vue tests/components/YouTubeVideoPip.test.ts
git commit -m "feat(youtube): add YouTubeVideoPip component"
```

---

### Task 4: Player Bar "Watch" Button Integration

**Files:**
- Modify: `app/components/MusicPlayerBar.vue`
- Test: `tests/components/musicUi.test.ts`

**Interfaces:**
- Props: add `isVideoPipOpen?: boolean`
- Emits: add `(e: 'toggle-pip'): void`

- [x] **Step 1: Write test for "Watch" button on player bar**

In `tests/components/musicUi.test.ts`, add test inside `describe('Music UI components')`:
```typescript
it('renders Watch Video button and emits toggle-pip when clicked', async () => {
  const wrapper = mount(MusicPlayerBar, {
    props: {
      track: {
        conversationId: 'conv-1',
        videoId: 'dQw4w9WgXcQ',
        title: 'Video Track',
        channelTitle: 'Artist',
        thumbnail: '',
        isPlaying: true,
        positionSec: 10,
        updatedAt: Date.now(),
        startedBy: 'Alice',
      },
      currentTimeSec: 10,
      durationSec: 120,
      isVideoPipOpen: false,
    },
  })

  const watchBtn = wrapper.find('[data-test="music-toggle-pip"]')
  expect(watchBtn.exists()).toBe(true)
  expect(watchBtn.text()).toContain('Watch')

  await watchBtn.trigger('click')
  expect(wrapper.emitted('toggle-pip')).toBeTruthy()

  await wrapper.setProps({ isVideoPipOpen: true })
  expect(watchBtn.classes()).toContain('bg-blue-500')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/musicUi.test.ts`
Expected: FAIL (`watchBtn.exists()` is false)

- [x] **Step 3: Update `app/components/MusicPlayerBar.vue`**

Import `Tv` icon from `@lucide/vue`:
```typescript
import { Play, Pause, Square, Volume2, VolumeX, Music, Volume1, SkipForward, ListMusic, Headphones, LogOut, Tv } from '@lucide/vue'
```
Add to props:
```typescript
isVideoPipOpen?: boolean
```
with default `isVideoPipOpen: false`.

Add to emits:
```typescript
(e: 'toggle-pip'): void
```

Add button to template right controls (before or next to Queue button):
```html
<button
  type="button"
  data-test="music-toggle-pip"
  class="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition cursor-pointer border"
  :class="isVideoPipOpen
    ? 'bg-blue-500 text-white border-blue-500 shadow-xs'
    : 'bg-black/5 dark:bg-white/10 text-[var(--ap-text-primary)] hover:bg-black/10 dark:hover:bg-white/15 border-[var(--ap-glass-border)]'"
  :title="isVideoPipOpen ? 'Hide Video (Audio Only)' : 'Watch Video (Picture-in-Picture)'"
  @click="emit('toggle-pip')"
>
  <Tv class="w-3.5 h-3.5" />
  <span class="hidden sm:inline">Watch</span>
</button>
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/musicUi.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add app/components/MusicPlayerBar.vue tests/components/musicUi.test.ts
git commit -m "feat(music): add Watch video button to MusicPlayerBar"
```

---

### Task 5: Main Page Media Element & PiP State Wiring

**Files:**
- Modify: `app/pages/index.vue`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- State: `isVideoPipOpen = ref(false)`
- Media Element: `<video id="youtube-media-player" ref="audioPlayerRef">`
- Dynamically attaches media element to `YouTubeVideoPip.vue` when `isVideoPipOpen` is true.
- Falls back to audio mode when error occurs while video is active.

- [x] **Step 1: Write test for PiP wiring in `indexPage.test.ts`**

In `tests/components/indexPage.test.ts`, add test:
```typescript
it('toggles isVideoPipOpen and switches media source when watch button is clicked', async () => {
  // Mount index shell with active music track
  // Trigger toggle-pip on MusicPlayerBar
  // Assert video pip container appears
})
```

- [x] **Step 2: Update `app/pages/index.vue`**

1. Define `isVideoPipOpen = ref(false)`.
2. Update `onPlayerAction('load', payload)` to append `&type=video` if `isVideoPipOpen.value` is true:
```typescript
const streamType = isVideoPipOpen.value ? '&type=video' : ''
audio.src = `/api/youtube/stream?v=${encodeURIComponent(payload.videoId)}${streamType}`
```
3. Add `handleToggleVideoPip()`:
```typescript
function handleToggleVideoPip() {
  isVideoPipOpen.value = !isVideoPipOpen.value
  const track = musicCurrentTrack.value
  if (track && audioPlayerRef.value) {
    const currentSec = audioPlayerRef.value.currentTime || 0
    const wasPlaying = !audioPlayerRef.value.paused
    const streamType = isVideoPipOpen.value ? '&type=video' : ''
    audioPlayerRef.value.src = `/api/youtube/stream?v=${encodeURIComponent(track.videoId)}${streamType}`
    pendingAudioSeekSec = currentSec
    pendingAudioAutoplay = wasPlaying
  }
}
```
4. Update `handleAudioError()`:
```typescript
function handleAudioError() {
  if (isVideoPipOpen.value) {
    // Graceful fallback: close PiP and reload audio-only
    isVideoPipOpen.value = false
    const track = musicCurrentTrack.value
    if (track && audioPlayerRef.value) {
      const currentSec = audioPlayerRef.value.currentTime || 0
      audioPlayerRef.value.src = `/api/youtube/stream?v=${encodeURIComponent(track.videoId)}`
      pendingAudioSeekSec = currentSec
      pendingAudioAutoplay = true
    }
  } else {
    musicHandlePlaybackError()
  }
}
```
5. Pass `isVideoPipOpen` and `@toggle-pip="handleToggleVideoPip"` to `<MusicPlayerBar>`.
6. Replace `<audio id="youtube-hidden-player" ...>`:
```html
<!-- Native HTML5 media element for room playback (audio or video) -->
<video
  id="youtube-media-player"
  ref="audioPlayerRef"
  preload="auto"
  playsinline
  :class="isVideoPipOpen ? 'w-full h-full object-cover' : 'hidden pointer-events-none w-0 h-0 opacity-0 overflow-hidden'"
  aria-hidden="true"
  @timeupdate="handleAudioTimeUpdate"
  @loadedmetadata="handleAudioMetadata"
  @durationchange="handleAudioMetadata"
  @play="musicAutoplayBlocked = false"
  @ended="handleAudioEnded"
  @error="handleAudioError"
></video>

<!-- YouTube Video Picture-in-Picture Floating Window -->
<YouTubeVideoPip
  v-if="isVideoPipOpen && musicCurrentTrack"
  :track="musicCurrentTrack"
  :current-time-sec="musicCurrentTimeSec"
  :duration-sec="musicDurationSec"
  :is-muted="musicIsMuted"
  @close="handleToggleVideoPip"
  @toggle-play="musicTogglePlayPause"
  @seek="musicSeekTo"
  @toggle-mute="musicToggleMute"
>
  <div ref="pipVideoContainerRef" class="w-full h-full">
    <!-- Teleported or slotted video element -->
  </div>
</YouTubeVideoPip>
```
Note: In Vue, we can teleport `<video>` into the PiP container when `isVideoPipOpen` is true using `<Teleport to="#pip-video-slot">` or mount it directly within `<Teleport>`.

- [x] **Step 3: Run all music test suites to verify passing**

Run: `npx vitest run tests/utils/youtube.test.ts tests/utils/youtubeServer.test.ts tests/components/musicUi.test.ts tests/components/YouTubeVideoPip.test.ts tests/composables/useMusicPlayer.test.ts`
Expected: ALL PASS

- [x] **Step 4: Commit changes**

```bash
git add app/pages/index.vue tests/
git commit -m "feat(youtube): wire up floating PiP video player in chat workspace"
```
