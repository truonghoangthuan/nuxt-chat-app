# Design Specification — Obsidian Monolith UI/UX Redesign

**Date:** 2026-10-21  
**Project:** Friends Chat (`nuxt-chat-app`)  
**Design Theme:** Obsidian Monolith (Linear / Raycast Precision Studio)  
**Layout Model:** Refined 2-Pane Studio (Unified Collapsible Sidebar + Focused Chat Stage)

---

## 1. Executive Summary & Design Vision

This specification defines a comprehensive visual and architectural redesign of `nuxt-chat-app`. Moving away from fragmented multi-column panels and generic SaaS styling, the **Obsidian Monolith** design delivers a high-craft, minimal, developer-grade messaging experience inspired by tools like Linear and Raycast.

### Core Pillars
1. **Precision & Minimalism:** Sub-pixel hairline borders (`border-white/[0.07]`), razor-sharp geometric typography (Geist + Geist Mono), monochromatic canvas surfaces with zero unnecessary visual noise.
2. **Refined 2-Pane Layout:** Replaces the disconnected 64px icon rail + 300px list layout with an integrated 280px sidebar combining workspace branding, quick compose actions, instant search filtering, collapsible conversation groups, and a compact user profile dock.
3. **Tactile Interaction:** Floating pill message composer, micro-specular highlights (`inset 0 1px 0 rgba(255, 255, 255, 0.05)`), subtle hover transitions (100–150ms), and electric indigo interactive accents (`#6366f1` / `#818cf8`).
4. **Zero-Regression Guarantee:** Retains 100% of functional requirements, data-test attributes, E2EE safeguards, realtime presence/typing synchronization, and passes all 22 test suites (244 Vitest tests).

---

## 2. Design Tokens & Visual Hierarchy

The application theme is governed by custom CSS variables declared in `app/assets/css/main.css`.

### 2.1 Color Palette & Surfaces

| Token | Dark Mode (`html.dark`) | Light Mode (`:root`) | Purpose |
| --- | --- | --- | --- |
| `--om-canvas` | `#09090b` (Zinc-950) | `#f4f4f5` (Zinc-100) | Outer workspace background |
| `--om-sidebar` | `#0c0d11` (Deep Charcoal) | `#ffffff` (Pure White) | Integrated sidebar panel |
| `--om-stage` | `#0e1015` (Elevated Zinc) | `#ffffff` (Pure White) | Chat stage & message viewport |
| `--om-card` | `#141720` (Surface Elevated) | `#fafafa` (Zinc-50) | Modals, composer, cards |
| `--om-input-bg` | `rgba(0, 0, 0, 0.40)` | `rgba(0, 0, 0, 0.03)` | Input fields, search bars |
| `--om-hover` | `rgba(255, 255, 255, 0.045)` | `rgba(15, 23, 42, 0.045)` | List item & button hover |
| `--om-active` | `rgba(99, 102, 241, 0.12)` | `rgba(99, 102, 241, 0.08)` | Active conversation highlight |
| `--om-border` | `rgba(255, 255, 255, 0.07)` | `rgba(15, 23, 42, 0.08)` | Hairline dividers & outlines |
| `--om-border-strong` | `rgba(255, 255, 255, 0.14)` | `rgba(15, 23, 42, 0.16)` | Active borders, input focus |
| `--om-specular` | `inset 0 1px 0 rgba(255, 255, 255, 0.06)` | `inset 0 1px 0 rgba(255, 255, 255, 0.9)` | Tactile edge reflection |
| `--om-accent` | `#6366f1` (Electric Indigo) | `#4f46e5` (Deep Indigo) | Primary buttons, active bars |
| `--om-accent-bright` | `#818cf8` (Indigo-400) | `#4338ca` (Indigo-700) | Highlighting, mention symbols |
| `--om-text-primary` | `#f4f4f5` (Zinc-100) | `#09090b` (Zinc-950) | Main headings, message content |
| `--om-text-secondary` | `#94a3b8` (Slate-400) | `#475569` (Slate-600) | Timestamps, subtitles, meta |
| `--om-text-muted` | `#64748b` (Slate-500) | `#94a3b8` (Slate-400) | Placeholders, inactive icons |
| `--om-presence-online`| `#10b981` (Emerald-500) | `#10b981` (Emerald-500) | Real-time presence indicator |
| `--om-destructive` | `#f43f5e` (Rose-500) | `#e11d48` (Rose-600) | Deletion, leave, errors |

