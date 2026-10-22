# Obsidian Monolith UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the UI/UX into the Obsidian Monolith design system (Linear / Raycast Precision Studio) featuring a unified 2-pane workspace, hairline borders, micro-specular highlights, and tactile composer ergonomics while preserving 100% of functional capabilities and green Vitest test suites.

**Architecture:** Replace the 3-column rail+drawer layout with an integrated 280px sidebar and focused chat stage. Migrate styling to custom Obsidian Monolith tokens (`--om-*` and backwards-compatible `--fp-*` mappings) across Tailwind v4, Vue 3 Composition API components, and Reka UI primitives. Retain all `data-test` hooks and domain invariants.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS v4, Lucide Vue (`@lucide/vue`), Reka UI / shadcn-nuxt, WebCrypto E2EE, Supabase Realtime, Vitest.

## Global Constraints
- Preserve `AVATAR_PALETTE` (`['#0284c7', '#0d9488', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#4f46e5']`) in `app/utils/chat.ts`.
- Retain all existing `data-test` attributes (`data-test="open-contacts"`, `data-test="open-start-dm"`, `data-test="open-create-group"`, `data-test="group-header-info-trigger"`, `data-test="open-group-info"`, `data-test="load-older-button"`, `data-test="scroll-to-bottom"`, etc.).
- Composable state fallbacks for SSR/Vitest must remain intact (`typeof useState !== 'undefined'`).
- All 22 Vitest test files (244 tests) must pass with 0 failures at each task boundary (`npm test`).

---

### Task 1: Design Tokens & CSS Variables Migration

**Files:**
- Modify: `app/assets/css/main.css`
- Test: `tests/composables/useTheme.test.ts`

**Interfaces:**
- Produces: CSS variables `--om-canvas`, `--om-sidebar`, `--om-stage`, `--om-card`, `--om-input-bg`, `--om-hover`, `--om-active`, `--om-border`, `--om-border-strong`, `--om-specular`, `--om-accent`, `--om-accent-bright`, `--om-text-primary`, `--om-text-secondary`, `--om-text-muted`, `--om-presence-online`, `--om-destructive`, and backward-compatible `--fp-*` mappings.

- [ ] **Step 1: Check existing theme test**

Run: `npm test tests/composables/useTheme.test.ts`
Expected: PASS

- [ ] **Step 2: Update `app/assets/css/main.css` with Obsidian Monolith design tokens**

