# Design Specification — Apple Fluid UI/UX Redesign

**Date:** 2026-10-22  
**Project:** Friends Chat (`nuxt-chat-app`)  
**Design Theme:** Apple Fluid (Cupertino Glassmorphism / macOS & iOS Precision System)  
**Reference Source:** `design-demos/demo-apple.html` & `design-demos/index.html`  
**Layout Model:** Single Unified Translucent 260px Sidebar + Translucent Frosted Glass Chat Stage

---

## 1. Executive Summary & Design Vision

This specification defines a complete visual and interaction refactor of `nuxt-chat-app` inspired by Apple's Cupertino design system (macOS Messages, iPadOS, iOS, and visionOS frosted glassmorphism).

### Core Pillars
1. **Apple Fluid Glassmorphism:** Deep translucent surfaces with multi-layer blur (`backdrop-blur-2xl`), ambient radial glow background lighting, hairline specular borders (`border-white/12`), and subtle drop shadows.
2. **Unified Apple Messages Sidebar:** Replaces the 64px icon rail + 264px drawer with a single unified 260px frosted sidebar featuring macOS traffic light cues (`#ff5f56`, `#ffbd2e`, `#27c93f`), a pill search capsule, fluid conversation items with Apple Blue active glow (`bg-blue-600/25 border-blue-500/30`), and an integrated profile capsule.
3. **iMessage Conversation Timeline:**
   - **Sender Bubbles:** Apple gradient (`from-[#0a84ff] to-[#0062cc]`, `rounded-[22px] rounded-br-[4px]`, shadow).
   - **Recipient Bubbles:** Frosted translucent glass (`bg-white/8 hover:bg-white/10 backdrop-blur-md border-white/10`, `rounded-[22px] rounded-bl-[4px]`).
   - **Reactions:** Frosted pill capsules.
   - **Empty State:** Apple Intelligence iridescent aura ring (`bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-400 animate-pulse`) with "Say Hello 👋" CTA.
4. **Floating Frosted Pill Dock (Composer):** Seamless auto-resizing pill dock with circular attachment button, dynamic typing bouncing dots, frosted reply banner, and circular Apple Blue send capsule (`active:scale-90`).
5. **Full Application Harmony:** Extends Apple Cupertino styling across Auth/Login, E2EE Passphrase Gate, and all Modals (Contacts, Group Modals, Profile Settings, Image Lightbox).
6. **Zero-Regression Guarantee:** Retains 100% of data-test attributes, keyboard navigation (Enter / Shift+Enter), E2EE encryption triggers, realtime events, and passes all 22 Vitest test suites.

---

## 2. Design Tokens & Visual Hierarchy

Theme tokens are declared in `app/assets/css/main.css` and mapped for both light and dark mode with backwards compatibility for legacy aliases (`--om-*` and `--fp-*`).

### 2.1 CSS Variables & Color Palette

| Token | Dark Mode (`html.dark`) | Light Mode (`:root`) | Purpose |
| --- | --- | --- | --- |
| `--ap-canvas` | `#0d0f17` (with dual radial glows) | `#f5f5f7` (with subtle blue glows) | Ambient workspace background |
| `--ap-sidebar` | `rgba(22, 25, 36, 0.75)` | `rgba(255, 255, 255, 0.75)` | Translucent frosted sidebar |
| `--ap-stage` | `rgba(16, 18, 26, 0.85)` | `rgba(255, 255, 255, 0.88)` | Translucent frosted stage |
| `--ap-card` | `rgba(255, 255, 255, 0.06)` | `rgba(0, 0, 0, 0.035)` | Cards, dialogs, recipient bubbles |
| `--ap-glass` | `rgba(255, 255, 255, 0.06)` | `rgba(255, 255, 255, 0.65)` | Frosted glass containers |
| `--ap-glass-border` | `rgba(255, 255, 255, 0.12)` | `rgba(0, 0, 0, 0.08)` | Specular borders |
| `--ap-glass-hover` | `rgba(255, 255, 255, 0.10)` | `rgba(0, 0, 0, 0.05)` | Interactive hover state |
| `--ap-input-bg` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.045)` | Capsule search & input background |
| `--ap-blue` | `#007aff` | `#007aff` | Apple System Blue |
| `--ap-blue-gradient`| `linear-gradient(135deg, #0a84ff 0%, #0062cc 100%)` | `linear-gradient(135deg, #0a84ff 0%, #0062cc 100%)` | Sender message bubble & primary CTA |
| `--ap-text-primary` | `#ffffff` | `#1d1d1f` | Primary typography |
| `--ap-text-secondary`| `rgba(255, 255, 255, 0.70)` | `#6e6e73` | Subtitles, labels, metadata |
| `--ap-text-muted` | `rgba(255, 255, 255, 0.40)` | `#86868b` | Placeholders, inactive cues |
| `--ap-presence-online`| `#34c759` | `#34c759` | Apple System Green |
| `--ap-destructive` | `#ff3b30` | `#ff3b30` | Apple System Red |

### 2.2 Typography & Shadows
- **Font Family:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif`
- **Monospace:** `'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace`
- **Border Radius:**
  - Workspace stages: `rounded-2xl` (`16px`)
  - Pill capsules: `rounded-full` (`9999px`)
  - Message bubbles: `rounded-[22px]` with corner anchor (`rounded-br-[4px]` or `rounded-bl-[4px]`)
  - Cards & modals: `rounded-2xl` (`16px`) to `rounded-3xl` (`24px`)

---

## 3. Component Architecture & Structural Changes

