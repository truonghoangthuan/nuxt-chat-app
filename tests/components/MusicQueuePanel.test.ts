import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MusicQueuePanel from '~/components/MusicQueuePanel.vue'
import type { MusicQueueItem } from '~/types/chat'
import type { MusicHistoryEntry } from '~/utils/chat'

describe('MusicQueuePanel.vue', () => {
  const sampleQueue: MusicQueueItem[] = [
    {
      id: 'q-1',
      videoId: 'v1',
      title: 'First In Queue',
      channelTitle: 'Artist 1',
      thumbnail: 'thumb1.jpg',
      addedBy: 'Alice',
    },
    {
      id: 'q-2',
      videoId: 'v2',
      title: 'Second In Queue',
      channelTitle: 'Artist 2',
      thumbnail: 'thumb2.jpg',
      addedBy: 'Bob',
    },
  ]

  const sampleHistory: MusicHistoryEntry[] = [
    {
      messageId: 'h-1',
      title: 'Recently Played With Track',
      actorName: 'Charlie',
      createdAt: '2026-10-28T09:00:00Z',
      track: {
        videoId: 'v-hist',
        title: 'Recently Played With Track',
        channelTitle: 'Artist Hist',
        thumbnail: 'thumb-hist.jpg',
      },
    },
    {
      messageId: 'h-2',
      title: 'Old Legacy Song Without Track',
      actorName: 'Dave',
      createdAt: '2026-10-27T09:00:00Z',
    },
  ]

  it('renders queue items and emits remove, clear, and play-now', async () => {
    const wrapper = mount(MusicQueuePanel, {
      props: {
        open: true,
        queue: sampleQueue,
        history: sampleHistory,
        currentTrack: null,
      },
    })

    expect(wrapper.find('[data-test="music-queue-panel"]').exists()).toBe(true)
    const items = wrapper.findAll('[data-test="queue-item"]')
    expect(items.length).toBe(2)
    expect(wrapper.text()).toContain('First In Queue')
    expect(wrapper.text()).toContain('Alice')

    // Remove item
    await items[0].find('[data-test="queue-remove"]').trigger('click')
    expect(wrapper.emitted('remove')?.[0]).toEqual(['q-1'])

    // Clear queue
    await wrapper.find('[data-test="queue-clear"]').trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
  })

  it('switches to history tab and handles replay actions or disabled state for legacy items', async () => {
    const wrapper = mount(MusicQueuePanel, {
      props: {
        open: true,
        queue: sampleQueue,
        history: sampleHistory,
        currentTrack: null,
      },
    })

    await wrapper.find('[data-test="tab-history"]').trigger('click')
    const histItems = wrapper.findAll('[data-test="history-item"]')
    expect(histItems.length).toBe(2)

    // First item has track -> play-now, add-next, add-queue enabled
    const playNowBtn = histItems[0].find('[data-test="history-play-now"]')
    expect(playNowBtn.exists()).toBe(true)
    expect(playNowBtn.attributes('disabled')).toBeUndefined()
    await playNowBtn.trigger('click')
    expect(wrapper.emitted('play-now')?.[0]?.[0]).toEqual(sampleHistory[0].track)

    // Second item has no track -> replay actions disabled
    const legacyPlayBtn = histItems[1].find('[data-test="history-play-now"]')
    expect(legacyPlayBtn.attributes('disabled')).toBeDefined()
  })

  it('emits move when reorder up or down buttons are clicked', async () => {
    const wrapper = mount(MusicQueuePanel, {
      props: {
        open: true,
        queue: sampleQueue,
        history: sampleHistory,
        currentTrack: null,
      },
    })

    const items = wrapper.findAll('[data-test="queue-item"]')
    await items[0].find('[data-test="queue-move-down"]').trigger('click')
    expect(wrapper.emitted('move')?.[0]).toEqual(['q-1', 1])

    await items[1].find('[data-test="queue-move-up"]').trigger('click')
    expect(wrapper.emitted('move')?.[1]).toEqual(['q-2', 0])
  })
})
