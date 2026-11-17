import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMusicController } from '~/composables/useMusicPlayer'
import type { MusicPlaybackState } from '~/types/chat'

const song = { videoId: 'same-video', title: 'Shared song', channelTitle: 'Artist', thumbnail: '' }
const state = (conversationId: string): MusicPlaybackState => ({
  ...song, conversationId, isPlaying: true, positionSec: 90,
  updatedAt: Date.now(), startedBy: 'Peer', actorId: 'peer',
})

describe('music conversation sync isolation', () => {
  let ctrl: ReturnType<typeof createMusicController>
  const onPlayerAction = vi.fn()
  const onBroadcast = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    ctrl = createMusicController({ onPlayerAction, onBroadcast, getCurrentUserId: () => 'local' })
    ctrl.stopPlayback(false)
    ctrl.sessions.value = {}
    ctrl.switchConversation(null)
    ctrl.switchConversation('room-A')
    ctrl.playTrack(song, 'room-A')
    ctrl.currentTimeSec.value = 12
    onPlayerAction.mockClear()
    onBroadcast.mockClear()
  })
  afterEach(() => {
    ctrl.stopPlayback(false)
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('keeps another room queue out of an idle selected room', () => {
    ctrl.stopPlayback(false)
    onPlayerAction.mockClear()
    const item = { ...song, id: 'queued-B', addedBy: 'Peer' }
    ctrl.applyRemoteSyncEvent({ type: 'queue', senderId: 'peer', conversationId: 'room-B', state: null,
      queueOp: { op: 'add', item } })
    expect(ctrl.queue.value).toEqual([])
    expect(ctrl.sessions.value['room-B'].queue).toEqual([item])
    expect(onPlayerAction).not.toHaveBeenCalled()
  })

  it('clears the active queue on a remote stop', () => {
    ctrl.enqueue(song, 'room-A')
    ctrl.applyRemoteSyncEvent({ type: 'stop', senderId: 'peer', conversationId: 'room-A', state: null })
    expect(ctrl.currentTrack.value).toBeNull()
    expect(ctrl.queue.value).toEqual([])
    expect(ctrl.sessions.value['room-A'].queue).toEqual([])
  })

  it('preserves active EOF fallback when a background event arrives', () => {
    ctrl.applyRemoteSyncEvent({ type: 'play', senderId: 'peer', conversationId: 'room-A', state: state('room-A') })
    ctrl.enqueue({ ...song, videoId: 'next-A' }, 'room-A')
    ctrl.handleTrackEnded()
    expect(vi.getTimerCount()).toBe(1)
    ctrl.applyRemoteSyncEvent({ type: 'sync_state', senderId: 'peer', conversationId: 'room-B', state: state('room-B') })
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(4000)
    expect(ctrl.currentTrack.value?.videoId).toBe('next-A')
  })

  it.each(['', 'room-B'])('rejects unscoped or mismatched state (%s)', (conversationId) => {
    const active = { ...ctrl.currentTrack.value! }
    ctrl.applyRemoteSyncEvent({ type: 'play', senderId: 'peer', conversationId, state: state('room-A') })
    expect(ctrl.currentTrack.value).toEqual(active)
    expect(ctrl.currentTimeSec.value).toBe(12)
    expect(ctrl.sessions.value['room-B']).toBeUndefined()
    expect(onPlayerAction).not.toHaveBeenCalled()
  })

  it('does not seek a replacement track after a delayed seek for the previous video', () => {
    ctrl.applyRemoteSyncEvent({ type: 'seek', senderId: 'peer', conversationId: 'room-A',
      state: { ...state('room-A'), videoId: 'old-video' } })
    expect(ctrl.sessions.value['room-A'].track?.positionSec).toBe(0)
    expect(ctrl.currentTimeSec.value).toBe(12)
    expect(onPlayerAction).not.toHaveBeenCalled()
  })

  it.each(['play', 'sync_state', 'stop'] as const)('keeps active playback and queue intact on background %s', (type) => {
    ctrl.enqueue(song, 'room-A')
    const active = { ...ctrl.currentTrack.value! }
    const queue = [...ctrl.queue.value]
    ctrl.applyRemoteSyncEvent({ type, senderId: 'peer', conversationId: 'room-B',
      state: type === 'stop' ? null : state('room-B') })
    expect(ctrl.currentTrack.value).toEqual(active)
    expect(ctrl.currentTimeSec.value).toBe(12)
    expect(ctrl.queue.value).toEqual(queue)
    expect(onPlayerAction).not.toHaveBeenCalled()
    ctrl.switchConversation('room-B')
    expect(ctrl.currentTrack.value?.conversationId ?? null).toBe(type === 'stop' ? null : 'room-B')
  })

  it('clears a stopped selected room queue even with no active track', () => {
    ctrl.currentTrack.value = null
    ctrl.queue.value = [{ ...song, id: 'stale', addedBy: 'Peer' }]
    ctrl.applyRemoteSyncEvent({ type: 'stop', senderId: 'peer', conversationId: 'room-A', state: null })
    expect(ctrl.queue.value).toEqual([])
  })

  it('caches events without starting playback when no conversation is selected', () => {
    ctrl.switchConversation(null)
    onPlayerAction.mockClear()
    ctrl.applyRemoteSyncEvent({ type: 'play', senderId: 'peer', conversationId: 'room-B', state: state('room-B') })
    expect(ctrl.currentTrack.value).toBeNull()
    expect(ctrl.sessions.value['room-B'].track?.videoId).toBe(song.videoId)
    expect(onPlayerAction).not.toHaveBeenCalled()
  })

  it('retains same-room seek, pause and echo suppression', () => {
    ctrl.applyRemoteSyncEvent({ type: 'seek', senderId: 'peer', conversationId: 'room-A', state: state('room-A') })
    expect(ctrl.currentTimeSec.value).toBe(90)
    expect(onPlayerAction).toHaveBeenCalledWith('seek', 90)
    ctrl.applyRemoteSyncEvent({ type: 'pause', senderId: 'peer', conversationId: 'room-A', state: state('room-A') })
    expect(ctrl.currentTrack.value?.isPlaying).toBe(false)
    expect(onPlayerAction).toHaveBeenCalledWith('pause')
    onPlayerAction.mockClear()
    ctrl.applyRemoteSyncEvent({ type: 'stop', senderId: 'local', conversationId: 'room-A', state: null })
    expect(ctrl.currentTrack.value).not.toBeNull()
    expect(onPlayerAction).not.toHaveBeenCalled()
    expect(onBroadcast).not.toHaveBeenCalled()
  })

  it('answers a cached room state request without cancelling the active EOF fallback', () => {
    ctrl.sessions.value['room-B'] = { track: state('room-B'), queue: [] }
    ctrl.applyRemoteSyncEvent({ type: 'play', senderId: 'peer', conversationId: 'room-A', state: state('room-A') })
    ctrl.enqueue({ ...song, videoId: 'next-A' }, 'room-A')
    ctrl.handleTrackEnded()
    onBroadcast.mockClear()
    ctrl.applyRemoteSyncEvent({ type: 'request_state', senderId: 'peer', conversationId: 'room-B', state: null })
    expect(vi.getTimerCount()).toBe(1)
    expect(onBroadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'sync_state', conversationId: 'room-B',
      state: expect.objectContaining({ conversationId: 'room-B' }) }))
  })

  it('updates room state while locally tuned out without driving the media player', () => {
    ctrl.leaveSession()
    onPlayerAction.mockClear()
    ctrl.applyRemoteSyncEvent({ type: 'seek', senderId: 'peer', conversationId: 'room-A', state: state('room-A') })
    ctrl.applyRemoteSyncEvent({ type: 'pause', senderId: 'peer', conversationId: 'room-A', state: state('room-A') })
    expect(ctrl.currentTimeSec.value).toBe(90)
    expect(ctrl.currentTrack.value?.isPlaying).toBe(false)
    expect(ctrl.isTunedIn.value).toBe(false)
    expect(onPlayerAction).not.toHaveBeenCalled()
  })

  it.each(['pause', 'seek'] as const)('caches background %s without touching the same song in the active room', (type) => {
    ctrl.sessions.value['room-B'] = { track: state('room-B'), queue: [] }
    const active = { ...ctrl.currentTrack.value! }
    ctrl.applyRemoteSyncEvent({ type, senderId: 'peer', conversationId: 'room-B', state: state('room-B') })
    expect(ctrl.currentTrack.value).toEqual(active)
    expect(ctrl.currentTimeSec.value).toBe(12)
    expect(onPlayerAction).not.toHaveBeenCalled()
    expect(onBroadcast).not.toHaveBeenCalled()
    expect(ctrl.sessions.value['room-B'].track?.positionSec).toBe(90)
    expect(ctrl.sessions.value['room-B'].track?.isPlaying).toBe(type !== 'pause')
  })
})
