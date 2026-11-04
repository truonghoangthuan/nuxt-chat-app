import { describe, it, expect, vi } from 'vitest'
import { createIncenseRepository } from '~/utils/incenseRepository'

describe('authenticated incense RPC adapter', () => {
  it('uses membership-checked RPCs with no client supplied actor or timestamp', async () => {
    const event = { id: 'event', conversation_id: 'room', user_id: 'actor' }
    const rpc = vi.fn().mockResolvedValueOnce({ data: [event], error: null }).mockResolvedValueOnce({ data: event, error: null })
    const repository = createIncenseRepository({ rpc })
    expect(await repository.list('room')).toEqual([event])
    expect(await repository.record('room', 'request')).toEqual(event)
    expect(rpc.mock.calls).toEqual([
      ['list_incense_events', { p_conversation_id: 'room' }],
      ['offer_incense', { p_conversation_id: 'room', p_client_id: 'request' }],
    ])
  })
  it('propagates schema and auth errors instead of returning fake success', async () => {
    const error = { code: 'PGRST202' }
    const repository = createIncenseRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error }) })
    await expect(repository.list('room')).rejects.toEqual(error)
    await expect(repository.record('room', 'request')).rejects.toEqual(error)
  })
})
