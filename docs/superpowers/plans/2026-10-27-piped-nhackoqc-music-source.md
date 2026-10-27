# Switch Music Source to KOQC Piped Instance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every YouTube media source (search, audio stream, thumbnail) with the KOQC Piped instance (`https://nhackoqc.xyz`), and add a Vietnam "Trending" list to the music modal.

**Architecture:** `nhackoqc.xyz/trending` is a Piped web UI. Its JSON backend is `https://pipedapi.nhackoqc.xyz`, and its media proxy is `https://pipedproxy.nhackoqc.xyz`. Nitro server routes call that API and proxy the bytes. The browser only talks to same-origin `/api/youtube/*`, so AGENTS.md Invariant 32 still holds. All old tiers are deleted: YouTube Data API, InnerTube search/player, HTML scrape, the old Piped pool, Invidious, and iTunes. The client player, realtime sync, `useMusicPlayer.ts`, and `MusicPlayerBar.vue` stay unchanged.

**Tech Stack:** Nuxt 4 Nitro routes (h3), Vitest, Piped REST API.

**Spec:** User decisions (2026-10-27):
1. Switch the music player source to `https://nhackoqc.xyz/trending`.
2. Do **not** keep old sources as fallback.
3. Search uses regular videos (`filter=videos`).
4. Trending region is Vietnam (`VN`).

### Probe evidence (2026-10-27)

| Endpoint | Result |
| --- | --- |
| `GET pipedapi.nhackoqc.xyz/trending?region=VN` | 200, ~900 ms, 50 items, CORS `*` |
| `GET pipedapi.nhackoqc.xyz/search?q=<q>&filter=videos` | 200, ~650 ms, `{ items: [...] }` |
| `GET pipedapi.nhackoqc.xyz/streams/<id>` | 200, ~1.7–1.9 s, `audioStreams[]` (`audio/mp4`, `audio/webm`) on `pipedproxy.nhackoqc.xyz` |
| `HEAD <audioStreams[n].url>` | 206, `audio/mp4` |
| `GET pipedproxy.nhackoqc.xyz/vi/<id>/mqdefault.jpg?host=i.ytimg.com` | 200, `image/webp` |

Item shape (trending and search `items`): `{ url: "/watch?v=<id>", type: "stream", title, thumbnail, uploaderName, duration (sec; -1 = live), isShort }`.

## Global Constraints

- One exported constant in `app/utils/youtube.ts`: `PIPED_API = 'https://pipedapi.nhackoqc.xyz'`, plus `PIPED_PROXY = 'https://pipedproxy.nhackoqc.xyz'`.
- The browser never fetches `*.nhackoqc.xyz`, `*.youtube.com`, or `*.ytimg.com` directly. Only same-origin `/api/youtube/*` (Invariant 32).
- Upstream timeout for every API call: `AbortSignal.timeout(3500)`.
- Trending region: `VN` default. Only `/^[A-Z]{2}$/` is accepted (after `toUpperCase()`), otherwise `VN`.
- Keep the stream byte-range capping (`normalizeStreamRangeHeader`, 2 MB) and the 10-minute `streamUrlCache`.
- No new dependencies. No new env vars. Remove `YOUTUBE_API_KEY` / `youtubeApiKey`.

## Review Focus

1. KOQC down or slow → `/api/youtube/search` returns `{ items: [], error }` (modal shows the message). `/api/youtube/stream` returns 502 JSON; the client's existing `@error` handler shows "Tune In". Neither may hang past the timeout. Pinned in Task 1 and Task 2 tests.
2. Cached proxy URL expired (403/404 from `pipedproxy`) → retry once with `bypassCache: true`. This existing behavior is kept. Pinned in a Task 2 test.
3. Live streams (`duration: -1`), shorts, and non-`stream` items → filtered out of search and trending. Pinned by the Task 1 parser test.
4. Malicious `region` query → clamped to `VN`. Pinned in a Task 3 test.
5. Opening the modal with existing results → trending must not overwrite them. Pinned in a Task 4 test.

