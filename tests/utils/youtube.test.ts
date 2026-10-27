import { describe, it, expect } from 'vitest'
import {
  parseYouTubeInitialData,
  parseYouTubeApiResponse,
  formatDurationSeconds,
  isValidYouTubeVideoId,
  getYouTubeThumbnailProxyUrl,
  normalizeStreamRangeHeader,
  extractBestAudioFormat,
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
})
