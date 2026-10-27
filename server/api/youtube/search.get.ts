import { defineEventHandler, getQuery } from 'h3'
import { searchYouTubeVideos } from '~/utils/youtube'

export default defineEventHandler(async (event) => {
  const queryParams = getQuery(event)
  const q = typeof queryParams.q === 'string' ? queryParams.q : ''

  if (!q.trim()) {
    return { items: [] }
  }

  const config = useRuntimeConfig()
  const apiKey = (config.youtubeApiKey as string) || process.env.YOUTUBE_API_KEY || ''

  const result = await searchYouTubeVideos(q, {
    apiKey: apiKey || undefined,
  })

  return result
})
