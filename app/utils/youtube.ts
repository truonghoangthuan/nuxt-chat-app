import type { YouTubeSearchResult } from '~/types/chat'

export function formatDurationSeconds(seconds: number): string {
  if (!seconds || Number.isNaN(seconds) || seconds < 0) {
    return '0:00'
  }
  const total = Math.floor(seconds)
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const padSecs = String(secs).padStart(2, '0')
  if (hrs > 0) {
    const padMins = String(mins).padStart(2, '0')
    return `${hrs}:${padMins}:${padSecs}`
  }
  return `${mins}:${padSecs}`
}

export function parseYouTubeApiResponse(data: Record<string, any>): YouTubeSearchResult[] {
  if (!data || !Array.isArray(data.items)) {
    return []
  }
  const results: YouTubeSearchResult[] = []
  for (const item of data.items) {
    const videoId = item?.id?.videoId
    if (!videoId) continue

    const snippet = item.snippet || {}
    const title = snippet.title || ''
    const channelTitle = snippet.channelTitle || ''
    const thumbnail =
      snippet.thumbnails?.medium?.url
      || snippet.thumbnails?.high?.url
      || snippet.thumbnails?.default?.url
      || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`

    results.push({
      videoId,
      title,
      channelTitle,
      thumbnail,
    })
  }
  return results
}

function findVideoRenderers(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') {
    return out
  }
  if (node.videoRenderer && node.videoRenderer.videoId) {
    out.push(node.videoRenderer)
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      findVideoRenderers(item, out)
    }
  } else {
    for (const key of Object.keys(node)) {
      findVideoRenderers(node[key], out)
    }
  }
  return out
}

export function parseYouTubeInitialData(htmlOrJson: string | Record<string, any>): YouTubeSearchResult[] {
  if (!htmlOrJson) {
    return []
  }

  let rootObj: any = null

  if (typeof htmlOrJson === 'object') {
    rootObj = htmlOrJson
  } else if (typeof htmlOrJson === 'string') {
    const trimmed = htmlOrJson.trim()
    if (trimmed.startsWith('{')) {
      try {
        rootObj = JSON.parse(trimmed)
      } catch {
        return []
      }
    } else {
      // Try extracting var ytInitialData = {...};
      const match = trimmed.match(/var\s+ytInitialData\s*=\s*({.+?});(?:<\/script>|\n)/s)
      if (match && match[1]) {
        try {
          rootObj = JSON.parse(match[1])
        } catch {
          return []
        }
      } else {
        return []
      }
    }
  }

  if (!rootObj) {
    return []
  }

  const rawRenderers = findVideoRenderers(rootObj)
  const seenIds = new Set<string>()
  const results: YouTubeSearchResult[] = []

  for (const vr of rawRenderers) {
    const videoId = vr.videoId
    if (!videoId || seenIds.has(videoId)) continue
    seenIds.add(videoId)

    const title =
      vr.title?.runs?.[0]?.text
      || vr.title?.simpleText
      || ''

    const channelTitle =
      vr.ownerText?.runs?.[0]?.text
      || vr.shortBylineText?.runs?.[0]?.text
      || ''

    const thumbs = vr.thumbnail?.thumbnails || []
    const thumbnail =
      thumbs[thumbs.length - 1]?.url
      || thumbs[0]?.url
      || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`

    const durationText = vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text

    results.push({
      videoId,
      title,
      channelTitle,
      thumbnail,
      ...(durationText ? { durationText } : {}),
    })
  }

  return results
}

export interface SearchYouTubeOptions {
  apiKey?: string
  fetchFn?: typeof fetch
}

export async function searchYouTubeVideos(
  query: string,
  options: SearchYouTubeOptions = {},
): Promise<{ items: YouTubeSearchResult[]; error?: string }> {
  const cleanQuery = query?.trim()
  if (!cleanQuery) {
    return { items: [] }
  }

  const myFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!myFetch) {
    return { items: [], error: 'Fetch client unavailable' }
  }

  // 1. YouTube Data API v3 when apiKey provided
  if (options.apiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&q=${encodeURIComponent(cleanQuery)}&key=${options.apiKey}`
      const resp = await myFetch(url)
      if (resp.ok) {
        const json = await resp.json()
        return { items: parseYouTubeApiResponse(json) }
      }
    } catch {
      return { items: [], error: 'Failed to search YouTube' }
    }
  }

  // 2. Keyless YouTube InnerTube POST endpoint
  try {
    const resp = await myFetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query: cleanQuery,
      }),
    })

    if (resp.ok) {
      const json = await resp.json()
      const items = parseYouTubeInitialData(json)
      if (items.length > 0) {
        return { items }
      }
    }
  } catch {
    // InnerTube failed, try fallback HTML scrape below
  }

  // 3. Fallback: Search HTML page
  try {
    const htmlResp = await myFetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    if (htmlResp.ok) {
      const html = await htmlResp.text()
      const items = parseYouTubeInitialData(html)
      return { items }
    }
  } catch {
    return { items: [], error: 'Failed to search YouTube' }
  }

  return { items: [], error: 'Failed to search YouTube' }
}
