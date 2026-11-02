import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'
import ImageViewerModal from '~/components/ImageViewerModal.vue'

enableAutoUnmount(afterEach)
afterEach(() => vi.restoreAllMocks())

const images = [1, 2].map(id => ({
  path: `blob:zoom-${id}`,
  mimeType: 'image/png',
  width: 1200,
  height: 800,
  size: 1000,
}))

function viewer() {
  return mount(ImageViewerModal, { props: { open: true, images, channelId: 'one' } })
}

describe('ImageViewer zoom', () => {
  it('keeps navigation legible over bright enlarged images', () => {
    const wrapper = viewer()
    for (const direction of ['prev', 'next']) {
      const button = wrapper.get(`[data-test="lightbox-${direction}"]`)
      expect(button.classes()).toContain('bg-black/60')
      expect(button.attributes('aria-label')).toBe(direction === 'prev' ? 'Previous image' : 'Next image')
    }
  })

  it('supports zoom shortcuts without stealing browser shortcuts or editable input, and tears down', async () => {
    const wrapper = viewer()
    const key = async (key: string, options: KeyboardEventInit = {}, target: EventTarget = window) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...options })
      target.dispatchEvent(event)
      await wrapper.vm.$nextTick()
      return event
    }
    const level = () => wrapper.get('[data-test="lightbox-zoom-level"]').text()
    expect((await key('+')).defaultPrevented).toBe(true)
    expect(level()).toBe('150%')
    await key('=')
    expect(level()).toBe('200%')
    await key('-')
    expect(level()).toBe('150%')
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
      expect((await key('+', options)).defaultPrevented).toBe(false)
      expect(level()).toBe('150%')
    }
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    try {
      expect((await key('+', {}, input)).defaultPrevented).toBe(false)
      expect(level()).toBe('150%')
    } finally {
      input.remove()
    }
    await key('0')
    expect(level()).toBe('100%')
    await wrapper.setProps({ open: false })
    expect((await key('+')).defaultPrevented).toBe(false)
    wrapper.unmount()
    expect((await key('+')).defaultPrevented).toBe(false)
  })

  it('disables all zoom controls for empty, loading and errored images', async () => {
    const cache = useImageAttachmentCache()
    let reject!: (error: Error) => void
    vi.spyOn(cache, 'getOrFetchImage').mockImplementation(() => new Promise((_, fail) => { reject = fail }))
    const wrapper = mount(ImageViewerModal, { props: { open: true, images: [] } })
    const assertDisabled = () => {
      for (const control of ['zoom-in', 'zoom-out', 'fit']) {
        expect(wrapper.get(`[data-test="lightbox-${control}"]`).attributes('disabled')).toBeDefined()
      }
    }
    assertDisabled()
    await wrapper.setProps({ images: [{ ...images[0], path: 'encrypted/pending.png' }] })
    assertDisabled()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="lightbox-zoom-level"]').text()).toBe('100%')
    reject(new Error('decrypt failed'))
    await flushPromises()
    expect(wrapper.find('[data-test="lightbox-error"]').exists()).toBe(true)
    assertDisabled()
    await wrapper.setProps({ images })
    expect(wrapper.get('[data-test="lightbox-zoom-in"]').attributes('disabled')).toBeUndefined()
  })

  it.each(['success', 'failure'] as const)('keeps the current image zoomable when an old load finishes with %s', async (outcome) => {
    const cache = useImageAttachmentCache()
    let resolve!: (url: string) => void
    let reject!: (error: Error) => void
    vi.spyOn(cache, 'getOrFetchImage').mockImplementation(() => new Promise((done, fail) => {
      resolve = done
      reject = fail
    }))
    const wrapper = mount(ImageViewerModal, {
      props: { open: true, images: [{ ...images[0], path: 'old/pending.enc' }, images[1]] },
    })
    await wrapper.get('[data-test="lightbox-next"]').trigger('click')
    expect(wrapper.get('[data-test="lightbox-zoom-in"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-test="lightbox-zoom-in"]').trigger('click')
    if (outcome === 'success') resolve('blob:obsolete')
    else reject(new Error('obsolete failure'))
    await flushPromises()
    expect(wrapper.find('[data-test="lightbox-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="lightbox-zoom-level"]').text()).toBe('150%')
    expect(wrapper.get('[data-test="lightbox-image"]').attributes('src')).toBe(images[1].path)
  })

  it('preserves the viewport center while zooming and resets scrolling on fit', async () => {
    const wrapper = viewer()
    const pan = wrapper.get('[data-test="lightbox-pan"]').element as HTMLElement
    Object.defineProperties(pan, {
      clientWidth: { value: 400 },
      clientHeight: { value: 300 },
    })
    await wrapper.get('[data-test="lightbox-zoom-in"]').trigger('click')
    expect(pan.scrollLeft).toBe(100)
    expect(pan.scrollTop).toBe(75)
    pan.scrollLeft = 140
    pan.scrollTop = 90
    await wrapper.get('[data-test="lightbox-zoom-in"]').trigger('click')
    expect(pan.scrollLeft).toBeCloseTo((140 + 200) * 2 / 1.5 - 200)
    expect(pan.scrollTop).toBeCloseTo((90 + 150) * 2 / 1.5 - 150)
    await wrapper.get('[data-test="lightbox-fit"]').trigger('click')
    expect(pan.scrollLeft).toBe(0)
    expect(pan.scrollTop).toBe(0)
  })

  it('resets zoom and pan on navigation, replacement, conversation changes and reopening', async () => {
    const wrapper = viewer()
    const reset = async (action: () => Promise<unknown>) => {
      await wrapper.get('[data-test="lightbox-zoom-in"]').trigger('click')
      const pan = wrapper.get('[data-test="lightbox-pan"]').element as HTMLElement
      pan.scrollLeft = 40
      pan.scrollTop = 60
      await action()
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[data-test="lightbox-zoom-level"]').text()).toBe('100%')
      const currentPan = wrapper.get('[data-test="lightbox-pan"]').element as HTMLElement
      expect(currentPan.scrollLeft).toBe(0)
      expect(currentPan.scrollTop).toBe(0)
    }
    await reset(() => wrapper.get('[data-test="lightbox-next"]').trigger('click'))
    await reset(() => wrapper.get('[data-test="lightbox-prev"]').trigger('click'))
    await reset(() => wrapper.setProps({ images: [...images] }))
    await reset(() => wrapper.setProps({ channelId: 'two' }))
    await reset(async () => {
      await wrapper.setProps({ open: false })
      await wrapper.setProps({ open: true })
    })
  })

  it('zooms the fitted image in bounded steps and restores fit without replacing its blob URL', async () => {
    const wrapper = viewer()
    const zoomIn = wrapper.get('[data-test="lightbox-zoom-in"]')
    const zoomOut = wrapper.get('[data-test="lightbox-zoom-out"]')
    const fit = wrapper.get('[data-test="lightbox-fit"]')
    const level = () => wrapper.get('[data-test="lightbox-zoom-level"]').text()
    const size = () => wrapper.get('[data-test="lightbox-zoom-content"]').attributes('style')

    expect(level()).toBe('100%')
    expect(zoomOut.attributes('disabled')).toBeDefined()
    await zoomIn.trigger('click')
    expect(level()).toBe('150%')
    expect(size()).toContain('width: 150%')
    expect(size()).toContain('height: 150%')
    expect(wrapper.get('[data-test="lightbox-image"]').attributes('src')).toBe(images[0].path)
    await zoomOut.trigger('click')
    expect(level()).toBe('100%')
    for (let step = 0; step < 10; step++) await zoomIn.trigger('click')
    expect(level()).toBe('400%')
    expect(zoomIn.attributes('disabled')).toBeDefined()
    await fit.trigger('click')
    expect(level()).toBe('100%')
    expect(size()).toContain('width: 100%')
    expect(zoomOut.attributes('disabled')).toBeDefined()
  })
})
