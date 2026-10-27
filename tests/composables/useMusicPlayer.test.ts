import { describe, it, expect, vi } from 'vitest'
import { createMusicController, computeSyncedPosition } from '~/composables/useMusicPlayer'

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
