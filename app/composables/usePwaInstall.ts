import { ref, type Ref } from 'vue'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export interface PwaInstallManagerOptions {
  windowTarget?: EventTarget | null
  isStandalone?: () => boolean
  registerServiceWorker?: () => void
}

export function createPwaInstallManager(options?: PwaInstallManagerOptions) {
  let deferredPrompt: BeforeInstallPromptEvent | null = null
  let swRegistered = false
  let listenersAttached = false

  const checkStandalone = (): boolean => {
    if (options?.isStandalone) {
      return options.isStandalone()
    }
    if (typeof window !== 'undefined') {
      if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
        return true
      }
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(display-mode: standalone)').matches
      }
    }
    return false
  }

  const isInstalled = ref<boolean>(checkStandalone())
  const canInstall = ref<boolean>(false)

  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    if (!isInstalled.value) {
      canInstall.value = true
    }
  }

  const handleAppInstalled = () => {
    deferredPrompt = null
    canInstall.value = false
    isInstalled.value = true
  }

  const getTarget = (): EventTarget | null => {
    if (options?.windowTarget !== undefined) {
      return options.windowTarget
    }
    if (typeof window !== 'undefined') {
      return window
    }
    return null
  }

  const init = () => {
    if (!swRegistered) {
      swRegistered = true
      if (options?.registerServiceWorker) {
        options.registerServiceWorker()
      } else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          navigator.serviceWorker.register('/sw.js').catch(() => {})
        } catch {}
      }
    }

    if (listenersAttached) return
    const target = getTarget()
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      target.addEventListener('appinstalled', handleAppInstalled)
      listenersAttached = true
    }
  }

  const cleanup = () => {
    const target = getTarget()
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      target.removeEventListener('appinstalled', handleAppInstalled)
    }
    listenersAttached = false
  }

  const promptInstall = async (): Promise<'accepted' | 'dismissed'> => {
    if (!deferredPrompt) {
      canInstall.value = false
      return 'dismissed'
    }

    const promptEvent = deferredPrompt
    deferredPrompt = null
    canInstall.value = false

    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      if (choice?.outcome === 'accepted') {
        isInstalled.value = true
      }
      return choice?.outcome || 'dismissed'
    } catch {
      return 'dismissed'
    }
  }

  return {
    canInstall,
    isInstalled,
    init,
    cleanup,
    promptInstall,
  }
}

let globalPwaInstallManager: ReturnType<typeof createPwaInstallManager> | null = null

export function usePwaInstall() {
  if (!globalPwaInstallManager) {
    globalPwaInstallManager = createPwaInstallManager()
  }
  return globalPwaInstallManager
}
