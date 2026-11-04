import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { createAssets } from '~/utils/incense/courtyardAssets.js'

describe('abortable courtyard assets', () => {
  it('decodes the real approved HDR with the supported loader without deprecation warnings', async () => {
    const data = readFileSync('public/incense/assets/sky.hdr')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const assets = createAssets(new AbortController().signal)
    try {
      const texture = await assets.environment()
      expect(texture.image.width).toBeGreaterThan(0)
      expect(warn).not.toHaveBeenCalled()
    } finally { assets.dispose(); warn.mockRestore(); vi.unstubAllGlobals() }
  })
  it('closes decoded bitmaps that finish after abort instead of attaching them', async () => {
    let resolve!: (value: any) => void
    const decoded = new Promise(r => { resolve = r })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })))
    vi.stubGlobal('createImageBitmap', vi.fn(() => decoded))
    const controller = new AbortController()
    const assets = createAssets(controller.signal)
    const texture = assets.texture('brick.jpg')
    const image = { close: vi.fn() }
    controller.abort()
    resolve(image)
    await Promise.all(assets.tasks)
    expect(texture.image).toBeNull()
    expect(image.close).toHaveBeenCalledOnce()
    assets.dispose()
    vi.unstubAllGlobals()
  })
  it('disposes textures belonging to a decoded orphan even after scope teardown', () => {
    const controller = new AbortController()
    const assets = createAssets(controller.signal)
    controller.abort()
    assets.dispose()
    const map = new THREE.Texture()
    const close = vi.fn()
    map.image = { close }
    const dispose = vi.spyOn(map, 'dispose')
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map })))
    assets.disposeObject(group)
    expect(dispose).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})
