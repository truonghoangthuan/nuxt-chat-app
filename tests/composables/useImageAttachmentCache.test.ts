import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'
import { decryptBinary } from '~/utils/crypto'

vi.mock('~/utils/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/crypto')>()
  return {
    ...actual,
    decryptBinary: vi.fn().mockImplementation(async (_key, bytes, _channelId) => {
      // return decrypted slice or simulated bytes
      return new Uint8Array([1, 2, 3, 4])
    }),
  }
})

describe('useImageAttachmentCache', () => {
  const fakeKey = {} as CryptoKey
  let mockSupabase: any

  beforeEach(() => {
    vi.clearAllMocks()
    const cache = useImageAttachmentCache()
    cache.revokeAllUrls()

    mockSupabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          download: vi.fn().mockResolvedValue({
            data: new Blob([new Uint8Array(40)]),
            error: null,
          }),
        }),
      },
    }

    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn((blob: Blob) => `blob:mock-${Math.random()}`)
    } else {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:mock-${Math.random()}`)
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = vi.fn()
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    }
  })

  it('returns cached blob URL on second call without re-fetching', async () => {
    const cache = useImageAttachmentCache()

    const url1 = await cache.getOrFetchImage('path/1.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
    const url2 = await cache.getOrFetchImage('path/1.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)

    expect(url1).toBe(url2)
    expect(mockSupabase.storage.from).toHaveBeenCalledTimes(1)
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('message-attachments')
  })

  it('deduplicates concurrent in-flight requests for the same image path', async () => {
    const cache = useImageAttachmentCache()

    let resolveDownload: (val: any) => void
    const downloadPromise = new Promise((resolve) => {
      resolveDownload = resolve
    })

    mockSupabase.storage.from.mockReturnValue({
      download: vi.fn().mockReturnValue(downloadPromise),
    })

    const p1 = cache.getOrFetchImage('path/concurrent.enc', 'image/png', 'ch-1', fakeKey, mockSupabase)
    const p2 = cache.getOrFetchImage('path/concurrent.enc', 'image/png', 'ch-1', fakeKey, mockSupabase)

    expect(cache.isDecrypting('path/concurrent.enc')).toBe(true)

    resolveDownload!({
      data: new Blob([new Uint8Array(32)]),
      error: null,
    })

    const [url1, url2] = await Promise.all([p1, p2])

    expect(url1).toBe(url2)
    expect(mockSupabase.storage.from).toHaveBeenCalledTimes(1)
    expect(cache.isDecrypting('path/concurrent.enc')).toBe(false)
  })

  it('tracks isDecrypting state during download and decryption', async () => {
    const cache = useImageAttachmentCache()

    expect(cache.isDecrypting('path/test.enc')).toBe(false)

    const fetchPromise = cache.getOrFetchImage('path/test.enc', 'image/webp', 'ch-1', fakeKey, mockSupabase)

    expect(cache.isDecrypting('path/test.enc')).toBe(true)

    await fetchPromise

    expect(cache.isDecrypting('path/test.enc')).toBe(false)
  })

  it('revokes all object URLs and clears cache on revokeAllUrls', async () => {
    const cache = useImageAttachmentCache()

    const url1 = await cache.getOrFetchImage('path/img1.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
    const url2 = await cache.getOrFetchImage('path/img2.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)

    cache.revokeAllUrls()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url2)

    // After revoke, fetching again triggers fresh download
    await cache.getOrFetchImage('path/img1.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
    expect(mockSupabase.storage.from).toHaveBeenCalledTimes(3)
  })

  it('handles download errors and cleans up in-flight state', async () => {
    const cache = useImageAttachmentCache()

    mockSupabase.storage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Object not found' },
      }),
    })

    await expect(
      cache.getOrFetchImage('path/missing.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
    ).rejects.toThrow('Object not found')

    expect(cache.isDecrypting('path/missing.enc')).toBe(false)

    // Can retry after failure
    mockSupabase.storage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([new Uint8Array(40)]),
        error: null,
      }),
    })

    const url = await cache.getOrFetchImage('path/missing.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
    expect(url).toBeTruthy()
  })

  it('handles decryption failure and cleans up in-flight state', async () => {
    const cache = useImageAttachmentCache()

    vi.mocked(decryptBinary).mockRejectedValueOnce(new Error('Decryption tag mismatch'))

    await expect(
      cache.getOrFetchImage('path/corrupted.enc', 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
    ).rejects.toThrow('Decryption tag mismatch')

    expect(cache.isDecrypting('path/corrupted.enc')).toBe(false)
  })

  it('auto-resolves key from useE2ee when key argument is omitted', async () => {
    const cache = useImageAttachmentCache()
    vi.stubGlobal('useE2ee', () => ({ key: { value: fakeKey } }))

    const url = await cache.getOrFetchImage('path/auto-key.enc', 'image/jpeg', 'ch-1', undefined, mockSupabase)
    expect(url).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('throws if key is not provided', async () => {
    const cache = useImageAttachmentCache()

    await expect(
      cache.getOrFetchImage('path/nokey.enc', 'image/jpeg', 'ch-1', null as any, mockSupabase)
    ).rejects.toThrow('Decryption key is required')
  })

  it('evicts oldest blob URL and calls revokeObjectURL when cache exceeds capacity', async () => {
    const cache = useImageAttachmentCache()
    const urls: string[] = []

    for (let i = 1; i <= 51; i++) {
      const url = await cache.getOrFetchImage(`path/${i}.enc`, 'image/jpeg', 'ch-1', fakeKey, mockSupabase)
      urls.push(url)
    }

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(urls[0])
    expect(cache.getCachedUrl('path/1.enc')).toBeUndefined()
    expect(cache.getCachedUrl('path/51.enc')).toBe(urls[50])
  })
})
