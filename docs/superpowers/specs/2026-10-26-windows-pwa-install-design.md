# Windows Installable Progressive Web App (PWA) Design

## 1. Problem & Intent
Users running `nuxt-chat-app` on Windows machines want to install the application natively to their Windows Start Menu, Desktop, and Taskbar so it launches in its own standalone desktop window without browser chrome, while keeping existing Windows Action Center notifications and End-to-End Encryption (E2EE) guarantees intact.

Currently, the app registers `public/sw.js` for Windows Action Center desktop notifications (`useNotification.ts`), but lacks:
1. A Web App Manifest (`public/manifest.webmanifest`) and required `192x192` / `512x512` PNG icons for Windows `.ico` shortcut generation.
2. HTML `<head>` manifest and theme-color metadata in `nuxt.config.ts`.
3. A Service Worker `fetch` event handler in `public/sw.js` (required by Chromium on Windows to satisfy PWA installability criteria) and root-level Service Worker registration so the app is installable even before unlocking `E2eeGate`.
4. An in-app "Install App" control (`beforeinstallprompt` / `appinstalled`) in `ChatSidebar.vue` so users can install the Windows app in one click without hunting inside the browser's three-dot menu.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Make `nuxt-chat-app` pass Chromium (Edge, Chrome, Brave) PWA installability checks on Windows.
- Provide `public/manifest.webmanifest` with `display: "standalone"`, `start_url: "/"`, `scope: "/"`, `#0b0f17` theme/background colors, and `192x192` PNG, `512x512` PNG, and SVG icons.
- Provide a pure, testable composable `app/composables/usePwaInstall.ts` (`createPwaInstallManager`) managing `beforeinstallprompt`, `appinstalled`, standalone detection, and `promptInstall()`.
- Surface an "Install App" button (`data-test="install-pwa-btn"`) in `ChatSidebar.vue`'s footer action bar whenever `canInstall` is true.
- Zero new npm dependencies (`ponytail` principle).

### Non-Goals
- Offline message history reading/sending (`IndexedDB` cache) or caching authenticated Supabase responses in Service Worker Cache Storage.
- Native `.exe` / `.msi` wrappers (Tauri / Electron) or Microsoft Store (`MSIX`) submission.

### Anti-Goals
- Never cache decrypted messages, `sessionStorage` E2EE keys, or Supabase REST/Realtime responses in `public/sw.js`.
- Never show the "Install App" button when the app is already running in `standalone` mode or when `beforeinstallprompt` has not fired.

---

## 3. Architecture & Component Design

### 3.1 Web App Manifest & Icons (`public/manifest.webmanifest`, `scripts/generate-pwa-icons.mjs`)
- `public/manifest.webmanifest`:
  - `id`: `"/"`
  - `name`: `"Friends Chat — Precision Studio"`
  - `short_name`: `"Friends Chat"`
  - `description`: `"Real-time end-to-end encrypted chat workspace for friends"`
  - `start_url`: `"/"`
  - `scope`: `"/"`
  - `display`: `"standalone"`
  - `background_color`: `"#0b0f17"`
  - `theme_color`: `"#0b0f17"`
  - `icons`:
    - `/pwa-192x192.png` (`192x192`, `image/png`, `purpose: "any"`)
    - `/pwa-512x512.png` (`512x512`, `image/png`, `purpose: "any maskable"`)
    - `/mug-hot-solid-full.svg` (`any`, `image/svg+xml`, `purpose: "any"`)
- `scripts/generate-pwa-icons.mjs`:
  - Zero-dependency Node script (`node:zlib`, `node:fs`) that generates valid `public/pwa-192x192.png` and `public/pwa-512x512.png` brand icons (`#0b0f17` dark studio background with `#10b981` emerald coffee mug motif).

### 3.2 Head Configuration (`nuxt.config.ts`)
- Add `<link rel="manifest" href="/manifest.webmanifest">` and `<link rel="apple-touch-icon" href="/pwa-192x192.png">` to `app.head.link`.
- Add `<meta name="theme-color" content="#0b0f17">` and `<meta name="application-name" content="Friends Chat">` to `app.head.meta`.

### 3.3 Service Worker (`public/sw.js`)
- Preserve existing `install`, `activate`, and `notificationclick` listeners intact.
- Add a minimal network pass-through `fetch` listener:
  ```js
  self.addEventListener('fetch', () => {
    // Network pass-through required for Windows Chromium PWA installability; never cache E2EE payloads.
  })
  ```

### 3.4 PWA Install State Composable (`app/composables/usePwaInstall.ts`)
- `BeforeInstallPromptEvent` interface extending `Event`:
  - `prompt: () => Promise<void>`
  - `userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>`
- `createPwaInstallManager(options?)`:
  - Accepts injectable `windowTarget` and `isStandaloneCheck` for deterministic Vitest testing without full browser dependency.
  - Registers `/sw.js` if `navigator.serviceWorker` is available so PWA criteria are met even before `useNotification` initializes.
  - Tracks `canInstall: Ref<boolean>` and `isInstalled: Ref<boolean>`.
  - Listens for `beforeinstallprompt`: calls `event.preventDefault()`, stores deferred event, and sets `canInstall.value = !isInstalled.value`.
  - Listens for `appinstalled`: clears deferred event, sets `canInstall.value = false`, and sets `isInstalled.value = true`.
  - `promptInstall()`: invokes `deferredPrompt.prompt()`, awaits `userChoice`, clears deferred event and sets `canInstall.value = false` on `'accepted'` (or whenever prompt is consumed, since `BeforeInstallPromptEvent.prompt()` can only be called once per event).
  - `cleanup()`: removes window listeners.

### 3.5 Sidebar UI Integration (`app/components/ChatSidebar.vue`, `app/pages/index.vue`)
- `ChatSidebar.vue`:
  - New optional prop `canInstallPwa?: boolean` (default `false`) and emit `(e: 'installPwa'): void`.
  - In the footer action bar (alongside Profile Settings, Notifications, Theme, and Logout), render a `Button` (`data-test="install-pwa-btn"`, `title="Install Windows App"`, `aria-label="Install Windows App"`) with the `Download` icon from `@lucide/vue` when `canInstallPwa` is `true`.
- `app/pages/index.vue`:
  - Wire `usePwaInstall()` (`canInstall`, `promptInstall`, `initPwaInstall`, `cleanupPwaInstall`) into `onMounted` / `onUnmounted` and pass `:can-install-pwa="canInstallPwa"` and `@install-pwa="promptInstallPwa"` to `ChatSidebar`.

---

## 4. Testing Strategy
- `tests/composables/usePwaInstall.test.ts`:
  - Captures `beforeinstallprompt`, prevents default, and sets `canInstall` to `true`.
  - `promptInstall()` calls `prompt()`, awaits `userChoice`, and updates `canInstall` / `isInstalled`.
  - `appinstalled` event resets `canInstall` to `false` and marks `isInstalled` as `true`.
  - Standalone mode (`display-mode: standalone`) starts with `isInstalled = true` and suppresses `canInstall`.
- `tests/components/chatUi.test.ts`:
  - `ChatSidebar` hides `[data-test="install-pwa-btn"]` by default (`canInstallPwa: false`).
  - `ChatSidebar` renders `[data-test="install-pwa-btn"]` when `canInstallPwa: true` and emits `installPwa` on click.
