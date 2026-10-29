import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTheme } from '~/composables/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('initializes the DOM when persisted preferences cannot be read', () => {
    const theme = useTheme()
    theme.initTheme()
    theme.toggleTheme()
    theme.setUiTheme('telegram')
    document.documentElement.className = ''
    delete document.documentElement.dataset.theme
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('Storage access denied', 'SecurityError') },
    })

    expect(() => theme.initTheme()).not.toThrow()
    expect(theme.isDark.value).toBe(false)
    expect(theme.uiTheme.value).toBe('telegram')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('telegram')
    expect(document.documentElement.classList.contains('theme-telegram')).toBe(true)
  })

  it.each(['SecurityError', 'QuotaExceededError'])('updates visible themes when persistence throws %s', (name) => {
    const theme = useTheme()
    theme.initTheme()
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new DOMException('Cannot persist preferences', name) },
    })

    expect(() => theme.toggleTheme()).not.toThrow()
    expect(theme.isDark.value).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(() => theme.setUiTheme('telegram')).not.toThrow()
    expect(theme.uiTheme.value).toBe('telegram')
    expect(document.documentElement.dataset.theme).toBe('telegram')
    expect(document.documentElement.classList.contains('theme-telegram')).toBe(true)
    expect(document.documentElement.classList.contains('theme-default')).toBe(false)
  })

  it('keeps theme operations working when accessing localStorage itself throws', () => {
    const theme = useTheme()
    theme.initTheme()
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new DOMException('Storage access denied', 'SecurityError') },
    })
    try {
      expect(() => theme.initTheme()).not.toThrow()
      expect(() => theme.toggleTheme()).not.toThrow()
      expect(() => theme.setUiTheme('telegram')).not.toThrow()
      expect(theme.isDark.value).toBe(false)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.dataset.theme).toBe('telegram')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('supports unavailable storage without losing in-memory preferences', () => {
    const theme = useTheme()
    theme.initTheme()
    vi.stubGlobal('localStorage', undefined)
    expect(() => theme.toggleTheme()).not.toThrow()
    expect(() => theme.setUiTheme('vscode')).not.toThrow()
    expect(() => theme.initTheme()).not.toThrow()
    expect(theme.isDark.value).toBe(false)
    expect(theme.uiTheme.value).toBe('vscode')
    expect(document.documentElement.dataset.theme).toBe('vscode')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('defaults to dark mode and toggles to light mode with localStorage persistence', () => {
    const theme = useTheme()
    theme.initTheme()
    expect(theme.isDark.value).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    theme.toggleTheme()
    expect(theme.isDark.value).toBe(false)
    expect(localStorage.getItem('nuxt-chat-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists and restores Telegram independently of color mode and cleans up when switching away', () => {
    const theme = useTheme()
    theme.initTheme()
    theme.setUiTheme('telegram')
    expect(theme.uiTheme.value).toBe('telegram')
    expect(localStorage.getItem('nuxt-chat-ui-theme')).toBe('telegram')
    expect(document.documentElement.dataset.theme).toBe('telegram')
    expect(document.documentElement.classList.contains('theme-telegram')).toBe(true)
    expect(document.documentElement.classList.contains('theme-default')).toBe(false)
    theme.toggleTheme()
    expect(theme.isDark.value).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('telegram')
    theme.initTheme()
    expect(theme.uiTheme.value).toBe('telegram')
    expect(theme.isDark.value).toBe(false)
    theme.toggleTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('telegram')
    for (const next of ['vscode', 'yahoo', 'default'] as const) {
      theme.setUiTheme('telegram')
      theme.setUiTheme(next)
      expect(document.documentElement.classList.contains('theme-telegram')).toBe(false)
      expect(document.documentElement.dataset.theme).toBe(next)
      expect(theme.isDark.value).toBe(true)
    }
  })

  it('defaults uiTheme to default, switches between vscode and yahoo with localStorage persistence, and preserves dark class', () => {
    const theme = useTheme()
    theme.initTheme()
    expect(theme.uiTheme.value).toBe('default')
    expect(document.documentElement.dataset.theme).toBe('default')
    expect(document.documentElement.classList.contains('theme-default')).toBe(true)

    theme.setUiTheme('vscode')
    expect(theme.uiTheme.value).toBe('vscode')
    expect(localStorage.getItem('nuxt-chat-ui-theme')).toBe('vscode')
    expect(document.documentElement.dataset.theme).toBe('vscode')
    expect(document.documentElement.classList.contains('theme-vscode')).toBe(true)
    expect(document.documentElement.classList.contains('theme-default')).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    theme.toggleTheme()
    expect(theme.isDark.value).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('vscode')

    localStorage.setItem('nuxt-chat-ui-theme', 'invalid-theme')
    theme.initTheme()
    expect(theme.uiTheme.value).toBe('default')
  })
})
