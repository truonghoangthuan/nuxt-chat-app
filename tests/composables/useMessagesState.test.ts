import { describe, it, expect } from 'vitest'
import { createMessagesStore } from '~/composables/useMessagesState'
import type { Profile } from '~/types/chat'

const alice: Profile = { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' }

describe('useMessagesState', () => {
  it('adds an optimistic message and deduplicates when Realtime INSERT arrives before HTTP ack', () => {
    const store = createMessagesStore()
    const opt = store.addOptimisticMessage({
      clientId: 'c-1',
      channelId: 'ch-1',
      user: alice,
      content: 'Hello friends!',
      createdAt: '2026-10-16T10:00:00.000Z',
    })
    expect(opt?.status).toBe('sending')
    expect(store.messages.value).toHaveLength(1)

    // Realtime arrives first
    const outcome = store.reconcileIncomingMessage({
      id: 'srv-1',
      client_id: 'c-1',
      channel_id: 'ch-1',
      user_id: alice.id,
      content: 'Hello friends!',
      created_at: '2026-10-16T10:00:01.000Z',
      author: alice,
    })
    expect(outcome).toBe('updated')
    expect(store.messages.value).toHaveLength(1)
    expect(store.messages.value[0].id).toBe('srv-1')
    expect(store.messages.value[0].status).toBe('sent')

    // HTTP ack arrives second — still 1 message
    store.markMessageSent('c-1', {
      id: 'srv-1',
      client_id: 'c-1',
      channel_id: 'ch-1',
      user_id: alice.id,
      content: 'Hello friends!',
      created_at: '2026-10-16T10:00:01.000Z',
      author: alice,
    })
    expect(store.messages.value).toHaveLength(1)
  })

  it('rejects whitespace-only or >4000 char optimistic messages', () => {
    const store = createMessagesStore()
    expect(store.addOptimisticMessage({ clientId: 'c-empty', channelId: 'ch-1', user: alice, content: '   ' })).toBeNull()
    expect(store.messages.value).toHaveLength(0)
  })

  it('transitions failed messages to retrying and allows dismissing failed messages', () => {
    const store = createMessagesStore()
    store.addOptimisticMessage({ clientId: 'c-2', channelId: 'ch-1', user: alice, content: 'Test retry' })
    store.markMessageFailed('c-2')
    expect(store.messages.value[0].status).toBe('failed')

    const retrying = store.markMessageRetrying('c-2')
    expect(retrying?.status).toBe('sending')

    store.markMessageFailed('c-2')
    store.dismissMessage('c-2')
    expect(store.messages.value).toHaveLength(0)
  })

  it('prepends older history pages and merges reconnect gap messages without duplicates in chronological order', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      { id: 'm-3', client_id: 'c-3', channel_id: 'ch-1', user_id: alice.id, content: 'Third', created_at: '2026-10-16T10:03:00Z' },
      { id: 'm-2', client_id: 'c-2', channel_id: 'ch-1', user_id: alice.id, content: 'Second', created_at: '2026-10-16T10:02:00Z' },
    ])
    expect(store.messages.value.map(m => m.id)).toEqual(['m-2', 'm-3'])

    const addedOlder = store.prependHistoryPage([
      { id: 'm-2', client_id: 'c-2', channel_id: 'ch-1', user_id: alice.id, content: 'Second', created_at: '2026-10-16T10:02:00Z' },
      { id: 'm-1', client_id: 'c-1', channel_id: 'ch-1', user_id: alice.id, content: 'First', created_at: '2026-10-16T10:01:00Z' },
    ])
    expect(addedOlder).toBe(1)
    expect(store.messages.value.map(m => m.id)).toEqual(['m-1', 'm-2', 'm-3'])
    expect(store.getOldestCursor()).toEqual({ created_at: '2026-10-16T10:01:00Z', id: 'm-1' })

    const addedGap = store.mergeGapMessages([
      { id: 'm-3', client_id: 'c-3', channel_id: 'ch-1', user_id: alice.id, content: 'Third', created_at: '2026-10-16T10:03:00Z' },
      { id: 'm-4', client_id: 'c-4', channel_id: 'ch-1', user_id: alice.id, content: 'Fourth', created_at: '2026-10-16T10:04:00Z' },
    ])
    expect(addedGap).toBe(1)
    expect(store.messages.value.map(m => m.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-4'])
  })
})
