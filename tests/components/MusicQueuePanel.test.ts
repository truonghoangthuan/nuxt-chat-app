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

    // Play now from queue removes item and emits play-now
    await items[1].find('[data-test="queue-play-now"]').trigger('click')
    expect(wrapper.emitted('remove')?.[1]).toEqual(['q-2'])
    expect(wrapper.emitted('play-now')?.[0]?.[0]).toEqual(sampleQueue[1])

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

  it('offers a shuffle action only for the queue and disables short queues', async () => {
    const wrapper = mount(MusicQueuePanel, {
      props: { open: true, queue: sampleQueue, history: sampleHistory },
    })
    const shuffle = wrapper.get('[data-test="queue-shuffle"]')
    expect(shuffle.attributes('type')).toBe('button')
    expect(shuffle.attributes('aria-label')).toBe('Shuffle upcoming songs')
    await shuffle.trigger('click')
    expect(wrapper.emitted('shuffle')).toEqual([[]])
    await wrapper.setProps({ queue: sampleQueue.slice(0, 1) })
    expect(shuffle.attributes('disabled')).toBeDefined()
    await shuffle.trigger('click')
    expect(wrapper.emitted('shuffle')).toHaveLength(1)
    await wrapper.setProps({ queue: [] })
    expect(shuffle.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    expect(wrapper.find('[data-test="queue-shuffle"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('filters loaded history by title, channel or friend without changing replay payloads', async () => {
    const wrapper = mount(MusicQueuePanel, {
      props: { open: true, queue: sampleQueue, history: sampleHistory },
    })
    expect(wrapper.find('[data-test="history-search"]').exists()).toBe(false)
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    const search = wrapper.get('[data-test="history-search"]')
    expect(search.attributes('type')).toBe('search')
    expect(search.attributes('aria-label')).toBe('Search loaded song history')
    for (const query of ['  RECENTLY  ', 'artist hist', 'cHaRlIe']) {
      await search.setValue(query)
      const rows = wrapper.findAll('[data-test="history-item"]')
      expect(rows).toHaveLength(1)
      expect(rows[0].text()).toContain(sampleHistory[0].title)
    }
    const row = wrapper.get('[data-test="history-item"]')
    await row.get('[data-test="history-play-now"]').trigger('click')
    await row.get('[data-test="history-add-next"]').trigger('click')
    await row.get('[data-test="history-add-queue"]').trigger('click')
    expect(wrapper.emitted('play-now')).toEqual([[sampleHistory[0].track]])
    expect(wrapper.emitted('queue-track')).toEqual([
      [sampleHistory[0].track, 'next'], [sampleHistory[0].track, 'end'],
    ])
    await search.setValue('legacy')
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(1)
    expect(wrapper.get('[data-test="history-play-now"]').attributes('disabled')).toBeDefined()
    expect(sampleHistory.map(item => item.messageId)).toEqual(['h-1', 'h-2'])
    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.emitted('remove')).toBeUndefined()
    expect(wrapper.emitted('clear')).toBeUndefined()
    wrapper.unmount()
  })

  it('distinguishes no matches from empty history and clears the filter without losing order', async () => {
    const wrapper = mount(MusicQueuePanel, {
      props: { open: true, queue: sampleQueue, history: sampleHistory },
    })
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    const search = wrapper.get('[data-test="history-search"]')
    await search.setValue('missing song')
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(0)
    expect(wrapper.get('[data-test="history-no-matches"]').text()).toContain('No matching songs')
    expect(wrapper.find('[data-test="history-empty"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="history-search-status"]').text()).toContain('0 of 2')
    expect(wrapper.get('[data-test="history-search-status"]').text()).toContain('loaded')
    expect(wrapper.get('[data-test="history-search-status"]').attributes('role')).toBe('status')
    await wrapper.get('[data-test="history-search-clear"]').trigger('click')
    expect((search.element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('[data-test="history-item"]').map(row => row.text())).toEqual([
      expect.stringContaining(sampleHistory[0].title), expect.stringContaining(sampleHistory[1].title),
    ])
    await search.setValue('   ')
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(2)
    await wrapper.setProps({ history: [] })
    expect(wrapper.find('[data-test="history-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="history-no-matches"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('updates filtered results as history arrives and resets on close or room changes', async () => {
    const track = { conversationId: 'room-a', videoId: 'playing', title: 'Playing', channelTitle: 'Artist', thumbnail: '', isPlaying: true, positionSec: 0, updatedAt: 0, startedBy: 'Alice' }
    const wrapper = mount(MusicQueuePanel, {
      props: { open: true, queue: sampleQueue, history: sampleHistory, currentTrack: track },
    })
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    await wrapper.get('[data-test="history-search"]').setValue('new song')
    await wrapper.setProps({ history: [...sampleHistory, { messageId: 'h-3', title: 'New Song', actorName: 'Eve' }] })
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(1)
    await wrapper.get('[data-test="tab-queue"]').trigger('click')
    expect(wrapper.findAll('[data-test="queue-item"]')).toHaveLength(2)
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    expect((wrapper.get('[data-test="history-search"]').element as HTMLInputElement).value).toBe('new song')
    await wrapper.setProps({ currentTrack: { ...track, conversationId: 'room-b' } })
    expect((wrapper.get('[data-test="history-search"]').element as HTMLInputElement).value).toBe('')
    await wrapper.get('[data-test="history-search"]').setValue('secret query')
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect((wrapper.get('[data-test="history-search"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(3)
    wrapper.unmount()
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
