import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPhraseConfig, deriveKey, exportKeyRaw } from '~/utils/crypto'
import { useE2ee, clearE2eeSession, E2EE_SESSION_STORAGE_KEY } from '~/composables/useE2ee'
import { useAuthProfile } from '~/composables/useAuthProfile'

const TEST_ITERATIONS = 1000
let mockConfigRow: any = null

const mockSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: mockConfigRow, error: null }),
        single: async () => ({ data: mockConfigRow, error: mockConfigRow ? null : { message: 'not found' } }),
      }),
    }),
  }),
  auth: {
    signOut: vi.fn(async () => ({ error: null })),
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
  },
}

vi.stubGlobal('useSupabaseClient', () => mockSupabase)
vi.stubGlobal('useSupabaseUser', () => ({ value: null }))

describe('useE2ee composable', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearE2eeSession()
    mockConfigRow = null
    vi.clearAllMocks()
  })

  it('transitions to unconfigured when e2ee_config row is missing', async () => {
    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('unconfigured')
    expect(e2ee.key.value).toBeNull()
  })

  it('rejects wrong phrase and unlocks + persists to sessionStorage on correct phrase', async () => {
    const cfg = await createPhraseConfig('shared friend secret phrase', TEST_ITERATIONS)
    mockConfigRow = { id: 1, ...cfg }

    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('locked')

    const badOk = await e2ee.unlockWithPhrase('wrong secret phrase 000')
    expect(badOk).toBe(false)
    expect(e2ee.status.value).toBe('locked')
    expect(e2ee.error.value).toBe('Incorrect secret phrase.')

    const goodOk = await e2ee.unlockWithPhrase('shared friend secret phrase')
    expect(goodOk).toBe(true)
    expect(e2ee.status.value).toBe('unlocked')
    expect(e2ee.key.value).not.toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeTruthy()
  })

  it('restores valid key from sessionStorage and evicts stale key after phrase rotation', async () => {
    const oldCfg = await createPhraseConfig('old secret phrase 111', TEST_ITERATIONS)
    const newCfg = await createPhraseConfig('new secret phrase 222', TEST_ITERATIONS)
    const oldKey = await deriveKey('old secret phrase 111', oldCfg.salt, TEST_ITERATIONS)
    sessionStorage.setItem(E2EE_SESSION_STORAGE_KEY, await exportKeyRaw(oldKey))

    // Matching config -> auto-unlocks
    mockConfigRow = { id: 1, ...oldCfg }
    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('unlocked')

    // Operator rotated phrase -> stale sessionStorage key is evicted and status becomes locked
    mockConfigRow = { id: 1, ...newCfg }
    await e2ee.initializeE2ee()
    expect(e2ee.status.value).toBe('locked')
    expect(e2ee.key.value).toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('clears sessionStorage and resets in-memory key on clearE2eeSession()', async () => {
    const cfg = await createPhraseConfig('shared friend secret phrase', TEST_ITERATIONS)
    mockConfigRow = { id: 1, ...cfg }

    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    await e2ee.unlockWithPhrase('shared friend secret phrase')
    expect(e2ee.status.value).toBe('unlocked')
    expect(e2ee.key.value).not.toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeTruthy()

    clearE2eeSession()
    expect(e2ee.status.value).toBe('locked')
    expect(e2ee.key.value).toBeNull()
    expect(e2ee.error.value).toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('wipes E2EE key and session storage when useAuthProfile().signOut() is called', async () => {
    const cfg = await createPhraseConfig('shared friend secret phrase', TEST_ITERATIONS)
    mockConfigRow = { id: 1, ...cfg }

    const e2ee = useE2ee()
    await e2ee.initializeE2ee()
    await e2ee.unlockWithPhrase('shared friend secret phrase')
    expect(e2ee.key.value).not.toBeNull()
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeTruthy()

    const auth = useAuthProfile()
    await auth.signOut()
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    expect(e2ee.key.value).toBeNull()
    expect(e2ee.status.value).toBe('locked')
    expect(sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)).toBeNull()
  })
})