---

### Task 1: Rewrite `app/utils/youtube.ts` around KOQC

**Files:**
- Modify: `app/utils/youtube.ts`
- Modify: `server/api/youtube/search.get.ts` (drop the `apiKey` / runtime config lookup)
- Modify: `nuxt.config.ts:23` (delete the `youtubeApiKey` line), `.env.example:6` (delete `YOUTUBE_API_KEY=`)
- Test: `tests/utils/youtube.test.ts`, `tests/utils/youtubeServer.test.ts`

**Interfaces:**
- Keep unchanged: `formatDurationSeconds`, `isValidYouTubeVideoId`, `getYouTubeThumbnailProxyUrl`, `normalizeStreamRangeHeader`, `extractBestAudioFormat`.
- Delete: `parseYouTubeApiResponse`, `parseYouTubeInitialData`, `SearchYouTubeOptions.apiKey`, `cleanMusicSearchTitle`, `resolveItunesAudioFallback`. Also delete the InnerTube ANDROID/IOS tiers, the `PIPED_INSTANCES` pool, and the `INVIDIOUS_INSTANCES` pool.
- Produces:
  - `export const PIPED_API = 'https://pipedapi.nhackoqc.xyz'`
  - `export const PIPED_PROXY = 'https://pipedproxy.nhackoqc.xyz'`
  - `export function parsePipedItems(items: any[]): YouTubeSearchResult[]`: keep `type === 'stream' && !isShort && duration > 0` with a valid 11-char id parsed from `url` (`v` param). Map `uploaderName` to `channelTitle` and `formatDurationSeconds(duration)` to `durationText`. Non-array input returns `[]`.
  - `searchYouTubeVideos(query, { fetchFn? }): Promise<{ items; error? }>`: a single `GET ${PIPED_API}/search?q=<enc>&filter=videos`, parsed with `parsePipedItems(json.items)`. A non-OK response or a throw returns `{ items: [], error: 'Failed to search YouTube' }`. A blank query returns `{ items: [] }` with no fetch.
  - `fetchPipedTrending(region: string, { fetchFn? }): Promise<{ items; error? }>`: `GET ${PIPED_API}/trending?region=<region>`, then `parsePipedItems(json)`. Same error shape.
  - `resolveYouTubeAudioStream(videoId, { fetchFn?, bypassCache? }): Promise<{ url; mimeType } | null>`: a single `GET ${PIPED_API}/streams/<id>`. Run `extractBestAudioFormat([...audioStreams, ...videoStreams.filter(v => v.videoOnly === false)])` and cache for 10 minutes. The return type drops `userAgent`.

- [ ] **Step 1: Rewrite tests first**
  - `youtube.test.ts`: delete the 3 tests that use `parseYouTubeApiResponse` / `parseYouTubeInitialData` and their imports. Add:
    ```ts
    it('parsePipedItems keeps playable streams and drops live, shorts, non-streams', () => {
      const out = parsePipedItems([
        { url: '/watch?v=dQw4w9WgXcQ', type: 'stream', title: 'A', thumbnail: 't', uploaderName: 'U', duration: 213, isShort: false },
        { url: '/watch?v=E8MZq0Stfi4', type: 'stream', title: 'Live', duration: -1, isShort: false },
        { url: '/watch?v=aaaaaaaaaaa', type: 'stream', title: 'Short', duration: 30, isShort: true },
        { url: '/channel/UCx', type: 'channel', title: 'Chan' },
      ])
      expect(out).toEqual([{ videoId: 'dQw4w9WgXcQ', title: 'A', channelTitle: 'U', thumbnail: 't', durationText: '3:33' }])
      expect(parsePipedItems(null as any)).toEqual([])
    })
    ```
  - `youtubeServer.test.ts`, `describe('searchYouTubeVideos')`: keep `returns empty items…blank` and `handles upstream fetch errors gracefully`. Delete the Data API, InnerTube, and iTunes tests. Add `it('searches KOQC Piped with filter=videos')`, asserting `fetchFn` was called with `` `${PIPED_API}/search?q=lofi&filter=videos` `` (plus an options object) and that the items are parsed.
  - Add `describe('fetchPipedTrending')` → `it('calls /trending?region=VN and parses items')` and `it('returns error shape when upstream fails')`.
  - `describe('resolveYouTubeAudioStream')`: keep the invalid-id test. Replace the InnerTube and fallback tests with `it('resolves best audio from KOQC /streams')`. The mock `audioStreams` holds webm 70 kbps and mp4 128 kbps. Expect `{ url: <mp4 url>, mimeType: 'audio/mp4' }`, with the fetch URL `` `${PIPED_API}/streams/dQw4w9WgXcQ` ``. Add `it('returns null when KOQC fails')`.
