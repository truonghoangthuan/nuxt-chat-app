#!/usr/bin/env node
import { webcrypto } from 'node:crypto'

const cryptoSubtle = webcrypto?.subtle || globalThis.crypto?.subtle
const getRandomValues = webcrypto?.getRandomValues
  ? webcrypto.getRandomValues.bind(webcrypto)
  : globalThis.crypto.getRandomValues.bind(globalThis.crypto)

const E2EE_ENVELOPE_PREFIX = 'e2ee:v1:'
const E2EE_VERIFIER_PLAINTEXT = 'nuxt-chat-e2ee-verifier:v1'
const E2EE_VERIFIER_AAD = 'e2ee-config'
const DEFAULT_PBKDF2_ITERATIONS = 600_000
const MIN_SECRET_PHRASE_LENGTH = 12

export function normalizeSecretPhrase(phrase) {
  return phrase.normalize('NFKC').trim()
}

export function bytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

export function base64UrlToBytes(base64Url) {
  return Buffer.from(base64Url, 'base64url')
}

export async function deriveKey(phrase, saltBase64Url, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const normalized = normalizeSecretPhrase(phrase)
  const salt = base64UrlToBytes(saltBase64Url)

  const baseKey = await cryptoSubtle.importKey(
    'raw',
    new TextEncoder().encode(normalized),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return await cryptoSubtle.deriveKey(
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

export async function encryptContent(key, plaintext, channelId) {
  const iv = new Uint8Array(12)
  getRandomValues(iv)
  const additionalData = new TextEncoder().encode(channelId)
  const plaintextBytes = new TextEncoder().encode(plaintext)

  const encrypted = await cryptoSubtle.encrypt(
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

async function main() {
  const phrase = process.argv[2]
  if (!phrase) {
    console.error('Usage: node scripts/generate-e2ee-config.mjs "<secret-phrase>"')
    process.exit(1)
  }

  const normalized = normalizeSecretPhrase(phrase)
  if (normalized.length < MIN_SECRET_PHRASE_LENGTH) {
    console.error(
      `Error: Secret phrase must be at least ${MIN_SECRET_PHRASE_LENGTH} characters after normalization.`
    )
    process.exit(1)
  }

  const saltBytes = new Uint8Array(16)
  getRandomValues(saltBytes)
  const salt = bytesToBase64Url(saltBytes)

  const key = await deriveKey(normalized, salt, DEFAULT_PBKDF2_ITERATIONS)
  const verifier = await encryptContent(key, E2EE_VERIFIER_PLAINTEXT, E2EE_VERIFIER_AAD)

  const sql = `INSERT INTO public.e2ee_config (id, salt, iterations, verifier) VALUES (1, '${salt}', ${DEFAULT_PBKDF2_ITERATIONS}, '${verifier}') ON CONFLICT (id) DO UPDATE SET salt = excluded.salt, iterations = excluded.iterations, verifier = excluded.verifier;`

  console.log(sql)
}

if (process.argv[1] && process.argv[1].endsWith('generate-e2ee-config.mjs')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
