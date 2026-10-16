import { describe, it, expect, vi } from 'vitest'
import { handleIncomingRealtimeMessage, isDuplicateKeyError } from '~/composables/useChatRoom'
import { extractAuthUserId } from '~/composables/useAuthProfile'
import { createMessagesStore } from '~/composables/useMessagesState'
import { createTypingTracker } from '~/composables/useTypingState'

describe('useChatRoom realtime message routing', () => {
  it('increments unread count for inactive channels and reconciles messages for active channel', () => {
    const store = createMessagesStore()
    const typing = createTypingTracker(() => 'u-me', 3000)
    const unreadCounts: Record<string, number> = {}

    typing.recordTyping({ user_id: 'u-alice', display_name: 'Alice' })

    // Message for inactive channel ch-random
    handleIncomingRealtimeMessage({
      row: {
        id: 'm-10',
        client_id: 'c-10',
        channel_id: 'ch-random',
        user_id: 'u-alice',
        content: 'Random thought',
        created_at: '2026-10-16T11:00:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
    })
    expect(unreadCounts['ch-random']).toBe(1)
    expect(store.messages.value).toHaveLength(0)

    // Message for active channel ch-general from Alice -> appends and clears Alice's typing
    handleIncomingRealtimeMessage({
      row: {
        id: 'm-11',
        client_id: 'c-11',
        channel_id: 'ch-general',
        user_id: 'u-alice',
        content: 'Hello general',
        created_at: '2026-10-16T11:01:00Z',
      },
      activeChannelId: 'ch-general',
      messagesStore: store,
      typingTracker: typing,
      unreadCounts,
    })
    expect(store.messages.value).toHaveLength(1)
    expect(typing.typingLabel.value).toBe('')
  })

  it('detects Postgres 23505 duplicate key unique constraint error for idempotent retry', () => {
    expect(isDuplicateKeyError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isDuplicateKeyError({ message: 'duplicate key value violates unique constraint "messages_client_id_key"' })).toBe(true)
    expect(isDuplicateKeyError({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    expect(isDuplicateKeyError(null)).toBe(false)
  })

  it('extracts user UUID from either JwtPayload.sub (@nuxtjs/supabase v2) or User.id', () => {
    expect(extractAuthUserId({ sub: 'uuid-from-jwt-sub' })).toBe('uuid-from-jwt-sub')
    expect(extractAuthUserId({ id: 'uuid-from-user-id' })).toBe('uuid-from-user-id')
    expect(extractAuthUserId(null)).toBeNull()
  })
})
