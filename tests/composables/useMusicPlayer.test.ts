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

  it('enqueues track when idle by starting playback immediately and notifying onTrackStarted', () => {
    const onBroadcast = vi.fn()
    const onTrackStarted = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      onTrackStarted,
      getCurrentUserId: () => 'user-1',
      getCurrentUserName: () => 'Alice',
    })
    ctrl.stopPlayback(false)
    ctrl.clearQueue()

    ctrl.enqueue(
      {
        videoId: 'v1',
        title: 'First Song',
        channelTitle: 'Artist 1',
        thumbnail: 't1',
      },
      'conv-1',
      'end',
    )

    expect(ctrl.currentTrack.value?.videoId).toBe('v1')
    expect(ctrl.queue.value).toEqual([])
    expect(onTrackStarted).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: 'v1' }),
      'conv-1',
    )
  })

  it('enqueues track while playing by appending to queue and broadcasting queue op', () => {
    const onBroadcast = vi.fn()
    const onTrackStarted = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      onTrackStarted,
      getCurrentUserId: () => 'user-1',
      getCurrentUserName: () => 'Alice',
    })

    ctrl.playTrack(
      { videoId: 'playing-1', title: 'Playing Now', channelTitle: 'Artist', thumbnail: 't' },
      'conv-1',
    )
    onBroadcast.mockClear()
    onTrackStarted.mockClear()

    ctrl.enqueue(
      { videoId: 'v2', title: 'Queued Song', channelTitle: 'Artist 2', thumbnail: 't2' },
      'conv-1',
      'end',
    )

    expect(ctrl.currentTrack.value?.videoId).toBe('playing-1')
    expect(ctrl.queue.value.length).toBe(1)
    expect(ctrl.queue.value[0].videoId).toBe('v2')
    expect(ctrl.queue.value[0].addedBy).toBe('Alice')
    expect(onTrackStarted).not.toHaveBeenCalled()
    expect(onBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'queue',
        conversationId: 'conv-1',
        queueOp: expect.objectContaining({
          op: 'add',
          position: 'end',
          item: expect.objectContaining({ videoId: 'v2' }),
        }),
      }),
    )
  })

  it('handles skipToNext: plays next queued track or stops if empty', () => {
    const onBroadcast = vi.fn()
    const onTrackStarted = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      onTrackStarted,
      getCurrentUserId: () => 'user-1',
      getCurrentUserName: () => 'Alice',
    })

    ctrl.clearQueue()
    ctrl.playTrack({ videoId: 'v1', title: 'Song 1', channelTitle: 'A1', thumbnail: 't1' }, 'conv-1')
    ctrl.enqueue({ videoId: 'v2', title: 'Song 2', channelTitle: 'A2', thumbnail: 't2' }, 'conv-1', 'end')
    expect(ctrl.queue.value.length).toBe(1)

    onTrackStarted.mockClear()
    ctrl.skipToNext()

    expect(ctrl.currentTrack.value?.videoId).toBe('v2')
    expect(ctrl.queue.value.length).toBe(0)
    expect(onTrackStarted).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: 'v2' }),
      'conv-1',
    )

    // Skip again when queue is empty -> stops
    ctrl.skipToNext()
    expect(ctrl.currentTrack.value).toBeNull()
  })

  it('applies remote queue and sync events correctly', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      getCurrentUserId: () => 'user-me',
    })
    ctrl.clearQueue()

    // Remote queue add
    ctrl.applyRemoteSyncEvent({
      type: 'queue',
      senderId: 'user-other',
      conversationId: 'conv-1',
      state: null,
      queueOp: {
        op: 'add',
        position: 'end',
        item: {
          id: 'q-item-1',
          videoId: 'vid-remote',
          title: 'Remote Song',
          channelTitle: 'Art',
          thumbnail: 't',
          addedBy: 'Bob',
        },
      },
    })
    expect(ctrl.queue.value.length).toBe(1)
    expect(ctrl.queue.value[0].id).toBe('q-item-1')

    // Remote play with queueItemId removes item from queue
    ctrl.applyRemoteSyncEvent({
      type: 'play',
      senderId: 'user-other',
      conversationId: 'conv-1',
      state: {
        conversationId: 'conv-1',
        videoId: 'vid-remote',
        title: 'Remote Song',
        channelTitle: 'Art',
        thumbnail: 't',
        isPlaying: true,
        positionSec: 0,
        updatedAt: Date.now(),
        startedBy: 'Bob',
        queueItemId: 'q-item-1',
      },
    })
    expect(ctrl.queue.value.length).toBe(0)
    expect(ctrl.currentTrack.value?.videoId).toBe('vid-remote')
  })

  it('auto-advances track on handleTrackEnded: leader advances immediately, non-leader waits with fallback', () => {
    vi.useFakeTimers()
    try {
      const onBroadcast = vi.fn()
      // Alice is the current actor
      const ctrlAlice = createMusicController({
        onBroadcast,
        getCurrentUserId: () => 'user-alice',
        getCurrentUserName: () => 'Alice',
      })
      ctrlAlice.clearQueue()
      ctrlAlice.playTrack({ videoId: 'v1', title: 'Song 1', channelTitle: 'A1', thumbnail: 't1' }, 'conv-1')
      ctrlAlice.enqueue({ videoId: 'v2', title: 'Song 2', channelTitle: 'A2', thumbnail: 't2' }, 'conv-1', 'end')

      // As leader (actorId === user-alice), ended advances immediately
      ctrlAlice.handleTrackEnded()
      expect(ctrlAlice.currentTrack.value?.videoId).toBe('v2')

      // Now test non-leader (Bob)
      const ctrlBob = createMusicController({
        onBroadcast,
        getCurrentUserId: () => 'user-bob',
        getCurrentUserName: () => 'Bob',
      })
      ctrlBob.clearQueue()
      // Bob sees currentTrack started by Alice
      ctrlBob.applyRemoteSyncEvent({
        type: 'play',
        senderId: 'user-alice',
        conversationId: 'conv-1',
        state: {
          conversationId: 'conv-1',
          videoId: 'v2',
          title: 'Song 2',
          channelTitle: 'A2',
          thumbnail: 't2',
          isPlaying: true,
          positionSec: 0,
          updatedAt: Date.now(),
          startedBy: 'Alice',
          actorId: 'user-alice',
        },
      })
      // Queue has item 3
      ctrlBob.enqueue({ videoId: 'v3', title: 'Song 3', channelTitle: 'A3', thumbnail: 't3' }, 'conv-1', 'end')

      // Non-leader handleTrackEnded doesn't advance immediately
      ctrlBob.handleTrackEnded()
      expect(ctrlBob.currentTrack.value?.videoId).toBe('v2')

      // Advancing time by 4000ms triggers fallback auto-advance
      vi.advanceTimersByTime(4000)
      expect(ctrlBob.currentTrack.value?.videoId).toBe('v3')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not reply to request_state for a different conversation (prevents room hijack)', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      getCurrentUserId: () => 'user-me',
    })
    ctrl.clearQueue()
    ctrl.playTrack({ videoId: 'v1', title: 'Song', channelTitle: 'A', thumbnail: '' }, 'conv-A')
    ctrl.enqueue({ videoId: 'v2', title: 'Song 2', channelTitle: 'A', thumbnail: '' }, 'conv-A', 'end')
    onBroadcast.mockClear()

    // Request comes in for conv-B
    ctrl.applyRemoteSyncEvent({
      type: 'request_state',
      senderId: 'user-other',
      conversationId: 'conv-B',
      state: null,
    })

    expect(onBroadcast).not.toHaveBeenCalled()
  })

  it('ignores remote queue ops for a different conversation', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({
      onBroadcast,
      getCurrentUserId: () => 'user-me',
    })
    ctrl.clearQueue()
    ctrl.playTrack({ videoId: 'v1', title: 'Song', channelTitle: 'A', thumbnail: '' }, 'conv-A')

    ctrl.applyRemoteSyncEvent({
      type: 'queue',
      senderId: 'user-other',
      conversationId: 'conv-B', // Different conversation
      state: null,
      queueOp: {
        op: 'add',
        position: 'end',
        item: {
          id: 'q-diff-room',
          videoId: 'v-diff',
          title: 'Different Room Song',
          channelTitle: 'A',
          thumbnail: '',
          addedBy: 'Bob',
        },
      },
    })

    expect(ctrl.queue.value.length).toBe(0)
  })
})

