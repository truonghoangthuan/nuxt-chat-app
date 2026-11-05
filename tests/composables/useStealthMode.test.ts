import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  formatShortcutFromEvent,
  matchesShortcutEvent,
  useStealthMode,
} from '~/composables/useStealthMode'

describe('useStealthMode & shortcut helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    const { setStealthHidden, updateStealthConfig, removeCustomCoverImage } = useStealthMode()
    setStealthHidden(false)
    updateStealthConfig({ shortcut: 'Ctrl+H', mode: 'code', imageFit: 'cover', cloakTitle: 'Workspace — Notes' })
    removeCustomCoverImage()
  })

  it('formats valid modifier + key combinations and function keys', () => {
    expect(formatShortcutFromEvent({ key: 'h', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('Ctrl+H')
    expect(formatShortcutFromEvent({ key: 'x', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe('Ctrl+Shift+X')
    expect(formatShortcutFromEvent({ key: 'F9', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe('F9')
    expect(formatShortcutFromEvent({ key: ' ', code: 'Space', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('Ctrl+Space')
  })

  it('rejects modifier-only presses and bare single keys without modifiers', () => {
    expect(formatShortcutFromEvent({ key: 'Control', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBeNull()
    expect(formatShortcutFromEvent({ key: 'h', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeNull()
    expect(formatShortcutFromEvent({ key: 'Enter', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeNull()
  })

  it('matches KeyboardEvent against configured shortcut case-insensitively', () => {
    expect(matchesShortcutEvent({ key: 'h', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }, 'Ctrl+H')).toBe(true)
    expect(matchesShortcutEvent({ key: 'H', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }, 'ctrl+h')).toBe(true)
    expect(matchesShortcutEvent({ key: 'h', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false }, 'Ctrl+H')).toBe(false)
    expect(matchesShortcutEvent({ key: ' ', code: 'Space', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }, 'Ctrl+Space')).toBe(true)
  })

  it('persists custom shortcut, cover mode, and image data URL in localStorage', () => {
    const stealth = useStealthMode()
    stealth.updateStealthConfig({ shortcut: 'Alt+Z', mode: 'image' })
    const success = stealth.setCustomCoverImage('data:image/png;base64,iVBORw0KGgo=')

    expect(success).toBe(true)
    expect(stealth.config.value.shortcut).toBe('Alt+Z')
    expect(stealth.customImageUrl.value).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(localStorage.getItem('nuxt-chat-stealth-image')).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('returns false from setCustomCoverImage when storage quota is exceeded', () => {
    const stealth = useStealthMode()
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })

    const success = stealth.setCustomCoverImage('data:image/png;base64,giantdata')
    expect(success).toBe(false)
    setItemSpy.mockRestore()
  })

  it('cloaks and restores document.title when toggling stealth mode', () => {
    document.title = 'Nuxt Friends Chat (3)'
    const stealth = useStealthMode()
    stealth.updateStealthConfig({ cloakTitle: 'Q4_Report.xlsx' })

    stealth.toggleStealth()
    expect(stealth.isStealthHidden.value).toBe(true)
    expect(document.title).toBe('Q4_Report.xlsx')

    stealth.toggleStealth()
    expect(stealth.isStealthHidden.value).toBe(false)
    expect(document.title).toBe('Nuxt Friends Chat (3)')
  })
})
