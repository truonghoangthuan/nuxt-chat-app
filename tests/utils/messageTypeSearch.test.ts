import { describe, expect, it } from 'vitest'
import { filterMessagesByKeyword } from '~/utils/chat'
import type { ChatMessage } from '~/types/chat'

const row = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, client_id: id, conversation_id: 'room', user_id: 'user',
  content, created_at: '2026-11-01T00:00:00Z', status: 'sent', ...extra,
})
const photo = (caption?: string) => JSON.stringify({
  type: 'images', images: [{ path: 'https://private.example/secret', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption,
})

describe('message type search', () => {
  it('matches rendered text and caption links but not image metadata or inline code', () => {
    const rows = [row('plain', 'hello'), row('image', photo()),
      row('caption', photo('Hello https://example.com')),
      row('link', 'https://example.org Hello'), row('code', '`https://example.net`'),
      row('deleted', 'https://example.com', { deleted_at: 'now' }),
      row('locked', 'https://example.com', { encryption: 'undecryptable' })]
    expect(filterMessagesByKeyword(rows, ' ', 'links').map(m => m.id)).toEqual(['caption', 'link'])
    expect(filterMessagesByKeyword(rows, 'HELLO', 'links').map(m => m.id)).toEqual(['caption', 'link'])
    expect(filterMessagesByKeyword(rows, 'example.org', 'links').map(m => m.id)).toEqual(['link'])
    expect(rows.map(m => m.id)).toEqual(['plain', 'image', 'caption', 'link', 'code', 'deleted', 'locked'])
  })

  it('finds decrypted images without requiring a caption or keyword', () => {
    const rows = [row('plain', 'hello'), row('image', photo()), row('caption', photo('Hello')),
      row('deleted', photo(), { deleted_at: 'now' }), row('locked', photo(), { encryption: 'undecryptable' }),
      row('broken', '{"type":"images","images":null}'), row('empty', '{"type":"images","images":[]}')]
    expect(filterMessagesByKeyword(rows, '', 'images').map(m => m.id)).toEqual(['image', 'caption'])
    expect(filterMessagesByKeyword(rows, 'HELLO', 'images').map(m => m.id)).toEqual(['caption'])
    expect(filterMessagesByKeyword(rows, 'private.example', 'images')).toEqual([])
    expect(filterMessagesByKeyword(rows, '')).toEqual([])
  })
})
