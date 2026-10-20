import { ref } from 'vue'
import { decryptBinary } from '~/utils/crypto'

export interface ImageAttachmentCache {
  getOrFetchImage: (
    path: string,
    mimeType: string,
    channelId: string,
    key: CryptoKey,
    supabaseClient?: any
  ) => Promise<string>
  revokeAllUrls: () => void
  isDecrypting: (path: string) => boolean
  getCachedUrl: (path: string) => string | undefined
}

export function createImageAttachmentCache(): ImageAttachmentCache {
  const cachedUrls = new Map<string, string>()
  const inFlight = new Map<string, Promise<string>>()
  const decrypting = ref<Record<string, boolean>>({})

  function isDecrypting(path: string): boolean {
    return Boolean(decrypting.value[path])
  }

  function getCachedUrl(path: string): string | undefined {
    return cachedUrls.get(path)
  }

  async function getOrFetchImage(
    path: string,
    mimeType: string,
    channelId: string,
    key: CryptoKey,
    supabaseClient?: any
  ): Promise<string> {
    if (!path) {
      throw new Error('Image path is required')
    }
    if (!key) {
      throw new Error('Decryption key is required')
    }

    const cached = cachedUrls.get(path)
    if (cached) {
      return cached
    }

    const pending = inFlight.get(path)
    if (pending) {
      return pending
    }

    decrypting.value = { ...decrypting.value, [path]: true }

    const promise = (async () => {
      try {
        const client = supabaseClient || (typeof useSupabaseClient !== 'undefined' ? useSupabaseClient() : null)
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

        const decryptedBytes = await decryptBinary(key, encryptedBytes, channelId)

        const blob = new Blob([decryptedBytes], { type: mimeType })
        let objectUrl: string
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          objectUrl = URL.createObjectURL(blob)
        } else {
          objectUrl = `blob:${path}`
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
