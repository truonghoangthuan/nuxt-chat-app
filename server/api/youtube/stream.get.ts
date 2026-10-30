import { defineEventHandler, getQuery, getRequestHeader, setResponseStatus } from 'h3'
import {
  isValidYouTubeVideoId,
  normalizeStreamRangeHeader,
  resolveYouTubeAudioStream,
} from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const videoId = typeof query.v === 'string' ? query.v.trim() : ''

  if (!isValidYouTubeVideoId(videoId)) {
    setResponseStatus(event, 400)
    return { error: 'Invalid video ID' }
  }

  const incomingRange = getRequestHeader(event, 'range')
  const rangeHeader = normalizeStreamRangeHeader(incomingRange)

  async function fetchStream(url: string) {
    return await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        Range: rangeHeader,
      },
    }).catch(() => null)
  }

  let resolved = await resolveYouTubeAudioStream(videoId)
  let upstream: Response | null = resolved ? await fetchStream(resolved.url) : null

  // Retry once bypassing cache on any failure: slow/failed Piped resolve, expired proxy URL, or upstream error
  if (!resolved || !upstream || (!upstream.ok && upstream.status !== 206)) {
    resolved = await resolveYouTubeAudioStream(videoId, { bypassCache: true })
    upstream = resolved ? await fetchStream(resolved.url) : null
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