Update `:root` (Light Mode) and `html.dark` (Dark Mode) in `app/assets/css/main.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');

@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* Obsidian Monolith Precision Studio (Linear / Raycast Aesthetic) */

:root {
  /* Daylight Precision Studio (Light Mode) */
  --om-canvas: #f4f4f5;
  --om-sidebar: #ffffff;
  --om-stage: #ffffff;
  --om-card: #fafafa;
  --om-input-bg: rgba(0, 0, 0, 0.035);
  --om-hover: rgba(15, 23, 42, 0.045);
  --om-active: rgba(99, 102, 241, 0.08);
  --om-border: rgba(15, 23, 42, 0.08);
  --om-border-strong: rgba(15, 23, 42, 0.16);
  --om-specular: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --om-accent: #4f46e5;
  --om-accent-bright: #4338ca;
  --om-text-primary: #09090b;
  --om-text-secondary: #475569;
  --om-text-muted: #94a3b8;
  --om-presence-online: #10b981;
  --om-destructive: #e11d48;

  /* Backward-compatible aliases for legacy classes */
  --fp-void: var(--om-canvas);
  --fp-rail: var(--om-sidebar);
  --fp-drawer: var(--om-sidebar);
  --fp-stage: var(--om-stage);
  --fp-stage-subtle: var(--om-card);
  --fp-composer: var(--om-card);
  --fp-surface-elevated: var(--om-card);
  --fp-hover: var(--om-hover);
  --fp-active: var(--om-active);
  --fp-input-bg: var(--om-input-bg);
  --fp-border: var(--om-border);
  --fp-border-strong: var(--om-border-strong);
  --fp-specular: var(--om-specular);
  --fp-text-primary: var(--om-text-primary);
  --fp-text-secondary: var(--om-text-secondary);
  --fp-text-muted: var(--om-text-muted);
  --fp-accent: var(--om-accent);
  --fp-accent-bright: var(--om-accent-bright);
  --fp-font-display: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
  --fp-font-sans: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
  --fp-font-mono: 'Geist Mono', ui-monospace, SFMono-Regular, monospace;
}

html.dark {
  /* Obsidian Monolith (Dark Mode) */
  --om-canvas: #09090b;
  --om-sidebar: #0c0d11;
  --om-stage: #0e1015;
  --om-card: #141720;
  --om-input-bg: rgba(0, 0, 0, 0.40);
  --om-hover: rgba(255, 255, 255, 0.045);
  --om-active: rgba(99, 102, 241, 0.12);
  --om-border: rgba(255, 255, 255, 0.07);
  --om-border-strong: rgba(255, 255, 255, 0.14);
  --om-specular: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  --om-accent: #6366f1;
  --om-accent-bright: #818cf8;
  --om-text-primary: #f4f4f5;
  --om-text-secondary: #94a3b8;
  --om-text-muted: #64748b;
  --om-presence-online: #10b981;
  --om-destructive: #f43f5e;

  /* Backward-compatible aliases */
  --fp-void: var(--om-canvas);
  --fp-rail: var(--om-sidebar);
  --fp-drawer: var(--om-sidebar);
  --fp-stage: var(--om-stage);
  --fp-stage-subtle: var(--om-card);
  --fp-composer: var(--om-card);
  --fp-surface-elevated: var(--om-card);
  --fp-hover: var(--om-hover);
  --fp-active: var(--om-active);
  --fp-input-bg: var(--om-input-bg);
  --fp-border: var(--om-border);
  --fp-border-strong: var(--om-border-strong);
  --fp-specular: var(--om-specular);
  --fp-text-primary: var(--om-text-primary);
  --fp-text-secondary: var(--om-text-secondary);
  --fp-text-muted: var(--om-text-muted);
  --fp-accent: var(--om-accent);
  --fp-accent-bright: var(--om-accent-bright);
}
```

- [ ] **Step 3: Run Vitest to verify styles load cleanly**

Run: `npm test`
Expected: PASS (all 22 suites pass)

- [ ] **Step 4: Commit**

```bash
git add app/assets/css/main.css
git commit -m "style: add obsidian monolith tokens and typography in main.css"
```

---

### Task 2: Refined 2-Pane Shell & Stage Header in `app/pages/index.vue`

**Files:**
- Modify: `app/pages/index.vue`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `ChatSidebar.vue`, `MessageViewport.vue`, `MessageComposer.vue`, `useChatRoom()`, `useTheme()`.
- Produces: 2-pane workspace shell (`div.h-dvh.flex.overflow-hidden.bg-[var(--om-canvas)].md:p-2.5.md:gap-2.5`) with modernized Stage Header (`h-[52px]` flex container).

- [ ] **Step 1: Run index page tests before changes**

Run: `npm test tests/components/indexPage.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 2: Update workspace layout & Stage Header in `app/pages/index.vue`**

Refactor the main workspace template in `app/pages/index.vue`:
1. Update outer shell container classes:
   `class="h-dvh flex overflow-hidden bg-[var(--om-canvas)] md:p-2.5 md:gap-2.5 transition-colors"`
2. Update Stage container classes:
   `class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[var(--om-stage)] md:rounded-[12px] md:border md:border-[var(--om-border)] shadow-sm"`
3. Modernize Stage Header (`<header class="h-[52px] px-4 md:px-5 bg-[var(--om-stage)]/95 backdrop-blur-xs border-b border-[var(--om-border)] flex items-center justify-between gap-4 shrink-0">`):
   - Left side: Mobile menu toggle button, conversation avatar (sm), title (`#slug` or `@peer`), online status chip (`Active now` / `Offline` with emerald dot), member count for groups.
   - Right side: Group info trigger button (`data-test="open-group-info"`), online friends avatar stack (`slice(0, 4)` with ring offset), online count badge.