- [ ] **Step 2: Run** `npx vitest run tests/utils`. Expected: the new tests FAIL (`parsePipedItems` / `fetchPipedTrending` / `PIPED_API` undefined).
- [ ] **Step 3: Implement** the interfaces above. Update `search.get.ts` to call `searchYouTubeVideos(q)` with no apiKey. Delete the config/env lines.
- [ ] **Step 4: Run** `npx vitest run tests/utils`. Expected: PASS, except the stream endpoint iTunes test (fixed in Task 2).
- [ ] **Step 5: Commit** `feat(music)!: use KOQC Piped as sole search and stream source`

---

### Task 2: Stream and thumbnail endpoints on KOQC

**Files:**
- Modify: `server/api/youtube/stream.get.ts`
- Modify: `server/api/youtube/thumbnail.get.ts`
- Test: `tests/utils/youtubeServer.test.ts` (`describe('server endpoints')`)

**Interfaces:**
- Consumes: `resolveYouTubeAudioStream`, `PIPED_PROXY` from Task 1.
- `stream.get.ts`: delete the `title` param, the iTunes fallback, `DEFAULT_UA`, and the `userAgent` plumbing. Keep validation, the range normalization, the single `bypassCache` retry on 401/403/404 or a fetch throw, the 502 JSON on failure, and response header copying.
- `thumbnail.get.ts`: change the upstream URL to `` `${PIPED_PROXY}/vi/${videoId}/mqdefault.jpg?host=i.ytimg.com` ``. Everything else stays the same (Content-Type comes from upstream, now `image/webp`).
- The client (`app/pages/index.vue:170-171`) may keep sending `&title=`. The server ignores it. Optional cleanup: drop `titleParam` there too.

- [ ] **Step 1: Rewrite tests**
  - Delete `stream endpoint falls back to iTunes AAC stream…`.
  - Add `it('stream endpoint proxies KOQC audio with capped 206 range')`. The global `fetch` mock returns `/streams` JSON with one `audio/mp4` URL on `pipedproxy.example`, and a 206 `Response` for that URL. Assert `res.status === 206`, `Content-Type === 'audio/mp4'`, and that the upstream call got the header `Range: 'bytes=0-1023'`.
  - Add `it('stream endpoint re-resolves once when cached proxy URL returns 403')`. The first audio fetch returns 403, the second returns 206. Assert 2 calls to `/streams/` and a final status of 206.
  - Add `it('stream endpoint returns 502 when KOQC is down')`. All fetches return `{ ok: false, status: 503 }`. Assert `{ error: 'Upstream audio stream failed' }`.
  - Add `it('thumbnail endpoint fetches from KOQC proxy')`, asserting the fetch URL equals `https://pipedproxy.nhackoqc.xyz/vi/dQw4w9WgXcQ/mqdefault.jpg?host=i.ytimg.com`.
- [ ] **Step 2: Run** `npx vitest run tests/utils/youtubeServer.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the endpoint changes.
- [ ] **Step 4: Run** `npx vitest run tests/utils`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(music): proxy stream and thumbnails through KOQC`

---

### Task 3: Trending endpoint

**Files:**
- Create: `server/api/youtube/trending.get.ts`
- Test: `tests/utils/youtubeServer.test.ts` (`describe('server endpoints')`, same mock-event style)

