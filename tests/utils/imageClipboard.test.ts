import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyImageToClipboard } from '~/utils/imageClipboard'

const drawImage = vi.fn()
const write = vi.fn(async (items: Array<{ data: Record<string, Promise<Blob>> }>) => { await items[0]!.data['image/png'] })
const sources: string[] = []
beforeEach(() => {
  sources.length = 0
  drawImage.mockClear()
  write.mockReset().mockImplementation(async items => { await items[0]!.data['image/png'] })
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Promise<Blob>>) {} })
  vi.stubGlobal('navigator', { clipboard: { write } })
  vi.stubGlobal('Image', class {
    naturalWidth = 30
    naturalHeight = 20
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(value: string) { sources.push(value); queueMicrotask(() => this.onload?.()) }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as any)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('local PNG clipboard export', () => {
  it('calls write synchronously before decoding to preserve user activation', async () => {
    const result = copyImageToClipboard('blob:local-image')
    expect(write).toHaveBeenCalledTimes(1)
    expect(drawImage).not.toHaveBeenCalled()
    await result
    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
  })

  it.each(['https://example.com/photo.png', 'data:image/png;base64,abc', 'private/encrypted.enc'])('rejects non-local source %s before loading or writing', async source => {
    await expect(copyImageToClipboard(source)).rejects.toThrow()
    expect(sources).toEqual([])
    expect(write).not.toHaveBeenCalled()
  })

  it.each(['context', 'encoding', 'decode', 'write', 'unsupported'] as const)('propagates %s errors', async failure => {
    if (failure === 'context') vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    if (failure === 'encoding') vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(callback => callback(null))
    if (failure === 'decode') vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
    })
    if (failure === 'write') write.mockImplementation(() => { throw new Error('write blocked') })
    if (failure === 'unsupported') vi.stubGlobal('ClipboardItem', undefined)
    await expect(copyImageToClipboard('blob:local-image')).rejects.toThrow()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
})