- [ ] **Step 3: Run index page tests and component tests**

Run: `npm test tests/components/indexPage.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat(ui): implement 2-pane shell and precision stage header in index.vue"
```

---

### Task 3: Integrated 2-Pane Sidebar Component (`app/components/ChatSidebar.vue`)

**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `props.conversations`, `props.onlineFriends`, `props.currentUser`, `props.unreadCounts`.
- Produces: Unified 280px sidebar combining header dock, instant filter search, collapsible category sections, and footer profile dock with all action emissions intact.

- [ ] **Step 1: Run sidebar and chat UI tests**

Run: `npm test tests/components/chatUi.test.ts`
Expected: PASS (35 tests)

- [ ] **Step 2: Refactor `app/components/ChatSidebar.vue` template**

1. Replace the dual (Icon Rail + Drawer) layout with a unified 280px panel:
   ```html
   <aside
     class="fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] h-full bg-[var(--om-sidebar)] border-r border-[var(--om-border)] md:static md:z-0 md:rounded-[12px] md:border shadow-sm shrink-0 transition-transform duration-200"
     :class="isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
   >
   ```
2. **Header Dock:**
   - App branding mark: rounded-[8px] bg-indigo-600 size-8 text-white font-bold flex items-center justify-center text-xs.
   - Title: `Friends Chat` (`text-sm font-semibold text-[var(--om-text-primary)]`).
   - Action icon buttons:
     - `New DM` (`data-test="open-start-dm"`, `@click="onNewDirectChatClick"`).
     - `New Group` (`data-test="open-create-group"`, `@click="onNewGroupClick"`).
     - `Contacts` (`data-test="open-contacts"`, `@click="onContactsClick"`).
     - Close mobile button (`@click="emit('closeMobile')"` on mobile).
3. **Instant Search Input:**
   - Search input container with `Search` icon and `⌘K` badge.
   - Dynamic binding `v-model="searchQuery"`.
4. **Categorized Conversations List:**
   - Collapsible/divided sections: `CHANNELS & GROUPS` and `DIRECT MESSAGES`.
   - Conversation items:
     - Avatar / channel icon, title, last message preview, unread count chip, active accent bar.
     - Click handler: `onConversationClick(conv.id)`.
5. **Footer Profile Dock:**
   - Border-t border-[var(--om-border)] p-2.5 flex items-center justify-between.
   - User profile button (`@click="emit('openProfileSettings')"`).
   - Theme toggle button (`@click="emit('toggleTheme')"`).
   - Notification toggle button (`@click="emit('toggleNotifications')"`).
   - Sign out button (`@click="emit('logout')"`).

- [ ] **Step 3: Run chat UI tests**

Run: `npm test tests/components/chatUi.test.ts`
Expected: PASS (35 tests)

- [ ] **Step 4: Commit**

```bash
git add app/components/ChatSidebar.vue
git commit -m "feat(ui): unify chat sidebar into integrated 2-pane precision studio"
```

---

### Task 4: Timeline Viewport & Message Presentation Refinements

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/components/MessageActionsMenu.vue`
- Modify: `app/components/MessageImageGrid.vue`
- Test: `tests/components/chatUi.test.ts`
- Test: `tests/components/MessageImageGrid.test.ts`
- Test: `tests/components/messageActionsMenu.test.ts`

**Interfaces:**
- Consumes: `timelineItems`, `REACTION_EMOJIS`, `MessageImageGrid`, `MessageActionsMenu`.
- Produces: Polished timeline feed with monospace timestamps, subtle hairline date dividers, floating hover action bar, and smooth scroll-lock pill.

- [ ] **Step 1: Run message viewport and image grid tests**

Run: `npm test tests/components/MessageImageGrid.test.ts tests/components/messageActionsMenu.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 2: Update message styling in `app/components/MessageViewport.vue`**

1. Date dividers:
   `hairline flex items-center my-4 before:flex-1 before:h-px before:bg-[var(--om-border)] after:flex-1 after:h-px after:bg-[var(--om-border)]` with centered date pill `px-2.5 py-0.5 text-[11px] font-mono font-medium text-[var(--om-text-muted)] bg-[var(--om-card)] border border-[var(--om-border)] rounded-full`.
