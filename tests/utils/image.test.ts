import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateImageFiles,
  formatImageMessageSummary,
  parseImagePayload,
  isImagePayload,
  resizeImage,
} from '~/utils/image'

describe('Image utilities', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && (window as unknown as { happyDOM?: { settings: { enableImageFileLoading: boolean } } }).happyDOM?.settings) {
      (window as unknown as { happyDOM: { settings: { enableImageFileLoading: boolean } } }).happyDOM.settings.enableImageFileLoading = true
    }
  })
  describe('validateImageFiles', () => {
    it('validates file count between 1 and 10', () => {
      const empty: File[] = []
      expect(validateImageFiles(empty).valid).toBe(false)
      expect(validateImageFiles(empty).error).toBeDefined()

      const eleven = Array.from(
        { length: 11 },
        (_, i) => new File([''], `img${i}.jpg`, { type: 'image/jpeg' })
      )
      expect(validateImageFiles(eleven).valid).toBe(false)
      expect(validateImageFiles(eleven).error).toMatch(/maximum 10/i)

      const ten = Array.from(
        { length: 10 },
        (_, i) => new File(['data'], `img${i}.jpg`, { type: 'image/jpeg' })
      )
      expect(validateImageFiles(ten).valid).toBe(true)
      expect(validateImageFiles(ten).error).toBeUndefined()
    })

    it('rejects files larger than 10MB or non-image types', () => {
      const huge = [
        new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', {
          type: 'image/jpeg',
        }),
      ]
      expect(validateImageFiles(huge).valid).toBe(false)
      expect(validateImageFiles(huge).error).toMatch(/10MB/i)

      const pdf = [new File(['text'], 'doc.pdf', { type: 'application/pdf' })]
      expect(validateImageFiles(pdf).valid).toBe(false)
      expect(validateImageFiles(pdf).error).toMatch(/image/i)
    })

    it('rejects batch total exceeding 30MB', () => {
      // 4 files * 8MB = 32MB > 30MB
      const files = Array.from(
        { length: 4 },
        (_, i) =>
          new File([new Uint8Array(8 * 1024 * 1024)], `file${i}.png`, {
            type: 'image/png',
          })
      )
      const res = validateImageFiles(files)
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/30MB/i)
    })

    it('accepts allowed image types (jpeg, png, webp, gif)', () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      for (const type of validTypes) {
        const file = [new File(['fake-bytes'], 'img', { type })]
        expect(validateImageFiles(file).valid).toBe(true)
      }
    })
  })

  describe('formatImageMessageSummary', () => {
    it('formats summary label correctly', () => {
      expect(formatImageMessageSummary(1)).toBe('📷 1 photo')
      expect(formatImageMessageSummary(1, 'Sunset on the beach')).toBe('📷 1 photo: Sunset on the beach')
      expect(formatImageMessageSummary(4)).toBe('📷 4 photos')
      expect(formatImageMessageSummary(3, 'Trip highlights')).toBe('📷 3 photos: Trip highlights')
      expect(formatImageMessageSummary(0)).toBe('📷 0 photos')
      expect(formatImageMessageSummary(10)).toBe('📷 10 photos')
    })
  })

  describe('parseImagePayload', () => {
    it('parses valid image payload', () => {
      const json = JSON.stringify({
        type: 'images',
        images: [
          {
            path: 'channel/image1.enc',
            mimeType: 'image/png',
            width: 800,
            height: 600,
            size: 1024,
          },
        ],
      })
      const parsed = parseImagePayload(json)
      expect(parsed).not.toBeNull()
      expect(parsed?.type).toBe('images')
      expect(parsed?.images).toHaveLength(1)
      expect(parsed?.images[0].path).toBe('channel/image1.enc')
      expect(parsed?.images[0].mimeType).toBe('image/png')
      expect(parsed?.images[0].width).toBe(800)
      expect(parsed?.images[0].height).toBe(600)
      expect(parsed?.images[0].size).toBe(1024)
      expect(parsed?.caption).toBeUndefined()
    })

    it('parses valid image payload with caption', () => {
      const json = JSON.stringify({
        type: 'images',
        images: [
          {
            path: 'channel/image1.enc',
            mimeType: 'image/png',
            width: 800,
            height: 600,
            size: 1024,
          },
        ],
        caption: 'Beautiful sunset',
      })
      const parsed = parseImagePayload(json)
      expect(parsed).not.toBeNull()
      expect(parsed?.caption).toBe('Beautiful sunset')
    })

    it('returns null for invalid caption type', () => {
      const json = JSON.stringify({
        type: 'images',
        images: [
          {
            path: 'channel/image1.enc',
            mimeType: 'image/png',
            width: 800,
            height: 600,
            size: 1024,
          },
        ],
        caption: 12345,
      })
      expect(parseImagePayload(json)).toBeNull()
    })

    it('returns null for invalid inputs', () => {
      expect(parseImagePayload('not json')).toBeNull()
      expect(parseImagePayload('')).toBeNull()
      expect(parseImagePayload('123')).toBeNull()
      expect(parseImagePayload('{"type":"text","content":"hi"}')).toBeNull()
      expect(parseImagePayload('{"type":"images","images":"not-an-array"}')).toBeNull()
      expect(
        parseImagePayload(
          '{"type":"images","images":[{"path":"missing-other-fields"}]}'
        )
      ).toBeNull()
    })
  })

  describe('isImagePayload', () => {
    it('preserves existing isImagePayload functionality', () => {
      const valid = JSON.stringify({ type: 'images', images: [] })
      expect(isImagePayload(valid)).toBe(true)
      expect(isImagePayload('Hello world')).toBe(false)
      expect(isImagePayload(null)).toBe(false)
      expect(isImagePayload(undefined)).toBe(false)
      expect(isImagePayload('{"type":"other"}')).toBe(false)
    })
  })

  describe('resizeImage', () => {
    // 2x2 transparent PNG base64
    const png2x2Base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const png2x2Bytes = Uint8Array.from(atob(png2x2Base64), (c) => c.charCodeAt(0))

    it('returns original file as blob when already within maxDim', async () => {
      const file = new File([png2x2Bytes], 'small.png', { type: 'image/png' })
      const res = await resizeImage(file, 2048)
      expect(res.width).toBe(2)
      expect(res.height).toBe(2)
      expect(res.blob).toBe(file)
    })

    it('downscales proportionally when exceeding maxDim', async () => {
      // Mock Image to simulate a large 3000x1500 landscape image
      const originalImage = globalThis.Image
      class MockImage {
        width = 3000
        height = 1500
        naturalWidth = 3000
        naturalHeight = 1500
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
      // @ts-expect-error Mocking global Image
      globalThis.Image = MockImage

      const mockBlob = new Blob(['resized-bytes'], { type: 'image/jpeg' })
      const drawSpy = vi.fn()
      const origCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = origCreateElement(tagName)
        if (tagName === 'canvas') {
          const canvas = el as HTMLCanvasElement
          canvas.getContext = vi.fn().mockReturnValue({
            drawImage: drawSpy,
          }) as unknown as typeof canvas.getContext
          canvas.toBlob = vi.fn((callback) => {
            callback(mockBlob)
          }) as unknown as typeof canvas.toBlob
        }
        return el
      })

      try {
        const file = new File(['fake-huge-image'], 'large.jpg', {
          type: 'image/jpeg',
        })
        const res = await resizeImage(file, 2048)

        expect(res.width).toBe(2048)
        expect(res.height).toBe(1024)
        expect(drawSpy).toHaveBeenCalledWith(expect.any(Object), 0, 0, 2048, 1024)
        expect(res.blob).toBe(mockBlob)
      } finally {
        globalThis.Image = originalImage
        vi.restoreAllMocks()
      }
    })

    it('downscales portrait image proportionally', async () => {
      const originalImage = globalThis.Image
      class MockPortraitImage {
        width = 1500
        height = 3000
        naturalWidth = 1500
        naturalHeight = 3000
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
      // @ts-expect-error Mocking global Image
      globalThis.Image = MockPortraitImage

      const mockBlob = new Blob(['resized-bytes'], { type: 'image/png' })
      const drawSpy = vi.fn()
      const origCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = origCreateElement(tagName)
        if (tagName === 'canvas') {
          const canvas = el as HTMLCanvasElement
          canvas.getContext = vi.fn().mockReturnValue({
            drawImage: drawSpy,
          }) as unknown as typeof canvas.getContext
          canvas.toBlob = vi.fn((callback) => {
            callback(mockBlob)
          }) as unknown as typeof canvas.toBlob
        }
        return el
      })

      try {
        const file = new File(['fake-portrait'], 'portrait.png', {
          type: 'image/png',
        })
        const res = await resizeImage(file, 2048)

        expect(res.width).toBe(1024)
        expect(res.height).toBe(2048)
        expect(drawSpy).toHaveBeenCalledWith(expect.any(Object), 0, 0, 1024, 2048)
        expect(res.blob).toBe(mockBlob)
      } finally {
        globalThis.Image = originalImage
        vi.restoreAllMocks()
      }
    })

    it('rejects when image loading fails', async () => {
      const file = new File(['not an image'], 'corrupt.jpg', {
        type: 'image/jpeg',
      })
      await expect(resizeImage(file)).rejects.toThrow(/Failed to load image/i)
    })
  })
})
