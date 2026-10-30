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

export interface ConversationMusicSession {
  track: MusicPlaybackState | null
  queue: MusicQueueItem[]
}

const globalSessions = ref<Record<string, ConversationMusicSession>>({})
const globalActiveConversationId = ref<string | null>(null)
const globalIsTunedIn = ref<boolean>(true)
const globalCurrentTrack = ref<MusicPlaybackState | null>(null)
const globalCurrentTimeSec = ref<number>(0)
const globalDurationSec = ref<number>(0)
const globalVolume = ref<number>(80)
const globalIsMuted = ref<boolean>(false)
const globalAutoplayBlocked = ref<boolean>(false)
const globalQueue = ref<MusicQueueItem[]>([])

export function createMusicController(options: MusicControllerOptions = {}) {
  const sessions: Ref<Record<string, ConversationMusicSession>> = globalSessions
  const activeConversationId: Ref<string | null> = globalActiveConversationId
  const isTunedIn: Ref<boolean> = globalIsTunedIn
  const currentTrack: Ref<MusicPlaybackState | null> = globalCurrentTrack
  const currentTimeSec: Ref<number> = globalCurrentTimeSec
  const durationSec: Ref<number> = globalDurationSec
  const volume: Ref<number> = globalVolume
  const isMuted: Ref<boolean> = globalIsMuted
  const autoplayBlocked: Ref<boolean> = globalAutoplayBlocked
  const queue: Ref<MusicQueueItem[]> = globalQueue

  let isApplyingRemoteSync = false
  let fallbackTimer: any = null
  // Stream error recovery: one silent reload per track, then surface Tune in
  let errorRetried = false
  let sourceFailed = false
  let errorRetryTimer: any = null

  function clearFallbackTimer(): void {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
  }

  function resetErrorState(): void {
    errorRetried = false
    sourceFailed = false
    if (errorRetryTimer) {
      clearTimeout(errorRetryTimer)
      errorRetryTimer = null
    }
  }

  // A media element in error state never refetches on play(); re-assign the source at the room position
  function reloadSource(): void {
    const track = currentTrack.value
    if (!track) return
    sourceFailed = false
    options.onPlayerAction?.('load', {
      videoId: track.videoId,
      title: track.title,
      startSeconds: computeSyncedPosition(track),
      autoplay: track.isPlaying,
    })
  }

  function handlePlaybackError(): void {
    const track = currentTrack.value
    if (!track) return
    sourceFailed = true
    if (errorRetried) {
      autoplayBlocked.value = true
      return
    }
    errorRetried = true
    const failedVideoId = track.videoId
    errorRetryTimer = setTimeout(() => {
      errorRetryTimer = null
      if (currentTrack.value?.videoId === failedVideoId) reloadSource()
    }, 1500)
  }

  function resetPlaybackError(): void {
    resetErrorState()
  }

  function switchConversation(conversationId: string | null): void {
    if (activeConversationId.value === conversationId) return

    if (activeConversationId.value && isTunedIn.value) {
      options.onPlayerAction?.('pause')
    }

    activeConversationId.value = conversationId
    isTunedIn.value = true

    if (conversationId) {
      if (!sessions.value[conversationId]) {
        sessions.value[conversationId] = { track: null, queue: [] }
      }
      currentTrack.value = sessions.value[conversationId].track
      queue.value = sessions.value[conversationId].queue
    } else {
      currentTrack.value = null
      queue.value = []
    }
  }

  function leaveSession(): void {
    isTunedIn.value = false
    options.onPlayerAction?.('pause')
  }

  function joinSession(conversationId?: string): void {
    if (conversationId && conversationId !== activeConversationId.value) {
      switchConversation(conversationId)
    }
    isTunedIn.value = true
    const track = currentTrack.value
    if (track) {
      const syncedPos = computeSyncedPosition(track)
      options.onPlayerAction?.('load', {
        videoId: track.videoId,
        title: track.title,
        startSeconds: syncedPos,
        autoplay: track.isPlaying,
      })
      if (track.isPlaying) {
        options.onPlayerAction?.('play')
      }
    }
  }

  function playTrackInternal(
    track: YouTubeSearchResult,
    conversationId: string,
    queueItemId?: string,
    startedByOverride?: string,
  ): void {
    clearFallbackTimer()
    resetErrorState()
    const userId = options.getCurrentUserId?.()
    const userName = startedByOverride || options.getCurrentUserName?.() || 'Someone'

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

    if (conversationId) {
      if (!sessions.value[conversationId]) {
        sessions.value[conversationId] = { track: null, queue: [] }
      }
      sessions.value[conversationId].track = newState
    }

    currentTrack.value = newState
    currentTimeSec.value = 0
    autoplayBlocked.value = false
    isTunedIn.value = true

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
    if (conversationId && activeConversationId.value !== conversationId) {
      activeConversationId.value = conversationId
    }
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
      addedBy: (track as any).addedBy || options.getCurrentUserName?.() || 'Someone',
    }

    const op: MusicQueueOp = { op: 'add', item, position }
    queue.value = applyQueueOp(queue.value, op)
    if (conversationId) {
      if (!sessions.value[conversationId]) {
        sessions.value[conversationId] = { track: currentTrack.value, queue: [] }
      }
      sessions.value[conversationId].queue = queue.value
    }

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
    const convId = currentTrack.value?.conversationId || activeConversationId.value
    if (convId && sessions.value[convId]) {
      sessions.value[convId].queue = queue.value
    }

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
    const convId = currentTrack.value?.conversationId || activeConversationId.value
    if (convId && sessions.value[convId]) {
      sessions.value[convId].queue = queue.value
    }

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
    const convId = currentTrack.value?.conversationId || activeConversationId.value
    if (convId && sessions.value[convId]) {
      sessions.value[convId].queue = []
    }

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
      playTrackInternal(nextItem, convId, nextItem.id, nextItem.addedBy)
    } else {
      stopPlayback(true)
    }
  }

  function handleTrackEnded(): void {
    if (queue.value.length === 0) {
      const currentActor = currentTrack.value?.actorId
      const currentUserId = options.getCurrentUserId?.()
      const isLeader = Boolean(currentActor && currentUserId && currentActor === currentUserId)
      stopPlayback(isLeader)
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
    const convId = currentTrack.value.conversationId || activeConversationId.value
    if (convId && sessions.value[convId]) {
      sessions.value[convId].track = null
      sessions.value[convId].queue = []
    }
    currentTrack.value = null
    queue.value = []
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
    if (sourceFailed) {
      reloadSource()
      return
    }
    options.onPlayerAction?.('play')
  }

  function applyRemoteSyncEvent(event: MusicSyncEvent): void {
    if (!event) return
    const currentUserId = options.getCurrentUserId?.()
    if (currentUserId && event.senderId === currentUserId) {
      return
    }

    const eventConvId = event.conversationId
    if (eventConvId) {
      if (!sessions.value[eventConvId]) {
        sessions.value[eventConvId] = { track: null, queue: [] }
      }
    }
    const isActiveRoom = !eventConvId || !activeConversationId.value || eventConvId === activeConversationId.value

    clearFallbackTimer()
    isApplyingRemoteSync = true
    try {
      if (event.type === 'queue') {
        if (eventConvId && sessions.value[eventConvId] && event.queueOp) {
          sessions.value[eventConvId].queue = applyQueueOp(sessions.value[eventConvId].queue, event.queueOp)
        }
        if (currentTrack.value && event.conversationId !== currentTrack.value.conversationId) {
          return
        }
        if (event.queueOp) {
          queue.value = applyQueueOp(queue.value, event.queueOp)
        }
      } else if (event.type === 'stop') {
        if (eventConvId && sessions.value[eventConvId]) {
          sessions.value[eventConvId].track = null
          sessions.value[eventConvId].queue = []
        }
        if (currentTrack.value && currentTrack.value.conversationId === event.conversationId) {
          currentTrack.value = null
          currentTimeSec.value = 0
          durationSec.value = 0
          autoplayBlocked.value = false
          options.onPlayerAction?.('pause')
        }
      } else if (event.type === 'play' || event.type === 'sync_state') {
        if (eventConvId && sessions.value[eventConvId]) {
          if (event.queue) {
            sessions.value[eventConvId].queue = event.queue
          }
          if (event.state?.queueItemId) {
            sessions.value[eventConvId].queue = sessions.value[eventConvId].queue.filter(item => item.id !== event.state!.queueItemId)
          }
          if (event.state) {
            sessions.value[eventConvId].track = event.state
          }
        }

        if (isActiveRoom) {
          if (event.queue) {
            queue.value = event.queue
          }
          if (event.state?.queueItemId) {
            queue.value = queue.value.filter(item => item.id !== event.state!.queueItemId)
          }
          if (event.state) {
            const syncedPos = computeSyncedPosition(event.state)
            const isSameVideo = currentTrack.value?.videoId === event.state.videoId
            const drift = Math.abs(currentTimeSec.value - syncedPos)
            currentTrack.value = event.state
            currentTimeSec.value = syncedPos

            if (isTunedIn.value) {
              if (!isSameVideo) {
                resetErrorState()
                options.onPlayerAction?.('load', {
                  videoId: event.state.videoId,
                  title: event.state.title,
                  startSeconds: syncedPos,
                  autoplay: event.state.isPlaying,
                })
              } else if (event.state.isPlaying) {
                if (drift > 2) {
                  options.onPlayerAction?.('seek', syncedPos)
                }
                options.onPlayerAction?.('play')
              } else {
                if (drift > 2) {
                  options.onPlayerAction?.('seek', syncedPos)
                }
                options.onPlayerAction?.('pause')
              }
            }
          }
        }
      } else if (event.type === 'pause') {
        if (eventConvId && sessions.value[eventConvId]?.track && sessions.value[eventConvId].track?.videoId === event.state?.videoId) {
          sessions.value[eventConvId].track = {
            ...sessions.value[eventConvId].track!,
            isPlaying: false,
            positionSec: event.state?.positionSec ?? 0,
            updatedAt: Date.now(),
          }
        }
        if (currentTrack.value && currentTrack.value.videoId === event.state?.videoId) {
          currentTrack.value = {
            ...currentTrack.value,
            isPlaying: false,
            positionSec: event.state?.positionSec ?? currentTimeSec.value,
            updatedAt: Date.now(),
          }
          if (isTunedIn.value) {
            options.onPlayerAction?.('pause')
          }
        }
      } else if (event.type === 'seek') {
        if (eventConvId && sessions.value[eventConvId]?.track && event.state) {
          sessions.value[eventConvId].track = {
            ...sessions.value[eventConvId].track!,
            positionSec: event.state.positionSec,
            updatedAt: Date.now(),
          }
        }
        if (currentTrack.value && event.state) {
          currentTimeSec.value = event.state.positionSec
          currentTrack.value = {
            ...currentTrack.value,
            positionSec: event.state.positionSec,
            updatedAt: Date.now(),
          }
          if (isTunedIn.value) {
            options.onPlayerAction?.('seek', event.state.positionSec)
          }
        }
      } else if (event.type === 'request_state') {
        const targetConv = event.conversationId
        const sessionTrack = targetConv && sessions.value[targetConv] ? sessions.value[targetConv].track : currentTrack.value
        const sessionQueue = targetConv && sessions.value[targetConv] ? sessions.value[targetConv].queue : queue.value
        if (sessionTrack && sessionTrack.conversationId === event.conversationId) {
          if (options.onBroadcast) {
            options.onBroadcast({
              type: 'sync_state',
              state: {
                ...sessionTrack,
                positionSec: targetConv === activeConversationId.value ? currentTimeSec.value : computeSyncedPosition(sessionTrack),
                updatedAt: Date.now(),
              },
              senderId: currentUserId || '',
              conversationId: event.conversationId,
              queue: sessionQueue || [],
            })
          }
        }
      }
    } finally {
      isApplyingRemoteSync = false
    }
  }

  return {
    sessions,
    activeConversationId,
    isTunedIn,
    currentTrack,
    currentTimeSec,
    durationSec,
    volume,
    isMuted,
    autoplayBlocked,
    queue,
    switchConversation,
    joinSession,
    leaveSession,
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
    handlePlaybackError,
    resetPlaybackError,
    applyRemoteSyncEvent,
  }
}

export function useMusicPlayer(options: MusicControllerOptions = {}) {
  return createMusicController(options)
}
