# YouTube Server-Proxy Audio & Thumbnail Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bypass corporate network blocks on `youtube.com`, `googlevideo.com`, and `i.ytimg.com` by proxying YouTube audio streams and thumbnails through Nuxt Nitro server routes on Vercel and replacing the client-side `YT.Player` iframe with a native HTML5 `<audio>` element.

**Architecture:**
1. **Multi-Source Stream Resolver & Byte-Range Proxy (`/api/youtube/stream`)**: Resolves direct audio stream URLs (`audio/mp4` or `audio/webm`) server-side via YouTube InnerTube (`ANDROID_VR`/`IOS` clients) with automatic fallback to public Piped and Invidious API instances, caches resolved URLs in server memory for 10 minutes, and proxies capped 2 MB HTTP `Range` chunks so Vercel serverless invocations complete quickly and stay under response size limits.
2. **Edge-Cached Thumbnail Proxy (`/api/youtube/thumbnail`)**: Proxies `https://i.ytimg.com/vi/<videoId>/mqdefault.jpg` through the app's own domain with `Cache-Control: public, max-age=86400, s-maxage=86400`.
3. **Native HTML5 `<audio>` Engine (`app/pages/index.vue`)**: Replaces the client-side `https://www.youtube.com/iframe_api` script and `YT.Player` iframe with a hidden `<audio id="youtube-hidden-player">` element wired to `useMusicPlayer.ts` actions (`load`, `play`, `pause`, `seek`), volume, mute, and `autoplayBlocked` recovery.

**Tech Stack:** Nuxt 4 (Nitro server routes, H3, Vue 3 Composition API), HTML5 `HTMLAudioElement`, Vitest + `@vue/test-utils`.

**Spec:** Self-contained in this plan (`docs/superpowers/plans/2026-10-27-youtube-proxy-playback.md`).

## Global Constraints

- Zero new npm dependencies.
- Zero browser requests to `*.youtube.com`, `*.googlevideo.com`, or `*.ytimg.com` during search, thumbnail rendering, or audio playback.
- Strict `videoId` validation (`/^[\w-]{11}$/`) at all server boundaries (`/api/youtube/stream`, `/api/youtube/thumbnail`) to prevent SSRF or path traversal.
- Preserve existing `parseYouTubeApiResponse` and `parseYouTubeInitialData` return shapes so all existing tests pass without modification.
- Cap open-ended byte ranges (`Range: bytes=0-`) in `/api/youtube/stream` to 2 MB (`2 * 1024 * 1024` bytes) per request to avoid Vercel serverless payload (4.5 MB) and execution timeout limits.

## Review Focus

1. **Invalid or malicious `videoId` parameter**: `/api/youtube/stream?v=../../etc` or empty `v` returns HTTP 400 without making any upstream fetch.
2. **Vercel datacenter IP blocked by primary InnerTube endpoint**: `resolveYouTubeAudioStream` falls back across Piped and Invidious API instances when InnerTube returns non-OK or lacks `streamingData.adaptiveFormats`.
3. **Vercel serverless response size / timeout limit on long tracks**: `normalizeStreamRangeHeader` caps open-ended `Range: bytes=X-` headers to `bytes=X-(X+2097151)` so the browser `<audio>` element fetches successive `206 Partial Content` chunks seamlessly.
4. **Expired or 403 cached upstream stream URL**: `/api/youtube/stream` evicts the cached entry and re-resolves once if the upstream audio fetch returns 401/403/404.
5. **Browser autoplay policy rejection (`NotAllowedError`)**: Rejecting `audio.play()` sets `musicAutoplayBlocked.value = true` so `MusicPlayerBar.vue` displays the "Tune In" button.

---

### Task 1: YouTube Stream Resolver, Range Capper & Thumbnail Proxy Helpers

**Files:**
- Modify: `app/utils/youtube.ts`
- Test: `tests/utils/youtube.test.ts`
- Test: `tests/utils/youtubeServer.test.ts`

