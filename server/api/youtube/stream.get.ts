import { defineEventHandler, getQuery, getRequestHeader, setResponseStatus } from 'h3'
import {
  isValidYouTubeVideoId,
  normalizeStreamRangeHeader,
  resolveYouTubeAudioStream,
  resolveItunesAudioFallback,
} from '~/utils/youtube'

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const videoId = typeof query.v === 'string' ? query.v.trim() : ''
  const title = typeof query.title === 'string' ? query.title.trim() : ''

  if (!isValidYouTubeVideoId(videoId)) {
    setResponseStatus(event, 400)
    return { error: 'Invalid video ID' }
  }

  const incomingRange = getRequestHeader(event, 'range')
  const rangeHeader = normalizeStreamRangeHeader(incomingRange)

  async function fetchStream(url: string, userAgent?: string) {
    return await fetch(url, {
      headers: {
        Range: rangeHeader,
        'User-Agent': userAgent || DEFAULT_UA,
      },
    }).catch(() => null)
  }

  let resolved = await resolveYouTubeAudioStream(videoId)
  let upstream: Response | null = null

  if (resolved) {
    upstream = await fetchStream(resolved.url, resolved.userAgent)

    // Retry once bypassing cache if upstream URL expired (401/403/404)
    if (!upstream || upstream.status === 401 || upstream.status === 403 || upstream.status === 404) {
      resolved = await resolveYouTubeAudioStream(videoId, { bypassCache: true })
      if (resolved) {
        upstream = await fetchStream(resolved.url, resolved.userAgent)
      }
    }
  }

  // Fallback to iTunes AAC stream if direct YouTube resolution or upstream fetch failed
  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    const fallback = await resolveItunesAudioFallback(videoId, { title })
    if (fallback) {
      const fallbackUpstream = await fetchStream(fallback.url, fallback.userAgent)
      if (fallbackUpstream && (fallbackUpstream.ok || fallbackUpstream.status === 206)) {
        resolved = fallback
        upstream = fallbackUpstream
      }
    }
  }

  if (!resolved || !upstream || (!upstream.ok && upstream.status !== 206)) {
    setResponseStatus(event, upstream?.status || 502)
    return { error: 'Upstream audio stream failed' }
  }

  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || resolved.mimeType || 'audio/mp4')
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'public, max-age=3600')

  const contentRange = upstream.headers.get('content-range')
  if (contentRange) headers.set('Content-Range', contentRange)

  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
})