### 2.2 Typography
- **Primary Sans:** `Geist`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif.
- **Monospace Accents:** `Geist Mono`, `ui-monospace`, `Menlo`, `monospace` (used for timestamps, shortcuts, `#` channel prefixes, and `@` mention tags).
- **Scale:**
  - `Display / Titles`: `15px` – `16px`, weight `600`, tracking `-0.015em`.
  - `Body Messages`: `14px`, weight `400`, line-height `1.5` (`leading-relaxed`), tracking normal.
  - `Metadata / Badges / Subtitles`: `11px` – `12px`, weight `500` / `600`.
  - `Section Headers`: `11px`, weight `600`, uppercase, tracking `0.05em`.

---

## 3. Structural & Component Architecture

### 3.1 Workspace Layout (`app/pages/index.vue`)
- **2-Pane Shell:**
  - Left: `ChatSidebar.vue` (width `280px` on desktop, full-screen overlay drawer on mobile).
  - Right: Main Chat Stage (`main.flex-1.flex.flex-col`), wrapped in a sleek bordered surface (`md:rounded-[12px] md:border border-[var(--om-border)] bg-[var(--om-stage)] overflow-hidden`).
  - Outer container: `h-dvh flex bg-[var(--om-canvas)] md:p-2.5 md:gap-2.5 overflow-hidden`.
- **Top Header Bar (`h-[52px]`):**
  - Left: Hamburger toggle (mobile only), Conversation avatar + Name (`#channel` or `@peer`), Online status pill (`Active now` / `Offline`), member count.
  - Right: Group Info button (for groups), online friends avatar stack (`slice(0, 4)` with ring offset), encrypted status indicator icon.

### 3.2 Integrated 2-Pane Sidebar (`app/components/ChatSidebar.vue`)
The sidebar consolidates navigation into a single, cohesive vertical panel:
1. **Workspace Header (Top):**
   - Brand mark: Minimalist rounded cube (`size-8 rounded-[8px] bg-indigo-600 flex items-center justify-center font-bold text-xs text-white`).
   - Workspace Name: `Friends Chat` (`text-sm font-semibold text-[var(--om-text-primary)]`).
   - Quick Action Icon Buttons:
     - `New Direct Chat` button (`data-test="open-start-dm"`).
     - `New Group` button (`data-test="open-create-group"`).
     - `Contacts / Address Book` button (`data-test="open-contacts"`).
2. **Instant Search & Filter Bar:**
   - Search input (`Input` component) with search icon and subtle `⌘K` visual badge.
   - Filters conversations dynamically by title, peer name, and email.
3. **Conversations Navigation List:**
   - Unified, scrollable list partitioned into clean collapsible categories:
     - `CHANNELS & GROUPS` (Group conversations and public channels).
     - `DIRECT MESSAGES` (1-on-1 friend conversations with peer avatar and online presence indicator).
   - **Conversation Item Styling:**
     - Rounded item container (`rounded-[8px] px-2.5 py-2 flex items-center gap-2.5 transition-colors cursor-pointer`).
     - Active conversation: `bg-[var(--om-active)] text-[var(--om-text-primary)] font-medium` with left accent bar (`w-[2.5px] h-4 rounded-full bg-[var(--om-accent)]`).
     - Unread count pill: `bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full`.
     - Timestamp & snippet: Truncated last message summary and relative time (`12:45 PM`, `Yesterday`).
4. **Footer Profile Dock (Bottom):**
   - Bordered top divider (`border-t border-[var(--om-border)] pt-2.5 mt-auto`).
   - User identity tile: `UserAvatar` (size `sm`), display name, and online green dot.
   - Utility action icons:
     - Dark / Light Mode Toggle (`Sun` / `Moon`).
     - System Notifications Toggle (`Bell` / `BellOff`).
     - Profile Settings Modal trigger (`Settings`).
     - Sign Out button (`LogOut`).

### 3.3 Message Timeline Viewport (`app/components/MessageViewport.vue`)
1. **History & Pagination:**
   - Load Older Messages trigger: Minimalist button (`data-test="load-older-button"`), visible when `hasMoreHistory` is true.
   - Dynamic date dividers: Centered hairline divider with rounded date badge (`text-[11px] font-mono text-[var(--om-text-muted)]`).
