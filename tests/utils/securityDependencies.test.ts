import { describe, expect, it } from 'vitest'
import lock from '../../package-lock.json'

// Security release floors, not a substitute for a fresh npm audit or HTTP checks.
describe('Nuxt security dependency baseline', () => {
  it.each([
    ['nuxt', [4, 6, 4]],
    ['@nuxt/schema', [4, 6, 4]],
    ['@nuxt/nitro-server', [4, 6, 4]],
    ['nitropack', [2, 13, 6]],
  ] as const)('locks %s at or above its patched release', (name, minimum) => {
    const version = lock.packages[`node_modules/${name}`].version
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    const actual = version.split('.').map(Number)
    const firstDifference = actual.findIndex((part: number, index: number) => part !== minimum[index])
    expect(firstDifference === -1 || actual[firstDifference] > minimum[firstDifference], version).toBe(true)
  })
})
