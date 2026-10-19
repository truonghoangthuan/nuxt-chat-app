# Project: Friends Chat UI/UX v2 Redesign

## Architecture
The project redesigns the user interface and user experience of `Friends Chat` (`nuxt-chat-app`) across three radically distinct, studio-grade interactive HTML prototypes (`dir-1.html`, `dir-2.html`, `dir-3.html`), a 6-candidate exploration board (`thumbs.html`), and full verification assets (screenshots, automated design linting, contrast analysis, pairwise diversity metrics, adversarial critique, and integrity audits).

### Spatial Skeletons & Lightness Classes
1. **Direction 1 — Warm Editorial Salon (`dir-1.html`)**:
   - Spatial Architecture: 3-column asymmetric salon skeleton (Topic Spine 220px + Rich Editorial Conversation Stream 68% + Living Room Lounge Column 32%).
   - Lightness Class: Warm Linen Paper (`#F7F3E9`), warm cream surfaces (`#FFFFFF` with `#E8E2D2` borders).
   - Typography: `Newsreader` (Editorial Display & Headings) + `Plus Jakarta Sans` (Crisp Body & Controls).
   - Visual Motif: Intimate coffee meetup cards, bookmarked quotes, subtle paper textures, rich reaction pills.

2. **Direction 2 — Obsidian Precision Studio (`dir-2.html`)**:
   - Spatial Architecture: 64px compact icon rail + 220px collapsible channel tree drawer + Floating Inset Stage (`#0E131F` / `#131826`) with 1px optical hairline borders (`rgba(255,255,255,0.08)`) and floating Command-Bar composer with `Cmd+K` keycaps.
   - Lightness Class: Deep Obsidian (`#080A0F`), translucent glass layers (`rgba(255,255,255,0.03)` with optical border `rgba(255,255,255,0.08)`).
   - Typography: `Schibsted Grotesk` (Technical Display) + `Hanken Grotesk` (Legible Body) + `Geist Mono` (Tabular / Telemetry).
   - Visual Motif: Terminal-grade precision, live WebSocket telemetry (`14ms · Synced`), code snippet card, git commit diff card.

