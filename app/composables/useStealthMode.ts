import { ref, type Ref } from 'vue'

export type StealthCoverMode = 'image' | 'code' | 'sheet'

export interface StealthConfig {
  shortcut: string
  mode: StealthCoverMode
  imageFit: 'cover' | 'contain'
  cloakTitle: string
}

export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  shortcut: 'Ctrl+H',
  mode: 'code',
  imageFit: 'cover',
  cloakTitle: 'Workspace — Notes',
}

export const STORAGE_KEY_STEALTH_CONFIG = 'nuxt-chat-stealth-config'
export const STORAGE_KEY_STEALTH_IMAGE = 'nuxt-chat-stealth-image'

const testIsStealthHiddenRef = ref<boolean>(false)
const testConfigRef = ref<StealthConfig>({ ...DEFAULT_STEALTH_CONFIG })
const testCustomImageUrlRef = ref<string | null>(null)
const testOriginalTitleRef = ref<string>('')

export function formatShortcutFromEvent(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
): string | null {
  const key = e.key
  if (!key) return null
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null

  const isFn = /^F([1-9]|1[0-2])$/i.test(key)
  const hasModifiers = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey

  if (!hasModifiers && !isFn) {
    return null
  }

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')

  const keyPart = isFn ? key.toUpperCase() : key.length === 1 ? key.toUpperCase() : key
  parts.push(keyPart)

  return parts.join('+')
}

export function matchesShortcutEvent(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  shortcut: string
): boolean {
  if (!shortcut || !e.key) return false

  const tokens = shortcut.split('+').map(t => t.trim().toUpperCase())
  if (tokens.length === 0) return false

  const targetKey = tokens[tokens.length - 1]
  const targetMods = new Set(tokens.slice(0, -1))

  const eventKey = e.key.toUpperCase()
  if (eventKey !== targetKey) return false

  const wantAlt = targetMods.has('ALT')
  const wantShift = targetMods.has('SHIFT')
  const wantCtrl = targetMods.has('CTRL')
  const wantMeta = targetMods.has('META')

  if (wantAlt !== !!e.altKey) return false
  if (wantShift !== !!e.shiftKey) return false

  if (wantCtrl && !wantMeta) {
    const hasCtrlOrMeta = !!e.ctrlKey || !!e.metaKey
    if (!hasCtrlOrMeta) return false
  } else {
    if (wantCtrl !== !!e.ctrlKey) return false
    if (wantMeta !== !!e.metaKey) return false
  }

  return true
}

export function useStealthMode() {
  const isStealthHidden: Ref<boolean> = typeof useState !== 'undefined'
    ? useState<boolean>('stealth-hidden', () => false)
    : testIsStealthHiddenRef

  const config: Ref<StealthConfig> = typeof useState !== 'undefined'
    ? useState<StealthConfig>('stealth-config', () => ({ ...DEFAULT_STEALTH_CONFIG }))
    : testConfigRef

  const customImageUrl: Ref<string | null> = typeof useState !== 'undefined'
    ? useState<string | null>('stealth-image-url', () => null)
    : testCustomImageUrlRef

  const originalTitle: Ref<string> = typeof useState !== 'undefined'
    ? useState<string>('stealth-original-title', () => '')
    : testOriginalTitleRef

  function initStealthMode(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const storedConfig = localStorage.getItem(STORAGE_KEY_STEALTH_CONFIG)
        if (storedConfig) {
          const parsed = JSON.parse(storedConfig)
          config.value = { ...DEFAULT_STEALTH_CONFIG, ...parsed }
        }
        const storedImage = localStorage.getItem(STORAGE_KEY_STEALTH_IMAGE)
        if (storedImage) {
          customImageUrl.value = storedImage
        }
      }
    } catch {
      // Storage unavailable fallback
    }
  }

  function updateStealthConfig(patch: Partial<StealthConfig>): void {
    config.value = { ...config.value, ...patch }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_STEALTH_CONFIG, JSON.stringify(config.value))
      }
    } catch {
      // Best-effort persistence
    }
  }

  function setCustomCoverImage(dataUrl: string): void {
    customImageUrl.value = dataUrl
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_STEALTH_IMAGE, dataUrl)
      }
    } catch {
      // Best-effort persistence
    }
  }

  function removeCustomCoverImage(): void {
    customImageUrl.value = null
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_STEALTH_IMAGE)
      }
    } catch {
      // Best-effort persistence
    }
  }

  function setStealthHidden(val: boolean): void {
    if (isStealthHidden.value === val) return
    if (val) {
      if (typeof document !== 'undefined') {
        originalTitle.value = document.title
        if (config.value.cloakTitle) {
          document.title = config.value.cloakTitle
        }
      }
      isStealthHidden.value = true
    } else {
      isStealthHidden.value = false
      if (typeof document !== 'undefined' && originalTitle.value) {
        document.title = originalTitle.value
      }
    }
  }

  function toggleStealth(): void {
    setStealthHidden(!isStealthHidden.value)
  }

  return {
    isStealthHidden,
    config,
    customImageUrl,
    initStealthMode,
    toggleStealth,
    setStealthHidden,
    updateStealthConfig,
    setCustomCoverImage,
    removeCustomCoverImage,
  }
}