**Interfaces:**
- Produces in `app/utils/youtube.ts`:
  - `isValidYouTubeVideoId(videoId: string): boolean`
  - `getYouTubeThumbnailProxyUrl(videoId: string, fallbackThumbnail?: string): string`
  - `normalizeStreamRangeHeader(rangeHeader: string | undefined, maxChunkBytes?: number): string`
  - `extractBestAudioFormat(formats: any[]): { url: string; mimeType: string } | null`
  - `resolveYouTubeAudioStream(videoId: string, options?: { fetchFn?: typeof fetch; bypassCache?: boolean }): Promise<{ url: string; mimeType: string } | null>`

- [ ] **Step 1: Write the failing unit tests in `tests/utils/youtube.test.ts` and `tests/utils/youtubeServer.test.ts`**

Add to `tests/utils/youtube.test.ts`:
```ts
import {
  parseYouTubeInitialData,
  parseYouTubeApiResponse,
  formatDurationSeconds,
  isValidYouTubeVideoId,
  getYouTubeThumbnailProxyUrl,
  normalizeStreamRangeHeader,
  extractBestAudioFormat,
} from '~/utils/youtube'

  it('validates 11-character YouTube video IDs and rejects traversal strings', () => {
    expect(isValidYouTubeVideoId('dQw4w9WgXcQ')).toBe(true)
    expect(isValidYouTubeVideoId('jfKfPfyJRdk')).toBe(true)
    expect(isValidYouTubeVideoId('short')).toBe(false)
    expect(isValidYouTubeVideoId('../etc/passwd')).toBe(false)
    expect(isValidYouTubeVideoId('')).toBe(false)
  })

  it('builds same-origin thumbnail proxy URL for valid videoId', () => {
    expect(getYouTubeThumbnailProxyUrl('dQw4w9WgXcQ')).toBe('/api/youtube/thumbnail?v=dQw4w9WgXcQ')
    expect(getYouTubeThumbnailProxyUrl('invalid', 'https://example.com/fallback.jpg')).toBe(
      'https://example.com/fallback.jpg',
    )
  })

  it('normalizes and caps open-ended HTTP Range headers to maxChunkBytes', () => {
    expect(normalizeStreamRangeHeader(undefined, 2097152)).toBe('bytes=0-2097151')
    expect(normalizeStreamRangeHeader('bytes=0-', 2097152)).toBe('bytes=0-2097151')
    expect(normalizeStreamRangeHeader('bytes=1048576-', 2097152)).toBe('bytes=1048576-3145727')
    expect(normalizeStreamRangeHeader('bytes=0-1023', 2097152)).toBe('bytes=0-1023')
    expect(normalizeStreamRangeHeader('bytes=0-9999999', 2097152)).toBe('bytes=0-2097151')
  })

  it('prefers audio/mp4 (m4a) over audio/webm when extracting best audio format', () => {
    const picked = extractBestAudioFormat([
      { mimeType: 'video/mp4', url: 'https://v.example/video.mp4' },
      { mimeType: 'audio/webm; codecs="opus"', url: 'https://a.example/audio.webm', bitrate: 160000 },
      { mimeType: 'audio/mp4; codecs="mp4a.40.2"', url: 'https://a.example/audio.m4a', bitrate: 128000 },
    ])
    expect(picked).toEqual({
      url: 'https://a.example/audio.m4a',
      mimeType: 'audio/mp4',
    })
  })
```

Add to `tests/utils/youtubeServer.test.ts`:
```ts
import { searchYouTubeVideos, resolveYouTubeAudioStream } from '~/utils/youtube'

describe('resolveYouTubeAudioStream', () => {
  it('returns null immediately for invalid videoId without calling fetch', async () => {
    const fetchFn = vi.fn()
    const res = await resolveYouTubeAudioStream('bad-id', { fetchFn: fetchFn as any })
    expect(res).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('extracts audio stream from InnerTube player response when available', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        streamingData: {
          adaptiveFormats: [
            {
              itag: 140,
              mimeType: 'audio/mp4; codecs="mp4a.40.2"',
              url: 'https://rr1---sn-mock.googlevideo.com/videoplayback?itag=140',
            },
          ],
        },
      }),
    })

    const res = await resolveYouTubeAudioStream('dQw4w9WgXcQ', {
      fetchFn: fetchFn as any,
      bypassCache: true,
    })
    expect(res).toEqual({
      url: 'https://rr1---sn-mock.googlevideo.com/videoplayback?itag=140',
      mimeType: 'audio/mp4',
    })
  })

  it('falls back to Piped/Invidious API when InnerTube player returns no stream', async () => {
    const fetchFn = vi
      .fn()
      // 1. InnerTube ANDROID_VR fails
      .mockResolvedValueOnce({ ok: true, json: async () => ({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }) })
      // 2. InnerTube IOS fails
      .mockResolvedValueOnce({ ok: false })
      // 3. Piped instance succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          audioStreams: [
            {
              url: 'https://pipedproxy.example.com/audio.m4a',
              mimeType: 'audio/mp4',
              bitrate: 128000,
            },
          ],
        }),
      })

    const res = await resolveYouTubeAudioStream('jfKfPfyJRdk', {
      fetchFn: fetchFn as any,
      bypassCache: true,
    })
    expect(res).toEqual({
      url: 'https://pipedproxy.example.com/audio.m4a',
      mimeType: 'audio/mp4',
    })
  })
})
```

