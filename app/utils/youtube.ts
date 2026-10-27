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
    const resp = await myFetch('https://youtubei.googleapis.com/youtubei/v1/search?prettyPrint=false', {
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

export function isValidYouTubeVideoId(videoId: string): boolean {
  if (typeof videoId !== 'string') return false
  return /^[\w-]{11}$/.test(videoId.trim())
}

export function getYouTubeThumbnailProxyUrl(videoId: string, fallbackThumbnail = ''): string {
  if (isValidYouTubeVideoId(videoId)) {
    return `/api/youtube/thumbnail?v=${encodeURIComponent(videoId.trim())}`
  }
  return fallbackThumbnail
}

export function normalizeStreamRangeHeader(
  rangeHeader: string | undefined,
  maxChunkBytes: number = 2 * 1024 * 1024,
): string {
  if (!rangeHeader || typeof rangeHeader !== 'string') {
    return `bytes=0-${maxChunkBytes - 1}`
  }
  const match = rangeHeader.trim().match(/^bytes=(\d+)-(\d*)$/)
  if (!match) {
    return `bytes=0-${maxChunkBytes - 1}`
  }
  const start = parseInt(match[1], 10)
  if (Number.isNaN(start) || start < 0) {
    return `bytes=0-${maxChunkBytes - 1}`
  }
  const requestedEnd = match[2] ? parseInt(match[2], 10) : undefined
  const maxEnd = start + maxChunkBytes - 1
  const end = requestedEnd !== undefined && !Number.isNaN(requestedEnd) && requestedEnd >= start
    ? Math.min(requestedEnd, maxEnd)
    : maxEnd
  return `bytes=${start}-${end}`
}

export function extractBestAudioFormat(formats: any[]): { url: string; mimeType: string } | null {
  if (!Array.isArray(formats) || formats.length === 0) return null

  const audioFormats = formats.filter((f) => {
    if (!f || typeof f.url !== 'string' || !/^https?:\/\//.test(f.url)) return false
    const type = String(f.mimeType || f.type || '').toLowerCase()
    return type.startsWith('audio/')
  })

  if (audioFormats.length === 0) {
    // Fallback to muxed video/mp4 with audio (e.g. itag 18 360p) for HTML5 <audio> playback
    const muxedFormats = formats.filter((f) => {
      if (!f || typeof f.url !== 'string' || !/^https?:\/\//.test(f.url)) return false
      if (f.videoOnly === true) return false
      const type = String(f.mimeType || f.type || '').toLowerCase()
      return (
        type.startsWith('video/mp4') &&
        (f.itag === 18 || Boolean(f.audioQuality) || type.includes('mp4a') || type.includes('avc1'))
      )
    })
    if (muxedFormats.length > 0) {
      return {
        url: muxedFormats[0].url,
        mimeType: 'audio/mp4',
      }
    }
    return null
  }

  // Prefer audio/mp4 (m4a) for universal Safari/Chrome/Firefox/Edge compatibility, then audio/webm
  const sorted = [...audioFormats].sort((a, b) => {
    const aType = String(a.mimeType || a.type || '').toLowerCase()
    const bType = String(b.mimeType || b.type || '').toLowerCase()
    const aIsMp4 = aType.includes('mp4') || aType.includes('m4a')
    const bIsMp4 = bType.includes('mp4') || bType.includes('m4a')

    if (aIsMp4 && !bIsMp4) return -1
    if (!aIsMp4 && bIsMp4) return 1

    const aBitrate = Number(a.bitrate || a.audioBitrate || 0)
    const bBitrate = Number(b.bitrate || b.audioBitrate || 0)
    return bBitrate - aBitrate
  })

  const best = sorted[0]
  const rawType = String(best.mimeType || best.type || '').toLowerCase()
  const mimeType = rawType.includes('mp4') || rawType.includes('m4a') ? 'audio/mp4' : 'audio/webm'

  return {
    url: best.url,
    mimeType,
  }
}

export function cleanMusicSearchTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') return ''
  return rawTitle
    .replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/\b(official|music|video|mv|audio|lyrics|lyric|hd|4k|visualizer|full|playlist|remix|feat|ft)\b/gi, ' ')
    .replace(/[|•\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function resolveItunesAudioFallback(
  videoId: string,
  options: { title?: string; fetchFn?: typeof fetch } = {},
): Promise<{ url: string; mimeType: string; userAgent?: string } | null> {
  const myFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!myFetch) return null

  let title = options.title?.trim()
  if (!title) {
    try {
      const searchRes = await searchYouTubeVideos(videoId, { fetchFn: myFetch })
      const match = searchRes.items.find((i) => i.videoId === videoId) || searchRes.items[0]
      title = match?.title || ''
    } catch {
      // ignore
    }
  }
  if (!title) return null

  const cleaned = cleanMusicSearchTitle(title) || title
  try {
    const timeoutSignal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(3500)
        : undefined
    const resp = await myFetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(cleaned)}&media=music&entity=song&limit=1`,
      timeoutSignal ? { signal: timeoutSignal } : undefined,
    )
    if (resp.ok) {
      const data = await resp.json()
      const item = data?.results?.[0]
      if (item?.previewUrl) {
        return {
          url: item.previewUrl,
          mimeType: 'audio/mp4',
        }
      }
    }
  } catch {
    // Fallback failed
  }
  return null
}

interface CachedStream {
  url: string
  mimeType: string
  userAgent?: string
  expiresAt: number
}

const streamUrlCache = new Map<string, CachedStream>()

export interface ResolveAudioOptions {
  fetchFn?: typeof fetch
  bypassCache?: boolean
}

export async function resolveYouTubeAudioStream(
  videoId: string,
  options: ResolveAudioOptions = {},
): Promise<{ url: string; mimeType: string; userAgent?: string } | null> {
  const cleanId = typeof videoId === 'string' ? videoId.trim() : ''
  if (!isValidYouTubeVideoId(cleanId)) {
    return null
  }

  const myFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!myFetch) {
    return null
  }

  const now = Date.now()
  if (!options.bypassCache) {
    const cached = streamUrlCache.get(cleanId)
    if (cached && cached.expiresAt > now) {
      return { url: cached.url, mimeType: cached.mimeType, userAgent: cached.userAgent }
    }
  }

  const timeoutSignal = () =>
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(3500)
      : undefined

  // 1. YouTube InnerTube Player API with ANDROID client (20.03.35)
  const ANDROID_UA = 'com.google.android.youtube/20.03.35 (Linux; U; Android 14) gzip'
  try {
    const resp = await myFetch('https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.03.35',
            androidSdkVersion: 34,
            osName: 'Android',
            osVersion: '14',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId: cleanId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: timeoutSignal(),
    })
    if (resp.ok) {
      const data = await resp.json()
      const formats = [
        ...(data?.streamingData?.adaptiveFormats || []),
        ...(data?.streamingData?.formats || []),
      ]
      const best = extractBestAudioFormat(formats)
      if (best) {
        const streamInfo = { ...best, userAgent: ANDROID_UA }
        streamUrlCache.set(cleanId, { ...streamInfo, expiresAt: now + 10 * 60 * 1000 })
        return streamInfo
      }
    }
  } catch {
    // Continue to next client / provider
  }

  // 2. YouTube InnerTube Player API with IOS client (20.03.02)
  const IOS_UA =
    'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)'
  try {
    const resp = await myFetch('https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': IOS_UA,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'IOS',
            clientVersion: '20.03.02',
            deviceMake: 'Apple',
            deviceModel: 'iPhone16,2',
            osName: 'iPhone',
            osVersion: '18.2.1.22C161',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId: cleanId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: timeoutSignal(),
    })
    if (resp.ok) {
      const data = await resp.json()
      const formats = [
        ...(data?.streamingData?.adaptiveFormats || []),
        ...(data?.streamingData?.formats || []),
      ]
      const best = extractBestAudioFormat(formats)
      if (best) {
        const streamInfo = { ...best, userAgent: IOS_UA }
        streamUrlCache.set(cleanId, { ...streamInfo, expiresAt: now + 10 * 60 * 1000 })
        return streamInfo
      }
    }
  } catch {
    // Continue to Piped/Invidious pool
  }

  // 3. Fallback: Piped API pool
  const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://pipedapi.adminforge.de',
  ]

  for (const instance of PIPED_INSTANCES) {
    try {
      const resp = await myFetch(`${instance}/streams/${cleanId}`, {
        signal: timeoutSignal(),
      })
      if (resp.ok) {
        const data = await resp.json()
        const formats = [
          ...(data?.audioStreams || []),
          ...(data?.videoStreams || []).filter((v: any) => v && v.videoOnly === false),
        ]
        const best = extractBestAudioFormat(formats)
        if (best) {
          streamUrlCache.set(cleanId, { ...best, expiresAt: now + 10 * 60 * 1000 })
          return best
        }
      }
    } catch {
      // Try next instance
    }
  }

  // 4. Fallback: Invidious API pool
  const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
  ]

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const resp = await myFetch(`${instance}/api/v1/videos/${cleanId}`, {
        signal: timeoutSignal(),
      })
      if (resp.ok) {
        const data = await resp.json()
        const formats = [
          ...(data?.adaptiveFormats || []),
          ...(data?.formatStreams || []),
        ]
        const best = extractBestAudioFormat(formats)
        if (best) {
          streamUrlCache.set(cleanId, { ...best, expiresAt: now + 10 * 60 * 1000 })
          return best
        }
      }
    } catch {
      // Try next instance
    }
  }

  return null
}
