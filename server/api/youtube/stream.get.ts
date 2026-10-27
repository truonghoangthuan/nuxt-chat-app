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

  let resolved = await resolveYouTubeAudioStream(videoId)
  if (!resolved) {
    setResponseStatus(event, 502)
    return { error: 'Unable to resolve audio stream' }
  }

  let upstream = await fetch(resolved.url, {
    headers: {
      Range: rangeHeader,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  }).catch(() => null)

  // Retry once bypassing cache if upstream URL expired (401/403/404)
  if (!upstream || upstream.status === 401 || upstream.status === 403 || upstream.status === 404) {
    resolved = await resolveYouTubeAudioStream(videoId, { bypassCache: true })
    if (!resolved) {
      setResponseStatus(event, 502)
      return { error: 'Unable to refresh audio stream' }
    }
    upstream = await fetch(resolved.url, {
      headers: {
        Range: rangeHeader,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }).catch(() => null)
  }

  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
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
