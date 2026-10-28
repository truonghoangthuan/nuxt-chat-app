import { ref, type Ref } from 'vue'
import type { MusicPlaybackState, MusicSyncEvent, YouTubeSearchResult, MusicQueueItem, MusicQueueOp } from '~/types/chat'

export function computeSyncedPosition(
  state: MusicPlaybackState,
  nowMs: number = Date.now(),
): number {
  if (!state.isPlaying) {
    return state.positionSec
  }
  const elapsed = Math.max(0, (nowMs - state.updatedAt) / 1000)
  return Math.round(state.positionSec + elapsed)
}

export function applyQueueOp(
  queue: MusicQueueItem[],
  op?: MusicQueueOp | null,
): MusicQueueItem[] {
  if (!op) return queue
  switch (op.op) {
    case 'add': {
      if (queue.some(item => item.id === op.item.id)) {
        return queue
      }
      if (op.position === 'next') {
        return [op.item, ...queue]
      }
      return [...queue, op.item]
    }
    case 'remove':
      return queue.filter(item => item.id !== op.id)
    case 'move': {
      const idx = queue.findIndex(item => item.id === op.id)
      if (idx === -1) return queue
      const target = queue[idx]
      const without = queue.filter((_, i) => i !== idx)
      const clampedIndex = Math.max(0, Math.min(without.length, op.toIndex))
      const next = [...without]
      next.splice(clampedIndex, 0, target)
      return next
    }
    case 'clear':
      return []
    default:
      return queue
  }
}

export interface MusicControllerOptions {
  onBroadcast?: (event: MusicSyncEvent) => void
  getCurrentUserId?: () => string | undefined
  getCurrentUserName?: () => string | undefined
  onPlayerAction?: (action: 'play' | 'pause' | 'seek' | 'load', payload?: any) => void
  onTrackStarted?: (track: YouTubeSearchResult, conversationId: string) => void
}

const globalCurrentTrack = ref<MusicPlaybackState | null>(null)
const globalCurrentTimeSec = ref<number>(0)
const globalDurationSec = ref<number>(0)
const globalVolume = ref<number>(80)
const globalIsMuted = ref<boolean>(false)
const globalAutoplayBlocked = ref<boolean>(false)
const globalQueue = ref<MusicQueueItem[]>([])

