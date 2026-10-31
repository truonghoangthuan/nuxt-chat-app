import { defineEventHandler, getQuery, getRequestHeader, setResponseStatus } from 'h3'
import {
  isValidYouTubeVideoId,
  normalizeStreamRangeHeader,
  resolveYouTubeAudioStream,
  resolveYouTubeVideoStream,
} from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const videoId = typeof query.v === 'string' ? query.v.trim() : ''
  const isVideo = query.type === 'video'

  if (!isValidYouTubeVideoId(videoId)) {
    setResponseStatus(event, 400)
    return { error: 'Invalid video ID' }
  }

  const incomingRange = getRequestHeader(event, 'range')
  const rangeHeader = normalizeStreamRangeHeader(incomingRange)

  const clientController = new AbortController()
  event.node?.req?.on?.('close', () => {
    clientController.abort()
  })

  async function fetchStream(url: string) {
    if (clientController.signal.aborted) return null

    const fetchController = new AbortController()
    const onClientClose = () => fetchController.abort()
    clientController.signal.addEventListener('abort', onClientClose, { once: true })

    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      fetchController.abort()
    }, 10000)

    try {
      const response = await fetch(url, {
        signal: fetchController.signal,
        headers: {
          Range: rangeHeader,
        },
      })
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      return response
    } catch {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      clientController.signal.removeEventListener('abort', onClientClose)
      return null
    }
  }

  const resolveStream = isVideo ? resolveYouTubeVideoStream : resolveYouTubeAudioStream
  const defaultMime = isVideo ? 'video/mp4' : 'audio/mp4'

  let resolved = await resolveStream(videoId)
  let upstream: Response | null = resolved ? await fetchStream(resolved.url) : null

  // Retry once bypassing cache on any failure
  if (!resolved || !upstream || (!upstream.ok && upstream.status !== 206)) {
    resolved = await resolveStream(videoId, { bypassCache: true })
    upstream = resolved ? await fetchStream(resolved.url) : null
  }

  if (!resolved || !upstream || (!upstream.ok && upstream.status !== 206)) {
    setResponseStatus(event, upstream?.status || 502)
    return { error: isVideo ? 'Upstream video stream failed' : 'Upstream audio stream failed' }
  }

  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || resolved.mimeType || defaultMime)
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
