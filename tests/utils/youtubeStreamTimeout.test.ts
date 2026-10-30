import { describe, expect, it, vi } from 'vitest'
import { clearStreamUrlCache } from '~/utils/youtube'
import streamHandler from '../../server/api/youtube/stream.get'

describe('audio proxy timeouts', () => {
  it.each([false, true])('bounds stalled audio fetches (retry also stalls: %s)', async (retryStalls) => {
    vi.useFakeTimers()
    clearStreamUrlCache()
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn().mockImplementation(async (input: any, init?: RequestInit) => {
      if (String(input).includes('/streams/')) {
        return {
          ok: true,
          json: async () => ({
            audioStreams: [{ url: 'https://pipedproxy.example.com/audio.m4a', mimeType: 'audio/mp4' }],
          }),
        }
      }
      const signal = init?.signal
      if (signal) signals.push(signal)
      if (!retryStalls && signals.length === 2) {
        return new Response(new Uint8Array([1, 2]), {
          status: 206,
          headers: { 'content-range': 'bytes 0-1/2', 'content-length': '2' },
        })
      }
      return new Promise((_resolve, reject) => {
        if (signal?.aborted) reject(signal.reason)
        else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const event = {
      path: '/api/youtube/stream?v=dQw4w9WgXcQ',
      node: {
        req: { url: '/api/youtube/stream?v=dQw4w9WgXcQ', headers: { range: 'bytes=0-1' } },
        res: { statusCode: 200, setHeader: vi.fn() },
      },
    } as any

    try {
      let completed = false
      const pending = streamHandler(event).then((result) => {
        completed = true
        return result
      })
      await vi.advanceTimersByTimeAsync(15000)
      if (retryStalls) await vi.advanceTimersByTimeAsync(15000)
      expect(completed).toBe(true)
      const result = await pending
      expect(signals).toHaveLength(2)
      expect(signals[0]).not.toBe(signals[1])
      expect(signals[0].aborted).toBe(true)
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/streams/'))).toHaveLength(2)
      if (retryStalls) {
        expect(signals[1].aborted).toBe(true)
        expect(event.node.res.statusCode).toBe(502)
        expect(result).toEqual({ error: 'Upstream audio stream failed' })
      } else {
        const response = result as Response
        expect(response.status).toBe(206)
        expect(response.headers.get('Content-Range')).toBe('bytes 0-1/2')
        expect(response.headers.get('Content-Length')).toBe('2')
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]))
        expect(fetchMock).toHaveBeenLastCalledWith(
          'https://pipedproxy.example.com/audio.m4a',
          expect.objectContaining({ headers: { Range: 'bytes=0-1' } }),
        )
      }
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      vi.useRealTimers()
      clearStreamUrlCache()
    }
  })
})
