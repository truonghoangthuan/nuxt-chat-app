import { describe, it, expect, vi } from 'vitest'
import { searchYouTubeVideos, resolveYouTubeAudioStream } from '~/utils/youtube'
import streamHandler from '../../server/api/youtube/stream.get'
import thumbnailHandler from '../../server/api/youtube/thumbnail.get'

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

describe('server endpoints', () => {
  it('thumbnail endpoint rejects invalid videoId with 400', async () => {
    let status = 200
    const mockEvent = {
      node: {
        req: { url: '/api/youtube/thumbnail?v=invalid' },
        res: {
          statusCode: 200,
          setHeader: vi.fn(),
        },
      },
    } as any

    const res = await thumbnailHandler(mockEvent)
    expect(res).toEqual({ error: 'Invalid video ID' })
  })

  it('stream endpoint rejects invalid videoId with 400', async () => {
    const mockEvent = {
      node: {
        req: { url: '/api/youtube/stream?v=bad' },
        res: {
          statusCode: 200,
          setHeader: vi.fn(),
        },
      },
    } as any

    const res = await streamHandler(mockEvent)
    expect(res).toEqual({ error: 'Invalid video ID' })
  })
})
