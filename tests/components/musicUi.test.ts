import { describe, it, expect, vi } from 'vitest'
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

  it('loads VN trending when opened with no results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      items: [
        {
          videoId: 'trend-1',
          title: 'Trending Song 1',
          channelTitle: 'Artist 1',
          thumbnail: 'https://example.com/thumb.jpg',
        },
      ],
    })
    vi.stubGlobal('$fetch', fetchMock)

    try {
      const wrapper = mount(YouTubeSearchModal, {
        props: {
          open: true,
        },
      })

      await new Promise((r) => setTimeout(r, 50))

      expect(fetchMock).toHaveBeenCalledWith('/api/youtube/trending')
      expect(wrapper.find('[data-test="youtube-trending-label"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="youtube-trending-label"]').text()).toContain('Trending in Vietnam')
      expect(wrapper.findAll('[data-test="youtube-result-item"]')).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not fetch trending when initialResults exist', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    try {
      const wrapper = mount(YouTubeSearchModal, {
        props: {
          open: true,
          initialResults: [
            {
              videoId: 'preset-1',
              title: 'Preset Song',
              channelTitle: 'Artist',
              thumbnail: '',
            },
          ],
        },
      })

      await new Promise((r) => setTimeout(r, 50))
      expect(fetchMock).not.toHaveBeenCalled()
      expect(wrapper.find('[data-test="youtube-trending-label"]').exists()).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('hides trending label after a typed search', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/youtube/trending') {
        return {
          items: [
            { videoId: 'trend-1', title: 'Trend', channelTitle: 'Artist', thumbnail: '' },
          ],
        }
      }
      if (url === '/api/youtube/search') {
        return {
          items: [
            { videoId: 'searched-1', title: 'Searched', channelTitle: 'Artist', thumbnail: '' },
          ],
        }
      }
      return { items: [] }
    })
    vi.stubGlobal('$fetch', fetchMock)

    try {
      const wrapper = mount(YouTubeSearchModal, {
        props: {
          open: true,
        },
      })

      await new Promise((r) => setTimeout(r, 50))
      expect(wrapper.find('[data-test="youtube-trending-label"]').exists()).toBe(true)

      const input = wrapper.find('[data-test="youtube-search-input"]')
      await input.setValue('lofi beats')
      await wrapper.find('form').trigger('submit')
      await new Promise((r) => setTimeout(r, 50))

      expect(wrapper.find('[data-test="youtube-trending-label"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Searched')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not overwrite search results if trending resolves after user searched', async () => {
    let resolveTrending: any
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/youtube/trending') {
        return new Promise((resolve) => {
          resolveTrending = () => resolve({
            items: [{ videoId: 'late-trend', title: 'Late Trend', channelTitle: 'Artist', thumbnail: '' }],
          })
        })
      }
      if (url === '/api/youtube/search') {
        return Promise.resolve({
          items: [{ videoId: 'my-search', title: 'My Search Result', channelTitle: 'Artist', thumbnail: '' }],
        })
      }
      return Promise.resolve({ items: [] })
    })
    vi.stubGlobal('$fetch', fetchMock)

    try {
      const wrapper = mount(YouTubeSearchModal, {
        props: { open: true },
        attachTo: document.body,
      })

      await new Promise((r) => setTimeout(r, 20))
      const input = wrapper.find('[data-test="youtube-search-input"]')

      // User searches before trending completes
      await input.setValue('fast query')
      await wrapper.find('form').trigger('submit')
      await new Promise((r) => setTimeout(r, 20))
      expect(wrapper.text()).toContain('My Search Result')

      // Now trending finishes late
      resolveTrending?.()
      await new Promise((r) => setTimeout(r, 20))

      // Trending must not overwrite search results
      expect(wrapper.text()).toContain('My Search Result')
      expect(wrapper.text()).not.toContain('Late Trend')
      wrapper.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
