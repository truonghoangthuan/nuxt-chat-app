import { describe, expect, it } from 'vitest'
import { filterMessagesByKeyword } from '~/utils/chat'
import type { ChatMessage } from '~/types/chat'

const row = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, client_id: id, conversation_id: 'room', user_id: 'user',
  content: 'Important plan', created_at: '2026-11-01T00:00:00Z', status: 'sent', ...extra,
})
const pinned_at = '2026-11-01T01:00:00Z'
const photo = (caption?: string) => JSON.stringify({
  type: 'images', images: [{ path: 'private/secret', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption,
})

describe('pinned message search', () => {
  it('intersects pins with image/link types and case-insensitive captions without matching metadata', () => {
    const rows = [row('normal'), row('text', { pinned_at }),
      row('photo', { pinned_at, content: photo('PLAN https://example.com') }),
      row('bare', { pinned_at, content: photo() }), row('unpin', { content: photo('Plan https://example.com') })]
    expect(filterMessagesByKeyword(rows, 'plan', 'all', true).map(m => m.id)).toEqual(['text', 'photo'])
    expect(filterMessagesByKeyword(rows, '', 'images', true).map(m => m.id)).toEqual(['photo', 'bare'])
    expect(filterMessagesByKeyword(rows, '', 'links', true).map(m => m.id)).toEqual(['photo'])
    expect(filterMessagesByKeyword(rows, 'PLAN', 'images', true).map(m => m.id)).toEqual(['photo'])
    expect(filterMessagesByKeyword(rows, 'secret', 'all', true)).toEqual([])
    expect(filterMessagesByKeyword(rows, 'plan').map(m => m.id)).toEqual(['normal', 'text', 'photo', 'unpin'])
  })

  it('browses only eligible pins without a keyword and leaves default search inactive', () => {
    const rows = [row('plain'), row('null', { pinned_at: null }), row('pin', { pinned_at }),
      row('image', { pinned_at, content: photo() }),
      row('deleted', { pinned_at, deleted_at: 'now' }),
      row('locked', { pinned_at, encryption: 'undecryptable' })]
    expect(filterMessagesByKeyword(rows, ' ', 'all', true).map(m => m.id)).toEqual(['pin', 'image'])
    expect(filterMessagesByKeyword(rows, ' ')).toEqual([])
    expect(rows.map(m => m.id)).toEqual(['plain', 'null', 'pin', 'image', 'deleted', 'locked'])
  })
})
