# Apple Fluid UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the entire UI/UX design of `nuxt-chat-app` to match the Apple Fluid Cupertino system demo (`design-demos/demo-apple.html`), including a unified 260px frosted sidebar, Apple iMessage bubbles, floating frosted pill composer dock, ambient radial glows, and Cupertino frosted modals while preserving 100% of functional capabilities and passing all Vitest test suites.

**Architecture:**
- Modernize `app/assets/css/main.css` with Apple Fluid tokens (`--ap-*` tokens with full backwards compatibility for `--om-*` and `--fp-*`).
- Unify the desktop sidebar from 2-pane (rail+drawer) into a sleek 260px Apple Messages sidebar (`ChatSidebar.vue`) with macOS traffic light controls, pill search capsule, and profile capsule.
- Upgrade `MessageViewport.vue` to Apple iMessage bubble geometry (blue gradient sender, frosted translucent recipient, Apple Intelligence aura empty state, Xcode code block).
- Transform `MessageComposer.vue` into the floating frosted pill dock with circular buttons, bouncing typing dots, and frosted reply capsule.
- Restyle `login.vue`, `E2eeGate.vue`, and all modals (`ContactsModal`, `CreateGroupModal`, `GroupInfoModal`, `ProfileSettingsModal`, `ImageViewerModal`).
- Update sidebar test assertions in `tests/components/chatUi.test.ts` to match the unified Apple sidebar.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS v4, Lucide Vue, Reka UI, WebCrypto E2EE, Supabase Realtime, Vitest.

## Global Invariants
- Preserve `AVATAR_PALETTE` in `app/utils/chat.ts`.
- Retain all functional `data-test` hooks (`data-test="open-contacts"`, `data-test="open-start-dm"`, `data-test="open-create-group"`, `data-test="group-header-info-trigger"`, `data-test="load-older-button"`, `data-test="conversation-search-input"`, `data-test="toggle-notifications-btn"`, etc.).
- Maintain message encryption triggers, client_id idempotency, and composite cursor comparison invariants.
- Ensure all tests pass at each task boundary (`npm test`).

---

### Task 1: Apple Fluid Tokens & Base Styling Migration

**Files:**
- Modify: `app/assets/css/main.css`
- Modify: `app/app.vue`
- Test: `tests/composables/useTheme.test.ts`

- [x] **Step 1: Run theme test to establish baseline**
Run: `npm test tests/composables/useTheme.test.ts`  
Expected: PASS

- [x] **Step 2: Update `app/assets/css/main.css` with Apple Fluid tokens**
Declare `--ap-*` tokens in `:root` and `html.dark` with:
- Canvas radial glow backgrounds
- Frosted glass variables (`--ap-sidebar`, `--ap-stage`, `--ap-glass`, `--ap-glass-border`, `--ap-glass-hover`)
- Apple System Blue (`#007aff`) & gradient `linear-gradient(135deg, #0a84ff 0%, #0062cc 100%)`
- System typography font-family stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif`)
- Custom scrollbar styling `.custom-scroll`
- Backward-compatible mapping from `--ap-*` to `--om-*` and `--fp-*`

- [x] **Step 3: Update `app/app.vue` base container**
Set ambient background:
```vue
<template>
  <div class="min-h-screen bg-[var(--ap-canvas)] text-[var(--ap-text-primary)] antialiased selection:bg-blue-500/30 selection:text-blue-200 transition-colors">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
```

- [x] **Step 4: Verify theme tests pass**
Run: `npm test tests/composables/useTheme.test.ts`  
Expected: PASS

---

### Task 2: Unified Apple Messages Sidebar (`ChatSidebar.vue`)

**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Modify: `tests/components/chatUi.test.ts`

- [x] **Step 1: Check existing sidebar tests**
Run: `npm test tests/components/chatUi.test.ts`  
Expected: PASS

- [x] **Step 2: Refactor `ChatSidebar.vue` to Unified 260px Apple Messages Sidebar**
1. Remove external 64px `nav` rail and integrate all controls into a single `aside[aria-label="Channel and Friends Directory"]` with `w-64 md:w-64 bg-[var(--ap-sidebar)] backdrop-blur-2xl rounded-2xl border border-[var(--ap-glass-border)] shadow-xl flex flex-col shrink-0 overflow-hidden`.
2. Header Bar (`h-12 px-4 flex items-center justify-between border-b border-white/5`):
   - Traffic light dots: red `#ff5f56`, yellow `#ffbd2e`, green `#27c93f`.
   - Title: "Messages" (`text-xs font-semibold text-white/90`).
   - Quick action icon buttons:
     - New Direct Chat (`data-test="open-start-dm"`)
     - New Group (`data-test="open-create-group"`)
     - Contacts (`data-test="open-contacts"`)
   - Telemetry badge ("Live" green indicator).
