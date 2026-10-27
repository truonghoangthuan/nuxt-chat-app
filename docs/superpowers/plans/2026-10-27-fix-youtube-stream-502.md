# Fix YouTube Audio Stream 502 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `GET /api/youtube/stream?v=<videoId>` returning `502 Bad Gateway` on Vercel and local corporate networks by updating InnerTube player clients (`ANDROID 20.03.35` and `IOS 20.03.02`) on `youtubei.googleapis.com`, forwarding matching client `User-Agent` headers to `googlevideo.com`, supporting muxed MP4 fallback formats (`itag 18`), and adding an iTunes AAC stream fallback when `googlevideo.com` or InnerTube is blocked.

**Architecture:**
1. **Root Cause 1 — Retired/Blocked InnerTube Clients & Host (`app/utils/youtube.ts`)**: `resolveYouTubeAudioStream` posted to `www.youtube.com/youtubei/v1/player` using `ANDROID_VR 1.60.19` with a Windows Chrome `User-Agent` (now rejected with `LOGIN_REQUIRED: Sign in to confirm you’re not a bot`) and `IOS 19.45.4` without `osName: 'iPhone'` (now rejected with HTTP `400 FAILED_PRECONDITION`). Switching to `https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false` with `ANDROID 20.03.35` and `IOS 20.03.02` client contexts and matching mobile `User-Agent` headers restores `200 OK` responses with direct `audio/mp4` (`itag 140`/`139`) and `audio/webm` (`itag 251`) streams, while also bypassing corporate SNI blocks on `www.youtube.com`.
2. **Root Cause 2 — Muxed Stream Exclusion & Dead Fallback Hang (`app/utils/youtube.ts`)**: When YouTube SABR experiments or Piped/Invidious instances only return pre-muxed `itag 18` (`video/mp4` with AAC audio in `streamingData.formats` or `videoStreams`), `extractBestAudioFormat` discarded them because it only accepted `mimeType.startsWith('audio/')`. Updating `extractBestAudioFormat` to fall back to non-video-only `video/mp4` formats and adding per-request timeouts (`3500ms`) prevents 17s hangs on dead instances.
3. **Root Cause 3 — Upstream `googlevideo.com` `User-Agent` Mismatch & Datacenter/Firewall Block Fallback (`server/api/youtube/stream.get.ts`)**: `googlevideo.com` stream URLs signed for `c=ANDROID` or `c=IOS` reject Windows Chrome `User-Agent` requests with `403 Forbidden`. Furthermore, if a serverless datacenter IP is bot-flagged by YouTube (`LOGIN_REQUIRED`) or a local corporate firewall resets `*.googlevideo.com` connections, `/api/youtube/stream` now falls back to `resolveItunesAudioFallback(videoId, { title })` (resolving the track title via query param or `youtubei.googleapis.com/youtubei/v1/search` and streaming AAC `audio/mp4` from `audio-ssl.itunes.apple.com`).

**Tech Stack:** Nuxt 4 (Nitro server routes, H3, Vue 3 Composition API), Vitest.

**Spec:** Self-contained in this plan (`docs/superpowers/plans/2026-10-27-fix-youtube-stream-502.md`).

## Global Constraints

- Zero new npm dependencies.
- Preserve existing `resolveYouTubeAudioStream(videoId, options)` return compatibility (`{ url: string; mimeType: string; userAgent?: string } | null`).
- Strict `videoId` validation (`/^[\w-]{11}$/`) before any upstream call.
- Per-provider fetch timeout of `3500ms` so dead Piped/Invidious instances never exceed Vercel's 10s function timeout.

## Review Focus

1. **Retired `IOS 19.45.4` / mismatched `ANDROID_VR` User-Agent**: `resolveYouTubeAudioStream` sends `ANDROID 20.03.35` (`com.google.android.youtube/20.03.35 (Linux; U; Android 14) gzip`) and `IOS 20.03.02` (`com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)`) with `contentCheckOk: true, racyCheckOk: true` to `https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false`.
2. **SABR-only response where only `streamingData.formats` (`itag 18` `video/mp4`) has a direct URL**: `extractBestAudioFormat` selects `itag 18` (`videoOnly !== true`) with `mimeType: 'audio/mp4'` when no standalone `audio/*` format exists.
3. **Upstream `googlevideo.com` rejects mismatched Desktop `User-Agent`**: `stream.get.ts` forwards `resolved.userAgent` (determined by the client that resolved the URL) when fetching `resolved.url`.
4. **Datacenter IP bot-block (`LOGIN_REQUIRED`) or firewall reset on `googlevideo.com`**: When `resolveYouTubeAudioStream` or the upstream `googlevideo.com` fetch fails, `stream.get.ts` resolves the track's AAC stream via `resolveItunesAudioFallback(videoId, { title })` and streams `206 Partial Content` audio.
5. **Corporate firewall blocking `www.youtube.com` during search**: `searchYouTubeVideos` queries `https://youtubei.googleapis.com/youtubei/v1/search?prettyPrint=false` before falling back to `www.youtube.com`.