2. **Message Row Presentation:**
   - **Standard Row:**
     - Left: `UserAvatar` (`size-8 rounded-[8px]`).
     - Right: Author display name (`text-[13px] font-semibold`), hoverable monospace timestamp (`text-[11px] text-[var(--om-text-muted)]`).
     - Content: `text-[14px] leading-relaxed text-[var(--om-text-primary)]`.
   - **Grouped Row (within 5 minutes):**
     - Left avatar omitted; left gutter aligned with standard content.
     - Timestamp appears smoothly on row hover in left gutter.
   - **Quoted Reply Box:**
     - Elevated mini-card (`border-l-2 border-indigo-500/70 bg-white/[0.03] p-1.5 rounded-r-[6px] text-xs text-[var(--om-text-secondary)]`).
   - **Image Grid (`MessageImageGrid.vue`):**
     - Clean multi-image layout (1 to 4 images), rounded corners (`rounded-[10px] overflow-hidden`), subtle 1px border, click to launch lightbox.
   - **Emoji Reactions:**
     - Flex wrap row of pills (`border border-[var(--om-border)] rounded-full px-2 py-0.5 text-xs`). Active user reaction has subtle indigo glow and border.
   - **Floating Action Toolbar (`MessageActionsMenu.vue`):**
     - Appears on row hover at top-right (`absolute -top-3 right-3 bg-[var(--om-card)] border border-[var(--om-border)] shadow-md rounded-[8px] flex items-center p-0.5`).
     - Quick emoji reaction buttons + Reply, Edit (for author), Delete (for author).
3. **Scroll-Lock Pill:**
   - Floating pill at bottom-center (`↓ N new messages`, `data-test="scroll-to-bottom"`), clicking scrolls smoothly to bottom.

### 3.4 Message Composer (`app/components/MessageComposer.vue`)
1. **Container:**
   - Floating pill card anchored at stage bottom (`px-4 pb-4 pt-2`).
   - Elevated border and shadow: `rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-card)] shadow-lg p-2.5`.
2. **Composer Header (When Replying):**
   - Active reply banner displaying author name, truncated message text, and `X` cancel button.
3. **Attachment Preview Strip:**
   - Displays pending uploaded images with thumbnail preview and remove `X` badge.
4. **Input Area & Actions:**
   - Auto-growing textarea (`min-h-[40px] max-h-[160px] resize-none bg-transparent text-sm focus:outline-none`).
   - Bottom action bar:
     - Left: Attachment file button (`Paperclip` icon) triggering image picker.
     - Right: Typing indicator or keyboard hint (`Enter` to send, `Shift+Enter` for newline) + Tactile Send Button (`size-8 rounded-[8px] bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all`).

### 3.5 Modals & System States
1. **Modals (`ContactsModal`, `CreateGroupModal`, `GroupInfoModal`, `ProfileSettingsModal`, `ImageViewerModal`):**
   - Backdrop: `bg-black/60 backdrop-blur-xs`.
   - Dialog Surface: `rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-card)] shadow-2xl`.
   - Retains all edit group title, add member, delete, leave group, and profile color picker swatches.
2. **E2EE Gate (`E2eeGate.vue`):**
   - High-craft unlock card centered in canvas.
   - Passphrase input with show/hide toggle, unlock submit button, error messages.
3. **Authentication Screen (`app/pages/login.vue`):**
   - Modernized split screen: Left branding hero card with subtle radial gradient and preview snippets; right authentication card with Sign In / Sign Up tabs, clean input fields, and indigo CTA.

---

## 4. Invariants & Compatibility Guardrails

1. **Test Preservation:**
   - All `data-test` attributes must remain intact: `data-test="open-contacts"`, `data-test="open-start-dm"`, `data-test="open-create-group"`, `data-test="group-header-info-trigger"`, `data-test="open-group-info"`, `data-test="load-older-button"`, `data-test="scroll-to-bottom"`, etc.
   - All 22 Vitest test suites must pass without error.
2. **Avatar Compatibility:**
   - Retain `AVATAR_PALETTE` in `app/utils/chat.ts` to ensure user profile colors and tests remain 100% compliant.
3. **Encryption & Security:**
   - No plaintext messages bypassing AES-GCM-256 E2EE envelope (`e2ee:v1:...`).
4. **Responsive Accessibility:**
   - Touch targets >= 44×44px where appropriate.
   - Body text >= 14px, labels >= 12px.
   - Mobile sidebar drawer smoothly slides in/out without layout breakage.

---

## 5. Verification Plan

1. **Visual Verification:**
   - Generate high-fidelity HTML demo/preview in `design-demos/` and take Playwright screenshots for verification.
2. **Automated Vitest Suite:**
   - Execute `npm test` after all changes.
   - Confirm all 244 unit, composable, and component tests pass.
3. **Build Check:**
   - Run `npm run build` or `npx nuxt typecheck` to ensure type soundness.
