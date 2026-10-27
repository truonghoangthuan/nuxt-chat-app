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
