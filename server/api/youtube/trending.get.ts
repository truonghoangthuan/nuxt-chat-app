import { defineEventHandler, getQuery, setResponseHeaders } from 'h3'
import { fetchPipedTrending } from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const region = typeof queryParams.region === 'string' ? queryParams.region.trim() : 'VN'

  setResponseHeaders(event, {
    'Cache-Control': 'public, max-age=600, s-maxage=600',
  })

  const result = await fetchPipedTrending(region)
  return result
})
