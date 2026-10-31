# YouTube Video Picture-in-Picture (PiP) Player Specification

## Overview
Adds support for watching YouTube videos alongside audio playback in the chat application. Users can toggle a floating, draggable Picture-in-Picture (PiP) window from the music player bar. The video stream is proxied through the server via Piped API, avoiding client-side requests to `youtube.com`.

## Requirements
1. **Server-Proxied Video Streaming:**
   - Server endpoint `/api/youtube/stream?v=<id>&type=video` streams muxed MP4 video with range request support.
   - Client never contacts `youtube.com` directly.
2. **Floating Draggable PiP Window:**
   - Floating card pinned to the bottom-right corner of the workspace.
   - Draggable across the screen with bounds clamped to the viewport.
   - Expandable between standard (320px) and large (440px) sizes.
   - Close button reverts playback to audio-only stream.
3. **Bandwidth Optimization:**
   - Default playback uses low-bandwidth audio-only stream.
   - Video stream is requested only when the PiP window is open.
   - Closing PiP immediately reverts back to the audio-only stream at the exact playback timestamp.
4. **Synchronization & Controls:**
   - Play, pause, seek, volume, and mute controls in the player bar and PiP overlay remain in sync with room playback state (`MusicPlaybackState`).
   - If PiP is open when a track ends, the next queued track automatically plays with video.
5. **Error Fallback:**
   - If the video stream fails upstream, playback falls back gracefully to the audio stream and closes the PiP window.

## Architecture & Data Flow

### 1. Server & Utilities (`app/utils/youtube.ts`, `server/api/youtube/stream.get.ts`)
- `extractBestVideoStream(formats: any[])`: Finds the best muxed stream (`videoOnly === false`, `mimeType.includes('mp4')`, typically 360p itag 18).
- `resolveYouTubeVideoStream(videoId: string, options)`: Queries Piped API `/streams/:videoId`, caches the resolved format for 10 minutes in memory.
- `server/api/youtube/stream.get.ts`:
  - Parses query parameter `type`.
  - When `type === 'video'`, resolves video stream; otherwise resolves audio stream.
  - Serves `video/mp4` with `Accept-Ranges: bytes`, handles HTTP 206 partial responses and upstream aborts.

### 2. Client Media Element (`app/pages/index.vue`)
- Replace `<audio id="youtube-hidden-player">` with `<video id="youtube-media-player">`.
- Reactive state `isVideoPipOpen = ref(false)`.
- When `isVideoPipOpen` is false:
  - Source is `/api/youtube/stream?v=<id>`
  - `<video>` element is hidden offscreen.
- When `isVideoPipOpen` is true:
  - Source switches to `/api/youtube/stream?v=<id>&type=video` at `musicCurrentTimeSec`.
  - `<video>` element renders inside `YouTubeVideoPip.vue`.
- Seamless position handoff: switching between video and audio preserves `currentTime`.

### 3. UI Components
- **`app/components/MusicPlayerBar.vue`:**
  - Adds a "Watch" button with `Tv` icon.
  - Toggles `isVideoPipOpen`.
  - Shows active state when PiP is open.
- **`app/components/YouTubeVideoPip.vue`:**
  - Draggable container anchored at `bottom-16 right-6`.
  - Header: Drag handle, track title, size expand toggle, close button.
  - Body: 16:9 aspect ratio video surface with hover playback controls (play/pause, seek slider, mute).

## Testing Strategy
- **Unit Tests (`tests/utils/youtube.test.ts`):** Validate `extractBestVideoStream` and video stream resolution.
- **Server Tests (`tests/utils/youtubeServer.test.ts`):** Validate `/api/youtube/stream?type=video` returns video content-type and headers.
- **Component Tests (`tests/components/YouTubeVideoPip.test.ts`):** Validate drag events, size toggle, and close emit.
- **Bar Tests (`tests/components/musicUi.test.ts`):** Validate "Watch" button emit and active styling.
