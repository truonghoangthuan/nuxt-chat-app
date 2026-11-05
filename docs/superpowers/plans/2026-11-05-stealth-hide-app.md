# Stealth Hide Mode (Boss Key) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customizable keyboard shortcut (default `Ctrl+H`) that instantly hides the entire chat application behind a fullscreen cover (custom uploaded image or built-in interactive decoy screen) while muting audio and cloaking the browser tab title.

**Architecture:**
1. **Pure Shortcut & Stealth State Composable (`app/composables/useStealthMode.ts`):** Manages stealth visibility (`isStealthHidden`), user-configurable shortcut (`shortcut`, default `'Ctrl+H'`), decoy mode (`'image' | 'code' | 'sheet'`), custom uploaded image Data URL (`customImageUrl`), and browser tab title cloaking. Persists settings in `localStorage` with SSR/Vitest-safe `useState` fallback.
2. **Fullscreen Stealth Overlay (`app/components/StealthOverlay.vue`):** Renders at `fixed inset-0 z-[9999]` when `isStealthHidden` is true. Supports displaying the user's uploaded cover image (`object-cover` / `object-contain` toggle) and built-in zero-setup interactive decoys (Fake VSCode/Notes Editor and Fake Spreadsheet) when no image is uploaded or when a decoy preset is selected.
3. **Settings UI (`app/components/ProfileSettingsModal.vue`) & Workspace Wiring (`app/pages/index.vue`):** Adds a "Stealth / Boss Key" section in `ProfileSettingsModal.vue` with a live key-combo recorder, cover mode selector, and custom cover image upload/remove controls. Wires a capture-phase `keydown` listener in `app/pages/index.vue` that intercepts the shortcut (`e.preventDefault()`), toggles stealth mode, and pauses/mutes active music and sound effects while hidden.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS, Web `FileReader` / `localStorage`, Vitest + `@vue/test-utils`.

**Spec:**
- User requirement 1: Feature to hide the application via a keyboard shortcut like `Ctrl + H`, customizable in user settings.
- User requirement 2: When triggered, wrap/cover the entire application with a user-uploaded image or selectable built-in decoy screen (with tab title cloaking and audio mute).

## Global Constraints

- Follow SSR/Vitest state fallback invariant (`typeof useState !== 'undefined'` with module-scoped `ref` fallback) in `app/composables/useStealthMode.ts`.
- Reject bare typing keys (e.g., plain `a`–`z`, `0`–`9`, `Space`, `Enter`, `Backspace` without `Ctrl`, `Alt`, or `Meta` modifiers, except function keys `F1`–`F12`) when recording a custom shortcut so normal chat typing in `MessageComposer.vue` is never blocked.
- Register the global shortcut listener in capture phase (`window.addEventListener('keydown', handler, true)`) and call `e.preventDefault()` on match so `Ctrl+H` does not open the browser's native History panel when the page is focused.
- Never allow a single mouse click on `StealthOverlay.vue` to exit stealth mode; only pressing the configured shortcut again (or secret triple-click on the bottom-right corner for mobile/touch recovery) restores the chat.
- Preserve all existing `data-test` attributes and emit signatures in `ProfileSettingsModal.vue` and `index.vue`.

## Review Focus

1. **Typing in Composer vs. Shortcut Trigger:** Pressing `Ctrl+H` while focused inside the `<textarea>` composer must toggle stealth mode instead of typing `h`, whereas pressing normal characters without modifiers must never trigger stealth mode.
2. **Missing Custom Image Fallback:** If a user presses `Ctrl+H` before uploading a custom image (or after removing their custom image), `StealthOverlay.vue` must automatically fall back to the built-in `'code'` decoy screen rather than rendering a blank or broken `<img>`.
3. **Shortcut Recorder Escape / Modifier-Only Presses:** Pressing only `Control`, `Shift`, `Alt`, or `Meta` while recording a shortcut must wait for a non-modifier key; pressing `Escape` cancels recording without overwriting the existing shortcut.
4. **Audio & Buzz Leakage While Hidden:** If YouTube music is playing or an incoming message/buzz arrives while `isStealthHidden` is true, audio playback must pause/mute and buzz sound must not play aloud.
5. **LocalStorage Quota / Oversized Image Upload:** Uploading a cover image larger than 5MB or non-image MIME type in `ProfileSettingsModal.vue` must fail validation cleanly (`validateImageFile`) with an inline error message.

