import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  sanitizeTauriServerUrl,
  buildTauriBootstrapHtml,
} from '../../scripts/prepare-tauri-frontend.mjs'

describe('Tauri v2 Windows Icons & Frontend Bootstrapper', () => {
  const rootDir = process.cwd()

  it('generates valid RGBA PNGs (32x32, 128x128, 256x256) and a valid 256x256 Windows icon.ico in src-tauri/icons/', () => {
    for (const [file, expectedDim] of [
      ['32x32.png', 32],
      ['128x128.png', 128],
      ['128x128@2x.png', 256],
    ] as const) {
      const p = path.join(rootDir, 'src-tauri', 'icons', file)
      expect(fs.existsSync(p)).toBe(true)
      const buf = fs.readFileSync(p)
      expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(buf.readUInt32BE(16)).toBe(expectedDim)
      expect(buf.readUInt32BE(20)).toBe(expectedDim)
      expect(buf[25]).toBe(6) // RGBA color type 6 required by Tauri
    }

    const icoPath = path.join(rootDir, 'src-tauri', 'icons', 'icon.ico')
    expect(fs.existsSync(icoPath)).toBe(true)
    const icoBuf = fs.readFileSync(icoPath)
    // ICONDIR: reserved=0, type=1 (ICO), count=1
    expect(icoBuf.readUInt16LE(0)).toBe(0)
    expect(icoBuf.readUInt16LE(2)).toBe(1)
    expect(icoBuf.readUInt16LE(4)).toBe(1)
    // ICONDIRENTRY: 0 means 256px width & height, offset=22
    expect(icoBuf[6]).toBe(0)
    expect(icoBuf[7]).toBe(0)
    expect(icoBuf.readUInt32LE(18)).toBe(22)
    // Embedded PNG magic bytes at offset 22
    expect(icoBuf.subarray(22, 30).toString('hex')).toBe('89504e470d0a1a0a')

    const svgPath = path.join(rootDir, 'src-tauri', 'icons', 'ubuntu-logo.svg')
    expect(fs.existsSync(svgPath)).toBe(true)
    expect(fs.readFileSync(svgPath, 'utf8')).toContain('#dd4814')
  })

  it('sanitizes server URLs and rejects non-http/https protocols', () => {
    expect(sanitizeTauriServerUrl('https://my-team.vercel.app/login?x=1')).toBe('https://my-team.vercel.app')
    expect(sanitizeTauriServerUrl('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(sanitizeTauriServerUrl('javascript:alert(1)')).toBe('')
    expect(sanitizeTauriServerUrl('file:///C:/Windows/System32')).toBe('')
    expect(sanitizeTauriServerUrl('')).toBe('')
  })

  it('builds src-tauri/frontend/index.html defaulting to https://taolaobidao.vercel.app', () => {
    const html = buildTauriBootstrapHtml()
    expect(html).toContain('https://taolaobidao.vercel.app')
    expect(html).toContain('my-team-desktop-server-url')

    const distHtmlPath = path.join(rootDir, 'src-tauri', 'frontend', 'index.html')
    expect(fs.existsSync(distHtmlPath)).toBe(true)
    const distHtml = fs.readFileSync(distHtmlPath, 'utf8')
    expect(distHtml).toContain('https://taolaobidao.vercel.app')
  })

  it('configures Tauri v2 Windows NSIS (.exe) and MSI bundler, system tray, and package.json scripts', () => {
    const confPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
    expect(fs.existsSync(confPath)).toBe(true)
    const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'))

    expect(conf.productName).toBe('My Team')
    expect(conf.identifier).toBe('com.myteam.chat')
    expect(conf.build.devUrl).toBe('http://localhost:3000')
    expect(conf.build.frontendDist).toBe('./frontend')
    expect(conf.bundle.targets).toEqual(expect.arrayContaining(['nsis', 'msi']))
    expect(conf.bundle.icon).toContain('icons/icon.ico')

    const cargoToml = fs.readFileSync(path.join(rootDir, 'src-tauri', 'Cargo.toml'), 'utf8')
    expect(cargoToml).toContain('tray-icon')

    const libRs = fs.readFileSync(path.join(rootDir, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    expect(libRs).toContain('TrayIconBuilder')
    expect(libRs).toContain('prevent_close')

    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    expect(pkg.scripts['tauri:prepare']).toBeDefined()
    expect(pkg.scripts['tauri:dev']).toBeDefined()
    expect(pkg.scripts['tauri:build']).toBeDefined()
  })

  it('configures tauri-plugin-autostart for Windows boot startup', () => {
    const cargoToml = fs.readFileSync(path.join(rootDir, 'src-tauri', 'Cargo.toml'), 'utf8')
    expect(cargoToml).toContain('tauri-plugin-autostart = "2"')

    const capabilities = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
    )
    expect(capabilities.permissions).toContain('autostart:default')

    const libRs = fs.readFileSync(path.join(rootDir, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    expect(libRs).toContain('tauri_plugin_autostart')
    expect(libRs).toContain('autolaunch().enable()')
  })

  it('configures tauri-plugin-notification, withGlobalTauri, and remote capability URLs for Windows notifications', () => {
    const cargoToml = fs.readFileSync(path.join(rootDir, 'src-tauri', 'Cargo.toml'), 'utf8')
    expect(cargoToml).toContain('tauri-plugin-notification = "2"')

    const conf = JSON.parse(fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'))
    expect(conf.app.withGlobalTauri).toBe(true)

    const capabilities = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
    )
    expect(capabilities.remote?.urls).toEqual(
      expect.arrayContaining([
        'https://taolaobidao.vercel.app/*',
        'https://*.vercel.app/*',
        'http://localhost:*/*',
      ])
    )
    expect(capabilities.permissions).toEqual(
      expect.arrayContaining([
        'notification:default',
        'core:window:allow-set-badge-count',
        'core:window:allow-request-user-attention',
      ])
    )

    const libRs = fs.readFileSync(path.join(rootDir, 'src-tauri', 'src', 'lib.rs'), 'utf8')
    expect(libRs).toContain('tauri_plugin_notification::init()')
  })
})
