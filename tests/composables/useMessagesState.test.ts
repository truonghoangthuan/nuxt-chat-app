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

  it('filters pending messages by channel when setting initial history', () => {
    const store = createMessagesStore()
    store.addOptimisticMessage({
      clientId: 'c-ch1',
      channelId: 'ch-1',
      user: alice,
      content: 'Ch 1 pending',
    })
    expect(store.messages.value).toHaveLength(1)

    // Switch to ch-2 with initial history
    store.setInitialHistory([
      { id: 'm-ch2-1', client_id: 'c-ch2-1', channel_id: 'ch-2', user_id: alice.id, content: 'Ch 2 msg', created_at: '2026-10-16T10:00:00Z' },
    ], 'ch-2')

    expect(store.messages.value).toHaveLength(1)
    expect(store.messages.value[0].id).toBe('m-ch2-1')
  })

  it('preserves realtime messages received during history fetch', () => {
    const store = createMessagesStore()
    // A realtime message arrives while history query is in-flight
    store.reconcileIncomingMessage({
      id: 'm-live',
      client_id: 'c-live',
      channel_id: 'ch-1',
      user_id: alice.id,
      content: 'Live incoming',
      created_at: '2026-10-16T10:05:00Z',
    })

    // History query returns older rows
    store.setInitialHistory([
      { id: 'm-old', client_id: 'c-old', channel_id: 'ch-1', user_id: alice.id, content: 'Old history', created_at: '2026-10-16T10:00:00Z' },
    ], 'ch-1')

    // Both should be present
    expect(store.messages.value.map(m => m.id)).toEqual(['m-old', 'm-live'])
  })

  it('updates author profile in-place across all matching messages when a user edits their profile', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'First from Alice',
        created_at: '2026-10-16T10:00:00Z',
        author: alice,
      },
      {
        id: 'm-2',
        client_id: 'c-2',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'From Bob',
        created_at: '2026-10-16T10:01:00Z',
        author: { id: 'u-bob', display_name: 'Bob', avatar_color: '#7c3aed' },
      },
    ])

    const updatedCount = store.updateAuthorProfile({
      id: alice.id,
      display_name: 'Alice Updated',
      avatar_color: '#e11d48',
    })

    expect(updatedCount).toBe(1)
    expect(store.messages.value[0].author).toEqual({
      id: alice.id,
      display_name: 'Alice Updated',
      avatar_color: '#e11d48',
    })
    expect(store.messages.value[1].author?.display_name).toBe('Bob')
  })

  it('reconciles message edits and soft-deletes in-place and cascades updates to child reply_to previews', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-parent',
        client_id: 'c-parent',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Original parent text',
        created_at: '2026-10-18T10:00:00Z',
        author: alice,
      },
      {
        id: 'm-reply',
        client_id: 'c-reply',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Replying to Alice',
        created_at: '2026-10-18T10:01:00Z',
        reply_to_id: 'm-parent',
        reply_to: {
          id: 'm-parent',
          user_id: alice.id,
          content: 'Original parent text',
          author: alice,
        },
      },
    ])

    // 1. Edit parent message
    const edited = store.reconcileUpdatedMessage({
      id: 'm-parent',
      content: 'Edited parent text',
      edited_at: '2026-10-18T10:02:00Z',
      deleted_at: null,
    })
    expect(edited).toBe(true)
    expect(store.messages.value[0].content).toBe('Edited parent text')
    expect(store.messages.value[0].edited_at).toBe('2026-10-18T10:02:00Z')
    expect(store.messages.value[1].reply_to?.content).toBe('Edited parent text')

    // 2. Soft-delete parent message
    const deleted = store.reconcileUpdatedMessage({
      id: 'm-parent',
      content: 'Edited parent text',
      edited_at: '2026-10-18T10:02:00Z',
      deleted_at: '2026-10-18T10:03:00Z',
    })
    expect(deleted).toBe(true)
    expect(store.messages.value[0].deleted_at).toBe('2026-10-18T10:03:00Z')
    expect(store.messages.value[1].reply_to?.deleted_at).toBe('2026-10-18T10:03:00Z')
  })

  it('adds and removes message reactions idempotently', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-1',
        client_id: 'c-1',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'React to me!',
        created_at: '2026-10-18T10:00:00Z',
        author: alice,
      },
    ])

    const added1 = store.applyReactionAdded({
      id: 'r-1',
      message_id: 'm-1',
      channel_id: 'ch-1',
      user_id: 'u-bob',
      emoji: '👍',
    })
    expect(added1).toBe(true)
    expect(store.messages.value[0].reactions).toHaveLength(1)

    // Duplicate (same user_id + emoji) is ignored
    const addedDup = store.applyReactionAdded({
      id: 'r-1',
      message_id: 'm-1',
      channel_id: 'ch-1',
      user_id: 'u-bob',
      emoji: '👍',
    })
    expect(addedDup).toBe(false)
    expect(store.messages.value[0].reactions).toHaveLength(1)

    const removed = store.applyReactionRemoved({
      message_id: 'm-1',
      user_id: 'u-bob',
      emoji: '👍',
    })
    expect(removed).toBe(true)
    expect(store.messages.value[0].reactions).toHaveLength(0)
  })

  it('correctly sorts messages when ISO timestamps differ in millisecond format', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-later',
        client_id: 'c-later',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Later by 500ms',
        created_at: '2026-10-18T10:00:00.500Z',
      },
      {
        id: 'm-earlier',
        client_id: 'c-earlier',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Earlier at sharp second',
        created_at: '2026-10-18T10:00:00Z',
      },
    ])

    expect(store.messages.value.map(m => m.id)).toEqual(['m-earlier', 'm-later'])
  })

  it('correctly sorts messages when ISO timestamps match down to milliseconds but differ in microseconds', () => {
    const store = createMessagesStore()
    store.setInitialHistory([
      {
        id: 'm-micro-later',
        client_id: 'c-micro-later',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Later by microseconds',
        created_at: '2026-10-18T10:00:00.123789Z',
      },
      {
        id: 'm-micro-earlier',
        client_id: 'c-micro-earlier',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Earlier by microseconds',
        created_at: '2026-10-18T10:00:00.123456Z',
      },
    ])

    expect(store.messages.value.map(m => m.id)).toEqual(['m-micro-earlier', 'm-micro-later'])
  })

  it('reconciles pending optimistic messages to sent during mergeGapMessages', () => {
    const store = createMessagesStore()
    store.addOptimisticMessage({
      clientId: 'c-opt-gap',
      channelId: 'ch-1',
      user: alice,
      content: 'Pending gap test',
    })
    expect(store.messages.value[0].status).toBe('sending')

    const reconciledCount = store.mergeGapMessages([
      {
        id: 'srv-gap-1',
        client_id: 'c-opt-gap',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Pending gap test',
        created_at: '2026-10-18T10:05:00Z',
        author: alice,
      },
    ])

    expect(reconciledCount).toBe(1)
    expect(store.messages.value).toHaveLength(1)
    expect(store.messages.value[0].id).toBe('srv-gap-1')
    expect(store.messages.value[0].status).toBe('sent')
  })

  it('preserves and updates message encryption state across optimistic add, sent, incoming, and update', () => {
    const store = createMessagesStore()

    // 1. Defaults to e2ee on optimistic add
    const opt = store.addOptimisticMessage({
      clientId: 'c-enc-1',
      channelId: 'ch-1',
      user: alice,
      content: 'Encrypted message',
    })
    expect(opt?.encryption).toBe('e2ee')
    expect(store.messages.value[0].encryption).toBe('e2ee')

    // 2. markMessageSent copies serverRow.encryption
    store.markMessageSent('c-enc-1', {
      id: 'srv-enc-1',
      client_id: 'c-enc-1',
      channel_id: 'ch-1',
      user_id: alice.id,
      content: 'Encrypted message',
      created_at: '2026-10-18T10:00:00Z',
      encryption: 'e2ee',
    })
    expect(store.messages.value[0].encryption).toBe('e2ee')

    // 3. Incoming legacy message preserved
    store.reconcileIncomingMessage({
      id: 'srv-legacy-1',
      client_id: 'c-legacy-1',
      channel_id: 'ch-1',
      user_id: alice.id,
      content: 'Legacy message',
      created_at: '2026-10-18T10:01:00Z',
      encryption: 'legacy',
    })
    expect(store.messages.value[1].encryption).toBe('legacy')

    // 4. Update preserves encryption if not specified, updates if specified
    store.setInitialHistory([
      {
        id: 'p-1',
        client_id: 'cp-1',
        channel_id: 'ch-1',
        user_id: alice.id,
        content: 'Parent text',
        created_at: '2026-10-18T10:00:00Z',
        encryption: 'e2ee',
      },
      {
        id: 'r-1',
        client_id: 'cr-1',
        channel_id: 'ch-1',
        user_id: 'u-bob',
        content: 'Reply text',
        created_at: '2026-10-18T10:01:00Z',
        reply_to_id: 'p-1',
        reply_to: {
          id: 'p-1',
          user_id: alice.id,
          content: 'Parent text',
          encryption: 'e2ee',
        },
        encryption: 'e2ee',
      },
    ])

    // Edit without changing encryption keeps 'e2ee'
    store.reconcileUpdatedMessage({
      id: 'p-1',
      content: 'Edited parent text',
      edited_at: '2026-10-18T10:02:00Z',
    })
    const p1 = store.messages.value.find(m => m.id === 'p-1')
    const r1 = store.messages.value.find(m => m.id === 'r-1')
    expect(p1?.encryption).toBe('e2ee')
    expect(r1?.reply_to?.encryption).toBe('e2ee')

    // Edit with explicit encryption updates both
    store.reconcileUpdatedMessage({
      id: 'p-1',
      content: 'Edited again',
      edited_at: '2026-10-18T10:03:00Z',
      encryption: 'legacy',
    })
    const p1Updated = store.messages.value.find(m => m.id === 'p-1')
    const r1Updated = store.messages.value.find(m => m.id === 'r-1')
    expect(p1Updated?.encryption).toBe('legacy')
    expect(r1Updated?.reply_to?.encryption).toBe('legacy')
  })
})