---

### Task 1: Create `useStealthMode` Composable & Shortcut Helpers

**Files:**
- Create: `app/composables/useStealthMode.ts`
- Test: `tests/composables/useStealthMode.test.ts`

**Interfaces:**
- Consumes: `validateImageFile` from `~/utils/chat`
- Produces:
  - `export type StealthCoverMode = 'image' | 'code' | 'sheet'`
  - `export interface StealthConfig { shortcut: string; mode: StealthCoverMode; imageFit: 'cover' | 'contain'; cloakTitle: string }`
  - `export function formatShortcutFromEvent(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null`
  - `export function matchesShortcutEvent(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>, shortcut: string): boolean`
  - `export function useStealthMode()` returning `{ isStealthHidden, config, customImageUrl, initStealthMode, toggleStealth, setStealthHidden, updateStealthConfig, setCustomCoverImage, removeCustomCoverImage }`

- [ ] **Step 1: Write the failing test in `tests/composables/useStealthMode.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
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
  })

  it('persists custom shortcut, cover mode, and image data URL in localStorage', () => {
    const stealth = useStealthMode()
    stealth.updateStealthConfig({ shortcut: 'Alt+Z', mode: 'image' })
    stealth.setCustomCoverImage('data:image/png;base64,iVBORw0KGgo=')

    expect(stealth.config.value.shortcut).toBe('Alt+Z')
    expect(stealth.customImageUrl.value).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(localStorage.getItem('nuxt-chat-stealth-image')).toBe('data:image/png;base64,iVBORw0KGgo=')
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useStealthMode.test.ts`
Expected: FAIL with module `~/composables/useStealthMode` not found.

- [ ] **Step 3: Implement `app/composables/useStealthMode.ts`**

Implement `formatShortcutFromEvent`, `matchesShortcutEvent`, and `useStealthMode` using `STORAGE_KEY_STEALTH_CONFIG = 'nuxt-chat-stealth-config'` and `STORAGE_KEY_STEALTH_IMAGE = 'nuxt-chat-stealth-image'`. Treat `metaKey` or `ctrlKey` as `Ctrl` when matching `Ctrl+<Key>` if on macOS, or format `Ctrl`/`Alt`/`Shift`/`Meta` explicitly so `Ctrl+H` works across platforms. Store original `document.title` before cloaking and restore it when `isStealthHidden` becomes `false`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useStealthMode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useStealthMode.ts tests/composables/useStealthMode.test.ts
git commit -m "feat(stealth): add useStealthMode composable and shortcut matcher"
```

---

### Task 2: Build Fullscreen `StealthOverlay.vue` Component

**Files:**
- Create: `app/components/StealthOverlay.vue`
- Test: `tests/components/StealthOverlay.test.ts`

**Interfaces:**
- Consumes: `StealthCoverMode` from `~/composables/useStealthMode`
- Props:
  - `active: boolean`
  - `mode: StealthCoverMode`
  - `customImageUrl: string | null`
  - `imageFit?: 'cover' | 'contain'`
  - `shortcutLabel?: string`
- Emits:
  - `(e: 'exit'): void` (only emitted on secret triple-click of the bottom-right status indicator for touch/mobile recovery; normal single clicks on the overlay do not emit `exit`)

- [ ] **Step 1: Write the failing test in `tests/components/StealthOverlay.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StealthOverlay from '~/components/StealthOverlay.vue'