2. Message rows:
   - Full message row: Avatar (size `sm`, rounded-[8px]), author name (text-[13px] font-semibold text-[var(--om-text-primary)]), timestamp (`font-mono text-[11px] text-[var(--om-text-muted)]`).
   - Grouped row (within 5 mins): Placed cleanly with left indent, hover timestamp fades in on row hover.
   - Quoted reply card: Left border 2px solid indigo-500, bg-white/[0.03], rounded-r-[6px], p-1.5 text-xs text-[var(--om-text-secondary)].
   - Emoji reactions: Pill badges (`rounded-full px-2 py-0.5 text-xs border border-[var(--om-border)]`), active user state with indigo highlight (`bg-indigo-500/15 border-indigo-500/30 text-indigo-400 font-semibold`).
   - Floating scroll-to-bottom pill: Centered bottom pill (`data-test="scroll-to-bottom"`), `bg-indigo-600 text-white rounded-full px-3 py-1 text-xs font-medium shadow-lg hover:bg-indigo-500`.

- [ ] **Step 3: Update `app/components/MessageActionsMenu.vue`**

Style the floating action bar with:
- Elevated mini-surface: `rounded-[8px] bg-[var(--om-card)] border border-[var(--om-border)] shadow-md p-0.5 flex items-center gap-0.5`.
- Subtle hover transitions on action buttons (`hover:bg-[var(--om-hover)] text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)]`).

- [ ] **Step 4: Update `app/components/MessageImageGrid.vue`**

Style the image attachments grid:
- Container: `rounded-[10px] overflow-hidden border border-[var(--om-border)]`.
- Hover zoom effect: `transition-transform duration-200 hover:scale-[1.01]`.

- [ ] **Step 5: Run tests for viewport, image grid, and actions menu**

Run: `npm test tests/components/chatUi.test.ts tests/components/MessageImageGrid.test.ts tests/components/messageActionsMenu.test.ts`
Expected: PASS (47 tests)

- [ ] **Step 6: Commit**

```bash
git add app/components/MessageViewport.vue app/components/MessageActionsMenu.vue app/components/MessageImageGrid.vue
git commit -m "feat(ui): polish message timeline, action menus, and image grid"
```

---

### Task 5: Floating Pill Message Composer

