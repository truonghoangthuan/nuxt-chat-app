import { describe, expect, it } from 'vitest'
import { safeAuthRedirectPath } from '~/utils/authRedirect'

describe('safeAuthRedirectPath', () => {
  it('preserves a local invite path and its query string', () => {
    expect(safeAuthRedirectPath('/chess?room=8b4d5f9a-3e43-4e52-9d53-2cf4e90f8a31')).toBe(
      '/chess?room=8b4d5f9a-3e43-4e52-9d53-2cf4e90f8a31',
    )
  })

  it.each([
    undefined,
    null,
    '',
    'https://attacker.example/path',
    '//attacker.example/path',
    'javascript:alert(1)',
    '/\\\\attacker.example/path',
  ])('falls back to home for an unsafe or empty redirect (%s)', (path) => {
    expect(safeAuthRedirectPath(path)).toBe('/')
  })
})
