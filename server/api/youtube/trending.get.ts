import { defineEventHandler, getQuery, setResponseHeaders } from 'h3'
import { fetchPipedTrending } from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const region = typeof queryParams.region === 'string' ? queryParams.region.trim() : 'VN'

  const result = await fetchPipedTrending(region)

  if (!result.error && result.items.length > 0) {
    setResponseHeaders(event, {
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    })
  } else {
    setResponseHeaders(event, {
      'Cache-Control': 'no-store, no-cache',
    })
  }

  return result
})