**Interfaces:**
- Consumes: `fetchPipedTrending` from Task 1.
- Produces: `GET /api/youtube/trending?region=XX` returns `{ items: YouTubeSearchResult[]; error?: string }` with status 200 (errors go in the body), plus `Cache-Control: public, max-age=600, s-maxage=600`.

- [ ] **Step 1: Write failing tests**
  - `it('trending endpoint defaults to VN')`: no query, so the global fetch is called with `.../trending?region=VN`.
  - `it('trending endpoint clamps invalid region to VN')`: `region=../x` produces `.../trending?region=VN`.
- [ ] **Step 2: Run** `npx vitest run tests/utils/youtubeServer.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** about 12 lines, mirroring `search.get.ts`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(music): add VN trending endpoint`

---

### Task 4: Show trending in `YouTubeSearchModal.vue`

**Files:**
- Modify: `app/components/YouTubeSearchModal.vue`
- Test: `tests/components/musicUi.test.ts`

**Interfaces:**
- Consumes: `GET /api/youtube/trending`.
- Behavior: when `open` becomes `true` and `searchResults` is empty, call `$fetch('/api/youtube/trending')` and fill `searchResults`. Set `isTrending = true`. Show a `Trending in Vietnam` label (`data-test="youtube-trending-label"`) above the list only while `isTrending`. A typed search sets `isTrending = false`. The trending spinner reuses `isSearching`. Keep the `select`/`close` emits, all existing `data-test` hooks, and Escape/Enter unchanged (Invariant 9).

- [ ] **Step 1: Write failing tests** (stub `$fetch` the way the existing suite does)
  - `it('loads VN trending when opened with no results')`: `$fetch` is called with `'/api/youtube/trending'`, the items render as `youtube-result-item`, and the label is visible.
  - `it('does not fetch trending when initialResults exist')`: mount with `initialResults`, so `$fetch` is never called.
  - `it('hides trending label after a typed search')`.
- [ ] **Step 2: Run** `npx vitest run tests/components/musicUi.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with one `isTrending` ref and one `loadTrending()` call inside the existing `open` watcher.
- [ ] **Step 4: Run** `npm test`. Expected: all suites PASS.
- [ ] **Step 5: Commit** `feat(music): show VN trending in music modal`

---

### Task 5: Docs

**Files:**
- Modify: `AGENTS.md`: Invariant 32 and the `youtube.ts` / `search.get.ts` descriptions in section 3.

- [ ] **Step 1:** Rewrite the Invariant 32 bullets about InnerTube mobile clients, User-Agent coupling, the SABR fallback, and the iTunes fallback. Replace them with: "Sole media source is the Piped instance `https://pipedapi.nhackoqc.xyz` (`PIPED_API`) with media proxy `https://pipedproxy.nhackoqc.xyz` (`PIPED_PROXY`). Search (`filter=videos`), streams, thumbnails, and VN trending are called server-side only. No fallback providers." Keep the bullets on zero client egress, native `<audio>`, byte-range capping, the 3500 ms timeout, and thumbnail caching.
- [ ] **Step 2:** In section 3, update the `search.get.ts` comment to "KOQC Piped search endpoint", and add `trending.get.ts`.
- [ ] **Step 3:** Run `npm test`. Expected: PASS.
- [ ] **Step 4: Commit** `docs: record KOQC Piped as sole music source`

## Out of scope (skipped)

- An iframe embed of the KOQC web UI. It breaks room sync and Invariant 32.
- Browser-direct playback from `pipedproxy.nhackoqc.xyz`. CORS allows it, but Invariant 32 forbids it.
- A region picker UI, and the music-only search filter.
- Renaming `youtube.ts`, `/api/youtube/*`, or `YouTubeSearchModal.vue`. Pure churn: IDs are still YouTube IDs.

## Risk

- Single third-party instance with no SLA. If KOQC goes down, music search, playback, and thumbnails all stop (chat is unaffected). Recovery means changing the `PIPED_API` / `PIPED_PROXY` constants to another Piped instance.
