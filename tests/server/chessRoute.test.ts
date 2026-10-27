import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/chess/move.post'
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { submitChessMove } from '../../server/utils/chessMove'
vi.mock('#supabase/server', () => ({ serverSupabaseUser: vi.fn(), serverSupabaseServiceRole: vi.fn() }))
vi.mock('../../server/utils/chessMove', () => ({ submitChessMove: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<any>(), readBody: vi.fn(async (event: any) => event.body) }))
const event = (origin = 'http://localhost:3000') => ({ headers: new Headers({ origin, host: 'localhost:3000' }), node: { req: { url: '/api/chess/move' } }, body: { from: 'e2', to: 'e4', actor: 'forged' } })
describe('Nitro chess trust adapter', () => {
  beforeEach(() => { vi.mocked(serverSupabaseUser).mockResolvedValue({ sub: 'verified-user' }); vi.mocked(serverSupabaseServiceRole).mockReturnValue({} as any); vi.mocked(submitChessMove).mockResolvedValue({} as any) })
  afterEach(() => vi.resetAllMocks())
  it('uses verified sub, never body actor, and the server service-role client', async () => {
    const e = event(); await handler(e as any)
    expect(submitChessMove).toHaveBeenCalledWith({}, 'verified-user', e.body)
    expect(serverSupabaseServiceRole).toHaveBeenCalledWith(e)
  })
  it('rejects missing or invalid authentication before reading privileged state', async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValueOnce(null)
    await expect(handler(event() as any)).rejects.toMatchObject({ statusCode: 401 })
    vi.mocked(serverSupabaseUser).mockRejectedValueOnce(new Error('Invalid JWT'))
    await expect(handler(event() as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(serverSupabaseServiceRole).not.toHaveBeenCalled()
    expect(submitChessMove).not.toHaveBeenCalled()
  })
  it('fails closed without a server secret', async () => {
    vi.mocked(serverSupabaseServiceRole).mockImplementationOnce(() => { throw new Error('Missing secret') })
    await expect(handler(event() as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(submitChessMove).not.toHaveBeenCalled()
  })
  it('rejects cross-origin submissions', async () => {
    await expect(handler(event('https://evil.example') as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(serverSupabaseUser).not.toHaveBeenCalled()
  })
})
