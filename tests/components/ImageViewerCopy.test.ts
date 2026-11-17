import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import ImageViewerModal from '~/components/ImageViewerModal.vue'

class TestClipboardItem {
  constructor(public data: Record<string, Promise<Blob>>) {}
}
const write = vi.fn(async (items: TestClipboardItem[]) => { await items[0]!.data['image/png'] })

enableAutoUnmount(afterEach)
beforeEach(() => {
  write.mockReset().mockImplementation(async items => { await items[0]!.data['image/png'] })
  vi.stubGlobal('ClipboardItem', TestClipboardItem)
  vi.stubGlobal('navigator', { clipboard: { write } })
  vi.stubGlobal('Image', class {
    naturalWidth = 30
    naturalHeight = 20
    onload: (() => void) | null = null
    set src(value: string) { imageSources.push(value); queueMicrotask(() => this.onload?.()) }
  })
  imageSources.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const imageSources: string[] = []
const images = [1, 2].map(id => ({ path: `blob:copy-${id}`, mimeType: 'image/png', width: 30, height: 20, size: 100 }))
const viewer = () => mount(ImageViewerModal, { props: { open: true, images, channelId: 'one' } })

describe('lightbox image copy', () => {
  it('copies the selected decrypted image only on request and announces success', async () => {
    const wrapper = viewer()
    await flushPromises()
    expect(write).not.toHaveBeenCalled()
    await wrapper.get('[data-test="lightbox-next"]').trigger('click')
    await wrapper.get('[data-test="lightbox-copy"]').trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledTimes(1)
    expect(imageSources).toEqual(['blob:copy-2'])
    expect(await write.mock.calls[0]![0][0]!.data['image/png']).toBeInstanceOf(Blob)
    expect(wrapper.get('[data-test="lightbox-copy-status"]').text()).toContain('Image copied')
  })

  it('disables unsupported copy while keeping Download available', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    const wrapper = viewer()
    await flushPromises()
    expect(wrapper.get('[data-test="lightbox-copy"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="lightbox-copy"]').attributes('title')).toContain('HTTPS')
    expect(wrapper.get('[data-test="lightbox-download"]').attributes('disabled')).toBeUndefined()
    expect(write).not.toHaveBeenCalled()
  })

  it('blocks duplicate clicks and allows retry after denied clipboard access', async () => {
    let reject!: (error: Error) => void
    write.mockReturnValueOnce(new Promise<void>((_, fail) => { reject = fail }))
    const wrapper = viewer()
    await flushPromises()
    const button = wrapper.get('[data-test="lightbox-copy"]')
    await button.trigger('click')
    expect(button.attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Copying image')
    await button.trigger('click')
    expect(write).toHaveBeenCalledTimes(1)
    reject(new Error('permission denied'))
    await flushPromises()
    expect(wrapper.text()).toContain('Allow clipboard access and retry, or use Download')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Image copied')
  })

  it.each(['navigate', 'conversation', 'images', 'close', 'unmount'] as const)('ignores stale success after %s', async transition => {
    let resolve!: () => void
    write.mockReturnValueOnce(new Promise<void>(done => { resolve = done }))
    const wrapper = viewer()
    await flushPromises()
    await wrapper.get('[data-test="lightbox-copy"]').trigger('click')
    if (transition === 'navigate') await wrapper.get('[data-test="lightbox-next"]').trigger('click')
    if (transition === 'conversation') await wrapper.setProps({ channelId: 'two' })
    if (transition === 'images') await wrapper.setProps({ images: [...images] })
    if (transition === 'close') { await wrapper.setProps({ open: false }); await wrapper.setProps({ open: true }) }
    if (transition === 'unmount') wrapper.unmount()
    resolve()
    await flushPromises()
    if (transition !== 'unmount') expect(wrapper.get('[data-test="lightbox-copy-status"]').text()).toBe('')
  })

  it('keeps a newer copy pending when an old write rejects', async () => {
    let reject!: (error: Error) => void
    let resolve!: () => void
    write.mockReturnValueOnce(new Promise<void>((_, fail) => { reject = fail }))
      .mockReturnValueOnce(new Promise<void>(done => { resolve = done }))
    const wrapper = viewer()
    await flushPromises()
    await wrapper.get('[data-test="lightbox-copy"]').trigger('click')
    await wrapper.get('[data-test="lightbox-next"]').trigger('click')
    await wrapper.get('[data-test="lightbox-copy"]').trigger('click')
    reject(new Error('old failure'))
    await flushPromises()
    expect(wrapper.get('[data-test="lightbox-copy"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Copying image')
    resolve()
    await flushPromises()
    expect(wrapper.text()).toContain('Image copied')
  })
})
