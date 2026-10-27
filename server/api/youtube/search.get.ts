import { defineEventHandler, getQuery } from 'h3'
import { searchYouTubeVideos } from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const q = typeof queryParams.q === 'string' ? queryParams.q : ''

  if (!q.trim()) {
    return { items: [] }
  }

  const result = await searchYouTubeVideos(q)

  return result
})
