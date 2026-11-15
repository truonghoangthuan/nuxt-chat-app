import { describe, expect, it } from 'vitest'
import { filterMessagesByKeyword } from '~/utils/chat'
import type { ChatMessage } from '~/types/chat'

const row = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, client_id: id, conversation_id: 'room', user_id: 'user',
  content, created_at: '2026-11-15T00:00:00Z', status: 'sent', ...extra,
})
const photo = (caption?: string) => JSON.stringify({
  type: 'images', images: [{ path: 'private/secret', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption,
})

describe('excluded phrase search', () => {
  it('supports exclusion alone while preserving privacy and blank-search defaults', () => {
    const rows = [row('text', 'Release ready'), row('omit', 'Old draft'),
      row('caption', photo('OLD DRAFT photo')), row('bare', photo()),
      row('deleted', 'Release ready', { deleted_at: 'now' }),
      row('locked', 'Release ready', { encryption: 'undecryptable' })]
    expect(filterMessagesByKeyword(rows, '', 'all', false, 'old draft').map(m => m.id)).toEqual(['text', 'bare'])
    expect(filterMessagesByKeyword(rows, '', 'all', false, 'secret').map(m => m.id)).toEqual(['text', 'omit', 'caption', 'bare'])
    expect(filterMessagesByKeyword(rows, '', 'all', false, '  ')).toEqual([])
  })

  it('intersects exclusions with pins and image/link filters over captions rather than metadata', () => {
    const pinned_at = '2026-11-15T01:00:00Z'
    const rows = [row('keep', photo('Plan https://example.com approved'), { pinned_at }),
      row('omit', photo('Plan https://example.com DRAFT'), { pinned_at }),
      row('unpin', photo('Plan https://example.com approved')),
      row('plain', 'Plan https://example.com approved', { pinned_at })]
    expect(filterMessagesByKeyword(rows, 'plan', 'images', true, 'draft').map(m => m.id)).toEqual(['keep'])
    expect(filterMessagesByKeyword(rows, '', 'links', true, 'draft').map(m => m.id)).toEqual(['keep', 'plain'])
    expect(filterMessagesByKeyword(rows, 'plan', 'images', true, 'secret').map(m => m.id)).toEqual(['keep', 'omit'])
    expect(filterMessagesByKeyword([row('vn', 'Một nén bình an 🕯️')], '', 'all', false, 'BÌNH AN 🕯️')).toEqual([])
  })

  it('omits a trimmed case-insensitive literal phrase from positive matches without mutating rows', () => {
    const rows = [row('keep', 'Plan release'), row('omit', 'Plan OLD DRAFT'), row('literal', 'Plan [draft].*')]
    expect(filterMessagesByKeyword(rows, 'plan', 'all', false, ' old draft ').map(m => m.id)).toEqual(['keep', 'literal'])
    expect(filterMessagesByKeyword(rows, 'plan', 'all', false, '[draft].*').map(m => m.id)).toEqual(['keep', 'omit'])
    expect(rows.map(m => m.id)).toEqual(['keep', 'omit', 'literal'])
  })
})