---

### Task 1: Upgrade InnerTube Clients, Muxed Format Support & iTunes Fallback in `app/utils/youtube.ts`

**Files:**
- Modify: `app/utils/youtube.ts:175-451`
- Test: `tests/utils/youtube.test.ts`
- Test: `tests/utils/youtubeServer.test.ts`

**Interfaces:**
- Produces in `app/utils/youtube.ts`:
  - `extractBestAudioFormat(formats: any[]): { url: string; mimeType: string } | null`
  - `cleanMusicSearchTitle(rawTitle: string): string`
  - `resolveItunesAudioFallback(videoId: string, options?: { title?: string; fetchFn?: typeof fetch }): Promise<{ url: string; mimeType: string; userAgent?: string } | null>`
  - `resolveYouTubeAudioStream(videoId: string, options?: ResolveAudioOptions): Promise<{ url: string; mimeType: string; userAgent?: string } | null>`

- [x] **Step 1: Write the failing unit tests in `tests/utils/youtube.test.ts` and `tests/utils/youtubeServer.test.ts`**

Add to `tests/utils/youtube.test.ts`:
```ts
  it('falls back to muxed video/mp4 (itag 18) when no standalone audio/* format exists', () => {
    const picked = extractBestAudioFormat([
      { mimeType: 'video/mp4', url: 'https://v.example/video-only.mp4', videoOnly: true, itag: 137 },
      { mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', url: 'https://v.example/muxed18.mp4', videoOnly: false, itag: 18 },
    ])
    expect(picked).toEqual({
      url: 'https://v.example/muxed18.mp4',
      mimeType: 'audio/mp4',
    })
  })
```

Update and add to `tests/utils/youtubeServer.test.ts`:
```ts
  it('uses keyless YouTube InnerTube POST search via youtubei.googleapis.com when no apiKey is provided', async () => {
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
      'https://youtubei.googleapis.com/youtubei/v1/search?prettyPrint=false',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(res.items[0]?.videoId).toBe('xyz98765432')
  })

  it('resolves iTunes AAC audio fallback by video title when YouTube streams are blocked', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            trackName: 'Em Không Quay Về',
            artistName: 'Hoàng Tôn',
            previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/sample.plus.aac.p.m4a',
          },
        ],
      }),
    })

    const res = await resolveItunesAudioFallback('ZlSx-6UbrmI', {
      title: 'HOÀNG TÔN feat. YANBI - Em Không Quay Về | Official Music Video',
      fetchFn: fetchFn as any,
    })
    expect(res).toEqual({
      url: 'https://audio-ssl.itunes.apple.com/itunes-assets/sample.plus.aac.p.m4a',
      mimeType: 'audio/mp4',
    })
  })
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/youtube.test.ts tests/utils/youtubeServer.test.ts`
Expected: FAIL (`extractBestAudioFormat` returns `null` for muxed format; `resolveItunesAudioFallback` not exported; `searchYouTubeVideos` still calls `www.youtube.com`).

- [x] **Step 3: Implement updated InnerTube clients, muxed format fallback, and `resolveItunesAudioFallback` in `app/utils/youtube.ts`**

Update `app/utils/youtube.ts`:
- In `searchYouTubeVideos`: POST to `https://youtubei.googleapis.com/youtubei/v1/search?prettyPrint=false`.
- In `extractBestAudioFormat(formats: any[])`: if `audioFormats.length === 0`, filter for muxed MP4 formats where `f && typeof f.url === 'string' && /^https?:\/\//.test(f.url)` and `type.startsWith('video/mp4')` and `f.videoOnly !== true` and (`f.itag === 18 || Boolean(f.audioQuality) || type.includes('mp4a')`), returning `{ url: muxed[0].url, mimeType: 'audio/mp4' }`.
- Implement `cleanMusicSearchTitle(rawTitle: string): string` and `resolveItunesAudioFallback(videoId: string, options?: { title?: string; fetchFn?: typeof fetch })`:
  - If `options?.title` is not provided, look up the video title via `searchYouTubeVideos(videoId, { fetchFn: myFetch })` matching `item.videoId === cleanId` (or first item).
  - Clean the title with `cleanMusicSearchTitle` and fetch `https://itunes.apple.com/search?term=${encodeURIComponent(cleaned)}&media=music&entity=song&limit=1`.
  - Return `{ url: previewUrl, mimeType: 'audio/mp4' }` when `results[0]?.previewUrl` is present.
