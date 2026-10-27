import { defineEventHandler, getQuery, setResponseHeaders, setResponseStatus } from 'h3'
import { isValidYouTubeVideoId } from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const videoId = typeof query.v === 'string' ? query.v.trim() : ''

  if (!isValidYouTubeVideoId(videoId)) {
    setResponseStatus(event, 400)
    return { error: 'Invalid video ID' }
  }

  try {
    const upstream = await fetch(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`)
    if (!upstream.ok) {
      setResponseStatus(event, upstream.status)
      return { error: 'Thumbnail unavailable' }
    }

    const buffer = new Uint8Array(await upstream.arrayBuffer())
    setResponseHeaders(event, {
      'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    })
    return buffer
  } catch {
    setResponseStatus(event, 502)
    return { error: 'Failed to proxy thumbnail' }
  }
})
