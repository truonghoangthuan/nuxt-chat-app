import type { ImageMessagePayload } from '~/types/chat'

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
