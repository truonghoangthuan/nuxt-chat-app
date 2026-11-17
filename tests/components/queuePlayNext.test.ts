import { describe, it, expect, vi } from 'vitest'
import { createMusicController, applyQueueOp } from '~/composables/useMusicPlayer'
import { mount } from '@vue/test-utils'
import MusicQueuePanel from '~/components/MusicQueuePanel.vue'
import type { MusicQueueItem } from '~/types/chat'

const queue: MusicQueueItem[] = [
  { id: 'first', videoId: 'same-video', title: 'First song', channelTitle: 'Artist', thumbnail: '', addedBy: 'Alice' },
  { id: 'middle', videoId: 'middle-video', title: 'Middle song', channelTitle: 'Artist', thumbnail: '', addedBy: 'Bob' },
  { id: 'last', videoId: 'same-video', title: 'Last song', channelTitle: 'Artist', thumbnail: '', addedBy: 'Alice' },
]

describe('Prioritize an upcoming song', () => {
  it('moves the selected queue identity to the front without starting or duplicating playback', async () => {
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue, history: [] } })
    const rows = wrapper.findAll('[data-test="queue-item"]')
    const first = rows[0].get('[data-test="queue-play-next"]')
    expect(first.attributes('disabled')).toBeDefined()
    await first.trigger('click')
    expect(wrapper.emitted('move')).toBeUndefined()
    const last = rows[2].get('[data-test="queue-play-next"]')
    expect(last.attributes('type')).toBe('button')
    expect(last.attributes('aria-label')).toBe('Play Last song next')
    await last.trigger('click')
    expect(wrapper.emitted('move')).toEqual([['last', 0]])
    for (const event of ['remove', 'play-now', 'queue-track', 'shuffle', 'clear']) {
      expect(wrapper.emitted(event)).toBeUndefined()
    }
    expect(queue.map(item => item.id)).toEqual(['first', 'middle', 'last'])
    wrapper.unmount()
  })

  it('reports supplied order through filtering, queue replacement and closing', async () => {
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue, history: [] } })
    expect(wrapper.get('[data-test="queue-up-next"]').text()).toBe('Up next: First song')
    expect(wrapper.get('[data-test="queue-up-next"]').attributes('role')).toBe('status')
    await wrapper.get('[data-test="queue-search"]').setValue('last')
    const button = wrapper.get('[data-test="queue-play-next"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.emitted('move')).toEqual([['last', 0]])
    expect(wrapper.get('[data-test="queue-up-next"]').text()).toBe('Up next: First song')
    await wrapper.setProps({ queue: [queue[2], queue[0], queue[1]] })
    expect(wrapper.get('[data-test="queue-up-next"]').text()).toBe('Up next: Last song')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.emitted('move')).toHaveLength(1)
    await wrapper.setProps({ open: false })
    expect(wrapper.find('[data-test="queue-up-next"]').exists()).toBe(false)
    await wrapper.setProps({ open: true, queue: [queue[1]] })
    expect(wrapper.get('[data-test="queue-up-next"]').text()).toBe('Up next: Middle song')
    expect(wrapper.get('[data-test="queue-play-next"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ queue: [] })
    expect(wrapper.find('[data-test="queue-up-next"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="queue-play-next"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses the existing shared move operation and leaves the active player untouched', async () => {
    const onBroadcast = vi.fn()
    const onPlayerAction = vi.fn()
    const controller = createMusicController({ onBroadcast, onPlayerAction, getCurrentUserId: () => 'me' })
    controller.stopPlayback(false)
    controller.switchConversation('room-a')
    controller.playTrack(queue[1], 'room-a')
    controller.queue.value = [...queue]
    const track = controller.currentTrack.value
    onBroadcast.mockClear()
    onPlayerAction.mockClear()
    const wrapper = mount(MusicQueuePanel, {
      props: { open: true, queue: controller.queue.value, history: [], currentTrack: track, onMove: controller.moveInQueue },
    })
    try {
      await wrapper.findAll('[data-test="queue-play-next"]')[2].trigger('click')
      expect(controller.queue.value.map(item => item.id)).toEqual(['last', 'first', 'middle'])
      expect(controller.currentTrack.value).toBe(track)
      expect(onPlayerAction).not.toHaveBeenCalled()
      expect(onBroadcast).toHaveBeenCalledTimes(1)
      const event = onBroadcast.mock.calls[0][0]
      expect(event).toMatchObject({ type: 'queue', conversationId: 'room-a', queueOp: { op: 'move', id: 'last', toIndex: 0 } })
      expect(applyQueueOp(queue, event.queueOp)).toEqual(controller.queue.value)
      expect(controller.sessions.value['room-a'].queue).toEqual(controller.queue.value)
      await wrapper.setProps({ queue: controller.queue.value })
      expect(wrapper.get('[data-test="queue-up-next"]').text()).toBe('Up next: Last song')
      controller.switchConversation('room-b')
      await wrapper.setProps({ queue: controller.queue.value, currentTrack: controller.currentTrack.value })
      expect(wrapper.find('[data-test="queue-up-next"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-test="queue-item"]')).toHaveLength(0)
      await wrapper.get('[data-test="tab-history"]').trigger('click')
      expect(wrapper.find('[data-test="queue-play-next"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      controller.stopPlayback(false)
    }
  })
})
