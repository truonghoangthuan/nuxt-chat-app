# Windows Installable PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `nuxt-chat-app` natively installable on Windows (Start Menu, Taskbar, standalone desktop window) as a Progressive Web App (PWA) with an in-app one-click install button.

**Architecture:** Add a W3C Web App Manifest (`public/manifest.webmanifest`) with zero-dependency generated `192x192` and `512x512` PNG icons, link the manifest in `nuxt.config.ts`, add a pass-through `fetch` handler to `public/sw.js`, and wire a testable `createPwaInstallManager` composable (`app/composables/usePwaInstall.ts`) to a conditional install button (`[data-test="install-pwa-btn"]`) in `app/components/ChatSidebar.vue`.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Web App Manifest & Service Worker APIs, `@lucide/vue`, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-26-windows-pwa-install-design.md`

## Global Constraints

- Zero new npm dependencies (`ponytail` principle: use Node built-ins `node:zlib`/`node:fs` for PNG icon generation and standard Web APIs for install prompts).
- Never cache E2EE payloads, decrypted messages, or Supabase responses in `public/sw.js` (`fetch` listener must remain a network pass-through).
- Preserve all existing `public/sw.js` Windows Action Center `notificationclick` behavior and `ChatSidebar.vue` `data-test` hooks.
- Guard all browser globals (`window`, `navigator.serviceWorker`, `window.matchMedia`) so Vitest tests run cleanly in `happy-dom` and SSR.

## Review Focus

- Calling `promptInstall()` when `beforeinstallprompt` was never fired: must safely no-op and return `'dismissed'` without throwing.
- Calling `promptInstall()` when user dismisses the native browser install dialog (`outcome: 'dismissed'`): must still clear the consumed `BeforeInstallPromptEvent` reference (`canInstall.value = false`) because Chromium invalidates a `BeforeInstallPromptEvent` after a single `.prompt()` call.
- App already running in standalone Windows window (`window.matchMedia('(display-mode: standalone)').matches === true`): `isInstalled` must be `true` and `canInstall` must remain `false` even if a synthetic event fires.
- Unmounting the workspace (`cleanup()`): must remove `beforeinstallprompt` and `appinstalled` listeners from `window` so repeated mounts in tests or navigation do not leak duplicate handlers.
- Service Worker `fetch` handler in `public/sw.js`: must not call `event.respondWith()` so Supabase Realtime WebSockets, Auth redirects, and E2EE blob fetches pass straight through the browser's native network stack.

---

### Task 1: PWA Manifest, Icons & Service Worker Fetch Hook

**Files:**
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `public/pwa-192x192.png`
- Create: `public/pwa-512x512.png`
- Create: `public/manifest.webmanifest`
- Modify: `public/sw.js`
- Modify: `nuxt.config.ts`
- Create: `tests/utils/pwaManifest.test.ts`

**Interfaces:**
- Produces:
  - `public/manifest.webmanifest` (valid JSON manifest with `192x192` PNG, `512x512` PNG, and SVG icon entries)
  - `public/pwa-192x192.png` and `public/pwa-512x512.png` (valid PNG binary headers + dimensions)
  - `public/sw.js` (`install`, `activate`, `fetch`, `notificationclick` listeners)
  - `nuxt.config.ts` (`rel="manifest"` link and `name="theme-color"` meta)

- [ ] **Step 1: Write the failing test in `tests/utils/pwaManifest.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Windows PWA Manifest, Icons & Service Worker', () => {
  const rootDir = process.cwd()

  it('provides a valid public/manifest.webmanifest for standalone Windows installation', () => {
    const manifestPath = path.join(rootDir, 'public', 'manifest.webmanifest')
    expect(fs.existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    expect(manifest.name).toBe('Friends Chat — Precision Studio')
    expect(manifest.short_name).toBe('Friends Chat')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.theme_color).toBe('#0b0f17')
    expect(manifest.background_color).toBe('#0b0f17')

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/pwaManifest.test.ts`
Expected: FAIL (`expect(fs.existsSync(manifestPath)).toBe(true)` fails).

- [ ] **Step 3: Create `scripts/generate-pwa-icons.mjs` and generate the PNG icons, `public/manifest.webmanifest`, `public/sw.js` update, and `nuxt.config.ts` head tags**

1. Create `scripts/generate-pwa-icons.mjs` using `node:zlib` (`deflateSync`) and `node:fs` to write `public/pwa-192x192.png` and `public/pwa-512x512.png` with `#0b0f17` background and a centered `#10b981` rounded mug badge, then run `node scripts/generate-pwa-icons.mjs`.
2. Create `public/manifest.webmanifest` with `name: "Friends Chat — Precision Studio"`, `short_name: "Friends Chat"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color: "#0b0f17"`, `theme_color: "#0b0f17"`, and `icons` for `/pwa-192x192.png`, `/pwa-512x512.png`, and `/mug-hot-solid-full.svg`.
3. In `public/sw.js`, append `self.addEventListener('fetch', () => {})`.
4. In `nuxt.config.ts`, add `{ rel: 'manifest', href: '/manifest.webmanifest' }` and `{ rel: 'apple-touch-icon', href: '/pwa-192x192.png' }` to `app.head.link`, and `meta: [{ name: 'theme-color', content: '#0b0f17' }, { name: 'application-name', content: 'Friends Chat' }]` to `app.head`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/pwaManifest.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-pwa-icons.mjs public/pwa-192x192.png public/pwa-512x512.png public/manifest.webmanifest public/sw.js nuxt.config.ts tests/utils/pwaManifest.test.ts
git commit -m "feat(pwa): add web manifest, Windows PNG icons, and sw fetch listener"
```

---

### Task 2: PWA Install Manager Composable (`app/composables/usePwaInstall.ts`)

**Files:**
- Create: `app/composables/usePwaInstall.ts`
- Create: `tests/composables/usePwaInstall.test.ts`

**Interfaces:**
- Produces:
  - `BeforeInstallPromptEvent` interface
  - `PwaInstallManagerOptions` interface (`windowTarget?: EventTarget | null`, `isStandalone?: () => boolean`, `registerServiceWorker?: () => void`)
  - `createPwaInstallManager(options?: PwaInstallManagerOptions)` returning `{ canInstall: Ref<boolean>, isInstalled: Ref<boolean>, init: () => void, cleanup: () => void, promptInstall: () => Promise<'accepted' | 'dismissed'> }`
  - `usePwaInstall()` singleton composable wrapper

- [ ] **Step 1: Write the failing test in `tests/composables/usePwaInstall.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/usePwaInstall.test.ts`
Expected: FAIL (`Cannot find module '~/composables/usePwaInstall'`).

- [ ] **Step 3: Implement `app/composables/usePwaInstall.ts`**

Create `app/composables/usePwaInstall.ts` exporting `createPwaInstallManager` and `usePwaInstall`. Check standalone state via `options?.isStandalone ? options.isStandalone() : (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)`. Register `/sw.js` in `init()` when `navigator.serviceWorker` exists, attach `beforeinstallprompt` and `appinstalled` handlers to `target`, and remove them in `cleanup()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/usePwaInstall.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add app/composables/usePwaInstall.ts tests/composables/usePwaInstall.test.ts
git commit -m "feat(pwa): add usePwaInstall composable for Windows install prompt"
```

---

### Task 3: Sidebar Install Button & Workspace Wiring (`app/components/ChatSidebar.vue`, `app/pages/index.vue`)

**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Modify: `app/pages/index.vue`
- Modify: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `usePwaInstall()` from `~/composables/usePwaInstall`
- Produces:
  - `ChatSidebar.vue` prop `canInstallPwa?: boolean` (default `false`) and emit `(e: 'installPwa'): void`
  - `[data-test="install-pwa-btn"]` button in `ChatSidebar.vue` footer action bar

- [ ] **Step 1: Write the failing test in `tests/components/chatUi.test.ts`**

Add a test in `tests/components/chatUi.test.ts`:

```typescript
  it('ChatSidebar renders the Windows Install App button only when canInstallPwa is true and emits installPwa', async () => {
    const baseProps = {
      conversations: [],
      activeConversationId: null,
      unreadCounts: {},
      onlineFriends: [],
      currentUser: { id: 'u-1', display_name: 'Alice', avatar_color: '#10b981' },
      isDark: true,
      connectionStatus: 'connected' as const,
      isOpenMobile: false,
    }

    const hiddenWrapper = mount(ChatSidebar, {
      props: { ...baseProps, canInstallPwa: false },
    })
    expect(hiddenWrapper.find('[data-test="install-pwa-btn"]').exists()).toBe(false)

    const installableWrapper = mount(ChatSidebar, {
      props: { ...baseProps, canInstallPwa: true },
    })
    const installBtn = installableWrapper.find('[data-test="install-pwa-btn"]')
    expect(installBtn.exists()).toBe(true)
    expect(installBtn.attributes('title')).toBe('Install Windows App')

    await installBtn.trigger('click')
    expect(installableWrapper.emitted('installPwa')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (`expect(installBtn.exists()).toBe(true)` fails).

- [ ] **Step 3: Implement `canInstallPwa` button in `app/components/ChatSidebar.vue` and wire in `app/pages/index.vue`**

1. In `app/components/ChatSidebar.vue`:
   - Import `Download` from `@lucide/vue`.
   - Add `canInstallPwa?: boolean` (default `false`) to `defineProps` and `(e: 'installPwa'): void` to `defineEmits`.
   - In the footer action bar (before Profile Settings button), render:
     ```vue
     <Button
       v-if="canInstallPwa"
       type="button"
       variant="ghost"
       size="icon"
       data-test="install-pwa-btn"
       class="size-7.5 rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
       aria-label="Install Windows App"
       title="Install Windows App"
       @click="emit('installPwa')"
     >
       <Download class="size-3.5" aria-hidden="true" />
     </Button>
     ```
2. In `app/pages/index.vue`:
   - Import `usePwaInstall` from `~/composables/usePwaInstall`.
   - Destructure `{ canInstall: canInstallPwa, init: initPwaInstall, cleanup: cleanupPwaInstall, promptInstall: promptInstallPwa } = usePwaInstall()`.
   - Call `initPwaInstall()` inside `onMounted` (before `initializeE2ee()` so `/sw.js` registers and `beforeinstallprompt` is captured even on the E2EE gate) and `cleanupPwaInstall()` inside `onUnmounted`.
   - Pass `:can-install-pwa="canInstallPwa"` and `@install-pwa="promptInstallPwa"` to `<ChatSidebar />`.

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`
Expected: All test suites PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/ChatSidebar.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(pwa): add Install Windows App button to ChatSidebar"
```