describe('StealthOverlay', () => {
  it('renders nothing when active is false', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: false, mode: 'image', customImageUrl: 'data:image/png;base64,abc' },
    })
    expect(wrapper.find('[data-test="stealth-overlay"]').exists()).toBe(false)
  })

  it('renders fullscreen custom uploaded image when mode is image and customImageUrl is present', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'image', customImageUrl: 'data:image/png;base64,abc', imageFit: 'cover' },
    })
    const img = wrapper.find('[data-test="stealth-custom-image"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('data:image/png;base64,abc')
    expect(img.classes()).toContain('object-cover')
  })

  it('falls back to built-in code editor decoy when mode is image but customImageUrl is null', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'image', customImageUrl: null },
    })
    expect(wrapper.find('[data-test="stealth-custom-image"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stealth-decoy-code"]').exists()).toBe(true)
  })

  it('renders built-in spreadsheet decoy when mode is sheet', () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'sheet', customImageUrl: null },
    })
    expect(wrapper.find('[data-test="stealth-decoy-sheet"]').exists()).toBe(true)
  })

  it('does not emit exit on single click anywhere on overlay', async () => {
    const wrapper = mount(StealthOverlay, {
      props: { active: true, mode: 'code', customImageUrl: null },
    })
    await wrapper.find('[data-test="stealth-overlay"]').trigger('click')
    expect(wrapper.emitted('exit')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/StealthOverlay.test.ts`
Expected: FAIL with `StealthOverlay.vue` not found.

- [ ] **Step 3: Implement `app/components/StealthOverlay.vue`**

Implement `StealthOverlay.vue` with `fixed inset-0 z-[9999] bg-[#1e1e1e] select-none overflow-hidden`:
- When `mode === 'image' && customImageUrl`, render `<img data-test="stealth-custom-image" :src="customImageUrl" class="w-full h-full" :class="imageFit === 'contain' ? 'object-contain bg-black' : 'object-cover'" />`.
- When `mode === 'sheet'`, render `<div data-test="stealth-decoy-sheet">` with a realistic spreadsheet toolbar, column headers `A–H`, and financial/project rows with selectable cells.
- Otherwise (when `mode === 'code'` or fallback when `customImageUrl` is empty), render `<div data-test="stealth-decoy-code">` with an interactive dark IDE notes/TypeScript view where the user can scroll or type into a scratchpad `<textarea>`.
- Include an inconspicuous status bar item (`data-test="stealth-corner-unlock"`) that emits `exit` only on triple-click (`@dblclick` / 3 clicks within 600ms) for touch devices without a physical keyboard.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/StealthOverlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/StealthOverlay.vue tests/components/StealthOverlay.test.ts
git commit -m "feat(stealth): add fullscreen StealthOverlay with image and decoy modes"
```

---

### Task 3: Add Stealth Shortcut & Cover Image Controls to `ProfileSettingsModal.vue`

**Files:**
- Modify: `app/components/ProfileSettingsModal.vue`
- Test: `tests/components/ProfileSettingsStealth.test.ts`

**Interfaces:**
- Consumes: `useStealthMode`, `formatShortcutFromEvent` from `~/composables/useStealthMode`, `validateImageFile` from `~/utils/chat`
- Produces: UI controls in `ProfileSettingsModal.vue`:
  - `data-test="stealth-shortcut-btn"` (toggles shortcut recording state; listens to `@keydown.stop.prevent`)
  - `data-test="stealth-shortcut-reset"` (resets to `'Ctrl+H'`)
  - `data-test="stealth-mode-image"`, `data-test="stealth-mode-code"`, `data-test="stealth-mode-sheet"`
  - `data-test="stealth-image-input"`, `data-test="stealth-image-upload-btn"`, `data-test="stealth-image-remove-btn"`, `data-test="stealth-image-preview"`

- [ ] **Step 1: Write the failing test in `tests/components/ProfileSettingsStealth.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfileSettingsModal from '~/components/ProfileSettingsModal.vue'
import { useStealthMode } from '~/composables/useStealthMode'

describe('ProfileSettingsModal — Stealth Mode settings', () => {
  beforeEach(() => {
    localStorage.clear()
    const { updateStealthConfig, removeCustomCoverImage } = useStealthMode()
    updateStealthConfig({ shortcut: 'Ctrl+H', mode: 'code', imageFit: 'cover', cloakTitle: 'Workspace — Notes' })
    removeCustomCoverImage()
  })

  it('records a new shortcut when recording mode is active and key combo is pressed', async () => {
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: { id: 'u1', display_name: 'Alice', avatar_color: '#3b82f6' },
      },
    })

    const recordBtn = wrapper.find('[data-test="stealth-shortcut-btn"]')
    expect(recordBtn.exists()).toBe(true)
    expect(recordBtn.text()).toContain('Ctrl+H')

    await recordBtn.trigger('click')
    await recordBtn.trigger('keydown', { key: 'k', ctrlKey: true, shiftKey: true })

    const { config } = useStealthMode()
    expect(config.value.shortcut).toBe('Ctrl+Shift+K')
    expect(recordBtn.text()).toContain('Ctrl+Shift+K')
  })

  it('switches stealth cover mode between image, code, and sheet', async () => {
    const wrapper = mount(ProfileSettingsModal, {
      props: {
        isOpen: true,
        profile: { id: 'u1', display_name: 'Alice', avatar_color: '#3b82f6' },
      },
    })

    await wrapper.find('[data-test="stealth-mode-sheet"]').trigger('click')
    const { config } = useStealthMode()
    expect(config.value.mode).toBe('sheet')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ProfileSettingsStealth.test.ts`
Expected: FAIL because `[data-test="stealth-shortcut-btn"]` does not exist.

- [ ] **Step 3: Implement Stealth Mode section in `app/components/ProfileSettingsModal.vue`**

In Column 2 of `ProfileSettingsModal.vue` (below Confetti Preference Toggle), add a "Stealth Hide (Boss Key)" card:
- Shortcut recorder button (`data-test="stealth-shortcut-btn"`) showing current `stealthConfig.shortcut` (or `"Press keys..."` when recording) and a Reset (`Ctrl+H`) button (`data-test="stealth-shortcut-reset"`).
- Cover Mode selector buttons (`data-test="stealth-mode-image"`, `data-test="stealth-mode-code"`, `data-test="stealth-mode-sheet"`).
- Custom Cover Image upload/preview/remove block (`data-test="stealth-image-input"`, `data-test="stealth-image-upload-btn"`, `data-test="stealth-image-remove-btn"`, `data-test="stealth-image-preview"`) that validates the image via `validateImageFile`, reads it as a Data URL via `readFileAsDataUrl`, stores it via `setCustomCoverImage(dataUrl)`, and automatically selects `mode: 'image'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ProfileSettingsStealth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/ProfileSettingsModal.vue tests/components/ProfileSettingsStealth.test.ts
git commit -m "feat(settings): add stealth shortcut recorder and cover image upload"
```

---

### Task 4: Wire Global Shortcut, Audio Suppression & `StealthOverlay` in `app/pages/index.vue`

**Files:**
- Modify: `app/pages/index.vue:30-35, 130-156, 570-585, 640-650, 910-955, 1680-1690`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `useStealthMode`, `matchesShortcutEvent` from `~/composables/useStealthMode`, `StealthOverlay` from `~/components/StealthOverlay.vue`
- Produces: Capture-phase `keydown` shortcut handling, audio pause on stealth enter, buzz sound suppression while hidden, and `<StealthOverlay>` mounted in `app/pages/index.vue`.

- [ ] **Step 1: Write the failing test in `tests/components/indexPage.test.ts`**

Add a test in `tests/components/indexPage.test.ts` (or `tests/components/stealthIntegration.test.ts`) verifying that dispatching `keydown` with `{ key: 'h', ctrlKey: true }` on `window` toggles `StealthOverlay` visibility (`[data-test="stealth-overlay"]`) and calls `preventDefault()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/indexPage.test.ts`
Expected: FAIL because `Ctrl+H` does not toggle `StealthOverlay` in `index.vue`.

- [ ] **Step 3: Wire `useStealthMode` and `StealthOverlay` in `app/pages/index.vue`**

1. Import `useStealthMode`, `matchesShortcutEvent`, and `StealthOverlay` in `app/pages/index.vue`.
2. Call `initStealthMode()` in `onMounted` and register `window.addEventListener('keydown', handleGlobalKeydown, true)` (and remove with `true` in `onUnmounted`).
3. In `handleGlobalKeydown(e: KeyboardEvent)`:
   - Ignore events when `e.target` is inside `[data-test="stealth-shortcut-btn"]` (so recording a shortcut in Settings does not immediately hide the app).
   - Check `if (matchesShortcutEvent(e, stealthConfig.value.shortcut))`: call `e.preventDefault()`, `e.stopPropagation()`, and `toggleStealth()`. If `isStealthHidden.value` becomes `true` and `audioPlayerRef.value && !audioPlayerRef.value.paused`, pause audio playback.
4. In `triggerBuzzShake()`, skip `playBuzzSound()` when `isStealthHidden.value` is `true`.
5. Mount `<StealthOverlay :active="isStealthHidden" :mode="stealthConfig.mode" :custom-image-url="customImageUrl" :image-fit="stealthConfig.imageFit" :shortcut-label="stealthConfig.shortcut" @exit="setStealthHidden(false)" />` at the root of `app/pages/index.vue`.

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npx vitest run`
Expected: All test suites PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue tests/components/indexPage.test.ts
git commit -m "feat(stealth): wire global Boss Key shortcut and StealthOverlay in workspace"
```
