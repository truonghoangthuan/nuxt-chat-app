import type { E2eeConfig } from '~/types/chat'

export const E2EE_ENVELOPE_PREFIX = 'e2ee:v1:'
export const E2EE_VERIFIER_PLAINTEXT = 'nuxt-chat-e2ee-verifier:v1'
export const E2EE_VERIFIER_AAD = 'e2ee-config'
export const DEFAULT_PBKDF2_ITERATIONS = 600_000
export const MIN_SECRET_PHRASE_LENGTH = 12

export function normalizeSecretPhrase(phrase: string): string {
  return phrase.normalize('NFKC').trim()
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.length
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function base64UrlToBytes(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad) {
    base64 += '='.repeat(4 - pad)
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function isEncryptedEnvelope(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string' || !value.startsWith(E2EE_ENVELOPE_PREFIX)) {
    return false
  }
  const rest = value.slice(E2EE_ENVELOPE_PREFIX.length)
  const parts = rest.split(':')
  if (parts.length !== 2) {
    return false
  }
  const [ivPart, ctPart] = parts
  if (!/^[A-Za-z0-9_-]{16}$/.test(ivPart)) {
    return false
  }
  if (!/^[A-Za-z0-9_-]{22,}$/.test(ctPart)) {
    return false
  }
  return true
}

export async function deriveKey(
  phrase: string,
  saltBase64Url: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const normalized = normalizeSecretPhrase(phrase)
  const salt = base64UrlToBytes(saltBase64Url)

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalized),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encryptContent(
  key: CryptoKey,
  plaintext: string,
  channelId: string
): Promise<string> {
  const iv = new Uint8Array(12)
  globalThis.crypto.getRandomValues(iv)
  const additionalData = new TextEncoder().encode(channelId)
  const plaintextBytes = new TextEncoder().encode(plaintext)

  const encrypted = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
    },
    key,
    plaintextBytes
  )

  const ivPart = bytesToBase64Url(iv)
  const ctPart = bytesToBase64Url(new Uint8Array(encrypted))
  return `${E2EE_ENVELOPE_PREFIX}${ivPart}:${ctPart}`
}

export async function decryptContent(
  key: CryptoKey,
  envelope: string,
  channelId: string
): Promise<string> {
  if (!envelope.startsWith(E2EE_ENVELOPE_PREFIX)) {
    throw new Error('Invalid envelope prefix')
  }
  const rest = envelope.slice(E2EE_ENVELOPE_PREFIX.length)
  const parts = rest.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid envelope structure')
  }
  const [ivPart, ctPart] = parts
  const iv = base64UrlToBytes(ivPart)
  const ciphertext = base64UrlToBytes(ctPart)
  const additionalData = new TextEncoder().encode(channelId)

  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData,
    },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
}

export async function exportKeyRaw(key: CryptoKey): Promise<string> {
  const raw = await globalThis.crypto.subtle.exportKey('raw', key)
  return bytesToBase64Url(new Uint8Array(raw))
}

export async function importKeyRaw(rawBase64Url: string): Promise<CryptoKey> {
  const rawBytes = base64UrlToBytes(rawBase64Url)
  return await globalThis.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function createPhraseConfig(
  phrase: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<{ salt: string; iterations: number; verifier: string }> {
  const saltBytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(saltBytes)
  const salt = bytesToBase64Url(saltBytes)

  const key = await deriveKey(phrase, salt, iterations)
  const verifier = await encryptContent(key, E2EE_VERIFIER_PLAINTEXT, E2EE_VERIFIER_AAD)

  return {
    salt,
    iterations,
    verifier,
  }
}

export async function verifyKeyWithConfig(
  key: CryptoKey,
  config: Pick<E2eeConfig, 'verifier'>
): Promise<boolean> {
  try {
    const plaintext = await decryptContent(key, config.verifier, E2EE_VERIFIER_AAD)
    return plaintext === E2EE_VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}
