import { describe, it, expect, beforeEach } from 'vitest'
import { useTheme } from '~/composables/useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
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
