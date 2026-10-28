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
}

const globalCurrentTrack = ref<MusicPlaybackState | null>(null)
const globalCurrentTimeSec = ref<number>(0)
const globalDurationSec = ref<number>(0)
const globalVolume = ref<number>(80)
const globalIsMuted = ref<boolean>(false)
const globalAutoplayBlocked = ref<boolean>(false)

export function createMusicController(options: MusicControllerOptions = {}) {
  const currentTrack: Ref<MusicPlaybackState | null> = globalCurrentTrack
  const currentTimeSec: Ref<number> = globalCurrentTimeSec
  const durationSec: Ref<number> = globalDurationSec
  const volume: Ref<number> = globalVolume
  const isMuted: Ref<boolean> = globalIsMuted
  const autoplayBlocked: Ref<boolean> = globalAutoplayBlocked

  let isApplyingRemoteSync = false

  function playTrack(track: YouTubeSearchResult, conversationId: string): void {
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
    }

    currentTrack.value = newState
    currentTimeSec.value = 0
    autoplayBlocked.value = false

    options.onPlayerAction?.('load', {
      videoId: track.videoId,
      title: track.title,
      startSeconds: 0,
    })

    if (options.onBroadcast && !isApplyingRemoteSync) {
      options.onBroadcast({
        type: 'play',
        state: newState,
        senderId: userId || '',
        conversationId,
      })
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

    isApplyingRemoteSync = true
    try {
      if (event.type === 'stop') {
        if (currentTrack.value && currentTrack.value.conversationId === event.conversationId) {
          currentTrack.value = null
          currentTimeSec.value = 0
          durationSec.value = 0
          autoplayBlocked.value = false
          options.onPlayerAction?.('pause')
        }
      } else if (event.type === 'play' || event.type === 'sync_state') {
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
    playTrack,
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