- [ ] **Step 2: Run Vitest to verify the new tests fail**

Run: `npx vitest run tests/utils/youtube.test.ts tests/utils/youtubeServer.test.ts`
Expected: FAIL with missing exports `isValidYouTubeVideoId`, `getYouTubeThumbnailProxyUrl`, `normalizeStreamRangeHeader`, `extractBestAudioFormat`, `resolveYouTubeAudioStream`.

- [ ] **Step 3: Implement stream resolution, range capping, and thumbnail URL helpers in `app/utils/youtube.ts`**

Implement in `app/utils/youtube.ts`:
- `isValidYouTubeVideoId(videoId: string): boolean`: returns `typeof videoId === 'string' && /^[\w-]{11}$/.test(videoId)`.
- `getYouTubeThumbnailProxyUrl(videoId: string, fallbackThumbnail = ''): string`: returns `/api/youtube/thumbnail?v=${videoId}` when `isValidYouTubeVideoId(videoId)` is true, else `fallbackThumbnail`.
- `normalizeStreamRangeHeader(rangeHeader: string | undefined, maxChunkBytes = 2 * 1024 * 1024): string`: parses `bytes=(\d+)-(\d*)`, defaults `start = 0`, clamps `end = Math.min(parsedEnd ?? (start + maxChunkBytes - 1), start + maxChunkBytes - 1)`, and returns `bytes=${start}-${end}`.
- `extractBestAudioFormat(formats: any[]): { url: string; mimeType: string } | null`: filters entries with valid `http(s)` `url` and `mimeType` or `type` starting with `'audio/'`, prefers `audio/mp4` over `audio/webm`, and normalizes `mimeType` to base type (`audio/mp4` or `audio/webm`).
- `resolveYouTubeAudioStream(videoId, options)`: validates `videoId`, checks module-scoped 10-minute `streamUrlCache` unless `bypassCache` is true, tries InnerTube `/youtubei/v1/player` (`ANDROID_VR` and `IOS` client contexts), then iterates fallback Piped (`https://pipedapi.kavin.rocks/streams/${videoId}`, `https://api.piped.private.coffee/streams/${videoId}`, `https://pipedapi.adminforge.de/streams/${videoId}`) and Invidious (`https://inv.nadeko.net/api/v1/videos/${videoId}`, `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`) endpoints.

- [ ] **Step 4: Run Vitest to verify all unit tests pass**

Run: `npx vitest run tests/utils/youtube.test.ts tests/utils/youtubeServer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/utils/youtube.ts tests/utils/youtube.test.ts tests/utils/youtubeServer.test.ts
git commit -m "feat: add YouTube stream resolver, range capper, and thumbnail proxy helpers"
```

---

### Task 2: Nuxt Nitro Audio Stream & Thumbnail Proxy Endpoints

**Files:**
- Create: `server/api/youtube/stream.get.ts`
- Create: `server/api/youtube/thumbnail.get.ts`
- Test: `tests/utils/youtubeServer.test.ts`

**Interfaces:**
- Consumes from `app/utils/youtube.ts`:
  - `isValidYouTubeVideoId`
  - `normalizeStreamRangeHeader`
  - `resolveYouTubeAudioStream`
