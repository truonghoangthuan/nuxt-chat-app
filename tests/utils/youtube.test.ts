import { describe, it, expect } from 'vitest'
import {
  parsePipedItems,
  formatDurationSeconds,
  isValidYouTubeVideoId,
  getYouTubeThumbnailProxyUrl,
  normalizeStreamRangeHeader,
  extractBestAudioFormat,
} from '~/utils/youtube'
import { formatSystemMessageText } from '~/utils/chat'

describe('youtube utils', () => {
  it('parsePipedItems keeps playable streams and drops live, shorts, non-streams', () => {
    const out = parsePipedItems([
      { url: '/watch?v=dQw4w9WgXcQ', type: 'stream', title: 'A', thumbnail: 't', uploaderName: 'U', duration: 213, isShort: false },
      { url: '/watch?v=E8MZq0Stfi4', type: 'stream', title: 'Live', duration: -1, isShort: false },
      { url: '/watch?v=aaaaaaaaaaa', type: 'stream', title: 'Short', duration: 30, isShort: true },
      { url: '/channel/UCx', type: 'channel', title: 'Chan' },
    ])
    expect(out).toEqual([
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'A',
        channelTitle: 'U',
        thumbnail: 't',
        durationText: '3:33',
      },
    ])
    expect(parsePipedItems(null as any)).toEqual([])
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
})