**Files:**
- Modify: `app/components/MessageComposer.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `replyingTo`, `typingLabel`, `mentionCandidates`.
- Produces: Floating pill composer with auto-resizing textarea, replying-to cancel banner, attachment thumbnails strip, and tactile send button.

- [ ] **Step 1: Run composer tests**

Run: `npm test tests/components/chatUi.test.ts`
Expected: PASS (35 tests)

- [ ] **Step 2: Update `app/components/MessageComposer.vue` template & styling**

1. Outer container: `px-4 pb-4 pt-2 shrink-0 bg-transparent`.
2. Floating card:
   `rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-card)] shadow-lg shadow-black/10 transition-shadow focus-within:border-indigo-500/40 p-2.5 flex flex-col gap-2`.
3. Replying-to preview:
   Clean dismissible bar at top of card with `X` button and truncated reply preview.
4. Pending attachments thumbnail strip:
   Horizontal scroll row with preview images, rounded-[8px], 1px border, and remove `X` badge.
5. Textarea & Action bar:
   - Auto-growing textarea: `bg-transparent text-sm text-[var(--om-text-primary)] placeholder-[var(--om-text-muted)] focus:outline-none min-h-[38px] max-h-[160px] resize-none`.
   - Action bar: Attachment paperclip button on left, typing indicator / keyboard hint (`Enter` to send, `Shift+Enter` for newline), tactile Send button (`size-8 rounded-[8px] bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-transform active:scale-95`).

- [ ] **Step 3: Run composer and chat UI tests**

Run: `npm test tests/components/chatUi.test.ts`
Expected: PASS (35 tests)

- [ ] **Step 4: Commit**

```bash
git add app/components/MessageComposer.vue
git commit -m "feat(ui): restyle message composer into tactile floating pill"
```

---

### Task 6: Modals, System States & Authentication Screen

**Files:**
- Modify: `app/components/ProfileSettingsModal.vue`
- Modify: `app/components/ContactsModal.vue`
- Modify: `app/components/CreateGroupModal.vue`
- Modify: `app/components/GroupInfoModal.vue`
- Modify: `app/components/ImageViewerModal.vue`
- Modify: `app/components/E2eeGate.vue`
- Modify: `app/components/ConnectionBanner.vue`
- Modify: `app/pages/login.vue`
- Test: `tests/components/GroupModals.test.ts`
- Test: `tests/components/ContactsModal.test.ts`
- Test: `tests/components/ImageViewerModal.test.ts`
- Test: `tests/components/login.test.ts`

**Interfaces:**
- Consumes: Modal props/events, `useAuthProfile()`, `useE2ee()`, `useConnectionManager()`.
- Produces: Unified obsidian modal surfaces, crisp passphrase gate, unobtrusive connection retry banner, and modern split-screen login page.

- [ ] **Step 1: Run modal and login tests before changes**

Run: `npm test tests/components/GroupModals.test.ts tests/components/ContactsModal.test.ts tests/components/ImageViewerModal.test.ts tests/components/login.test.ts`
Expected: PASS (34 tests)

- [ ] **Step 2: Update modal dialog components**
- Apply `rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-card)] shadow-2xl` to dialog surfaces in:
  - `ProfileSettingsModal.vue` (preserve avatar color swatches, email, user ID, join date).
  - `ContactsModal.vue` (preserve email search, friend add/remove, direct chat trigger).
  - `CreateGroupModal.vue` (preserve multi-select contacts, invite emails, title input).
  - `GroupInfoModal.vue` (preserve edit group title, member list, add member, leave group).
  - `ImageViewerModal.vue` (preserve lightbox carousel, thumbnail strip, zoom controls).

- [ ] **Step 3: Update `E2eeGate.vue` & `ConnectionBanner.vue`**
- In `E2eeGate.vue`: Modernize card with deep obsidian card surface, lock badge, passphrase input, and unlock button.
- In `ConnectionBanner.vue`: Non-intrusive warning pill/banner with countdown and manual retry button.

- [ ] **Step 4: Update `app/pages/login.vue`**
- Modernize split screen:
  - Left hero side: subtle radial gradient, typography with Geist Display, preview cards.
  - Right auth card: clean tabbed switcher (`Sign in` / `Create account`), inputs with `var(--om-border-strong)`, indigo CTA button.

- [ ] **Step 5: Run tests for all modals and login**

Run: `npm test tests/components/GroupModals.test.ts tests/components/ContactsModal.test.ts tests/components/ImageViewerModal.test.ts tests/components/login.test.ts`
Expected: PASS (34 tests)

- [ ] **Step 6: Commit**

```bash
git add app/components/ProfileSettingsModal.vue app/components/ContactsModal.vue app/components/CreateGroupModal.vue app/components/GroupInfoModal.vue app/components/ImageViewerModal.vue app/components/E2eeGate.vue app/components/ConnectionBanner.vue app/pages/login.vue
git commit -m "feat(ui): restyle modals, system states, and login screen for obsidian monolith"
```

---

### Task 7: Full Verification & Build Gate

**Files:**
- Entire repository
- Test: All 22 test files in `tests/`

**Interfaces:**
- Validates: End-to-end type safety, component tests, composable tests, utils tests, production compilation.

- [ ] **Step 1: Run entire Vitest test suite**

Run: `npm test`
Expected: PASS (all 22 test files, 244 tests passing)

- [ ] **Step 2: Run Nuxt production build**

Run: `npm run build`
Expected: Successful build with 0 TypeScript or Tailwind errors.

- [ ] **Step 3: Verify git status and commit any remaining changes**

Run: `git status`
Expected: Working tree clean.

- [ ] **Step 4: Final commit tag / summary**

```bash
git commit --allow-empty -m "chore: complete obsidian monolith ui/ux redesign verification"
```
