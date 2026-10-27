import { describe, it, expect, vi } from 'vitest'
import { searchYouTubeVideos } from '~/utils/youtube'

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
