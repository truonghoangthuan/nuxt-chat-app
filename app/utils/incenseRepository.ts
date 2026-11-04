import type { IncenseEvent, IncenseRepository } from '~/composables/useIncenseActivity'

interface RpcClient {
  rpc: (name: string, params: Record<string, string>) => PromiseLike<{ data: unknown; error: unknown }>
}

export function createIncenseRepository(client: RpcClient): IncenseRepository {
  return {
    async list(conversationId) {
      const { data, error } = await client.rpc('list_incense_events', { p_conversation_id: conversationId })
      if (error) throw error
      if (!Array.isArray(data)) throw new Error('Invalid incense history response')
      return data as IncenseEvent[]
    },
    async record(conversationId, clientId) {
      const { data, error } = await client.rpc('offer_incense', { p_conversation_id: conversationId, p_client_id: clientId })
      if (error) throw error
      if (!data || typeof data !== 'object' || !('id' in data)) throw new Error('Missing incense confirmation')
      return data as IncenseEvent
    },
  }
}
