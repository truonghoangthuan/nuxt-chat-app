# Application UI Themes (Default, VSCode, Yahoo! Messenger) — Design Spec

## 1. Intent & Why
Users want to switch the entire application personality from User Settings (`ProfileSettingsModal.vue`) between three distinct UI themes:
1. **Default (`default`)**: Current Apple Fluid / iMessage frosted glass workspace.
2. **VSCode (`vscode`)**: A full IDE shell clone (Activity Bar, Explorer tree sidebar, Editor tab bar & breadcrumbs, line-numbered monospace chat log, Terminal composer dock, and bottom Status Bar).
3. **Yahoo! Messenger (`yahoo`)**: A classic 2000s desktop IM clone (royal purple & gold window chrome, menu bar, collapsible buddy list tree, Tahoma/Verdana typography, inline `Username (HH:MM): message` transcript log, and classic IM formatting toolbar with `BUZZ!`).

Each UI theme supports both **Light** and **Dark** color modes via the existing `isDark` toggle (`useTheme.ts`).

## 2. Goals & Non-Goals
- **Goals:**
  - Persist `uiTheme` (`'default' | 'vscode' | 'yahoo'`) in `localStorage['nuxt-chat-ui-theme']` alongside existing `localStorage['nuxt-chat-theme']` (`'dark' | 'light'`).
  - Reflect active theme on `document.documentElement` via `data-theme="<uiTheme>"` and `theme-<uiTheme>` class.
  - Transform layout chrome, typography, colors, message rows, and composer docks across `index.vue`, `ChatSidebar.vue`, `MessageViewport.vue`, `MessageComposer.vue`, and `ProfileSettingsModal.vue`.
  - Preserve 100% of existing `data-test` hooks, props, emits, E2EE invariants, and scroll-pinning logic.
- **Non-Goals:**
  - Database schema migrations (`localStorage` only per user decision).
  - Duplicating stateful chat orchestration or breaking existing Vitest suites.

## 3. Architecture & Component Design

### 3.1 `app/composables/useTheme.ts`
- Export `type AppUiTheme = 'default' | 'vscode' | 'yahoo'`.
- Add `uiTheme` state (`useState<AppUiTheme>('theme-ui', () => 'default')` with Vitest `ref` fallback).
- `initTheme()` loads `nuxt-chat-theme` (`isDark`) and `nuxt-chat-ui-theme` (`uiTheme`), then applies `dark`, `theme-${uiTheme}`, and `dataset.theme = uiTheme` on `document.documentElement`.
- `setUiTheme(next: AppUiTheme)` updates `uiTheme`, writes `localStorage['nuxt-chat-ui-theme']`, and calls `applyClass()`.

### 3.2 `app/assets/css/main.css`
- Define CSS variables and font overrides scoped to `html[data-theme="vscode"]` (Light+ & Dark+) and `html[data-theme="yahoo"]` (Classic Light & Yahoo Dark):
  - **VSCode:** `font-family: 'Geist Mono', 'Consolas', monospace`, `--radius: 0px`, Dark+ (`#1e1e1e` editor, `#252526` explorer, `#333333` activity bar, `#007acc` status bar/accent) and Light+ (`#ffffff` editor, `#f3f3f3` explorer, `#2c2c2c` activity bar, `#007acc` status bar/accent).
  - **Yahoo:** `font-family: 'Tahoma', 'Verdana', sans-serif`, `--radius: 3px`, Classic Light (`#dcd8e8` canvas, `#500095`–`#7b0099` royal purple chrome, `#ffcc00` gold accent, `#ffffff` stage) and Yahoo Dark (`#12091c` canvas, `#2d0054`–`#4a0072` header, `#160d22` stage, `#ffcc00` gold accent).

### 3.3 `app/components/ProfileSettingsModal.vue`
- Add Theme Selector grid with 3 selectable cards:
  - `[data-test="theme-option-default"]` — Default (Apple Fluid)
  - `[data-test="theme-option-vscode"]` — VSCode IDE
  - `[data-test="theme-option-yahoo"]` — Yahoo! Messenger
- Clicking a card calls `setUiTheme(...)` immediately for instant live preview.

### 3.4 Workspace & Component Clone Layouts
- **`app/pages/index.vue`**:
  - `vscode`: Edge-to-edge layout (`p-0 md:p-0 md:gap-0`), left Activity Bar (`[data-test="vscode-activity-bar"]`), Editor Tab Bar & Breadcrumbs (`[data-test="vscode-tab-bar"]`), and bottom Status Bar (`[data-test="vscode-status-bar"]`).
  - `yahoo`: Classic desktop window framing with purple gradient title bar (`[data-test="yahoo-stage-titlebar"]`).
- **`app/components/ChatSidebar.vue`**:
  - `vscode`: `EXPLORER` header, collapsible folder headers (`OPEN EDITORS`, `CONVERSATIONS`, `ONLINE PEERS`), compact 24px file-row items with file extensions (`.ts` / `.sh`).
  - `yahoo`: `Y! Messenger` purple/gold header (`[data-test="yahoo-messenger-header"]`), classic menu bar (`Messenger · Contacts · Actions · Help`), collapsible `[-] Contacts` and `[-] Online Friends` buddy tree.
- **`app/components/MessageViewport.vue`**:
  - `vscode`: Left-aligned editor log rows with line-number gutter (`[data-test="vscode-line-number"]`), `[HH:MM]` timestamp, `@author` token, and flat code-style message container.
  - `yahoo`: Full-width classic IM transcript rows (`Author (HH:MM): message`) with royal blue self username and purple/red peer username.
- **`app/components/MessageComposer.vue`**:
  - `vscode`: Integrated Terminal panel with `PROBLEMS | OUTPUT | TERMINAL` header (`[data-test="vscode-terminal-header"]`) and `>` prompt prefix.
  - `yahoo`: Classic IM formatting toolbar (`[data-test="yahoo-composer-toolbar"]`) with `Tahoma 10pt` badge, smiley icon, and `BUZZ!` button (`[data-test="yahoo-buzz-btn"]` sending `🔊 BUZZ!!!`), plus classic beveled Send button.