- In `resolveYouTubeAudioStream(videoId: string, options?: ResolveAudioOptions)`:
  - Try `https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false` with:
    1. `ANDROID` (`clientVersion: '20.03.35'`, `androidSdkVersion: 34`, `osName: 'Android'`, `osVersion: '14'`, `User-Agent: 'com.google.android.youtube/20.03.35 (Linux; U; Android 14) gzip'`)
    2. `IOS` (`clientVersion: '20.03.02'`, `deviceMake: 'Apple'`, `deviceModel: 'iPhone16,2'`, `osName: 'iPhone'`, `osVersion: '18.2.1.22C161'`, `User-Agent: 'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)'`)
  - Combine `adaptiveFormats` and `formats` when calling `extractBestAudioFormat`.
  - Attach `userAgent` to the resolved result when returning from `ANDROID` or `IOS`.
  - Keep Piped and Invidious fallbacks with `3500ms` timeout and include muxed `videoStreams` (`videoOnly === false`) / `formatStreams`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/youtube.test.ts tests/utils/youtubeServer.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add app/utils/youtube.ts tests/utils/youtube.test.ts tests/utils/youtubeServer.test.ts
git commit -m "feat: upgrade InnerTube mobile clients and add iTunes audio fallback"
```

---

### Task 2: Wire Upstream User-Agent & Automatic Fallback in `server/api/youtube/stream.get.ts` and `app/pages/index.vue`

**Files:**
- Modify: `server/api/youtube/stream.get.ts`
- Modify: `app/composables/useMusicPlayer.ts:55-65,175-186`
- Modify: `app/pages/index.vue:163-180`
- Test: `tests/utils/youtubeServer.test.ts`

**Interfaces:**
- Consumes from `app/utils/youtube.ts`: `resolveYouTubeAudioStream`, `resolveItunesAudioFallback`, `isValidYouTubeVideoId`, `normalizeStreamRangeHeader`
- Modifies `GET /api/youtube/stream?v=<videoId>&title=<optionalTitle>`

- [x] **Step 1: Write the failing test in `tests/utils/youtubeServer.test.ts`**

Add to `tests/utils/youtubeServer.test.ts`:
```ts
  it('stream endpoint falls back to iTunes AAC stream when upstream YouTube stream fails', async () => {
    const origFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('itunes.apple.com/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/mock.m4a' }],
          }),
        }
      }
      if (url.includes('audio-ssl.itunes.apple.com')) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: {
            'content-type': 'audio/mp4',
            'content-range': 'bytes 0-3/4',
            'content-length': '4',
          },
        })
      }
      // Simulate all direct YouTube / Piped / Invidious endpoints failing on datacenter IP
      return { ok: false, status: 403, json: async () => ({}) }
    }) as any

    try {
      const mockEvent = {
        node: {
          req: {
            url: '/api/youtube/stream?v=ZlSx-6UbrmI&title=Em%20Khong%20Quay%20Ve',
            headers: { range: 'bytes=0-1023' },
          },
          res: {
            statusCode: 200,
            setHeader: vi.fn(),
          },
        },
      } as any

      const res = (await streamHandler(mockEvent)) as Response
      expect(res.status).toBe(206)
      expect(res.headers.get('Content-Type')).toBe('audio/mp4')
    } finally {
      globalThis.fetch = origFetch
    }
  })
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/youtubeServer.test.ts`
Expected: FAIL (returns `{ error: 'Unable to resolve audio stream' }` with status 502).

- [x] **Step 3: Implement upstream `User-Agent` forwarding and `resolveItunesAudioFallback` in `server/api/youtube/stream.get.ts`, and pass `title` in `useMusicPlayer.ts` / `index.vue`**

In `server/api/youtube/stream.get.ts`:
- Read `const title = typeof query.title === 'string' ? query.title.trim() : ''`.
- When `resolveYouTubeAudioStream(videoId)` resolves a stream, fetch `resolved.url` using `resolved.userAgent || DEFAULT_UA`.
- If `resolved` is `null` or `upstream` fails (`!upstream || (!upstream.ok && upstream.status !== 206)`) after cache-bypass retry, call `await resolveItunesAudioFallback(videoId, { title })` and fetch the fallback stream with `Range: rangeHeader`.
- In `app/composables/useMusicPlayer.ts`, include `title: track.title` in `onPlayerAction('load', ...)` payloads (`playTrack` and `applyRemoteSyncEvent`).
- In `app/pages/index.vue`, append `&title=${encodeURIComponent(payload.title)}` when `payload.title` is present on `audio.src = ...`.

- [x] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`
Expected: PASS across all test suites.

- [x] **Step 5: Commit**

```bash
git add server/api/youtube/stream.get.ts app/composables/useMusicPlayer.ts app/pages/index.vue tests/utils/youtubeServer.test.ts
git commit -m "fix: forward client User-Agent and fallback to iTunes stream on 502"
```
