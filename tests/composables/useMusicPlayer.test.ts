import { describe, it, expect, vi } from 'vitest'
import { createMusicController, computeSyncedPosition, applyQueueOp } from '~/composables/useMusicPlayer'
import type { MusicQueueItem } from '~/types/chat'

describe('applyQueueOp', () => {
  const itemA: MusicQueueItem = {
    id: 'item-1',
    videoId: 'vid-1',
    title: 'Song 1',
    channelTitle: 'Artist 1',
    thumbnail: 't1',
    addedBy: 'Alice',
  }
  const itemB: MusicQueueItem = {
    id: 'item-2',
    videoId: 'vid-2',
    title: 'Song 2',
    channelTitle: 'Artist 2',
    thumbnail: 't2',
    addedBy: 'Bob',
  }
  const itemC: MusicQueueItem = {
    id: 'item-3',
    videoId: 'vid-3',
    title: 'Song 3',
    channelTitle: 'Artist 3',
    thumbnail: 't3',
    addedBy: 'Charlie',
  }

  it('adds item to end and to next position', () => {
    let q = applyQueueOp([], { op: 'add', item: itemA, position: 'end' })
    expect(q).toEqual([itemA])

    q = applyQueueOp(q, { op: 'add', item: itemB, position: 'end' })
    expect(q).toEqual([itemA, itemB])

    q = applyQueueOp(q, { op: 'add', item: itemC, position: 'next' })
    expect(q).toEqual([itemC, itemA, itemB])
  })

  it('ignores duplicate id when adding', () => {
    const q1 = [itemA]
    const q2 = applyQueueOp(q1, { op: 'add', item: { ...itemA, title: 'Updated Song' }, position: 'end' })
    expect(q2).toEqual([itemA])
  })

  it('removes item by id', () => {
    const q = [itemA, itemB]
    const res = applyQueueOp(q, { op: 'remove', id: 'item-1' })
    expect(res).toEqual([itemB])

    const res2 = applyQueueOp(res, { op: 'remove', id: 'item-nonexistent' })
    expect(res2).toEqual([itemB])
  })

  it('moves item to new index with clamping', () => {
    const q = [itemA, itemB, itemC]
    // Move itemC from index 2 to index 0
    const res1 = applyQueueOp(q, { op: 'move', id: 'item-3', toIndex: 0 })
    expect(res1.map(x => x.id)).toEqual(['item-3', 'item-1', 'item-2'])

    // Move with clamped toIndex beyond length
    const res2 = applyQueueOp(q, { op: 'move', id: 'item-1', toIndex: 99 })
    expect(res2.map(x => x.id)).toEqual(['item-2', 'item-3', 'item-1'])

    // Move with negative toIndex clamps to 0
    const res3 = applyQueueOp(q, { op: 'move', id: 'item-2', toIndex: -5 })
    expect(res3.map(x => x.id)).toEqual(['item-2', 'item-1', 'item-3'])
  })

  it('clears queue', () => {
    const q = [itemA, itemB]
    expect(applyQueueOp(q, { op: 'clear' })).toEqual([])
  })
})

describe('useMusicPlayer controller', () => {
  it('starts playing a selected track and broadcasts play event', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      getCurrentUserId: () => 'user-1',
      getCurrentUserName: () => 'Alice',
    })

    ctrl.playTrack(
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      },
      'conv-1',
    )

    expect(ctrl.currentTrack.value?.videoId).toBe('dQw4w9WgXcQ')
    expect(ctrl.currentTrack.value?.isPlaying).toBe(true)
    expect(ctrl.currentTrack.value?.conversationId).toBe('conv-1')
    expect(onBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'play',
        conversationId: 'conv-1',
        senderId: 'user-1',
      }),
    )
  })

  it('applies remote sync events without re-broadcasting (echo prevention)', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      getCurrentUserId: () => 'user-2',
    })

    ctrl.applyRemoteSyncEvent({
      type: 'play',
      senderId: 'user-1',
      conversationId: 'conv-1',
      state: {
        conversationId: 'conv-1',
        videoId: 'jfKfPfyJRdk',
        title: 'Lofi Radio',
        channelTitle: 'Lofi Girl',
        thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/mqdefault.jpg',
        isPlaying: true,
        positionSec: 12,
        updatedAt: Date.now(),
        startedBy: 'Alice',
        actorId: 'user-1',
      },
    })

    expect(ctrl.currentTrack.value?.videoId).toBe('jfKfPfyJRdk')
    expect(onBroadcast).not.toHaveBeenCalled()
  })

  it('computes elapsed position for playing tracks', () => {
    const pos = computeSyncedPosition(
      {
        conversationId: 'conv-1',
        videoId: 'abc',
        title: 'Song',
        channelTitle: 'Artist',
        thumbnail: '',
        isPlaying: true,
        positionSec: 10,
        updatedAt: 1000,
        startedBy: 'Alice',
      },
      6000,
    )
    expect(pos).toBe(15)
  })
})
