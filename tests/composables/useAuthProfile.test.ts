import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { useAuthProfile, extractAuthUserId } from '~/composables/useAuthProfile'

const mockAuthUser = {
  id: '3e4b0b6f-9370-4c40-ba71-5dcec6bef736',
  email: 'testuser@example.com',
  user_metadata: {
    display_name: 'Original Name',
    avatar_color: '#0284c7',
  },
}

const mockUserRef = ref<any>(mockAuthUser)
let mockFromHandlers: any = {}

const mockSupabase = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: mockAuthUser }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
  from: vi.fn((table: string) => mockFromHandlers[table] || {}),
}

vi.stubGlobal('useSupabaseClient', () => mockSupabase)
vi.stubGlobal('useSupabaseUser', () => mockUserRef)

describe('useAuthProfile', () => {
  beforeEach(() => {
    mockUserRef.value = { ...mockAuthUser }
    mockFromHandlers = {}
    vi.clearAllMocks()
  })

  it('extracts auth user id from id or sub claims', () => {
    expect(extractAuthUserId({ id: 'u-123' })).toBe('u-123')
    expect(extractAuthUserId({ sub: 'u-456' })).toBe('u-456')
    expect(extractAuthUserId(null)).toBeNull()
  })

  it('includes email when creating fallback profile in ensureProfile', async () => {
    let upsertPayload: any = null
    mockFromHandlers.profiles = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } })),
        })),
      })),
      upsert: vi.fn((payload) => {
        upsertPayload = payload
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: payload, error: null })),
          })),
        }
      }),
    }

    const { ensureProfile } = useAuthProfile()
    const prof = await ensureProfile()

    expect(prof).not.toBeNull()
    expect(upsertPayload).not.toBeNull()
    expect(upsertPayload.email).toBe('testuser@example.com')
  })

  it('uses upsert with email in updateProfile so missing profile row does not throw PGRST116', async () => {
    let upsertCalled = false
    let upsertPayload: any = null

    mockFromHandlers.profiles = {
      upsert: vi.fn((payload) => {
        upsertCalled = true
        upsertPayload = payload
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: payload, error: null })),
          })),
        }
      }),
    }

    const { updateProfile } = useAuthProfile()
    const result = await updateProfile('New Display Name', '#0284c7', '')

    expect(result.error).toBeNull()
    expect(upsertCalled).toBe(true)
    expect(upsertPayload.display_name).toBe('New Display Name')
    expect(upsertPayload.email).toBe('testuser@example.com')
    expect(upsertPayload.id).toBe('3e4b0b6f-9370-4c40-ba71-5dcec6bef736')
  })
})
