import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MusicPlayerBar from '~/components/MusicPlayerBar.vue'
import YouTubeSearchModal from '~/components/YouTubeSearchModal.vue'

describe('Music UI components', () => {
  it('renders MusicPlayerBar when track is active and emits controls', async () => {
    const wrapper = mount(MusicPlayerBar, {
      props: {
        track: {
          conversationId: 'conv-1',
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          channelTitle: 'Rick Astley',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
          isPlaying: true,
          positionSec: 45,
          updatedAt: Date.now(),
          startedBy: 'Alice',
        },
        currentTimeSec: 45,
        durationSec: 213,
        isMuted: false,
        autoplayBlocked: false,
      },
    })

    expect(wrapper.find('[data-test="music-player-bar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Never Gonna Give You Up')
    expect(wrapper.text()).toContain('Alice')

    await wrapper.find('[data-test="music-toggle-play"]').trigger('click')
    expect(wrapper.emitted('toggle-play')).toBeTruthy()

    await wrapper.find('[data-test="music-stop-btn"]').trigger('click')
    expect(wrapper.emitted('stop')).toBeTruthy()
  })

  it('shows Tune In button when browser autoplay is blocked', async () => {
    const wrapper = mount(MusicPlayerBar, {
      props: {
        track: {
          conversationId: 'conv-1',
          videoId: 'dQw4w9WgXcQ',
          title: 'Test Song',
          channelTitle: 'Artist',
          thumbnail: '',
          isPlaying: true,
          positionSec: 0,
          updatedAt: Date.now(),
          startedBy: 'Bob',
        },
        currentTimeSec: 0,
        durationSec: 120,
        isMuted: false,
        autoplayBlocked: true,
      },
    })

    const unblockBtn = wrapper.find('[data-test="music-unblock-btn"]')
    expect(unblockBtn.exists()).toBe(true)
    await unblockBtn.trigger('click')
    expect(wrapper.emitted('unblock-autoplay')).toBeTruthy()
  })

  it('renders YouTubeSearchModal and emits select when a result is clicked', async () => {
    const wrapper = mount(YouTubeSearchModal, {
      props: {
        open: true,
        initialResults: [
          {
            videoId: 'jfKfPfyJRdk',
            title: 'lofi hip hop radio',
            channelTitle: 'Lofi Girl',
            thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg',
            durationText: 'LIVE',
          },
        ],
      },
    })

    const item = wrapper.find('[data-test="youtube-result-item"]')
    expect(item.exists()).toBe(true)
    await item.trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual(
      expect.objectContaining({ videoId: 'jfKfPfyJRdk' }),
    )
  })

  it('renders proxied thumbnail URLs in MusicPlayerBar and YouTubeSearchModal so browser never hits i.ytimg.com', () => {
    const bar = mount(MusicPlayerBar, {
      props: {
        track: {
          conversationId: 'conv-1',
          videoId: 'dQw4w9WgXcQ',
          title: 'Never Gonna Give You Up',
          channelTitle: 'Rick Astley',
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
          isPlaying: true,
          positionSec: 10,
          updatedAt: Date.now(),
          startedBy: 'Alice',
        },
        currentTimeSec: 10,
        durationSec: 213,
      },
    })
    expect(bar.find('img').attributes('src')).toBe('/api/youtube/thumbnail?v=dQw4w9WgXcQ')

    const modal = mount(YouTubeSearchModal, {
      props: {
        open: true,
        initialResults: [
          {
            videoId: 'jfKfPfyJRdk',
            title: 'lofi hip hop radio',
            channelTitle: 'Lofi Girl',
            thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg',
          },
        ],
      },
    })
    expect(modal.find('img').attributes('src')).toBe('/api/youtube/thumbnail?v=jfKfPfyJRdk')
  })
})
