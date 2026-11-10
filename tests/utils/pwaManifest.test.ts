import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Windows PWA Manifest, Icons & Service Worker', () => {
  const rootDir = process.cwd()

  it('provides a valid public/manifest.webmanifest for standalone Windows installation', () => {
    const manifestPath = path.join(rootDir, 'public', 'manifest.webmanifest')
    expect(fs.existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    expect(manifest.name).toBe('My Team')
    expect(manifest.short_name).toBe('My Team')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.theme_color).toBe('#0b0f17')
    expect(manifest.background_color).toBe('#0b0f17')

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')

    const icon512Any = manifest.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '512x512' && i.purpose === 'any')
    const icon512Maskable = manifest.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '512x512' && i.purpose === 'maskable')
    expect(icon512Any).toBeDefined()
    expect(icon512Maskable).toBeDefined()
  })

  it('configures My Team branding and /favicon.ico in nuxt.config.ts and public/favicon.ico', () => {
    const nuxtConfig = fs.readFileSync(path.join(rootDir, 'nuxt.config.ts'), 'utf8')
    expect(nuxtConfig).toContain("title: 'My Team'")
    expect(nuxtConfig).toContain("{ name: 'application-name', content: 'My Team' }")
    expect(nuxtConfig).toContain("href: '/favicon.ico'")

    const faviconBuf = fs.readFileSync(path.join(rootDir, 'public', 'favicon.ico'))
    expect(faviconBuf.length).toBe(463)
  })

  it('includes valid 192x192 and 512x512 PNG icons in public/', () => {
    for (const [file, expectedDim] of [
      ['pwa-192x192.png', 192],
      ['pwa-512x512.png', 512],
    ] as const) {
      const iconPath = path.join(rootDir, 'public', file)
      expect(fs.existsSync(iconPath)).toBe(true)
      const buf = fs.readFileSync(iconPath)
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      // IHDR width and height at bytes 16..24 (big-endian uint32)
      expect(buf.readUInt32BE(16)).toBe(expectedDim)
      expect(buf.readUInt32BE(20)).toBe(expectedDim)
    }
  })

  it('registers a pass-through fetch listener in public/sw.js without respondWith caching', () => {
    const swCode = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'), 'utf8')
    const listeners: Record<string, Function> = {}
    const selfMock = {
      addEventListener: vi.fn((type: string, cb: Function) => {
        listeners[type] = cb
      }),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(), matchAll: vi.fn(), openWindow: vi.fn() },
    }
    const runSw = new Function('self', swCode)
    runSw(selfMock)

    expect(typeof listeners.install).toBe('function')
    expect(typeof listeners.activate).toBe('function')
    expect(typeof listeners.notificationclick).toBe('function')
    expect(typeof listeners.fetch).toBe('function')

    const respondWith = vi.fn()
    listeners.fetch({ respondWith })
    expect(respondWith).not.toHaveBeenCalled()
  })

  it('provides a GitHub Actions workflow to build Windows .exe and .msi installers', () => {
    const wfPath = path.join(rootDir, '.github', 'workflows', 'windows-desktop.yml')
    expect(fs.existsSync(wfPath)).toBe(true)
    const wf = fs.readFileSync(wfPath, 'utf8')
    expect(wf).toContain('windows-latest')
    expect(wf).toContain('tauri:build')
  })
})
