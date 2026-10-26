# VSCode & Yahoo! Messenger Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-UI VSCode IDE and Classic Yahoo! Messenger clone themes (each with Light & Dark variants) selectable from User Settings and persisted in `localStorage`.

**Architecture:** Extend `useTheme.ts` with `uiTheme: Ref<'default' | 'vscode' | 'yahoo'>` persisted in `localStorage['nuxt-chat-ui-theme']` and bound to `document.documentElement.dataset.theme`. Layer theme-scoped CSS tokens/fonts in `app/assets/css/main.css` and conditional structural chrome in `ProfileSettingsModal.vue`, `index.vue`, `ChatSidebar.vue`, `MessageViewport.vue`, and `MessageComposer.vue` while preserving every existing `data-test` hook and component invariant.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS v4, Vitest + `@vue/test-utils`

**Spec:** `docs/superpowers/specs/2026-10-26-vscode-yahoo-themes-design.md`

## Global Constraints

- Preserve all existing `data-test` attributes, props, and emits across `ChatSidebar.vue`, `MessageViewport.vue`, `MessageComposer.vue`, and `ProfileSettingsModal.vue`.
- `MessageComposer.vue` must remain slotted inside `MessageViewport.vue` (`AGENTS.md` Rule #21).
- Action toolbars inside `MessageViewport.vue` must remain `absolute` out-of-flow (`AGENTS.md` Rule #20).
- `useTheme.ts` must guard `typeof useState !== 'undefined'` with module-level `ref` fallback (`AGENTS.md` Rule #5).
- Persist UI theme in `localStorage['nuxt-chat-ui-theme']` and dark/light state in `localStorage['nuxt-chat-theme']`.

## Review Focus

1. Invalid or missing `localStorage['nuxt-chat-ui-theme']` value falls back cleanly to `'default'`.
2. Switching `uiTheme` between `'default'`, `'vscode'`, and `'yahoo'` preserves `isDark` state and updates both `document.documentElement.dataset.theme` and `theme-*` class without clobbering `dark`.
3. In `vscode` and `yahoo` themes, `MessageViewport.vue` still renders `[data-test="message-bubble-<id>"]`, `[data-test="compact-message"]` / `[data-test="full-message"]`, and hover action buttons (`edit`, `delete`, `reply`, `pin`, `react`).
4. In `yahoo` theme, clicking `[data-test="yahoo-buzz-btn"]` when composer is enabled emits `send` with `'🔊 BUZZ!!!'`.
5. Existing `ProfileSettingsModal` tests submitting display name and avatar color continue passing without requiring theme props.

---

### Task 1: Multi-Theme State & Persistence (`useTheme.ts` & `main.css`)

**Files:**
- Modify: `app/composables/useTheme.ts`
- Modify: `app/assets/css/main.css`
- Test: `tests/composables/useTheme.test.ts`

**Interfaces:**
- Produces:
  - `export type AppUiTheme = 'default' | 'vscode' | 'yahoo'`
  - `useTheme(): { isDark: Ref<boolean>, uiTheme: Ref<AppUiTheme>, initTheme: () => void, toggleTheme: () => void, setUiTheme: (theme: AppUiTheme) => void }`

- [ ] **Step 1: Write failing tests in `tests/composables/useTheme.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useTheme.test.ts`
Expected: FAIL (`theme.uiTheme` / `theme.setUiTheme` undefined)

- [ ] **Step 3: Implement `uiTheme` and `setUiTheme` in `app/composables/useTheme.ts` and theme tokens in `app/assets/css/main.css`**

In `app/composables/useTheme.ts`:
- Define `export type AppUiTheme = 'default' | 'vscode' | 'yahoo'` and `VALID_UI_THEMES: AppUiTheme[] = ['default', 'vscode', 'yahoo']`.
- Add `testUiThemeRef = ref<AppUiTheme>('default')` and `uiTheme = typeof useState !== 'undefined' ? useState<AppUiTheme>('theme-ui', () => 'default') : testUiThemeRef`.
- Update `applyClass()` to toggle `dark`, remove `theme-default`, `theme-vscode`, `theme-yahoo`, add `theme-${uiTheme.value}`, and set `document.documentElement.dataset.theme = uiTheme.value`.
- Update `initTheme()` to read and validate `localStorage.getItem('nuxt-chat-ui-theme')`.
- Add `setUiTheme(next: AppUiTheme)` saving to `localStorage.setItem('nuxt-chat-ui-theme', next)`.

In `app/assets/css/main.css`:
- Add `html[data-theme="vscode"]`, `html.dark[data-theme="vscode"]`, `html[data-theme="yahoo"]`, and `html.dark[data-theme="yahoo"]` token blocks and `body` font-family / background rules.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useTheme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useTheme.ts app/assets/css/main.css tests/composables/useTheme.test.ts
git commit -m "feat(theme): add vscode and yahoo uiTheme state and CSS tokens"
```

---

### Task 2: Theme Selector in User Settings (`ProfileSettingsModal.vue`)

**Files:**
- Modify: `app/components/ProfileSettingsModal.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `useTheme()` from `app/composables/useTheme.ts`
- Produces: `[data-test="theme-option-default"]`, `[data-test="theme-option-vscode"]`, `[data-test="theme-option-yahoo"]`, `[data-test="theme-mode-toggle"]` in `ProfileSettingsModal.vue`

- [ ] **Step 1: Write failing test in `tests/components/chatUi.test.ts`**

```ts
it('ProfileSettingsModal renders Default, VSCode, and Yahoo theme options and updates active theme on click', async () => {
  const ProfileSettingsModal = (await import('~/components/ProfileSettingsModal.vue')).default
  const { useTheme } = await import('~/composables/useTheme')
  const { uiTheme, initTheme } = useTheme()
  localStorage.clear()
  initTheme()

  const wrapper = mount(ProfileSettingsModal, {
    props: {
      isOpen: true,
      profile: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
    },
  })

  await wrapper.find('[data-test="theme-option-vscode"]').trigger('click')
  expect(uiTheme.value).toBe('vscode')
  expect(document.documentElement.dataset.theme).toBe('vscode')

  await wrapper.find('[data-test="theme-option-yahoo"]').trigger('click')
  expect(uiTheme.value).toBe('yahoo')
  expect(document.documentElement.dataset.theme).toBe('yahoo')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts -t "ProfileSettingsModal renders Default, VSCode, and Yahoo"`
Expected: FAIL (`[data-test="theme-option-vscode"]` not found)

- [ ] **Step 3: Add Application Theme selector section in `app/components/ProfileSettingsModal.vue`**

Import `useTheme` in `ProfileSettingsModal.vue` and add a 3-card theme picker (`Default`, `VSCode`, `Yahoo!`) plus Dark/Light mode toggle button `[data-test="theme-mode-toggle"]`, adapting modal container classes to semantic CSS variables so the modal itself reflects the active theme.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts -t "ProfileSettingsModal"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/ProfileSettingsModal.vue tests/components/chatUi.test.ts
git commit -m "feat(settings): add Default, VSCode, and Yahoo theme selector in ProfileSettingsModal"
```

---

### Task 3: VSCode & Yahoo Clone Layouts in Workspace Shell & Sidebar (`index.vue` & `ChatSidebar.vue`)

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `app/components/ChatSidebar.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `useTheme().uiTheme`
- Produces:
  - In `app/pages/index.vue`: `[data-test="vscode-activity-bar"]`, `[data-test="vscode-tab-bar"]`, `[data-test="vscode-status-bar"]`, `[data-test="yahoo-stage-titlebar"]`
  - In `app/components/ChatSidebar.vue`: `[data-test="vscode-explorer-header"]`, `[data-test="yahoo-messenger-header"]`

- [ ] **Step 1: Write failing test in `tests/components/chatUi.test.ts`**

```ts
it('ChatSidebar switches structural chrome for vscode and yahoo themes while keeping conversation hooks', async () => {
  const { useTheme } = await import('~/composables/useTheme')
  const { setUiTheme } = useTheme()

  setUiTheme('vscode')
  const wrapper = mount(ChatSidebar, {
    props: {
      conversations: [{ id: 'c-1', type: 'group', title: 'dev-team', created_by: 'u-1', created_at: '2026-10-20T00:00:00Z' }],
      activeConversationId: 'c-1',
      unreadCounts: {},
      onlineFriends: [],
      currentUser: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
      isDark: true,
      connectionStatus: 'connected',
      isOpenMobile: false,
    },
  })

  expect(wrapper.find('[data-test="vscode-explorer-header"]').exists()).toBe(true)
  expect(wrapper.find('[data-test="conversation-item-c-1"]').exists()).toBe(true)

  setUiTheme('yahoo')
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[data-test="yahoo-messenger-header"]').exists()).toBe(true)
  expect(wrapper.find('[data-test="conversation-item-c-1"]').exists()).toBe(true)
  setUiTheme('default')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts -t "ChatSidebar switches structural chrome"`
Expected: FAIL (`[data-test="vscode-explorer-header"]` not found)

- [ ] **Step 3: Implement VSCode & Yahoo chrome in `app/components/ChatSidebar.vue` and `app/pages/index.vue`**

- In `ChatSidebar.vue`:
  - Consume `const { uiTheme } = useTheme()`.
  - Render `[data-test="vscode-explorer-header"]` (`EXPLORER` title bar & collapsible tree section headers, compact monospace `.ts`/`.sh` file labels) when `uiTheme === 'vscode'`.
  - Render `[data-test="yahoo-messenger-header"]` (`Y! Messenger` purple/gold header, `Messenger · Contacts · Actions · Help` menu bar, user status banner, and `[-] Conversations` / `[-] Online Friends` tree headers) when `uiTheme === 'yahoo'`.
  - Keep all action buttons (`open-contacts`, `open-start-dm`, `open-create-group`, `open-profile-settings`, etc.) mounted in all themes.
- In `app/pages/index.vue`:
  - Call `initTheme()` on mount (and read `uiTheme` from `useTheme()`).
  - Render `[data-test="vscode-activity-bar"]`, `[data-test="vscode-tab-bar"]`, and `[data-test="vscode-status-bar"]` when `uiTheme === 'vscode'`, and `[data-test="yahoo-stage-titlebar"]` when `uiTheme === 'yahoo'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts -t "ChatSidebar"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/ChatSidebar.vue app/pages/index.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): add VSCode IDE shell and Yahoo Messenger chrome to workspace and sidebar"
```

---

### Task 4: VSCode & Yahoo Clone Message Viewport & Composer (`MessageViewport.vue` & `MessageComposer.vue`)

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/components/MessageComposer.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `useTheme().uiTheme`
- Produces:
  - In `MessageViewport.vue`: `[data-test="vscode-line-number"]` (when `uiTheme === 'vscode'`), `[data-test="yahoo-transcript-author"]` (when `uiTheme === 'yahoo'`), preserving `[data-test="message-bubble-<id>"]` and action bar buttons.
  - In `MessageComposer.vue`: `[data-test="vscode-terminal-header"]` (when `uiTheme === 'vscode'`), `[data-test="yahoo-composer-toolbar"]` and `[data-test="yahoo-buzz-btn"]` (when `uiTheme === 'yahoo'`).

- [ ] **Step 1: Write failing test in `tests/components/chatUi.test.ts`**

```ts
it('MessageViewport and MessageComposer render VSCode IDE log/terminal and Yahoo IM transcript/toolbar', async () => {
  const { useTheme } = await import('~/composables/useTheme')
  const { setUiTheme } = useTheme()

  setUiTheme('vscode')
  const viewport = mount(MessageViewport, {
    props: {
      currentUserId: 'u-1',
      messages: [
        {
          id: 'm-1',
          client_id: 'c-1',
          channel_id: 'ch-1',
          user_id: 'u-1',
          content: 'const x = 42',
          created_at: '2026-10-20T10:00:00Z',
          status: 'sent',
          author: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
        },
      ],
    },
  })
  expect(viewport.find('[data-test="vscode-line-number"]').exists()).toBe(true)
  expect(viewport.find('[data-test="message-bubble-m-1"]').exists()).toBe(true)

  const composer = mount(MessageComposer, {
    props: { channelSlug: 'general' },
  })
  expect(composer.find('[data-test="vscode-terminal-header"]').exists()).toBe(true)

  setUiTheme('yahoo')
  await viewport.vm.$nextTick()
  await composer.vm.$nextTick()
  expect(viewport.find('[data-test="yahoo-transcript-author"]').exists()).toBe(true)
  expect(composer.find('[data-test="yahoo-composer-toolbar"]').exists()).toBe(true)

  await composer.find('[data-test="yahoo-buzz-btn"]').trigger('click')
  expect(composer.emitted('send')?.[0]).toEqual(['🔊 BUZZ!!!'])

  setUiTheme('default')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts -t "MessageViewport and MessageComposer render VSCode"`
Expected: FAIL (`[data-test="vscode-line-number"]` not found)

- [ ] **Step 3: Implement VSCode and Yahoo layouts in `MessageViewport.vue` and `MessageComposer.vue`**

- In `MessageViewport.vue`:
  - Consume `const { uiTheme } = useTheme()`.
  - When `uiTheme === 'vscode'`: align rows left, render line number gutter `[data-test="vscode-line-number"]` (`idx + 1`), compact `[HH:MM] @author:` prefix, and style `[data-test="message-bubble-..."]` as flat monospace editor line.
  - When `uiTheme === 'yahoo'`: align rows left as classic IM transcript lines, render `[data-test="yahoo-transcript-author"]` (`Author (HH:MM):`), and style `[data-test="message-bubble-..."]` as flat inline Yahoo transcript text.
- In `MessageComposer.vue`:
  - Consume `const { uiTheme } = useTheme()`.
  - When `uiTheme === 'vscode'`: render `[data-test="vscode-terminal-header"]` (`PROBLEMS | OUTPUT | TERMINAL`) and `>` prompt indicator inside a sharp rectangular dock.
  - When `uiTheme === 'yahoo'`: render `[data-test="yahoo-composer-toolbar"]` (`Tahoma 10pt`, `:-)`, and `[data-test="yahoo-buzz-btn"]` which emits `send('🔊 BUZZ!!!')` when not disabled) above a classic rectangular Yahoo input box and beveled Send button.

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`
Expected: PASS (all test files green)

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue app/components/MessageComposer.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): add VSCode and Yahoo message viewport and composer clones"
```
