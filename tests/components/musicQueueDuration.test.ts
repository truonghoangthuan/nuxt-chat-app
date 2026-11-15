import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MusicQueuePanel from '~/components/MusicQueuePanel.vue'
import type { MusicQueueItem } from '~/types/chat'

const queue: MusicQueueItem[] = [
  { id: 'one', videoId: 'one', title: 'First song', channelTitle: 'Artist', thumbnail: '', addedBy: 'Alice', durationText: '3:05' },
  { id: 'two', videoId: 'two', title: 'Second song', channelTitle: 'Artist', thumbnail: '', addedBy: 'Bob', durationText: '1:02:03' },
]

describe('Upcoming queue listening time', () => {
  it('labels incomplete totals and unknown song lengths rather than promising a finish time', async () => {
    const unknowns = [undefined, '', 'LIVE', '0:00', '-3:05', 'Infinity', '3:60', '1:60:00', 'NaN', '9'.repeat(400) + ':00']
    const wrapper = mount(MusicQueuePanel, { props: { open: true, history: [], queue: [queue[0], ...unknowns.map((durationText, index) => ({ ...queue[1], id: `unknown-${index}`, durationText }))] } })
    expect(wrapper.get('[data-test="queue-duration-summary"]').text()).toBe('Upcoming time: at least 3:05 · 10 unknown lengths · Excludes current song')
    expect(wrapper.findAll('[data-test="queue-item-duration"]').slice(1).every(item => item.text() === 'Length unknown')).toBe(true)
    await wrapper.setProps({ queue: [{ ...queue[0], durationText: undefined }] })
    expect(wrapper.get('[data-test="queue-duration-summary"]').text()).toBe('Upcoming time: unknown · 1 unknown length · Excludes current song')
    wrapper.unmount()
  })

  it('updates after room queue replacement and removal and keeps the summary out of history', async () => {
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue, history: [], currentTrack: { conversationId: 'room', videoId: 'current', title: 'Current', channelTitle: '', thumbnail: '', isPlaying: true, positionSec: 42, updatedAt: 0, startedBy: 'Alice' } } })
    await wrapper.setProps({ queue: [queue[0]] })
    expect(wrapper.get('[data-test="queue-duration-summary"]').text()).toContain('Upcoming time: 3:05')
    await wrapper.setProps({ queue: [] })
    expect(wrapper.get('[data-test="queue-duration-summary"]').text()).toBe('Upcoming time: 0:00 · Excludes current song')
    await wrapper.get('[data-test="tab-history"]').trigger('click')
    expect(wrapper.find('[data-test="queue-duration-summary"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('shows the whole upcoming duration and individual lengths independently of search', async () => {
    const wrapper = mount(MusicQueuePanel, { props: { open: true, queue, history: [] } })
    expect(wrapper.get('[data-test="queue-duration-summary"]').text()).toBe('Upcoming time: 1:05:08 · Excludes current song')
    expect(wrapper.findAll('[data-test="queue-item-duration"]').map(item => item.text())).toEqual(['3:05', '1:02:03'])
    await wrapper.get('[data-test="queue-search"]').setValue('First')
    expect(wrapper.findAll('[data-test="queue-item"]')).toHaveLength(1)
    expect(wrapper.get('[data-test="queue-duration-summary"]').text()).toContain('1:05:08')
    expect(wrapper.emitted()).not.toHaveProperty('move')
    expect(wrapper.emitted()).not.toHaveProperty('play-now')
    wrapper.unmount()
  })
})
