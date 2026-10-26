import { describe, it, expect } from 'vitest'
import { generateE2eeSeed } from '../../scripts/generate-e2ee-config.mjs'
import { deriveKey, verifyKeyWithConfig } from '~/utils/crypto'

describe('generate-e2ee-config script helper', () => {
  it('rejects phrases shorter than 12 characters after normalization', async () => {
    await expect(generateE2eeSeed('short')).rejects.toThrow(
      'Secret phrase must be at least 12 characters after normalization.',
    )
  })

  it('generates valid PBKDF2 salt, 600k iterations, verifier envelope, and SQL insert seed', async () => {
    const phrase = 'correct-horse-battery-staple-passphrase'
    const result = await generateE2eeSeed(phrase)

    expect(result.salt).toBeTruthy()
    expect(result.iterations).toBe(600_000)
    expect(result.verifier).toMatch(/^e2ee:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
    expect(result.sql).toContain('INSERT INTO public.e2ee_config')
    expect(result.sql).toContain(result.salt)
    expect(result.sql).toContain(result.verifier)

    // Verify key derived with same phrase unlocks the generated config
    const key = await deriveKey(phrase, result.salt, result.iterations)
    const isValid = await verifyKeyWithConfig(key, {
      salt: result.salt,
      iterations: result.iterations,
      verifier: result.verifier,
    })
    expect(isValid).toBe(true)

    // Verify wrong phrase cannot unlock the generated config
    const wrongKey = await deriveKey('completely-different-passphrase-here', result.salt, result.iterations)
    const isWrongValid = await verifyKeyWithConfig(wrongKey, {
      salt: result.salt,
      iterations: result.iterations,
      verifier: result.verifier,
    })
    expect(isWrongValid).toBe(false)
  })
})
