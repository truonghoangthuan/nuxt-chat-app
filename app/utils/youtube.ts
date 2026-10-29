import type { YouTubeSearchResult } from '~/types/chat'

export const PIPED_API = 'https://pipedapi.nhackoqc.xyz'
export const PIPED_PROXY = 'https://pipedproxy.nhackoqc.xyz'

export function formatDurationSeconds(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) {
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

export function parsePipedItems(items: any[]): YouTubeSearchResult[] {
  if (!Array.isArray(items)) {
    return []
  }

  const results: YouTubeSearchResult[] = []
  for (const item of items) {
    if (!item || item.type !== 'stream' || item.isShort || typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration <= 0) {
      continue
    }

    const url = typeof item.url === 'string' ? item.url : ''
    const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/)
    const videoId = match ? match[1] : ''

    if (!isValidYouTubeVideoId(videoId)) {
      continue
    }

    results.push({
      videoId,
      title: item.title || '',
      channelTitle: item.uploaderName || '',
      thumbnail: item.thumbnail || '',
      durationText: formatDurationSeconds(item.duration),
    })
  }

  return results
}

export interface SearchYouTubeOptions {
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

  const timeoutSignal = () =>
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(3500)
      : undefined

  try {
    const resp = await myFetch(
      `${PIPED_API}/search?q=${encodeURIComponent(cleanQuery)}&filter=videos`,
      { signal: timeoutSignal() },
    )

    if (resp.ok) {
      const json = await resp.json()
      const items = parsePipedItems(json?.items)
      return { items }
    }
  } catch {
    // Upstream failure
  }

  return { items: [], error: 'Failed to search YouTube' }
}

export async function fetchPipedTrending(
  region: string = 'VN',
  options: { fetchFn?: typeof fetch } = {},
): Promise<{ items: YouTubeSearchResult[]; error?: string }> {
  const myFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!myFetch) {
    return { items: [], error: 'Fetch client unavailable' }
  }

  const timeoutSignal = () =>
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(3500)
      : undefined

  const safeRegion = /^[A-Z]{2}$/.test(region?.toUpperCase()) ? region.toUpperCase() : 'VN'

  try {
    const resp = await myFetch(
      `${PIPED_API}/trending?region=${encodeURIComponent(safeRegion)}`,
      { signal: timeoutSignal() },
    )

    if (resp.ok) {
      const json = await resp.json()
      const items = parsePipedItems(json)
      return { items }
    }
  } catch {
    // Upstream failure
  }

  return { items: [], error: 'Failed to fetch trending' }
}

interface CachedStream {
  url: string
  mimeType: string
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
): Promise<{ url: string; mimeType: string } | null> {
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
      return { url: cached.url, mimeType: cached.mimeType }
    }
  }

  // Cold Piped extraction for uncached videos often exceeds 3.5s
  const timeoutSignal = () =>
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(8000)
      : undefined

  try {
    const resp = await myFetch(`${PIPED_API}/streams/${encodeURIComponent(cleanId)}`, {
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
    // Upstream failure
  }

  return null
}
