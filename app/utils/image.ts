import type { EncryptedImageMetadata, ImageMessagePayload } from '~/types/chat'

export const MAX_IMAGE_COUNT = 10
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_IMAGE_BATCH_SIZE = 30 * 1024 * 1024 // 30MB
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_IMAGE_MIME_TYPES)

/**
 * Checks if the given content is a serialized ImageMessagePayload JSON string.
 */
export function isImagePayload(content: unknown): boolean {
  if (typeof content !== 'string') return false
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false

  try {
    const parsed = JSON.parse(trimmed)
    return Boolean(
      parsed &&
      typeof parsed === 'object' &&
      parsed.type === 'images' &&
      Array.isArray(parsed.images)
    )
  } catch {
    return false
  }
}

/**
 * Validates a batch of image files before processing or uploading.
 * Checks file count (1-10), allowed MIME types, individual file size (<= 10MB),
 * and total batch size (<= 30MB).
 */
export function validateImageFiles(files: File[]): { valid: boolean; error?: string } {
  if (!files || files.length === 0) {
    return {
      valid: false,
      error: 'At least one image is required.',
    }
  }

  if (files.length > MAX_IMAGE_COUNT) {
    return {
      valid: false,
      error: `Maximum ${MAX_IMAGE_COUNT} images allowed per message.`,
    }
  }

  let totalSize = 0
  for (const file of files) {
    if (!ALLOWED_MIME_SET.has(file.type)) {
      return {
        valid: false,
        error: `File "${file.name}" is not a supported image type (JPEG, PNG, WebP, GIF only).`,
      }
    }

    if (file.size > MAX_IMAGE_FILE_SIZE) {
      return {
        valid: false,
        error: `Image "${file.name}" exceeds the 10MB size limit.`,
      }
    }

    totalSize += file.size
  }

  if (totalSize > MAX_IMAGE_BATCH_SIZE) {
    return {
      valid: false,
      error: 'Total upload size exceeds the 30MB limit.',
    }
  }

  return { valid: true }
}

/**
 * Formats a user-friendly summary string for an image message payload.
 */
export function formatImageMessageSummary(count: number): string {
  return count === 1 ? '📷 1 photo' : `📷 ${count} photos`
}

/**
 * Safely parses and validates a JSON string as an ImageMessagePayload.
 * Returns null if the string is invalid or does not match the expected schema.
 */
export function parseImagePayload(content: unknown): ImageMessagePayload | null {
  if (typeof content !== 'string') return null
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.type !== 'images' ||
      !Array.isArray(parsed.images)
    ) {
      return null
    }

    const isValid = parsed.images.every(
      (img: unknown) =>
        img &&
        typeof img === 'object' &&
        typeof (img as EncryptedImageMetadata).path === 'string' &&
        Boolean((img as EncryptedImageMetadata).path) &&
        typeof (img as EncryptedImageMetadata).mimeType === 'string' &&
        Boolean((img as EncryptedImageMetadata).mimeType) &&
        typeof (img as EncryptedImageMetadata).width === 'number' &&
        typeof (img as EncryptedImageMetadata).height === 'number' &&
        typeof (img as EncryptedImageMetadata).size === 'number'
    )

    if (!isValid) return null
    return parsed as ImageMessagePayload
  } catch {
    return null
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to load image'))
    reader.readAsDataURL(file)
  })
}

/**
 * Loads an image file and downscales it proportionally if its dimensions
 * exceed maxDim. If within maxDim, returns the original file as a blob.
 */
export async function resizeImage(
  file: File,
  maxDim = 2048
): Promise<{ blob: Blob; width: number; height: number }> {
  const dataUrl = await readFileAsDataUrl(file)
  const img = new Image()

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })

  const origWidth = img.naturalWidth || img.width
  const origHeight = img.naturalHeight || img.height

  if (origWidth <= 0 || origHeight <= 0) {
    throw new Error('Failed to load image')
  }

  if (origWidth <= maxDim && origHeight <= maxDim) {
    return {
      blob: file,
      width: origWidth,
      height: origHeight,
    }
  }

  let targetWidth: number
  let targetHeight: number

  if (origWidth >= origHeight) {
    targetWidth = maxDim
    targetHeight = Math.max(1, Math.round((origHeight * maxDim) / origWidth))
  } else {
    targetHeight = maxDim
    targetWidth = Math.max(1, Math.round((origWidth * maxDim) / origHeight))
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
  }

  let blob: Blob
  if (typeof canvas.toBlob === 'function') {
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b)
          else reject(new Error('Failed to create blob from canvas'))
        },
        file.type || 'image/jpeg',
        0.85
      )
    })
  } else {
    blob = file
  }

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
  }
}
