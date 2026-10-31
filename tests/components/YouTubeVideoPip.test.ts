import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import YouTubeVideoPip from '~/components/YouTubeVideoPip.vue'

describe('YouTubeVideoPip', () => {
  const dummyTrack = {
    conversationId: 'conv-1',
    videoId: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    channelTitle: 'Rick Astley',
    thumbnail: '',
    isPlaying: true,
    positionSec: 30,
    updatedAt: Date.now(),
    startedBy: 'Alice',
  }

  it('renders video pip card with track title and emits close', async () => {
    const wrapper = mount(YouTubeVideoPip, {
      props: {
        track: dummyTrack,
        currentTimeSec: 30,
        durationSec: 213,
        isMuted: false,
      },
      slots: {
        default: '<video id="test-video"></video>',
      },
    })

    expect(wrapper.find('[data-test="video-pip-container"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Never Gonna Give You Up')
    expect(wrapper.find('#test-video').exists()).toBe(true)

    await wrapper.find('[data-test="video-pip-close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('toggles expand size state when expand button is clicked', async () => {
    const wrapper = mount(YouTubeVideoPip, {
      props: {
        track: dummyTrack,
        currentTimeSec: 30,
        durationSec: 213,
      },
    })

    const container = wrapper.find('[data-test="video-pip-container"]')
    expect(container.classes()).toContain('w-80') // 320px default

    const expandBtn = wrapper.find('[data-test="video-pip-expand"]')
    await expandBtn.trigger('click')
    expect(container.classes()).toContain('w-[440px]')
  })

  it('emits playback controls from overlay', async () => {
    const wrapper = mount(YouTubeVideoPip, {
      props: {
        track: dummyTrack,
        currentTimeSec: 30,
        durationSec: 213,
        isMuted: false,
      },
    })

    await wrapper.find('[data-test="video-pip-play-toggle"]').trigger('click')
    expect(wrapper.emitted('toggle-play')).toHaveLength(1)

    await wrapper.find('[data-test="video-pip-mute-toggle"]').trigger('click')
    expect(wrapper.emitted('toggle-mute')).toHaveLength(1)
  })
})