- Produces:
  - `GET /api/youtube/stream?v=<videoId>`: streams audio bytes with `206 Partial Content` / `200 OK`, `Accept-Ranges: bytes`, `Content-Type`, `Content-Range`, `Content-Length`.
  - `GET /api/youtube/thumbnail?v=<videoId>`: proxies thumbnail image from `https://i.ytimg.com/vi/<videoId>/mqdefault.jpg` with `Cache-Control: public, max-age=86400, s-maxage=86400`.

- [ ] **Step 1: Write `server/api/youtube/thumbnail.get.ts` and `server/api/youtube/stream.get.ts`**

`server/api/youtube/thumbnail.get.ts`:
```ts
import { defineEventHandler, getQuery, setResponseHeaders, setResponseStatus } from 'h3'
import { isValidYouTubeVideoId } from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const { v } = getQuery(event)
  const videoId = typeof v === 'string' ? v.trim() : ''

  if (!isValidYouTubeVideoId(videoId)) {
    setResponseStatus(event, 400)
    return { error: 'Invalid video ID' }
  }

  try {
    const upstream = await fetch(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`)
    if (!upstream.ok) {
      setResponseStatus(event, upstream.status)
      return { error: 'Thumbnail unavailable' }
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer())
    setResponseHeaders(event, {
      'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    })
    return buffer
  } catch {
    setResponseStatus(event, 502)
    return { error: 'Failed to proxy thumbnail' }
  }
})
```

`server/api/youtube/stream.get.ts`:
```ts
import { defineEventHandler, getQuery, getRequestHeader, setResponseStatus } from 'h3'
import {
  isValidYouTubeVideoId,
  normalizeStreamRangeHeader,
  resolveYouTubeAudioStream,
} from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const { v } = getQuery(event)
  const videoId = typeof v === 'string' ? v.trim() : ''

  if (!isValidYouTubeVideoId(videoId)) {
    setResponseStatus(event, 400)
    return { error: 'Invalid video ID' }
  }

  const incomingRange = getRequestHeader(event, 'range')
  const rangeHeader = normalizeStreamRangeHeader(incomingRange)

  let resolved = await resolveYouTubeAudioStream(videoId)
  if (!resolved) {
    setResponseStatus(event, 502)
    return { error: 'Unable to resolve audio stream' }
  }

  let upstream = await fetch(resolved.url, {
    headers: {
      Range: rangeHeader,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  }).catch(() => null)

  // Retry once bypassing cache if upstream URL expired (401/403/404)
  if (!upstream || upstream.status === 401 || upstream.status === 403 || upstream.status === 404) {
    resolved = await resolveYouTubeAudioStream(videoId, { bypassCache: true })
    if (!resolved) {
      setResponseStatus(event, 502)
      return { error: 'Unable to refresh audio stream' }
    }
    upstream = await fetch(resolved.url, {
      headers: {
        Range: rangeHeader,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }).catch(() => null)
  }

  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    setResponseStatus(event, upstream?.status || 502)
    return { error: 'Upstream audio stream failed' }
  }

  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || resolved.mimeType || 'audio/mp4')
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

- [ ] **Step 2: Run Vitest suite to verify server helpers and existing tests pass**

Run: `npx vitest run tests/utils/youtubeServer.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/api/youtube/stream.get.ts server/api/youtube/thumbnail.get.ts
git commit -m "feat: add Nitro server endpoints for YouTube audio stream and thumbnail proxy"
```

---

### Task 3: Native HTML5 `<audio>` Playback Engine & Proxied Thumbnails in UI

**Files:**
- Modify: `app/components/MusicPlayerBar.vue`
- Modify: `app/components/YouTubeSearchModal.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/musicUi.test.ts`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes from `app/utils/youtube.ts`:
  - `getYouTubeThumbnailProxyUrl(videoId: string, fallbackThumbnail?: string): string`
- Updates `app/pages/index.vue`:
  - Replaces `<div id="youtube-hidden-player">` and `YT.Player` iframe loader with `<audio id="youtube-hidden-player" ref="audioPlayerRef" preload="auto" class="hidden" aria-hidden="true" @timeupdate="handleAudioTimeUpdate" @loadedmetadata="handleAudioMetadata" @durationchange="handleAudioMetadata" @play="musicAutoplayBlocked = false" @ended="handleAudioEnded" @error="handleAudioError" />`.
  - `onPlayerAction(action, payload)` drives `audioPlayerRef.value` (`src = '/api/youtube/stream?v=' + payload.videoId`, `currentTime`, `play()`, `pause()`).