3. **Direction 3 — Tactile Neo-Brutalist Sticker Zine (`dir-3.html`)**:
   - Spatial Architecture: Left 3-card stacked bento deck + Asymmetric speech cards & pinboard canvas with chunky solid drop shadows (`3px 3px 0 #121212`).
   - Lightness Class: Saturated Neo-Brutalist Mint Canvas (`#A7F3D0` [Mint-200, Oklab distance = 0.1055 > 0.06 vs #F7F3E9] with subtle halftone dots), warm paper bubbles (`#FFFDF8` and `#FACC15`).
   - Typography: `Bricolage Grotesque` (Expressive Brutalist Display) + `Work Sans` (Friendly Body).
   - Visual Motif: Tactile sticker badges, pressable 3D keycap reaction buttons (`translateY(2px)`), meme card, chunky SEND keycap.

## Feature Inventory
Every feature from user requirements and surveys is cataloged with its assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | v1 Backups Creation | Copy `dir-[1-3].html` and `dir-[1-3].png` to `dir-[1-3]-v1.*` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | v1 vs v2 Critique Report | 6-dimension rubric evaluation at `critique-v1-vs-v2.md` scoring v1 < 7.0 and detailing v2 fixes | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Directions Re-foundation | Update `directions.md` with 6 candidate concepts & 3 selected v2 directions | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Exact Avatar Palette | Strict implementation of 8 colors (`#0284c7`, `#0d9488`, `#7c3aed`, `#db2777`, `#ea580c`, `#16a34a`, `#2563eb`, `#4f46e5`) | M2, M3, M4 | ORIGINAL_REQUEST §R2 |
| 5 | Avatar Initials Algorithm | Deterministic 1-2 char uppercase initials matching `app/utils/chat.ts` | M2, M3, M4 | Spec Miner |
| 6 | Zero Dead Whitespace Voids | Viewport filled naturally with 8–14 realistic messages, date dividers, unread markers | M2, M3, M4 | ORIGINAL_REQUEST §R2 |
| 7 | Full Message Row | Sender avatar, name, timestamp, message body, hover action bar, reaction pills | M2, M3, M4 | Spec Miner |
| 8 | Compact Grouped Message | Consecutive messages <= 5 min window grouped without repeating avatar/header | M2, M3, M4 | Spec Miner |
| 9 | Quoted Reply Preview | Reply banner with original author, truncated text preview, and smooth jump | M2, M3, M4 | Spec Miner |
| 10 | Edited Message Badge | `(edited)` badge with timestamp tooltip | M2, M3, M4 | Spec Miner |
| 11 | Deleted Message Tombstone | Italic `This message was deleted` row hiding toolbar and reactions | M2, M3, M4 | Spec Miner |
| 12 | Optimistic Sending State | Semi-transparent message row with `Sending...` status indicator | M2, M3, M4 | Spec Miner |
| 13 | Failed Message State | Rose-tinted failed row with interactive `Retry` and `Dismiss` actions | M2, M3, M4 | Spec Miner |
| 14 | Reaction Pills | 8-emoji reactions (`👍`, `❤️`, `😂`, `🎉`, `🔥`, `😮`, `😢`, `👀`) with active/inactive counts | M2, M3, M4 | Spec Miner |
| 15 | Hover Action Toolbar | Floating toolbar on message hover with `React`, `Reply`, `Edit`, `Delete` | M2, M3, M4 | Spec Miner |
| 16 | Floating New-Messages Pill | Bouncing pill indicator (`↓ N new message(s)`) with smooth scroll to bottom | M2, M3, M4 | Spec Miner |
| 17 | Typing Indicator | Per-user typing tracker label ("Alice is typing...") with animated dots | M2, M3, M4 | Spec Miner |
| 18 | Connection Banner Simulation | Transient reconnecting banner with countdown and `Retry now` button | M2, M3, M4 | Spec Miner |
| 19 | Interactive Message Sending | Functional textarea composer (Enter to send, Shift+Enter newline) appending new messages | M2, M3, M4 | ORIGINAL_REQUEST §R2 |
| 20 | Channel Navigation & Switching | Sidebar with `#general`, `#random`, `#help`, etc., topic description, unread counts | M2, M3, M4 | ORIGINAL_REQUEST §R2 |
| 21 | Create Channel Modal | Modal dialog with channel name input, live `#slug` preview, and validation | M2, M3, M4 | ORIGINAL_REQUEST §R2 |
| 22 | Profile Settings Modal | Modal with display name input, live avatar preview, 8-color swatch picker | M2, M3, M4 | ORIGINAL_REQUEST §R2 |
| 23 | Redesigned Login View | Authentic Sign-In / Create Account screen (`/login`) styled per direction aesthetic | M2, M3, M4 | ORIGINAL_REQUEST §R2 |
| 24 | Direction 1 Implementation | Complete `dir-1.html` Warm Editorial Salon prototype | M2 | ORIGINAL_REQUEST §R2 |
| 25 | Direction 2 Implementation | Complete `dir-2.html` Obsidian Precision Studio prototype | M3 | ORIGINAL_REQUEST §R2 |
| 26 | Direction 3 Implementation | Complete `dir-3.html` Tactile Neo-Brutalist Sticker Zine prototype | M4 | ORIGINAL_REQUEST §R2 |
| 27 | 6-Candidate Exploration Board | Complete `thumbs.html` presenting 6 candidate concepts with live preview cards | M5 | ORIGINAL_REQUEST §R2 |
| 28 | 1440x900 Screenshot Rendering | Headless Chrome rendering of `dir-1.png`, `dir-2.png`, `dir-3.png`, `thumbs.png` | M6 | ORIGINAL_REQUEST §R3 |
| 29 | Design Lint Verification | Programmatic `design_lint.py check` passing with 0 red lights and 0 yellow lights | M6 | ORIGINAL_REQUEST §R3 |
| 30 | Contrast Ratio Verification | 100% WCAG AA contrast compliance across all text elements in all 3 prototypes | M6 | ORIGINAL_REQUEST §R3 |
| 31 | Pairwise Diversity Verification | `design_lint.py compare` passing with $lc < 0.55$ and $pd \ge 0.06$ | M6 | ORIGINAL_REQUEST §R3 |
| 32 | Adversarial Critique Evaluation | Independent critique scoring each direction $\ge 8.5/10$ overall & $\ge 8.0/10$ Concept | M6 | ORIGINAL_REQUEST §R3 |
| 33 | Forensic Integrity Audit | Systematic integrity audit confirming no hardcoding, facade bypass, or cheating | M6 | Hard Constraint |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | v1 Audit, Archiving & Re-foundation | Archive v1 files to `dir-[1-3]-v1.*`, write `critique-v1-vs-v2.md`, update `directions.md` | None | **DONE** |
| M2 | Direction 1 v2 Prototype | Build `design-demos/dir-1.html` (Warm Editorial Salon) with all 21 core domain features | M1 | **DONE** |
| M3 | Direction 2 v2 Prototype | Build `design-demos/dir-2.html` (Obsidian Precision Studio) with all 21 core domain features | M1 | **DONE** |
| M4 | Direction 3 v2 Prototype | Build `design-demos/dir-3.html` (Tactile Neo-Brutalist Sticker Zine) with all 21 core domain features | M1 | **DONE** |
| M5 | Exploration Board (thumbs.html) | Build `design-demos/thumbs.html` featuring all 6 candidate directions with interactive previews | M2, M3, M4 | **DONE** |
| M6 | Screenshots, Linting & Adversarial Audit | Render 1440x900 screenshots, run design_lint.py check/compare, contrast check, adversarial critique & forensic audit | M5 | **DONE** |

## Interface Contracts
### Prototypes ↔ Design Lint & Verification
- All HTML files self-contained with embedded CSS and JS (no relative local resources).
- Viewport: `1440px × 900px` desktop layout with responsive container support.
- Fonts: Google Fonts loaded via `<link>` with robust fallback stacks (`serif`, `sans-serif`, `monospace`).
- Typography Floors: Minimum label font size $\ge 12px$; minimum body text ($\ge 28$ chars outside caption tags) $\ge 14.5px$.
- Color Contrast: All visible text elements $\ge 4.5:1$ (normal text) and $\ge 3.0:1$ (large bold text) against their computed opaque background.
- Resting State Visibility: Hover toolbars and transient popovers must use `display: none` or `visibility: hidden` in resting state to avoid contrast flags.
- Avatar Palette: Strict adherence to `['#0284c7', '#0d9488', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#4f46e5']`.
- Chromatic Separation: Pairwise Oklab distance between directions $\ge 0.06$.
- Edge Map Correlation: Pairwise normalized edge correlation $lc < 0.55$.

## Code Layout
- `design-demos/dir-1.html` — Direction 1 v2 Prototype
- `design-demos/dir-2.html` — Direction 2 v2 Prototype
- `design-demos/dir-3.html` — Direction 3 v2 Prototype
- `design-demos/thumbs.html` — 6-Candidate Exploration Board
- `design-demos/dir-1-v1.html` — v1 Direction 1 Backup
- `design-demos/dir-2-v1.html` — v1 Direction 2 Backup
- `design-demos/dir-3-v1.html` — v1 Direction 3 Backup
- `design-demos/dir-1-v1.png` — v1 Direction 1 Screenshot Backup
- `design-demos/dir-2-v1.png` — v1 Direction 2 Screenshot Backup
- `design-demos/dir-3-v1.png` — v1 Direction 3 Screenshot Backup
- `design-demos/critique-v1-vs-v2.md` — Point-by-point 6-dimension rubric critique of v1 vs v2
- `design-demos/directions.md` — 6-candidate exploration specification
- `design-demos/dir-1.png` — Direction 1 1440x900 rendered screenshot
- `design-demos/dir-2.png` — Direction 2 1440x900 rendered screenshot
- `design-demos/dir-3.png` — Direction 3 1440x900 rendered screenshot
- `design-demos/thumbs.png` — Exploration board 1440x900 rendered screenshot

## Milestone 6 Verification Results (Authoritative Sign-off)

1. **Automated Design Linting (`design_lint.py check --viewport 1440x900`)**:
   - `dir-1.html`: 0 red lights, 0 yellow lights, 100% WCAG AA contrast (Newsreader + Plus Jakarta Sans on #F7F3E9).
   - `dir-2.html`: 0 red lights, 0 yellow lights, 100% WCAG AA contrast (Schibsted Grotesk + Hanken Grotesk on #080A0F).
   - `dir-3.html`: 0 red lights, 0 yellow lights, 100% WCAG AA contrast (Bricolage Grotesque + Work Sans on #99F6E4/#A7F3D0).
   - `thumbs.html`: 0 red lights, 0 yellow lights, 100% WCAG AA contrast (Schibsted Grotesk + Plus Jakarta Sans on #0A0D14).

2. **Diversity & Separation Metrics (`design_lint.py compare --viewport 1440x900`)**:
   - `dir-1.html ↔ dir-2.html`: Palette Distance = 0.647 ($\ge 0.06$), Edge Correlation = 0.01 ($< 0.55$).
   - `dir-1.html ↔ dir-3.html`: Palette Distance = 0.060 ($\ge 0.06$), Edge Correlation = -0.03 ($< 0.55$).
   - `dir-2.html ↔ dir-3.html`: Palette Distance = 0.549 ($\ge 0.06$), Edge Correlation = 0.31 ($< 0.55$).
   - Verdict: All 3 directions distinctly separated across chromatic and spatial dimensions.

3. **Screenshot Resolutions (`sips`)**:
   - `dir-1.png`: 1440 × 900 px (Verified)
   - `dir-2.png`: 1440 × 900 px (Verified)
   - `dir-3.png`: 1440 × 900 px (Verified)
   - `thumbs.png`: 1440 × 900 px (Verified)

4. **Test Suite Verification (`npm test`)**:
   - 6 test files passed, 62/62 tests passing (100% green).

5. **Adversarial Critique Evaluation (`references/critique-guide.md`)**:
   - Direction 1: Concept 9.0/10, Overall 9.17/10 (Studio Grade, zero dead voids).
   - Direction 2: Concept 9.0/10, Overall 9.25/10 (Studio Grade, zero dead voids).
   - Direction 3: Concept 8.5/10, Overall 8.92/10 (Studio Grade, zero dead voids).
   - All three directions exceed $\ge 8.5/10$ overall and $\ge 8.0/10$ on Concept.

6. **Forensic Integrity Audit**:
   - Zero hardcoding, zero facade implementations, authentic state and interactions verified.
   - Status: **CLEAN / APPROVED**.

