import { ref, type Ref } from 'vue'

export type AppUiTheme = 'default' | 'vscode' | 'yahoo' | 'telegram'
export const VALID_UI_THEMES: AppUiTheme[] = ['default', 'vscode', 'yahoo', 'telegram']

const testDarkRef = ref<boolean>(true)
const testUiThemeRef = ref<AppUiTheme>('default')

export function useTheme() {
  const isDark: Ref<boolean> = typeof useState !== 'undefined'
    ? useState<boolean>('theme-dark', () => true)
    : testDarkRef

  const uiTheme: Ref<AppUiTheme> = typeof useState !== 'undefined'
    ? useState<AppUiTheme>('theme-ui', () => 'default')
    : testUiThemeRef

  function applyClass(): void {
    if (typeof document !== 'undefined') {
      const doc = document.documentElement
      doc.classList.toggle('dark', isDark.value)
      VALID_UI_THEMES.forEach((t) => doc.classList.remove(`theme-${t}`))
      doc.classList.add(`theme-${uiTheme.value}`)
      doc.dataset.theme = uiTheme.value
    }
  }

  function initTheme(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('nuxt-chat-theme')
        const storedUi = localStorage.getItem('nuxt-chat-ui-theme') as AppUiTheme | null
        isDark.value = stored !== 'light'
        uiTheme.value = storedUi && VALID_UI_THEMES.includes(storedUi) ? storedUi : 'default'
      }
    } catch {
      // Keep the in-memory preferences when browser storage is unavailable.
    }
    applyClass()
  }

  function toggleTheme(): void {
    isDark.value = !isDark.value
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('nuxt-chat-theme', isDark.value ? 'dark' : 'light')
      }
    } catch {
      // Persistence is best-effort; theme controls must still update the DOM.
    }
    applyClass()
  }

  function setUiTheme(theme: AppUiTheme): void {
    if (VALID_UI_THEMES.includes(theme)) {
      uiTheme.value = theme
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('nuxt-chat-ui-theme', theme)
        }
      } catch {
        // Persistence is best-effort; theme controls must still update the DOM.
      }
      applyClass()
    }
  }

  return {
    isDark,
    uiTheme,
    initTheme,
    toggleTheme,
    setUiTheme,
  }
}
