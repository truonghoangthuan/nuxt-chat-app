import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { EncryptedImageMetadata } from '~/types/chat'
import ImageViewerModal from '~/components/ImageViewerModal.vue'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'

function makeMockImage(id: number, isBlob = false): EncryptedImageMetadata {
  return {
    path: isBlob ? `blob:mock-image-${id}` : `channels/ch-1/images/img-${id}.enc`,
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    size: 150000,
  }
}

describe('ImageViewerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const cache = useImageAttachmentCache()
    cache.revokeAllUrls()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render modal content when open is false', () => {
    const wrapper = mount(ImageViewerModal, {
      props: {
        open: false,
        images: [makeMockImage(1, true)],
        initialIndex: 0,
        channelId: 'ch-1',
      },
    })

    expect(wrapper.find('[data-test="lightbox-modal"]').exists()).toBe(false)
  })

  it('renders counter and active image when open is true', () => {
    const images = [
      makeMockImage(1, true),
      makeMockImage(2, true),
      makeMockImage(3, true),
      makeMockImage(4, true),
    ]

    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images,
        initialIndex: 1,
        channelId: 'ch-1',
      },
    })

    expect(wrapper.find('[data-test="lightbox-modal"]').exists()).toBe(true)
    const counter = wrapper.find('[data-test="lightbox-counter"]')
    expect(counter.exists()).toBe(true)
    expect(counter.text()).toBe('2 / 4')

    const img = wrapper.find('[data-test="lightbox-image"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(images[1].path)
  })

  it('navigates next and previous using chevron buttons', async () => {
    const images = [
      makeMockImage(1, true),
      makeMockImage(2, true),
      makeMockImage(3, true),
      makeMockImage(4, true),
    ]

    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images,
        initialIndex: 1,
        channelId: 'ch-1',
      },
    })

    const nextBtn = wrapper.find('[data-test="lightbox-next"]')
    const prevBtn = wrapper.find('[data-test="lightbox-prev"]')
    expect(nextBtn.exists()).toBe(true)
    expect(prevBtn.exists()).toBe(true)

    // Click next -> index 2 (3 / 4)
    await nextBtn.trigger('click')
    expect(wrapper.find('[data-test="lightbox-counter"]').text()).toBe('3 / 4')
    expect(wrapper.find('[data-test="lightbox-image"]').attributes('src')).toBe(images[2].path)

    // Click prev -> index 1 (2 / 4)
    await prevBtn.trigger('click')
    expect(wrapper.find('[data-test="lightbox-counter"]').text()).toBe('2 / 4')
    expect(wrapper.find('[data-test="lightbox-image"]').attributes('src')).toBe(images[1].path)
  })

  it('hides next and prev buttons when images list has only 1 image', () => {
    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images: [makeMockImage(1, true)],
        initialIndex: 0,
        channelId: 'ch-1',
      },
    })

    expect(wrapper.find('[data-test="lightbox-prev"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="lightbox-next"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="lightbox-counter"]').text()).toBe('1 / 1')
  })

  it('emits update:open false when close button is clicked', async () => {
    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images: [makeMockImage(1, true)],
        initialIndex: 0,
        channelId: 'ch-1',
      },
    })

    const closeBtn = wrapper.find('[data-test="lightbox-close"]')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')

    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })

  it('navigates with ArrowRight and ArrowLeft keyboard events, and closes with Escape', async () => {
    const images = [
      makeMockImage(1, true),
      makeMockImage(2, true),
      makeMockImage(3, true),
    ]

    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images,
        initialIndex: 0,
        channelId: 'ch-1',
      },
      attachTo: document.body,
    })

    // ArrowRight -> next image
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="lightbox-counter"]').text()).toBe('2 / 3')
    expect(wrapper.find('[data-test="lightbox-image"]').attributes('src')).toBe(images[1].path)

    // ArrowLeft -> previous image
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="lightbox-counter"]').text()).toBe('1 / 3')
    expect(wrapper.find('[data-test="lightbox-image"]').attributes('src')).toBe(images[0].path)

    // Escape -> close
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])

    wrapper.unmount()
  })

  it('triggers download anchor when download button is clicked', async () => {
    const images = [makeMockImage(1, true)]
    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images,
        initialIndex: 0,
        channelId: 'ch-1',
      },
    })

    const clickSpy = vi.fn()
    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    const removeChildSpy = vi.spyOn(document.body, 'removeChild')
    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName)
      if (tagName === 'a') {
        el.click = clickSpy
      }
      return el
    })

    const downloadBtn = wrapper.find('[data-test="lightbox-download"]')
    expect(downloadBtn.exists()).toBe(true)
    await downloadBtn.trigger('click')

    expect(clickSpy).toHaveBeenCalled()
    createElementSpy.mockRestore()
    appendChildSpy.mockRestore()
    removeChildSpy.mockRestore()
  })

  it('fetches and decrypts remote image using cache, showing loading state while decrypting', async () => {
    const fakeKey = {} as CryptoKey
    const cache = useImageAttachmentCache()
    let resolveImageFetch: (url: string) => void
    const pendingPromise = new Promise<string>((resolve) => {
      resolveImageFetch = resolve
    })

    vi.spyOn(cache, 'getOrFetchImage').mockReturnValue(pendingPromise)

    const images = [makeMockImage(1, false)]
    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images,
        initialIndex: 0,
        channelId: 'ch-1',
        e2eeKey: fakeKey,
      },
    })

    // Shows loading indicator
    expect(wrapper.find('[data-test="lightbox-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lightbox-image"]').exists()).toBe(false)

    // Resolve fetch
    resolveImageFetch!('blob:decrypted-url-1')
    await pendingPromise
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="lightbox-loading"]').exists()).toBe(false)
    const img = wrapper.find('[data-test="lightbox-image"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:decrypted-url-1')
  })

  it('shows error state when decryption fails and clears error on navigation', async () => {
    const fakeKey = {} as CryptoKey
    const cache = useImageAttachmentCache()
    vi.spyOn(cache, 'getOrFetchImage').mockRejectedValue(new Error('Decryption failed'))

    const images = [makeMockImage(1, false), makeMockImage(2, true)]
    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images,
        initialIndex: 0,
        channelId: 'ch-1',
        e2eeKey: fakeKey,
      },
    })

    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 10))

    const errorEl = wrapper.find('[data-test="lightbox-error"]')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toContain('Failed to decrypt or load image.')
    expect(wrapper.find('[data-test="lightbox-download"]').attributes('disabled')).toBeDefined()

    // Navigate to next image (which is a valid blob url) -> error is cleared
    await wrapper.find('[data-test="lightbox-next"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="lightbox-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="lightbox-image"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lightbox-download"]').attributes('disabled')).toBeUndefined()
  })

  it('disables download button while remote image is loading', async () => {
    const fakeKey = {} as CryptoKey
    const cache = useImageAttachmentCache()
    const pendingPromise = new Promise<string>(() => {})
    vi.spyOn(cache, 'getOrFetchImage').mockReturnValue(pendingPromise)

    const images = [makeMockImage(1, false)]
    const wrapper = mount(ImageViewerModal, {
      props: {
        open: true,
        images,
        initialIndex: 0,
        channelId: 'ch-1',
        e2eeKey: fakeKey,
      },
    })

    const downloadBtn = wrapper.find('[data-test="lightbox-download"]')
    expect(downloadBtn.attributes('disabled')).toBeDefined()
  })
})
