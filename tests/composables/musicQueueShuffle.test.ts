import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyQueueOp, createMusicController } from '~/composables/useMusicPlayer'
import type { MusicQueueItem } from '~/types/chat'

const songs: MusicQueueItem[] = ['a', 'b', 'c', 'd'].map(id => ({
  id, videoId: id, title: id, channelTitle: 'Artist', thumbnail: '', addedBy: `Friend ${id}`,
}))

afterEach(() => vi.restoreAllMocks())

describe('room queue shuffle', () => {
  it('permutes upcoming entries through compatible moves without restarting playback', () => {
    const onBroadcast = vi.fn()
    const onPlayerAction = vi.fn()
    const ctrl = createMusicController({ onBroadcast, onPlayerAction, getCurrentUserId: () => 'me' })
    ctrl.stopPlayback(false)
    ctrl.switchConversation('shuffle-room')
    ctrl.playTrack(songs[0], 'shuffle-room')
    ctrl.queue.value = [...songs]
    const track = ctrl.currentTrack.value
    onBroadcast.mockClear()
    onPlayerAction.mockClear()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    ctrl.shuffleQueue()

    expect(ctrl.queue.value.map(item => item.id)).toEqual(['b', 'c', 'd', 'a'])
    expect(ctrl.queue.value).toEqual([songs[1], songs[2], songs[3], songs[0]])
    expect(ctrl.currentTrack.value).toBe(track)
    expect(onPlayerAction).not.toHaveBeenCalled()
    expect(onBroadcast).toHaveBeenCalledTimes(3)
    let peerQueue = [...songs]
    for (const [event] of onBroadcast.mock.calls) {
      expect(event).toMatchObject({ type: 'queue', senderId: 'me', conversationId: 'shuffle-room', queueOp: { op: 'move' } })
      peerQueue = applyQueueOp(peerQueue, event.queueOp)
    }
    expect(peerQueue).toEqual(ctrl.queue.value)
    expect(ctrl.sessions.value['shuffle-room'].queue).toEqual(peerQueue)
    ctrl.switchConversation('other-room')
    expect(ctrl.queue.value).toEqual([])
    const moves = onBroadcast.mock.calls.map(([event]) => ({ ...event, senderId: 'peer' }))
    ctrl.sessions.value['shuffle-room'].queue = [...songs]
    onBroadcast.mockClear()
    for (const event of moves) ctrl.applyRemoteSyncEvent(event)
    expect(ctrl.queue.value).toEqual([])
    expect(ctrl.sessions.value['shuffle-room'].queue).toEqual(peerQueue)
    expect(onBroadcast).not.toHaveBeenCalled()
    ctrl.switchConversation('shuffle-room')
    expect(ctrl.queue.value).toEqual(peerQueue)
    ctrl.stopPlayback(false)
  })

  it('does not broadcast or mutate empty, singleton, or unchanged permutations', () => {
    const onBroadcast = vi.fn()
    const ctrl = createMusicController({ onBroadcast })
    ctrl.stopPlayback(false)
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    for (const queue of [[], [songs[0]], songs]) {
      ctrl.queue.value = [...queue]
      onBroadcast.mockClear()
      ctrl.shuffleQueue()
      expect(ctrl.queue.value).toEqual(queue)
      expect(onBroadcast).not.toHaveBeenCalled()
    }
    ctrl.stopPlayback(false)
  })
})
