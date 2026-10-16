import { ref } from 'vue'

const isDark = ref<boolean>(true)

export function useTheme() {
  function applyClass(): void {
    if (typeof document !== 'undefined') {
      if (isDark.value) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  function initTheme(): void {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('nuxt-chat-theme')
      if (stored === 'light') {
        isDark.value = false
      } else {
        isDark.value = true
      }
    }
    applyClass()
  }

  function toggleTheme(): void {
    isDark.value = !isDark.value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nuxt-chat-theme', isDark.value ? 'dark' : 'light')
    }
    applyClass()
  }

  return {
    isDark,
    initTheme,
    toggleTheme,
  }
}