3. Search Capsule:
   - Capsule search input (`data-test="conversation-search-input"`, `rounded-full bg-white/8 border border-white/10 text-xs text-white placeholder-white/40`).
4. Conversations Feed:
   - Unified conversation list items with `rounded-xl p-2.5`.
   - Active state: `bg-blue-600/25 border border-blue-500/30 text-white`.
   - Inactive state: `hover:bg-white/5 text-white/80`.
   - Circular avatars with status dot, timestamps, last message subtitle, unread badge (Apple Blue pill), @ mention badge.
5. Online Friends Section:
   - Frosted row items with status dot.
6. Footer Profile Capsule:
   - Profile avatar, display name, online badge.
   - Action buttons: Profile Settings (`data-test="open-profile-settings"`), Notifications (`data-test="toggle-notifications-btn"`), Theme toggle, Logout.

- [x] **Step 3: Update `tests/components/chatUi.test.ts` sidebar assertions**
Update line 656 from expecting `nav[aria-label="Workspace navigation"]` to checking the unified Apple Messages sidebar `aside[aria-label="Channel and Friends Directory"]` and verify all action buttons (`open-contacts`, `open-start-dm`, `open-create-group`, `toggle-notifications-btn`, `open-profile-settings`, `conversation-search-input`) exist and emit properly.

- [x] **Step 4: Verify sidebar and UI tests pass**
Run: `npm test tests/components/chatUi.test.ts`  
Expected: PASS

---

### Task 3: Workspace Shell & Header Stage (`app/pages/index.vue`)

**Files:**
- Modify: `app/pages/index.vue`
- Test: `tests/components/indexPage.test.ts`

- [x] **Step 1: Run index page tests**
Run: `npm test tests/components/indexPage.test.ts`  
Expected: PASS

- [x] **Step 2: Refactor `index.vue` workspace layout & stage header**
1. Workspace shell: `h-dvh flex overflow-hidden bg-[var(--ap-canvas)] p-2 md:p-3 md:gap-3 transition-colors`.
2. Stage main wrapper:
   `main.flex-1.flex.flex-col.min-w-0.h-full.bg-[var(--ap-stage)].backdrop-blur-2xl.rounded-2xl.border.border-[var(--ap-glass-border)].shadow-xl.overflow-hidden`.
3. Stage header:
   - Frosted header: `h-14 px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/2 backdrop-blur-md`.
   - Direct conversation: avatar + `@peer` name + `Active now` / `Offline` status pill.
   - Group conversation: group icon capsule + group title (`data-test="group-header-info-trigger"`) + member count pill.
   - Header actions: Group info trigger, E2EE lock indicator.

- [x] **Step 3: Verify index page tests pass**
Run: `npm test tests/components/indexPage.test.ts`  
Expected: PASS

---

### Task 4: Apple iMessage Timeline Viewport (`MessageViewport.vue`)

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Test: `tests/components/chatUi.test.ts`

- [x] **Step 1: Check MessageViewport tests**
Run: `npm test tests/components/chatUi.test.ts`  
Expected: PASS

- [x] **Step 2: Restyle `MessageViewport.vue` to Apple iMessage timeline**
1. Timeline container: `flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4 custom-scroll relative`.
2. Date Dividers:
   - Frosted pill: `px-3 py-1 rounded-full text-[11px] font-medium text-white/50 bg-white/5 backdrop-blur-md border border-white/5`.
3. Message Bubbles:
   - Sender Bubble (Me): `rounded-[22px] rounded-br-[4px] bg-gradient-to-br from-[#0a84ff] to-[#0062cc] text-white text-[13.5px] leading-relaxed shadow-md shadow-blue-600/25 transition-all`.
   - Recipient Bubble: `rounded-[22px] rounded-bl-[4px] bg-white/8 hover:bg-white/10 backdrop-blur-md border border-white/10 text-white text-[13.5px] leading-relaxed shadow-sm transition-all`.
   - Quoted reply snippet: frosted capsule with blue accent line.
   - Code block: Xcode dark styling with 3 traffic lights in header and copy button.
4. Empty State:
   - Apple Intelligence glowing iridescent aura ring (`w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-400 p-0.5 shadow-[0_0_30px_rgba(168,85,247,0.35)] animate-pulse mb-4` with message icon).
   - "No Messages Yet" heading, subtext, and friendly "Say Hello 👋" CTA button.
5. Reactions Bar:
   - Frosted pill buttons (`rounded-full bg-white/8 hover:bg-white/12 border border-white/10 text-white/80`).
6. Pending / Sending / Failed states:
   - Preserve `data-test="retry-${item.message.id}"` and `data-test="dismiss-${item.message.id}"` with Apple frosted styling.

- [x] **Step 3: Verify MessageViewport tests pass**
Run: `npm test tests/components/chatUi.test.ts`  
Expected: PASS

---

### Task 5: Floating Frosted Pill Dock Composer (`MessageComposer.vue`)

