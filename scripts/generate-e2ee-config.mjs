#!/usr/bin/env node
import {
  createPhraseConfig,
  normalizeSecretPhrase,
  MIN_SECRET_PHRASE_LENGTH,
  DEFAULT_PBKDF2_ITERATIONS,
} from '../app/utils/crypto.ts'

export function buildE2eeSeedSql({ salt, iterations, verifier }) {
  return `INSERT INTO public.e2ee_config (id, salt, iterations, verifier) VALUES (1, '${salt}', ${iterations}, '${verifier}') ON CONFLICT (id) DO NOTHING;`
}

export async function generateE2eeSeed(phrase) {
  const normalized = normalizeSecretPhrase(phrase)
  if (normalized.length < MIN_SECRET_PHRASE_LENGTH) {
    throw new Error(
      `Secret phrase must be at least ${MIN_SECRET_PHRASE_LENGTH} characters after normalization.`
    )
  }

  const config = await createPhraseConfig(normalized, DEFAULT_PBKDF2_ITERATIONS)
  const sql = buildE2eeSeedSql(config)

  return {
    salt: config.salt,
    iterations: config.iterations,
    verifier: config.verifier,
    sql,
  }
}

async function main() {
  const phrase = process.argv[2]
  if (!phrase) {
    console.error('Usage: node scripts/generate-e2ee-config.mjs "<secret-phrase>"')
    process.exit(1)
  }

  try {
    const { sql } = await generateE2eeSeed(phrase)
    console.log(sql)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('generate-e2ee-config.mjs') ||
  process.argv[1].endsWith('generate-e2ee-config')
)

if (isMain && !process.env.VITEST) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