export function createMusicController(options: MusicControllerOptions = {}) {
  const currentTrack: Ref<MusicPlaybackState | null> = globalCurrentTrack
  const currentTimeSec: Ref<number> = globalCurrentTimeSec
  const durationSec: Ref<number> = globalDurationSec
  const volume: Ref<number> = globalVolume
  const isMuted: Ref<boolean> = globalIsMuted
  const autoplayBlocked: Ref<boolean> = globalAutoplayBlocked
  const queue: Ref<MusicQueueItem[]> = globalQueue

  let isApplyingRemoteSync = false
  let fallbackTimer: any = null

  function clearFallbackTimer(): void {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  function playTrackInternal(
    track: YouTubeSearchResult,
    conversationId: string,
    queueItemId?: string,
  ): void {
    clearFallbackTimer()
    const userId = options.getCurrentUserId?.()
    const userName = options.getCurrentUserName?.() || 'Someone'

    const newState: MusicPlaybackState = {
      conversationId,
      videoId: track.videoId,
      title: track.title,
      channelTitle: track.channelTitle,
      thumbnail: track.thumbnail,
      isPlaying: true,
      positionSec: 0,
      updatedAt: Date.now(),
      startedBy: userName,
      ...(userId ? { actorId: userId } : {}),
      ...(queueItemId ? { queueItemId } : {}),
    }

    currentTrack.value = newState
    currentTimeSec.value = 0
    autoplayBlocked.value = false

    options.onPlayerAction?.('load', {
      videoId: track.videoId,
      title: track.title,
      startSeconds: 0,
    })

    if (!isApplyingRemoteSync) {
      options.onTrackStarted?.(track, conversationId)
      if (options.onBroadcast) {
        options.onBroadcast({
          type: 'play',
          state: newState,
          senderId: userId || '',
          conversationId,
        })
      }
    }
  }

  function playTrack(track: YouTubeSearchResult, conversationId: string): void {
    playTrackInternal(track, conversationId)
  }

  function enqueue(
    track: YouTubeSearchResult,
    conversationId: string,
    position: 'end' | 'next' = 'end',
  ): void {
    if (!currentTrack.value) {
      playTrack(track, conversationId)
      return
    }

    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)

    const item: MusicQueueItem = {
      ...track,
      id,
      addedBy: options.getCurrentUserName?.() || 'Someone',
    }

    const op: MusicQueueOp = { op: 'add', item, position }
    queue.value = applyQueueOp(queue.value, op)

    if (options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: 'queue',
        state: currentTrack.value,
        senderId: options.getCurrentUserId?.() || '',
        conversationId,
        queueOp: op,
      })
    }
  }

  function removeFromQueue(id: string): void {
    const op: MusicQueueOp = { op: 'remove', id }
    queue.value = applyQueueOp(queue.value, op)

    if (options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: 'queue',
        state: currentTrack.value,
        senderId: options.getCurrentUserId?.() || '',
        conversationId: currentTrack.value?.conversationId || '',
        queueOp: op,
      })
    }
  }

  function moveInQueue(id: string, toIndex: number): void {
    const op: MusicQueueOp = { op: 'move', id, toIndex }
    queue.value = applyQueueOp(queue.value, op)

    if (options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: 'queue',
        state: currentTrack.value,
        senderId: options.getCurrentUserId?.() || '',
        conversationId: currentTrack.value?.conversationId || '',
        queueOp: op,
      })
    }
  }

  function clearQueue(): void {
    const op: MusicQueueOp = { op: 'clear' }
    queue.value = []

    if (options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: 'queue',
        state: currentTrack.value,
        senderId: options.getCurrentUserId?.() || '',
        conversationId: currentTrack.value?.conversationId || '',
        queueOp: op,
      })
    }
  }

  function skipToNext(): void {
    if (queue.value.length > 0) {
      const nextItem = queue.value[0]
      queue.value = queue.value.slice(1)
      const convId = currentTrack.value?.conversationId || ''
      playTrackInternal(nextItem, convId, nextItem.id)
    } else {
      stopPlayback(true)
    }
  }

  function handleTrackEnded(): void {
    if (queue.value.length === 0) {
      stopPlayback(true)
      return
    }

    const currentActor = currentTrack.value?.actorId
    const currentUserId = options.getCurrentUserId?.()
    if (currentActor && currentUserId && currentActor === currentUserId) {
      skipToNext()
    } else {
      clearFallbackTimer()
      const expectedTrackId = currentTrack.value?.videoId
      fallbackTimer = setTimeout(() => {
        if (currentTrack.value?.videoId === expectedTrackId && queue.value.length > 0) {
          skipToNext()
        }
      }, 4000)
    }
  }

  function togglePlayPause(): void {
    if (!currentTrack.value) return
    const nextIsPlaying = !currentTrack.value.isPlaying
    const updatedState: MusicPlaybackState = {
      ...currentTrack.value,
      isPlaying: nextIsPlaying,
      positionSec: currentTimeSec.value,
      updatedAt: Date.now(),
    }
    currentTrack.value = updatedState

    options.onPlayerAction?.(nextIsPlaying ? 'play' : 'pause')

    if (options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: nextIsPlaying ? 'play' : 'pause',
        state: updatedState,
        senderId: options.getCurrentUserId?.() || '',
        conversationId: updatedState.conversationId,
      })
    }
  }

  function seekTo(seconds: number): void {
    if (!currentTrack.value) return
    const pos = Math.max(0, Math.round(seconds))
    currentTimeSec.value = pos
    const updatedState: MusicPlaybackState = {
      ...currentTrack.value,
      positionSec: pos,
      updatedAt: Date.now(),
    }
    currentTrack.value = updatedState

    options.onPlayerAction?.('seek', pos)

    if (options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: 'seek',
        state: updatedState,
        senderId: options.getCurrentUserId?.() || '',
        conversationId: updatedState.conversationId,
      })
    }
  }

  function stopPlayback(broadcast = true): void {
    clearFallbackTimer()
    if (!currentTrack.value) return
    const convId = currentTrack.value.conversationId
    currentTrack.value = null
    currentTimeSec.value = 0
    durationSec.value = 0
    autoplayBlocked.value = false

    options.onPlayerAction?.('pause')

    if (broadcast && options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: 'stop',
        state: null,
        senderId: options.getCurrentUserId?.() || '',
        conversationId: convId,
      })
    }
  }

  function setVolume(val: number): void {
    volume.value = Math.max(0, Math.min(100, Math.round(val)))
    if (volume.value > 0 && isMuted.value) {
      isMuted.value = false
    }
  }

  function toggleMute(): void {
    isMuted.value = !isMuted.value
  }

  function unblockAutoplay(): void {
    autoplayBlocked.value = false
    options.onPlayerAction?.('play')
  }

  function applyRemoteSyncEvent(event: MusicSyncEvent): void {
    if (!event) return
    const currentUserId = options.getCurrentUserId?.()
    if (currentUserId && event.senderId === currentUserId) {
      return
    }

    clearFallbackTimer()
    isApplyingRemoteSync = true
    try {
      if (event.type === 'queue') {
        if (currentTrack.value && event.conversationId !== currentTrack.value.conversationId) {
          return
        }
        if (event.queueOp) {
          queue.value = applyQueueOp(queue.value, event.queueOp)
        }
      } else if (event.type === 'stop') {
        if (currentTrack.value && currentTrack.value.conversationId === event.conversationId) {
          currentTrack.value = null
          currentTimeSec.value = 0
          durationSec.value = 0
          autoplayBlocked.value = false
          options.onPlayerAction?.('pause')
        }
      } else if (event.type === 'play' || event.type === 'sync_state') {
        if (event.queue) {
          queue.value = event.queue
        }
        if (event.state?.queueItemId) {
          queue.value = queue.value.filter(item => item.id !== event.state!.queueItemId)
        }
        if (event.state) {
          const syncedPos = computeSyncedPosition(event.state)
          const isSameVideo = currentTrack.value?.videoId === event.state.videoId
          currentTrack.value = event.state
          currentTimeSec.value = syncedPos

          if (!isSameVideo) {
            options.onPlayerAction?.('load', {
              videoId: event.state.videoId,
              title: event.state.title,
              startSeconds: syncedPos,
              autoplay: event.state.isPlaying,
            })
          } else if (event.state.isPlaying) {
            options.onPlayerAction?.('seek', syncedPos)
            options.onPlayerAction?.('play')
          } else {
            options.onPlayerAction?.('seek', syncedPos)
            options.onPlayerAction?.('pause')
          }
        }
      } else if (event.type === 'pause') {
        if (currentTrack.value && currentTrack.value.videoId === event.state?.videoId) {
          currentTrack.value = {
            ...currentTrack.value,
            isPlaying: false,
            positionSec: event.state?.positionSec ?? currentTimeSec.value,
            updatedAt: Date.now(),
          }
          options.onPlayerAction?.('pause')
        }
      } else if (event.type === 'seek') {
        if (currentTrack.value && event.state) {
          currentTimeSec.value = event.state.positionSec
          currentTrack.value = {
            ...currentTrack.value,
            positionSec: event.state.positionSec,
            updatedAt: Date.now(),
          }
          options.onPlayerAction?.('seek', event.state.positionSec)
        }
      } else if (event.type === 'request_state') {
        if (currentTrack.value && currentTrack.value.conversationId === event.conversationId) {
          if (options.onBroadcast) {
            options.onBroadcast({
              type: 'sync_state',
              state: {
                ...currentTrack.value,
                positionSec: currentTimeSec.value,
                updatedAt: Date.now(),
              },
              senderId: currentUserId || '',
              conversationId: event.conversationId,
              queue: queue.value,
            })
          }
        }
      }
    } finally {
      isApplyingRemoteSync = false
    }
  }

  return {
    currentTrack,
    currentTimeSec,
    durationSec,
    volume,
    isMuted,
    autoplayBlocked,
    queue,
    playTrack,
    enqueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    skipToNext,
    handleTrackEnded,
    togglePlayPause,
    seekTo,
    stopPlayback,
    setVolume,
    toggleMute,
    unblockAutoplay,
    applyRemoteSyncEvent,
  }
}

export function useMusicPlayer(options: MusicControllerOptions = {}) {
  return createMusicController(options)
}
