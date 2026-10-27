import { describe, it, expect, vi } from 'vitest'
import {
  searchYouTubeVideos,
  resolveYouTubeAudioStream,
  fetchPipedTrending,
  PIPED_API,
} from '~/utils/youtube'
import streamHandler from '../../server/api/youtube/stream.get'
import thumbnailHandler from '../../server/api/youtube/thumbnail.get'

describe('searchYouTubeVideos', () => {
  it('returns empty items without calling fetch when query is blank', async () => {
    const fetchFn = vi.fn()
    const res = await searchYouTubeVideos('   ', { fetchFn: fetchFn as any })
    expect(res).toEqual({ items: [] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('searches KOQC Piped with filter=videos', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            url: '/watch?v=xyz98765432',
            type: 'stream',
            title: 'Keyless Track',
            uploaderName: 'Indie Channel',
            thumbnail: 'https://pipedproxy.example.com/thumb.jpg',
            duration: 260,
            isShort: false,
          },
        ],
      }),
    })
    const res = await searchYouTubeVideos('keyless track', { fetchFn: fetchFn as any })
    expect(fetchFn).toHaveBeenCalledWith(
      `${PIPED_API}/search?q=keyless%20track&filter=videos`,
      expect.anything(),
    )
    expect(res.items[0]?.videoId).toBe('xyz98765432')
    expect(res.items[0]?.title).toBe('Keyless Track')
    expect(res.items[0]?.channelTitle).toBe('Indie Channel')
    expect(res.items[0]?.durationText).toBe('4:20')
  })

  it('handles upstream fetch errors gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network down'))
    const res = await searchYouTubeVideos('lofi', { fetchFn: fetchFn as any })
    expect(res).toEqual({ items: [], error: 'Failed to search YouTube' })
  })
})

describe('fetchPipedTrending', () => {
  it('calls /trending?region=VN and parses items', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          url: '/watch?v=trend123456',
          type: 'stream',
          title: 'Trending Hit',
          uploaderName: 'Top Star',
          thumbnail: 'https://pipedproxy.example.com/trend.jpg',
          duration: 185,
          isShort: false,
        },
      ],
    })
    const res = await fetchPipedTrending('VN', { fetchFn: fetchFn as any })
    expect(fetchFn).toHaveBeenCalledWith(
      `${PIPED_API}/trending?region=VN`,
      expect.anything(),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].videoId).toBe('trend123456')
    expect(res.items[0].durationText).toBe('3:05')
  })

  it('returns error shape when upstream fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const res = await fetchPipedTrending('VN', { fetchFn: fetchFn as any })
    expect(res).toEqual({ items: [], error: 'Failed to fetch trending' })
  })
})

describe('resolveYouTubeAudioStream', () => {
  it('returns null immediately for invalid videoId without calling fetch', async () => {
    const fetchFn = vi.fn()
    const res = await resolveYouTubeAudioStream('bad-id', { fetchFn: fetchFn as any })
    expect(res).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('resolves best audio from KOQC /streams', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        audioStreams: [
          {
            url: 'https://pipedproxy.example.com/audio.webm',
            mimeType: 'audio/webm',
            bitrate: 70000,
          },
          {
            url: 'https://pipedproxy.example.com/audio.m4a',
            mimeType: 'audio/mp4',
            bitrate: 128000,
          },
        ],
      }),
    })

    const res = await resolveYouTubeAudioStream('dQw4w9WgXcQ', {
      fetchFn: fetchFn as any,
      bypassCache: true,
    })
    expect(fetchFn).toHaveBeenCalledWith(
      `${PIPED_API}/streams/dQw4w9WgXcQ`,
      expect.anything(),
    )
    expect(res).toEqual({
      url: 'https://pipedproxy.example.com/audio.m4a',
      mimeType: 'audio/mp4',
    })
  })

  it('returns null when KOQC fails', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({ ok: false, status: 502 })
    const res = await resolveYouTubeAudioStream('dQw4w9WgXcQ', {
      fetchFn: fetchFn as any,
      bypassCache: true,
    })
    expect(res).toBeNull()
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
        path: '/api/youtube/stream?v=ZlSx-6UbrmI&title=Em%20Khong%20Quay%20Ve',
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
})
