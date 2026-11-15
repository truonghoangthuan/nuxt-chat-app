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

  it('searches upcoming titles, artists and friends locally with trimmed case-insensitive substrings', async () => {
    const wrapper = mount(MusicQueuePanel, {
      props: { open: true, queue: sampleQueue, history: sampleHistory },
    })
    const search = wrapper.get('[data-test="queue-search"]')
    expect(search.attributes('type')).toBe('search')
    expect(search.attributes('aria-label')).toBe('Search upcoming songs')
    for (const query of ['  SECOND  ', 'aRtIsT 2', '  bOB ']) {
      await search.setValue(query)
      expect(wrapper.findAll('[data-test="queue-item"]')).toHaveLength(1)
      expect(wrapper.get('[data-test="queue-item"]').text()).toContain('Second In Queue')
      expect(wrapper.get('[data-test="queue-search-status"]').text()).toBe('1 of 2 upcoming songs.')
    }
    expect(wrapper.get('[data-test="queue-search-status"]').attributes('role')).toBe('status')
    for (const event of ['remove', 'move', 'play-now', 'queue-track', 'clear', 'shuffle', 'close']) {
      expect(wrapper.emitted(event)).toBeUndefined()
    }
    expect(sampleQueue.map(item => item.id)).toEqual(['q-1', 'q-2'])
    wrapper.unmount()
  })

  it('distinguishes empty queue from no matches and clears literal or whitespace queries', async () => {
    const queue = [...sampleQueue, { ...sampleQueue[0], id: 'literal', title: '[Song].* 🎵', channelTitle: '', addedBy: '' }]
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue, history: [] } })
    const search = wrapper.get('[data-test="queue-search"]')
    await search.setValue('[song].*')
    expect(wrapper.findAll('[data-test="queue-item"]')).toHaveLength(1)
    await search.setValue('missing')
    expect(wrapper.get('[data-test="queue-no-matches"]').text()).toContain('Try another song, artist or friend')
    expect(wrapper.find('[data-test="queue-empty"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="queue-search-status"]').text()).toBe('0 of 3 upcoming songs.')
    await wrapper.get('[data-test="queue-search-clear"]').trigger('click')
    expect((search.element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('[data-test="queue-item"]').map(row => row.get('h4').text())).toEqual(queue.map(item => item.title))
    await search.setValue('   ')
    expect(wrapper.findAll('[data-test="queue-item"]')).toHaveLength(3)
    await wrapper.get('[data-test="queue-search-clear"]').trigger('click')
    expect(wrapper.find('[data-test="queue-search-clear"]').exists()).toBe(false)
    await search.setValue('missing')
    await wrapper.setProps({ queue: [] })
    expect(wrapper.find('[data-test="queue-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="queue-no-matches"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="queue-search-status"]').text()).toBe('0 of 0 upcoming songs.')
    wrapper.unmount()
  })

  it('keeps searches independent, recomputes queue updates and resets on close or conversation changes', async () => {
    const track = { conversationId: 'room-a', videoId: 'playing', title: 'Playing', channelTitle: 'Artist', thumbnail: '', isPlaying: true, positionSec: 0, updatedAt: 0, startedBy: 'Alice' }
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue: sampleQueue, history: sampleHistory, currentTrack: track } })
    await wrapper.get('[data-test="queue-search"]').setValue('new song')
    await wrapper.setProps({ queue: [...sampleQueue, { ...sampleQueue[0], id: 'new', title: 'New Song' }] })
    expect(wrapper.findAll('[data-test="queue-item"]')).toHaveLength(1)
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    await wrapper.get('[data-test="history-search"]').setValue('legacy')
    await wrapper.get('[data-test="tab-queue"]').trigger('click')
    expect((wrapper.get('[data-test="queue-search"]').element as HTMLInputElement).value).toBe('new song')
    await wrapper.get('[data-test="queue-search-clear"]').trigger('click')
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    expect((wrapper.get('[data-test="history-search"]').element as HTMLInputElement).value).toBe('legacy')
    await wrapper.get('[data-test="tab-queue"]').trigger('click')
    await wrapper.get('[data-test="queue-search"]').setValue('second')
    await wrapper.setProps({ currentTrack: { ...track, positionSec: 10, title: 'Another Track' } })
    expect((wrapper.get('[data-test="queue-search"]').element as HTMLInputElement).value).toBe('second')
    await wrapper.setProps({ currentTrack: { ...track, conversationId: 'room-b' } })
    expect((wrapper.get('[data-test="queue-search"]').element as HTMLInputElement).value).toBe('')
    await wrapper.get('[data-test="queue-search"]').setValue('private query')
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    expect((wrapper.get('[data-test="queue-search"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('play-now')).toBeUndefined()
    expect(wrapper.emitted('move')).toBeUndefined()
    expect(wrapper.emitted('remove')).toBeUndefined()
    expect(wrapper.props('currentTrack')).toEqual({ ...track, conversationId: 'room-b' })
    wrapper.unmount()
  })

  it('targets shared indices and identities for filtered controls, hidden neighbors and drag/drop', async () => {
    const queue = [
      { ...sampleQueue[0], id: 'first', title: 'Match' },
      { ...sampleQueue[0], id: 'hidden', title: 'Hidden' },
      { ...sampleQueue[0], id: 'middle', title: 'Match' },
      { ...sampleQueue[0], id: 'hidden-2', title: 'Hidden' },
      { ...sampleQueue[0], id: 'last', title: 'Match' },
    ]
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue, history: [] } })
    await wrapper.get('[data-test="queue-search"]').setValue('match')
    const rows = wrapper.findAll('[data-test="queue-item"]')
    expect(rows).toHaveLength(3)
    expect(rows[0].get('[data-test="queue-move-up"]').attributes('disabled')).toBeDefined()
    expect(rows[2].get('[data-test="queue-move-down"]').attributes('disabled')).toBeDefined()
    await rows[1].get('[data-test="queue-move-up"]').trigger('click')
    await rows[1].get('[data-test="queue-move-down"]').trigger('click')
    await rows[2].trigger('dragstart')
    await rows[0].trigger('drop')
    await rows[0].trigger('dragstart')
    await rows[2].trigger('drop')
    expect(wrapper.emitted('move')).toEqual([['middle', 1], ['middle', 3], ['last', 0], ['first', 4]])
    await rows[1].get('[data-test="queue-play-now"]').trigger('click')
    await rows[2].get('[data-test="queue-remove"]').trigger('click')
    expect(wrapper.emitted('play-now')).toEqual([[queue[2]]])
    expect(wrapper.emitted('remove')).toEqual([['middle'], ['last']])
    await wrapper.get('[data-test="queue-search"]').setValue('not found')
    await wrapper.get('[data-test="queue-shuffle"]').trigger('click')
    await wrapper.get('[data-test="queue-clear"]').trigger('click')
    expect(wrapper.emitted('shuffle')).toEqual([[]])
    expect(wrapper.emitted('clear')).toEqual([[]])
    expect(queue.map(item => item.id)).toEqual(['first', 'hidden', 'middle', 'hidden-2', 'last'])
    wrapper.unmount()
  })

  it('retains dragged identity across queue updates and cancels ended or closed drags', async () => {
    const queue = [sampleQueue[0], { ...sampleQueue[0], id: 'hidden', title: 'Hidden' }, sampleQueue[1]]
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue, history: [] } })
    await wrapper.get('[data-test="queue-search"]').setValue('queue')
    await wrapper.findAll('[data-test="queue-item"]')[1].trigger('dragstart')
    await wrapper.setProps({ queue: [sampleQueue[1], ...queue.slice(0, 2)] })
    await wrapper.findAll('[data-test="queue-item"]')[1].trigger('drop')
    expect(wrapper.emitted('move')).toEqual([['q-2', 1]])
    await wrapper.findAll('[data-test="queue-item"]')[0].trigger('dragstart')
    await wrapper.findAll('[data-test="queue-item"]')[0].trigger('dragend')
    await wrapper.findAll('[data-test="queue-item"]')[1].trigger('drop')
    expect(wrapper.emitted('move')).toHaveLength(1)
    await wrapper.findAll('[data-test="queue-item"]')[0].trigger('dragstart')
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await wrapper.findAll('[data-test="queue-item"]')[1].trigger('drop')
    expect(wrapper.emitted('move')).toHaveLength(1)
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