describe('useMusicPlayer playback error recovery', () => {
  const track = { videoId: 'errVid12345', title: 'Err Song', channelTitle: 'C', thumbnail: 't' }

  it('silently reloads the source once after a stream error, then shows Tune in on second error', () => {
    vi.useFakeTimers()
    try {
      const onPlayerAction = vi.fn()
      const ctrl = createMusicController({ onPlayerAction, getCurrentUserId: () => 'u1' })
      ctrl.playTrack(track, 'conv-1')
      onPlayerAction.mockClear()

      ctrl.handlePlaybackError()
      expect(ctrl.autoplayBlocked.value).toBe(false)
      vi.advanceTimersByTime(1500)
      expect(onPlayerAction).toHaveBeenCalledWith('load', expect.objectContaining({ videoId: 'errVid12345' }))

      ctrl.handlePlaybackError()
      vi.advanceTimersByTime(1500)
      expect(ctrl.autoplayBlocked.value).toBe(true)
      expect(onPlayerAction).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Tune in after a stream error reloads the source at the synced position instead of bare play', () => {
    vi.useFakeTimers()
    try {
      const onPlayerAction = vi.fn()
      const ctrl = createMusicController({ onPlayerAction, getCurrentUserId: () => 'u1' })
      ctrl.playTrack(track, 'conv-1')
      ctrl.handlePlaybackError()
      vi.advanceTimersByTime(1500)
      ctrl.handlePlaybackError()
      onPlayerAction.mockClear()

      vi.advanceTimersByTime(8500)
      ctrl.unblockAutoplay()
      expect(ctrl.autoplayBlocked.value).toBe(false)
      expect(onPlayerAction).toHaveBeenCalledWith(
        'load',
        expect.objectContaining({ videoId: 'errVid12345', startSeconds: 10 }),
      )
      expect(onPlayerAction).not.toHaveBeenCalledWith('play')
    } finally {
      vi.useRealTimers()
    }
  })

  it('Tune in without a stream error still does a plain play (autoplay policy block)', () => {
    const onPlayerAction = vi.fn()
    const ctrl = createMusicController({ onPlayerAction, getCurrentUserId: () => 'u1' })
    ctrl.playTrack(track, 'conv-1')
    onPlayerAction.mockClear()

    ctrl.autoplayBlocked.value = true
    ctrl.unblockAutoplay()
    expect(onPlayerAction).toHaveBeenCalledWith('play')
  })

  it('resets the silent retry budget when a new track loads', () => {
    vi.useFakeTimers()
    try {
      const onPlayerAction = vi.fn()
      const ctrl = createMusicController({ onPlayerAction, getCurrentUserId: () => 'u1' })
      ctrl.playTrack(track, 'conv-1')
      ctrl.handlePlaybackError()
      vi.advanceTimersByTime(1500)

      ctrl.playTrack({ ...track, videoId: 'nextVid1234' }, 'conv-1')
      onPlayerAction.mockClear()
      ctrl.handlePlaybackError()
      vi.advanceTimersByTime(1500)
      expect(ctrl.autoplayBlocked.value).toBe(false)
      expect(onPlayerAction).toHaveBeenCalledWith('load', expect.objectContaining({ videoId: 'nextVid1234' }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves addedBy user as startedBy when auto-advancing queue via skipToNext', () => {
    const player = createMusicController({
      getCurrentUserName: () => 'TriggerUser',
    })
    player.playTrack({ videoId: 'v1', title: 'Song 1', channelTitle: 'Artist 1' }, 'conv-1')
    player.enqueue({ videoId: 'v2', title: 'Song 2', channelTitle: 'Artist 2', addedBy: 'SongAdder' } as any, 'conv-1')
    player.skipToNext()
    expect(player.currentTrack.value?.startedBy).toBe('SongAdder')
  })

  it('isolates music state per conversation and allows joining and leaving session locally', () => {
    const player = createMusicController()
    player.switchConversation('conv-A')
    player.playTrack({ videoId: 'v1', title: 'Song A' }, 'conv-A')
    expect(player.currentTrack.value?.title).toBe('Song A')

    // Switch to conv-B
    player.switchConversation('conv-B')
    expect(player.currentTrack.value).toBeNull()

    // Leave session locally in conv-A
    player.switchConversation('conv-A')
    expect(player.isTunedIn.value).toBe(true)
    player.leaveSession()
    expect(player.isTunedIn.value).toBe(false)
    // verify room track is still present
    expect(player.currentTrack.value?.title).toBe('Song A')
  })
})