### 3.1 Workspace Shell (`app/pages/index.vue`)
- Outer container: `h-dvh flex overflow-hidden bg-[var(--ap-canvas)] p-2 md:p-3 md:gap-3 transition-colors` with radial lighting.
- Stage: Translucent floating container (`bg-[var(--ap-stage)] backdrop-blur-2xl rounded-2xl border border-[var(--ap-glass-border)] shadow-xl flex-1 flex flex-col min-w-0 overflow-hidden`).
- Stage Header: Frosted header bar with avatar, channel/peer title, status badges (`Active now` / `Offline` / members count), group info trigger, and encrypted indicator.

### 3.2 Single Unified Apple Sidebar (`app/components/ChatSidebar.vue`)
- Converted from 2-pane (rail + drawer) to single unified 260px Apple Messages sidebar (`w-64 md:w-64 shrink-0 bg-[var(--ap-sidebar)] backdrop-blur-2xl rounded-2xl border border-[var(--ap-glass-border)] shadow-xl flex flex-col overflow-hidden`).
- **Top Header Bar:**
  - 3 macOS traffic light window controls: Red (`#ff5f56`), Yellow (`#ffbd2e`), Green (`#27c93f`).
  - Title: "Messages" (`text-xs font-semibold`).
  - Quick action buttons: `data-test="open-start-dm"`, `data-test="open-create-group"`, `data-test="open-contacts"`.
- **Search Capsule:**
  - Pill search bar: `w-full h-8 pl-8 pr-3 bg-white/8 border border-white/10 rounded-full text-xs text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50`.
- **Conversations Feed:**
  - Fluid cards with `rounded-xl p-2.5`.
  - Active item: `bg-blue-600/25 border border-blue-500/30 text-white`.
  - Inactive item: `hover:bg-white/5 text-white/80`.
  - Circular avatar with bottom-right status dot.
  - Badges: Apple Blue unread count pill, @ mention amber badge.
- **Online Friends Section:**
  - Cupertino contacts list with green online dot.
- **Footer Profile Capsule:**
  - User avatar, name, online badge.
  - Action buttons: Settings (`data-test="open-profile-settings"`), Notifications (`data-test="toggle-notifications-btn"`), Theme toggle, Logout.

### 3.3 Message Viewport (`app/components/MessageViewport.vue`)
- **Sender Bubbles:**
  - `rounded-[22px] rounded-br-[4px] bg-gradient-to-br from-[#0a84ff] to-[#0062cc] text-white text-[13.5px] shadow-md shadow-blue-600/25`.
- **Recipient Bubbles:**
  - `rounded-[22px] rounded-bl-[4px] bg-white/8 hover:bg-white/10 backdrop-blur-md border border-white/10 text-white text-[13.5px] shadow-sm`.
- **Date Divider:**
  - Frosted capsule: `px-3 py-1 rounded-full text-[11px] font-medium text-white/50 bg-white/5 backdrop-blur-md border border-white/5`.
- **Empty State:**
  - Apple Intelligence iridescent glow ring (`bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-400 p-0.5 shadow-[0_0_30px_rgba(168,85,247,0.35)] animate-pulse mb-4`).
  - Headline: "No Messages Yet".
  - Button: "Say Hello 👋" CTA.
- **Reactions:**
  - Frosted pill buttons (`rounded-full bg-white/8 hover:bg-white/12 border border-white/10 text-white/80`).
- **Code Block:**
  - Xcode-style dark container with traffic light header and copy button.

### 3.4 Floating Frosted Pill Dock (`app/components/MessageComposer.vue`)
- Floating frosted pill dock (`rounded-full bg-white/8 hover:bg-white/10 backdrop-blur-2xl border border-white/15 shadow-2xl p-1.5 flex items-center gap-2 transition-all focus-within:bg-white/12 focus-within:ring-2 focus-within:ring-blue-500/40`).
- Attachment button: `w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all shrink-0`.
- Textarea: borderless, auto-resizing, clean `placeholder="iMessage"`.
- Send button: Apple blue circle `w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/30 transition-all active:scale-90 shrink-0`.
- Reply banner: Frosted pill banner (`rounded-2xl bg-white/8 border border-white/10 px-4 py-1.5 backdrop-blur-md`).
- Mention autocomplete: Frosted floating capsule menu with rounded-xl options.

### 3.5 Login Page & Passphrase Gate (`app/pages/login.vue`, `app/components/E2eeGate.vue`)
- Ambient radial glows.
- Frosted glass cards with `backdrop-blur-2xl` and Apple Blue accents.
- Segmented pill tabs for Sign In / Sign Up.

### 3.6 Modals (`ContactsModal`, `CreateGroupModal`, `GroupInfoModal`, `ProfileSettingsModal`, `ImageViewerModal`)
- Translucent frosted glass dialog cards (`rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl shadow-2xl`).
- Apple Blue primary buttons, frosted input fields, and pill chips.

---

## 4. Verification & Testing Strategy

1. **Vitest Regression Gate:** Run `npm test` to verify all 22 test suites and 254 tests pass.
2. **Sidebar Test Modernization:** Update `tests/components/chatUi.test.ts` to reflect the unified Apple Messages sidebar while preserving all interaction assertions (`open-contacts`, `open-start-dm`, `open-create-group`, `toggle-notifications-btn`, `open-profile-settings`, mention badges, and friend selection).
3. **Responsive Verification:** Ensure mobile drawer layout (`isOpenMobile` state, backdrop, hamburger trigger) functions seamlessly alongside desktop floating stages.