- [ ] **Step 1: Write the failing component tests in `tests/components/musicUi.test.ts`**

Add to `tests/components/musicUi.test.ts`:
```ts
  it('renders proxied thumbnail URLs in MusicPlayerBar and YouTubeSearchModal so browser never hits i.ytimg.com', () => {
    const bar = mount(MusicPlayerBar, {
      props: {
        track: {
          conversationId: 'conv-1',
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          channelTitle: 'Rick Astley',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
          isPlaying: true,
          positionSec: 10,
          updatedAt: Date.now(),
          startedBy: 'Alice',
        },
        currentTimeSec: 10,
        durationSec: 213,
      },
    })
    expect(bar.find('img').attributes('src')).toBe('/api/youtube/thumbnail?v=dQw4w9WgXcQ')

    const modal = mount(YouTubeSearchModal, {
      props: {
        open: true,
        initialResults: [
          {
            videoId: 'jfKfPfyJRdk',
            title: 'lofi hip hop radio',
            channelTitle: 'Lofi Girl',
            thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg',
          },
        ],
      },
    })
    expect(modal.find('img').attributes('src')).toBe('/api/youtube/thumbnail?v=jfKfPfyJRdk')
  })
```

- [ ] **Step 2: Run Vitest to verify the component test fails**

Run: `npx vitest run tests/components/musicUi.test.ts`
Expected: FAIL (`expected 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' to be '/api/youtube/thumbnail?v=dQw4w9WgXcQ'`)

- [ ] **Step 3: Update `MusicPlayerBar.vue`, `YouTubeSearchModal.vue`, and `app/pages/index.vue`**

1. In `app/components/MusicPlayerBar.vue`:
   - Import `getYouTubeThumbnailProxyUrl` from `~/utils/youtube`.
   - Bind `:src="getYouTubeThumbnailProxyUrl(track.videoId, track.thumbnail)"` on the thumbnail `<img>`.
2. In `app/components/YouTubeSearchModal.vue`:
   - Import `getYouTubeThumbnailProxyUrl` from `~/utils/youtube`.
   - Bind `:src="getYouTubeThumbnailProxyUrl(item.videoId, item.thumbnail)"` on each result `<img>`.
3. In `app/pages/index.vue`:
   - Replace `let ytPlayer: any = null`, `let ytTimeInterval: any = null`, `createYtPlayerInstance`, `initYouTubePlayer`, and the `YT.Player` branches in `onPlayerAction` with `const audioPlayerRef = ref<HTMLAudioElement | null>(null)` and native `HTMLAudioElement` control:
     - `load`: sets `audio.src = `/api/youtube/stream?v=${encodeURIComponent(payload.videoId)}``, sets `audio.currentTime = payload.startSeconds || 0`, and if `payload.autoplay !== false`, calls `audio.play()?.catch(() => { musicAutoplayBlocked.value = true })`.
     - `play`: calls `audio.play()?.catch(() => { musicAutoplayBlocked.value = true })`.
     - `pause`: calls `audio.pause()`.
     - `seek`: sets `audio.currentTime = payload`.
   - Replace `<div id="youtube-hidden-player" ...>` with `<audio id="youtube-hidden-player" ref="audioPlayerRef" preload="auto" class="hidden pointer-events-none w-0 h-0 opacity-0 overflow-hidden" aria-hidden="true" @timeupdate="handleAudioTimeUpdate" @loadedmetadata="handleAudioMetadata" @durationchange="handleAudioMetadata" @play="musicAutoplayBlocked = false" @ended="handleAudioEnded" @error="handleAudioError"></audio>`.

- [ ] **Step 4: Run full test suite and production build**

Run: `npm test` and `npm run build`
Expected: All test suites PASS and production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/components/MusicPlayerBar.vue app/components/YouTubeSearchModal.vue app/pages/index.vue tests/components/musicUi.test.ts
git commit -m "feat: replace client YT.Player iframe with server-proxied HTML5 audio"
```
