import { describe, it, expect } from 'vitest'
import {
  E2EE_ENVELOPE_PREFIX,
  normalizeSecretPhrase,
  isEncryptedEnvelope,
  deriveKey,
  encryptContent,
  decryptContent,
  encryptBinary,
  decryptBinary,
  exportKeyRaw,
  importKeyRaw,
  createPhraseConfig,
  verifyKeyWithConfig,
} from '~/utils/crypto'

const TEST_ITERATIONS = 1000

describe('E2EE WebCrypto utilities', () => {
  it('normalizes secret phrase with NFKC and trims outer whitespace', async () => {
    const nfd = '  caf\u0065\u0301 correct horse battery  \n'
    const nfc = 'caf\u00e9 correct horse battery'
    expect(normalizeSecretPhrase(nfd)).toBe(nfc)

    const cfg = await createPhraseConfig(nfd, TEST_ITERATIONS)
    const keyFromNfc = await deriveKey(nfc, cfg.salt, TEST_ITERATIONS)
    expect(await verifyKeyWithConfig(keyFromNfc, cfg)).toBe(true)
  })

  it('encrypts with unique random IVs and decrypts back to original UTF-8 text', async () => {
    const cfg = await createPhraseConfig('correct horse battery staple', TEST_ITERATIONS)
    const key = await deriveKey('correct horse battery staple', cfg.salt, TEST_ITERATIONS)

    const plaintext = 'Hello @Alice 👋 — secret launch at 21:00!'
    const env1 = await encryptContent(key, plaintext, 'ch-general')
    const env2 = await encryptContent(key, plaintext, 'ch-general')

    expect(env1.startsWith(E2EE_ENVELOPE_PREFIX)).toBe(true)
    expect(isEncryptedEnvelope(env1)).toBe(true)
    expect(env1).not.toBe(env2)
    expect(env1).not.toContain('secret launch')

    expect(await decryptContent(key, env1, 'ch-general')).toBe(plaintext)
    expect(await decryptContent(key, env2, 'ch-general')).toBe(plaintext)
  })

  it('rejects decryption when key is wrong or channelId AAD does not match', async () => {
    const cfg1 = await createPhraseConfig('first secret phrase 123', TEST_ITERATIONS)
    const key1 = await deriveKey('first secret phrase 123', cfg1.salt, TEST_ITERATIONS)
    const key2 = await deriveKey('second secret phrase 456', cfg1.salt, TEST_ITERATIONS)

    const env = await encryptContent(key1, 'Top secret DM', 'ch-dm-1')

    await expect(decryptContent(key2, env, 'ch-dm-1')).rejects.toThrow()
    await expect(decryptContent(key1, env, 'ch-other-channel')).rejects.toThrow()
  })

  it('exports and re-imports raw AES-GCM key for sessionStorage persistence', async () => {
    const cfg = await createPhraseConfig('session persistence phrase', TEST_ITERATIONS)
    const originalKey = await deriveKey('session persistence phrase', cfg.salt, TEST_ITERATIONS)
    const env = await encryptContent(originalKey, 'Persisted across reload', 'ch-1')

    const raw = await exportKeyRaw(originalKey)
    const restoredKey = await importKeyRaw(raw)

    expect(await verifyKeyWithConfig(restoredKey, cfg)).toBe(true)
    expect(await decryptContent(restoredKey, env, 'ch-1')).toBe('Persisted across reload')
  })

  it('detects valid e2ee:v1 envelopes vs legacy plaintext or malformed strings', () => {
    expect(isEncryptedEnvelope('Hello world')).toBe(false)
    expect(isEncryptedEnvelope('e2ee:v1:short:bad')).toBe(false)
    expect(isEncryptedEnvelope('e2ee:v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB')).toBe(true)
  })
})

describe('encryptBinary and decryptBinary', () => {
  it('encrypts and decrypts Uint8Array round-trip with channelId as AAD', async () => {
    const rawKey = new Uint8Array(32).fill(7)
    const key = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
    const original = new TextEncoder().encode('fake-image-bytes-data-stream')
    const encrypted = await encryptBinary(key, original, 'channel-123')
    expect(encrypted.byteLength).toBe(12 + original.byteLength + 16)

    const decrypted = await decryptBinary(key, encrypted, 'channel-123')
    expect(new TextDecoder().decode(decrypted)).toBe('fake-image-bytes-data-stream')
  })

  it('fails decryption if channelId does not match (cross-channel defense)', async () => {
    const rawKey = new Uint8Array(32).fill(7)
    const key = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
    const original = new TextEncoder().encode('secret-bytes')
    const encrypted = await encryptBinary(key, original, 'channel-123')

    await expect(decryptBinary(key, encrypted, 'channel-456')).rejects.toThrow()
  })

  it('fails decryption if ciphertext is tampered', async () => {
    const rawKey = new Uint8Array(32).fill(7)
    const key = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )
    const original = new TextEncoder().encode('secret-bytes')
    const encrypted = await encryptBinary(key, original, 'channel-123')
    encrypted[15] ^= 0xff

    await expect(decryptBinary(key, encrypted, 'channel-123')).rejects.toThrow()
  })
})