**Files:**
- Modify: `app/components/MessageComposer.vue`
- Test: `tests/components/chatUi.test.ts`

- [x] **Step 1: Check MessageComposer tests**
Run: `npm test tests/components/chatUi.test.ts`  
Expected: PASS

- [x] **Step 2: Restyle `MessageComposer.vue` to Apple Floating Frosted Pill Dock**
1. Floating Frosted Pill Dock:
   - Container: `p-4 bg-transparent shrink-0`. Max width container: `max-w-[65ch] mx-auto` (responsive width up to 100%).
   - Dock: `rounded-full bg-white/8 hover:bg-white/10 backdrop-blur-2xl border border-white/15 shadow-2xl p-1.5 flex items-center gap-2 transition-all focus-within:bg-white/12 focus-within:ring-2 focus-within:ring-blue-500/40`.
2. Controls:
   - Attachment button: `w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all shrink-0` (`data-test="attach-image-button"`).
   - Textarea: borderless, auto-resizing, clean `text-[13.5px] leading-relaxed custom-scroll max-h-32 py-1 px-1 resize-none bg-transparent text-white placeholder-white/40 focus:outline-none`.
   - Send Button: `w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/30 transition-all active:scale-90 shrink-0`.
3. Typing Indicator:
   - Bouncing dots with blue glow (`Alex Rivera is typing...`).
4. Reply Banner:
   - Frosted pill banner (`rounded-2xl bg-white/8 border border-white/10 px-4 py-1.5 flex items-center justify-between text-xs backdrop-blur-md`).
5. Mention Autocomplete:
   - Frosted floating capsule menu with rounded-xl candidates.

- [x] **Step 3: Verify MessageComposer tests pass**
Run: `npm test tests/components/chatUi.test.ts`  
Expected: PASS

---

### Task 6: Cupertino Auth / Login Page & E2EE Gate

**Files:**
- Modify: `app/pages/login.vue`
- Modify: `app/components/E2eeGate.vue`
- Test: `tests/components/login.test.ts`
- Test: `tests/composables/useE2ee.test.ts`

- [x] **Step 1: Check existing login and E2EE tests**
Run: `npm test tests/components/login.test.ts`  
Expected: PASS

- [x] **Step 2: Restyle `login.vue` with Apple Cupertino Frosted Glass**
- Ambient radial glows on background.
- Left hero card: Frosted glass panel with Cupertino typography, iridescent badge, and clean features preview.
- Right form card: Translucent frosted glass card with Apple System Blue primary button, frosted input fields, and pill tabs (Sign in / Sign up).

- [x] **Step 3: Restyle `E2eeGate.vue` with Apple Cupertino Frosted Glass**
- Frosted glass modal card with ambient glowing aura, Apple System Blue action buttons, Cupertino typography, and clear passkey instructions.

- [x] **Step 4: Verify login and E2EE tests pass**
Run: `npm test tests/components/login.test.ts tests/composables/useE2ee.test.ts`  
Expected: PASS

---

### Task 7: Cupertino Frosted Modals Restyling

**Files:**
- Modify: `app/components/ContactsModal.vue`
- Modify: `app/components/CreateGroupModal.vue`
- Modify: `app/components/GroupInfoModal.vue`
- Modify: `app/components/ProfileSettingsModal.vue`
- Modify: `app/components/ImageViewerModal.vue`
- Test: `tests/components/ContactsModal.test.ts`
- Test: `tests/components/GroupModals.test.ts`
- Test: `tests/components/ImageViewerModal.test.ts`

- [x] **Step 1: Check existing modal tests**
Run: `npm test tests/components/ContactsModal.test.ts tests/components/GroupModals.test.ts tests/components/ImageViewerModal.test.ts`  
Expected: PASS

- [x] **Step 2: Restyle all modals to Apple frosted glass dialogs**
- Backdrop: `bg-black/60 backdrop-blur-md`.
- Modal body: `rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl shadow-2xl overflow-hidden`.
- Header: clean Apple typography with subtle close button.
- Inputs: pill search / frosted input fields (`bg-white/8 border-white/10 rounded-full` or `rounded-xl`).
- Buttons: Apple System Blue (`bg-blue-500 hover:bg-blue-600 text-white rounded-full` or `rounded-xl`).

- [x] **Step 3: Verify modal tests pass**
Run: `npm test tests/components/ContactsModal.test.ts tests/components/GroupModals.test.ts tests/components/ImageViewerModal.test.ts`  
Expected: PASS

---

### Task 8: Complete Verification Gate & Production Build

**Files:**
- Verify: Full test suite (`npm test`)
- Verify: Production build (`npm run build`)

- [x] **Step 1: Run complete test suite**
Run: `npm test`  
Expected: 22 test files passed, 254+ tests passed, 0 failures.

- [x] **Step 2: Run production build check**
Run: `npm run build`  
Expected: Build succeeds without template or TypeScript compilation errors.
