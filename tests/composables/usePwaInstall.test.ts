import { describe, it, expect, vi } from 'vitest'
import { createPwaInstallManager } from '~/composables/usePwaInstall'

describe('usePwaInstall composable (createPwaInstallManager)', () => {
  it('captures beforeinstallprompt, sets canInstall=true, and triggers promptInstall()', async () => {
    const target = new EventTarget()
    const registerSw = vi.fn()
    const manager = createPwaInstallManager({
      windowTarget: target,
      isStandalone: () => false,
      registerServiceWorker: registerSw,
    })

    manager.init()
    expect(registerSw).toHaveBeenCalledTimes(1)
    expect(manager.canInstall.value).toBe(false)
    expect(manager.isInstalled.value).toBe(false)

    const promptEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    })

    target.dispatchEvent(promptEvent)
    expect(promptEvent.defaultPrevented).toBe(true)
    expect(manager.canInstall.value).toBe(true)

    const outcome = await manager.promptInstall()
    expect(outcome).toBe('accepted')
    expect(promptEvent.prompt).toHaveBeenCalledTimes(1)
    expect(manager.canInstall.value).toBe(false)
    expect(manager.isInstalled.value).toBe(true)

    manager.cleanup()
  })

  it('clears canInstall even when user dismisses the install prompt because prompt event is single-use', async () => {
    const target = new EventTarget()
    const manager = createPwaInstallManager({
      windowTarget: target,
      isStandalone: () => false,
      registerServiceWorker: vi.fn(),
    })

    manager.init()
    const promptEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    })

    target.dispatchEvent(promptEvent)
    expect(manager.canInstall.value).toBe(true)

    const outcome = await manager.promptInstall()
    expect(outcome).toBe('dismissed')
    expect(manager.canInstall.value).toBe(false)
    expect(manager.isInstalled.value).toBe(false)

    // Subsequent promptInstall() without a new event safely returns 'dismissed'
    expect(await manager.promptInstall()).toBe('dismissed')
    manager.cleanup()
  })

  it('marks isInstalled=true and suppresses canInstall when already in standalone display mode or on appinstalled', () => {
    const target = new EventTarget()
    const standaloneManager = createPwaInstallManager({
      windowTarget: target,
      isStandalone: () => true,
      registerServiceWorker: vi.fn(),
    })

    standaloneManager.init()
    expect(standaloneManager.isInstalled.value).toBe(true)

    const promptEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    })
    target.dispatchEvent(promptEvent)
    expect(standaloneManager.canInstall.value).toBe(false)
    standaloneManager.cleanup()

    // Also test appinstalled event transition from browser mode
    const browserManager = createPwaInstallManager({
      windowTarget: target,
      isStandalone: () => false,
      registerServiceWorker: vi.fn(),
    })
    browserManager.init()
    target.dispatchEvent(promptEvent)
    expect(browserManager.canInstall.value).toBe(true)

    target.dispatchEvent(new Event('appinstalled'))
    expect(browserManager.canInstall.value).toBe(false)
    expect(browserManager.isInstalled.value).toBe(true)
    browserManager.cleanup()
  })
})
