import { ref } from 'vue'
import { decryptBinary } from '~/utils/crypto'

export interface ImageAttachmentCache {
  getOrFetchImage: (
    path: string,
    mimeType: string,
    channelId: string,
    key?: CryptoKey | null,
    supabaseClient?: any
  ) => Promise<string>
  revokeAllUrls: () => void
  isDecrypting: (path: string) => boolean
  getCachedUrl: (path: string) => string | undefined
}

function resolveDefaultKey(): CryptoKey | null {
  try {
    if (typeof useE2ee !== 'undefined') {
      const e2ee = useE2ee()
      return e2ee.key.value
    }
  } catch {
    // E2EE composable unavailable
  }
  return null
}

function resolveDefaultSupabase(): any {
  try {
    if (typeof useSupabaseClient !== 'undefined') {
      return useSupabaseClient()
    }
  } catch {
    // Supabase client unavailable
  }
  return null
}

export const MAX_CACHED_ATTACHMENTS = 50

export function createImageAttachmentCache(): ImageAttachmentCache {
  const cachedUrls = new Map<string, string>()
  const inFlight = new Map<string, Promise<string>>()
  const decrypting = ref<Record<string, boolean>>({})

  function isDecrypting(path: string): boolean {
    return Boolean(decrypting.value[path])
  }

  function getCachedUrl(path: string): string | undefined {
    const cached = cachedUrls.get(path)
    if (cached !== undefined) {
      cachedUrls.delete(path)
      cachedUrls.set(path, cached)
    }
    return cached
  }

  async function getOrFetchImage(
    path: string,
    mimeType: string,
    channelId: string,
    key?: CryptoKey | null,
    supabaseClient?: any
  ): Promise<string> {
    if (!path) {
      throw new Error('Image path is required')
    }
    const resolvedKey = key || resolveDefaultKey()
    if (!resolvedKey) {
      throw new Error('Decryption key is required')
    }

    const cached = cachedUrls.get(path)
    if (cached) {
      cachedUrls.delete(path)
      cachedUrls.set(path, cached)
      return cached
    }

    const pending = inFlight.get(path)
    if (pending) {
      return pending
    }

    decrypting.value = { ...decrypting.value, [path]: true }

    const promise = (async () => {
      try {
        const client = supabaseClient || resolveDefaultSupabase()
        if (!client) {
          throw new Error('Supabase client is not available')
        }

        const { data, error } = await client.storage
          .from('message-attachments')
          .download(path)

        if (error || !data) {
          throw new Error(error?.message || `Failed to download attachment: ${path}`)
        }

        const buffer = await data.arrayBuffer()
        const encryptedBytes = new Uint8Array(buffer)

        const decryptedBytes = await decryptBinary(resolvedKey, encryptedBytes, channelId)

        const blob = new Blob([decryptedBytes], { type: mimeType })
        let objectUrl: string
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          objectUrl = URL.createObjectURL(blob)
        } else {
          objectUrl = `blob:${path}`
        }

        while (cachedUrls.size >= MAX_CACHED_ATTACHMENTS) {
          const oldestKey = cachedUrls.keys().next().value
          if (oldestKey) {
            const oldUrl = cachedUrls.get(oldestKey)
            if (oldUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
              try {
                URL.revokeObjectURL(oldUrl)
              } catch {
                // Ignore revocation errors
              }
            }
            cachedUrls.delete(oldestKey)
          } else {
            break
          }
        }

        cachedUrls.set(path, objectUrl)
        return objectUrl
      } finally {
        inFlight.delete(path)
        const next = { ...decrypting.value }
        delete next[path]
        decrypting.value = next
      }
    })()

    inFlight.set(path, promise)
    return promise
  }

  function revokeAllUrls(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const url of cachedUrls.values()) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // Ignore revocation errors
        }
      }
    }
    cachedUrls.clear()
    inFlight.clear()
    decrypting.value = {}
  }

  return {
    getOrFetchImage,
    revokeAllUrls,
    isDecrypting,
    getCachedUrl,
  }
}

const defaultCache = createImageAttachmentCache()

export function useImageAttachmentCache(): ImageAttachmentCache {
  return defaultCache
}
