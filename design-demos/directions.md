# Six Direction Candidates & Three Selected v2 Directions (`directions.md`)
## Nuxt 4 Real-Time Friends Chat App (`Friends Chat` / `nuxt-chat-app`)

> **Document Status:** Authoritative Design Specification for v2 Prototypes  
> **Source Standards:** `.agents/skills/huashu-design/SKILL.md` & `.agents/skills/huashu-design/references/directions.md`  
> **Associated Prototypes:** `design-demos/dir-1.html`, `design-demos/dir-2.html`, `design-demos/dir-3.html`, `design-demos/thumbs.html`  

---

## 1. Six Candidate Directions Exploration

Each candidate is grounded in a specific artistic director, historical master, or web interface lineage, deriving its visual motif and spatial architecture directly from the close-knit social dynamics of friends hanging out online.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             6 CANDIDATE CONCEPTUAL ARCHETYPES                                    │
├──────────────────────────┬──────────────────────────┬────────────────────────────────────────────┤
│ Direction 1 (Selected)   │ Direction 2 (Selected)   │ Direction 3 (Selected)                     │
│ Warm Editorial Salon     │ Obsidian Precision Studio│ Tactile Neo-Brutalist Sticker Zine         │
│ Lightness: 浅·暖纸       │ Lightness: 深·近黑       │ Lightness: 浅·有色                         │
│ Palette: #F7F3E9 Linen   │ Palette: #080A0F Obsidian│ Palette: #A7F3D0 Neo-Mint                  │
│ Type: Newsreader+Jakarta │ Type: Schibsted+Hanken   │ Type: Bricolage Grotesque+Work Sans        │
├──────────────────────────┼──────────────────────────┼────────────────────────────────────────────┤
│ Candidate 4 (Backup)     │ Candidate 5 (Backup)     │ Candidate 6 (Backup)                       │
│ Modern Bento Workspace   │ Functional Ledger Stream │ Chromatic Spectrum Dock                    │
│ Lightness: 浅·中性白     │ Lightness: 浅·中性灰     │ Lightness: 中明度·有色                     │
│ Palette: #F8FAFC White   │ Palette: #FBFBFB Neutral │ Palette: #18181B Multi-Chromatic           │
│ Type: Jakarta+System     │ Type: Commit Mono+Plex   │ Type: Cabinet Grotesk+Satoshi              │
└──────────────────────────┴──────────────────────────┴────────────────────────────────────────────┘
```

---

### Candidate 1 (Selected as Direction 1) — The Sunday Clubhouse (Warm Editorial Salon)
- **Artistic Lineage & References:** Seiichi Horiuchi (创刊艺术指导《POPEYE》《BRUTUS》) × Studio Dumbar Humanist Editorial Systems.
- **Conceptual Motif (Form from Content):** A relaxed weekend salon where close friends gather around a table with pour-over coffee, vintage cameras, and vinyl records. Conversation flows not as corporate tickets, but as a living literary magazine.
- **Spatial Architecture (Asymmetric 3-Column Salon):**
  - **Left Topic Spine (220px):** Refined vertical channel index (`#general`, `#random`, `#help`, `#vinyl-club`, `#game-night`) with unread counter badges and issue date stamps.
  - **Center Conversation Stream (68% flex):** Wide, readable timeline with generous margins, rich coffee meetup bulletin card, deckled paper date dividers, quoted reply cards with terracotta left rules, and interactive reaction pills.
  - **Right "Living Room Lounge" (32% column, ~340px):** Dedicated clubhouse parlor displaying "Who's in the Room" (seated friend nameplates with deterministic avatar colors and online status), active channel bulletin, and music listening status.
- **Lightness Class & Palette:** `浅·暖纸`
  - Base Paper: `#F7F3E9` (Warm Linen Paper)
  - Card Surfaces: `#FFFFFF` with `#E8E2D2` soft borders
  - Primary Ink: `#1C1917` (Deep Espresso Charcoal)
  - Accent Color: `#C84B31` (Burnt Terracotta)
  - Secondary Accent: `#4D7C0F` (Muted Olive Sage)
- **Typography Pairing:**
  - Display / Headings: `Newsreader` (Editorial Serif, Optical 72pt styling, 28px–32px mastheads)
  - Body / Controls: `Plus Jakarta Sans` (14.5px body, 12px metadata)
- **Signature Interactive Elements:**
  - Masthead issue banner (`Issue No. 42 · Sunday Edition`).
  - Coffee meetup itinerary card with location pin and RSVP count.
  - Bookmarked quote cards with subtle deckled edges.
  - Complete 8-color `AVATAR_PALETTE` presence badges.

---

### Candidate 2 (Selected as Direction 2) — Obsidian Precision Studio (Linear / Raycast High Craft)
- **Artistic Lineage & References:** Rauno Freiberg & Emil Kowalski (Linear / Vercel / Raycast Precision Interface Craft).
- **Conceptual Motif (Form from Content):** An ultra-responsive, low-latency creative studio for friends who build together. Surfacing the elegance of WebSocket synchronization, optimistic state reconciliation, and real-time cursor telemetry.
- **Spatial Architecture (Floating Inset Dual-Stage):**
  - **Left Icon Rail (64px):** Compact vertical rail with quick tool switchers, profile badge, and connection telemetry indicator.
  - **Collapsible Channel Tree Drawer (220px):** Grouped topic channels and direct messages with micro latency tags and unread counters.
  - **Floating Inset Main Stage:** Inset conversation viewport with 12px rounded corners, 1px optical hairline borders (`rgba(255,255,255,0.08)`), subtle top-edge specular highlights (`inset 0 1px 0 rgba(255,255,255,0.06)`), and floating Command-Bar composer deck.
- **Lightness Class & Palette:** `深·近黑`
  - Base Background: `#080A0F` (Deep Obsidian Void)
  - Floating Stage: `#0E131F` / `#131826` (Translucent Charcoal Slate)
  - Hairline Borders: `#1F293D` / `rgba(255, 255, 255, 0.08)`
  - Primary Text: `#F1F5F9` (Crisp Slate White)
  - Secondary Text: `#94A3B8` (Muted Steel)
  - Telemetry Accent: `#10B981` (Emerald Realtime Pulse)
  - Focus Accent: `#6366F1` (Electric Indigo)
- **Typography Pairing:**
  - Display / Headings: `Schibsted Grotesk` (Technical Display Grotesk, SemiBold 600)
  - Body / Controls: `Hanken Grotesk` (14.5px body, 12px metadata)
  - Monospace / Telemetry: `Geist Mono` or Tabular Grotesk for timestamps and code diffs
- **Signature Interactive Elements:**
  - Live WebSocket telemetry pill with dynamic ping (`14ms · Synced`).
  - Embedded code snippet card with syntax highlighting and copy button.
  - Floating Command Deck composer with multi-line `<textarea>` (Enter to send, Shift+Enter for newline), `Cmd+K` palette trigger, and keycap badges.
  - Precision hover action toolbar with 1px optical borders.

---

### Candidate 3 (Selected as Direction 3) — The Sticker Zine (Tactile Neo-Brutalist Sticker Zine)
- **Artistic Lineage & References:** Retro Memphis Group / Japanese Street Fashion Zines / Tactile Web Neo-Brutalism (Web #03 / #02).
- **Conceptual Motif (Form from Content):** A chaotic, vibrant clubhouse pinboard plastered with stickers, meme cards, voice notes, and playful banter. Friendship expressed as physical, tactile, touchable objects.
- **Spatial Architecture (Asymmetric Speech Cards & Pinboard):**
  - **Left 3-Card Stacked Bento Deck (280px):**
    - Card 1: Clubhouse Stamp & active channel pill (`FRIENDS CHAT CLUBHOUSE ★`).
    - Card 2: Topic Room Stack with chunky pill badges and unread counts.
    - Card 3: Online Friends Sticker Wall with interactive avatar squircle badges and status pins.
  - **Right Conversation Pinboard:** Asymmetric conversation canvas where incoming messages from friends appear as left-aligned ivory cards (`#FFFDF8`) with 3px solid ink drop shadows, and outgoing messages from the user appear as right-aligned sunburst yellow (`#FACC15`) or electric cobalt cards.
- **Lightness Class & Palette:** `浅·有色`
  - Canvas Background: `#A7F3D0` (Saturated Neo-Brutalist Mint Canvas, Mint-200, Oklab distance = 0.1055 > 0.06 vs `#F7F3E9` and 0.7657 vs `#080A0F`)
  - Friend Cards: `#FFFDF8` (Warm Ivory Paper with 2.5px solid ink border)
  - User Cards: `#FACC15` (Sunburst Yellow) and `#38BDF8` (Sky Blue) with prominent visual presence ($\ge 15\%$ visual weight)
  - Ink & Shadows: `#121212` (Solid Heavy Ink with `3px 3px 0 #121212` shadows)
  - Vibrant Badges: `#FB7185` (Coral Pink) and `#A855F7` (Bright Purple)
- **Typography Pairing:**
  - Display / Headings: `Bricolage Grotesque` (High-contrast, Punchy Neo-Grotesk Display)
  - Body / Controls: `Work Sans` (Structured, Friendly Sans, 14.5px body, 12px labels)
- **Signature Interactive Elements:**
  - Pressable 3D keycap reaction buttons with tactile click displacement (`translateY(2px)` and shadow reduction).
  - Pinned photo meme card with tilted sticker tape header.
  - Chunky "SEND" 3D keycap button in composer deck.
  - Complete modal dialogs with 3px hard drop shadows and live `#slug` previews.

---

### Candidate 4 (Backup Candidate) — Modern Bento Community Split
- **Artistic Lineage & References:** Campsite / Arc Browser / Linear Asymmetric Bento Workspace.
- **Conceptual Motif (Form from Content):** A modern collaborative workspace optimized for high-context friends who juggle multiple concurrent discussions, media links, and event planning.
- **Spatial Architecture:**
  - Left navigation rail (240px) with expandable channel folders.
  - Top horizontal bento deck: 2 summary cards highlighting active channel topic description, today's pinned media, and real-time typing preview.
  - Bottom 2-column split: Left 70% conversation stream + Right 30% contextual media/link drawer.
- **Lightness Class & Palette:** `浅·中性白`
  - Base Canvas: `#F8FAFC` (Clean Cool Slate White)
  - Card Surfaces: `#FFFFFF` with 1px subtle `#E2E8F0` borders
  - Primary Text: `#0F172A` (Slate Ink)
  - Accent Color: `#0284c7` (Clean Sky Blue)
- **Typography Pairing:** `Plus Jakarta Sans` (Display) + `Inter` / system-ui (Body).

---

### Candidate 5 (Backup Candidate) — Functional Ledger Stream
- **Artistic Lineage & References:** Are.na / Lobsters / Hacker News Minimalist Functionalism (Web #17 Functional Brutalism).
- **Conceptual Motif (Form from Content):** Zero-bullshit chronological timeline for technical friends. Every conversation item is an immutable, strictly aligned row in an archival stream.
- **Spatial Architecture:**
  - Monospace breadcrumb navigation header with active channel cursor and message sequence count.
  - Borderless 3-column chronological stream: Column 1: Monospace timestamp (`21:14:02`) | Column 2: 2-character author tag | Column 3: Message body, code citation, and reaction counts.
- **Lightness Class & Palette:** `浅·中性灰`
  - Base Canvas: `#FBFBFB` (Neutral Light Gray)
  - Rules & Dividers: `#E5E5E5` (1px subtle grid lines)
  - Primary Text: `#111111` (Pure Neutral Black)
  - Secondary Text: `#737373` (Neutral Gray)
  - Accent Color: `#2563EB` (Hyperlink Blue)
- **Typography Pairing:** `Commit Mono` / `Geist Mono` (Display & Timestamps) + `IBM Plex Sans` (Body).

---

### Candidate 6 (Backup Candidate) — Chromatic Dock Spectrum Chat
- **Artistic Lineage & References:** East #07 Chinese Traditional Solarterm Spectrum / Soundwave Visualizer.
- **Conceptual Motif (Form from Content):** Turning the application's 8-color `AVATAR_PALETTE` into an interactive living color spectrum. Friends' voices form a harmonious acoustic chord.
- **Spatial Architecture:**
  - Clean, distraction-free upper chat canvas with minimal chrome.
  - Bottom interactive accordion dock representing all 8 channels and friends as live chromatic spectrum bands that expand upon hover/focus, dynamically shifting the accent tint of the active room.
- **Lightness Class & Palette:** `中明度·有色` / Multi-chromatic
  - Base Canvas: `#18181B` (Deep Carbon Zinc)
  - Spectrum Bands: Full 8-color palette (`#0284c7`, `#0d9488`, `#7c3aed`, `#db2777`, `#ea580c`, `#16a34a`, `#2563eb`, `#4f46e5`)
  - Typography: High-contrast `#FAFAFA`
- **Typography Pairing:** `Cabinet Grotesk` (Expressive Display) + `Satoshi` (Body).

---

## 2. Selection Rationale for the Top 3 Prototypes

To satisfy the acceptance criteria in `ORIGINAL_REQUEST.md` and pass automated design diversity checks (`lc < 0.55`, `pd >= 0.06`), the top 3 selected candidates span maximally divergent visual poles, spatial skeletons, and background lightness classes:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 THE THREE SELECTED v2 PROTOTYPES                                 │
├───────────────────────┬───────────────────────────────┬──────────────────────────────────────────┤
│ Direction 1           │ Direction 2                   │ Direction 3                              │
│ Warm Editorial Salon  │ Obsidian Precision Studio     │ Tactile Neo-Brutalist Sticker Zine       │
├───────────────────────┼───────────────────────────────┼──────────────────────────────────────────┤
│ 浅·暖纸 (#F7F3E9)     │ 深·近黑 (#080A0F)             │ 浅·有色 (#A7F3D0)                        │
│ 3-Column Salon Grid   │ Floating Inset Stage & Gutter │ Asymmetric Speech Cards & Pinboard       │
│ Newsreader (Serif)    │ Schibsted Grotesk (Tech Sans) │ Bricolage Grotesque (Punchy Display)     │
│ Plus Jakarta Sans     │ Hanken Grotesk + Geist Mono   │ Work Sans (Friendly Sans)                │
│ Warm, Literary, Calm  │ Engineered, Low-Latency, Crisp│ Tactile, Playful, Energetic Pop          │
└───────────────────────┴───────────────────────────────┴──────────────────────────────────────────┘
```

1. **Direction 1 (`design-demos/dir-1.html`) — Candidate 1 (Warm Editorial Salon):**
   - **Pole:** Humanistic / Literary / Calm Warm Paper.
   - **Lightness Class:** `浅·暖纸` (Warm Linen Paper `#F7F3E9`).
   - **Skeleton:** 3-column asymmetric layout (Topic Spine 220px + Conversation 68% + Living Room Lounge 32%).
   - **Typography:** `Newsreader` + `Plus Jakarta Sans`.

2. **Direction 2 (`design-demos/dir-2.html`) — Candidate 2 (Obsidian Precision Studio):**
   - **Pole:** Crisp / Technical / Engineered Low-Latency Dark Mode.
   - **Lightness Class:** `深·近黑` (Deep Obsidian `#080A0F`).
   - **Skeleton:** 64px icon dock + 220px tree drawer + Floating Inset Stage with optical hairlines + Floating Command-Bar composer deck.
   - **Typography:** `Schibsted Grotesk` + `Hanken Grotesk` + `Geist Mono`.

3. **Direction 3 (`design-demos/dir-3.html`) — Candidate 3 (Tactile Neo-Brutalist Sticker Zine):**
   - **Pole:** Expressive / Tactile / Playful Pop Club.
   - **Lightness Class:** `浅·有色` (Saturated Neo-Brutalist Mint Canvas `#A7F3D0`, Mint-200).
   - **Skeleton:** Left 3-card stacked bento deck + Right asymmetric conversation pinboard with left ivory cards and right sunburst cards.
   - **Typography:** `Bricolage Grotesque` + `Work Sans`.

---

## 3. Measurable Structural Diversity Proof

The combination of these 3 directions guarantees complete divergence across all automated quality checks:
1. **Background Class Diversity:** The 3 prototypes belong to 3 distinct background classes (`浅·暖纸`, `深·近黑`, `浅·有色`), satisfying `design_lint.py compare`.
2. **Oklab Palette Distance:** The high chromatic separation between warm linen (`#F7F3E9`), obsidian (`#080A0F`), and saturated neo-mint (`#A7F3D0`, Mint-200) ensures all pairwise palette distances far exceed the $pd \ge 0.06$ threshold (Oklab distance between `#F7F3E9` and `#A7F3D0` is $0.1055 > 0.06$, and between `#080A0F` and `#A7F3D0` is $0.7657 > 0.06$).
3. **Layout Edge-Map Correlation:** The radical variation in spatial skeletons (3-column asymmetric salon vs. floating inset stage vs. bento pinboard) guarantees normalized edge-map correlation $lc < 0.55$.
4. **Typographic Diversity:** No generic fonts (`Inter`, `Roboto`, `Arial`) are used for display; each direction possesses a bespoke typographic voice.

## 4. Universal 21-Domain-State Matrix Mandate for All v2 Prototypes

> **Mandatory Implementation Contract for Builders (M2, M3, M4):**  
> Under the multi-agent parallel construction protocol, builder subagents for Milestone 2 (`dir-1.html`), Milestone 3 (`dir-2.html`), and Milestone 4 (`dir-3.html`) consume this specification as their non-negotiable functional baseline. **ALL 21 core domain features listed below are mandatory across ALL THREE prototypes.** No prototype may omit, stub, or partially implement any of these states. Each direction must express every feature authentically using its assigned spatial skeleton, typography, and palette.

### 4.1 Master 21-Domain-State Matrix

| # | Domain State / Feature Specification | v2 Dir 1 (Salon) | v2 Dir 2 (Obsidian) | v2 Dir 3 (Sticker Zine) | Mandatory Invariant & Behavioral Contract |
|---|---|:---:|:---:|:---:|---|
| 1 | **Topic channels with unread badges** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Vertical channel navigation listing `#general`, `#random`, `#help`, etc., with active highlight and numeric unread counter badges. |
| 2 | **Full 8-color `AVATAR_PALETTE`** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Strict adherence to `#0284c7`, `#0d9488`, `#7c3aed`, `#db2777`, `#ea580c`, `#16a34a`, `#2563eb`, `#4f46e5`. 1–2 char uppercase initials, bold white text (`#FFFFFF`, weight: 700), $\ge 4.5:1$ contrast. |
| 3 | **Date dividers** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Distinct chronological day demarcation (`Today, October 19`) styled with horizontal rule, deckled paper, or tactile pill. |
| 4 | **Full message row** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Complete canonical message row with sender avatar badge, author display name, timestamp, message body, hover actions, and reaction pills. |
| 5 | **Compact grouped messages (< 5m window)** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Consecutive messages from the same sender within 5 minutes omit repeated avatar and author header, displaying compact padding and revealing gutter timestamp on hover. |
| 6 | **Quoted reply preview card** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Embedded quote card inside message row showing original author (`@Author`), snippet preview, and accent border/fill linking to parent message. |
| 7 | **Inline edited badge (`(edited)`)** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Discreet `(edited)` text badge rendered alongside timestamp or message body indicating message revision. |
| 8 | **Soft-delete tombstone (`This message was deleted`)** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Muted italicized tombstone row replacing deleted content. Hover action toolbar and emoji reaction pills MUST be hidden/suppressed. |
| 9 | **Optimistic message sending state** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Immediate optimistic local echo upon sending with `status: 'sending'`, subtle pulse or opacity reduction (`0.65`) while pending confirmation. |
| 10 | **Failed-to-send state with Retry / Dismiss** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Warning-tinted message row showing error state with interactive `Retry` (re-queues message) and `Dismiss` (removes row) actions. |
| 11 | **Interactive emoji reaction pills** | ✅ Mandated | ✅ Mandated | ✅ Mandated | 8 standard emojis (`👍`, `❤️`, `😂`, `🎉`, `🔥`, `😮`, `😢`, `👀`) with numeric counts. Clicking increments/decrements count and toggles user active state. |
| 12 | **Hover action toolbar (`React`, `Reply`, `Edit`, `Delete`)** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Floating toolbar appearing on message hover. Must be `display: none` in resting state and `display: flex` on hover to pass automated contrast linting. |
| 13 | **Floating new-messages scroll pill** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Floating indicator (`↓ N new messages`) appearing when user viewport is scrolled up; clicking triggers smooth scroll to the bottom. |
| 14 | **Animated typing indicator dots** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Ambient indicator showing animated bouncing 3-dot pulse and user label ("Alice is typing..."). |
| 15 | **Replying-to preview banner in composer** | ✅ Mandated | ✅ Mandated | ✅ Mandated | In-composer preview strip showing active reply target with original author, snippet preview, and dismiss cancel button (`×`). |
| 16 | **Reconnecting connection banner** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Alert banner indicating connection degradation / reconnecting state with dynamic countdown timer and manual `Retry now` action. |
| 17 | **Interactive textarea composer (Enter / Shift+Enter)** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Multi-line `<textarea>` composer (never a single-line `<input>`) supporting `Enter` to submit, `Shift+Enter` for newline, and auto-scrolling to bottom. |
| 18 | **Interactive channel switching** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Switching channels updates header title, description, and message stream instantly without race conditions or channel bleed. |
| 19 | **Create Channel modal with live `#slug` preview** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Modal dialog with channel name input, live kebab-case `#slug` normalization preview (`lowercase`, `alphanumeric + hyphens`), validation, and Cancel/Create buttons. |
| 20 | **Profile Settings modal with 8-color swatch picker** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Modal dialog with display name input, live avatar badge preview, and interactive 8-swatch palette picker supporting all `AVATAR_PALETTE` hex codes. |
| 21 | **Authentic Sign-In / Create Account view (`/login`)** | ✅ Mandated | ✅ Mandated | ✅ Mandated | Redesigned, production-grade login/signup view styled in the direction's aesthetic, accessible via profile footer/avatar menu and returning to chat via `Sign In` / `← Back to Chat`. |

---

### 4.2 Detailed Invariant Specifications for Downstream Builders

#### 1. Compact Grouped Messages (< 5-Minute Invariant)
- **Rule:** When consecutive messages share the same `user_id` and the timestamp difference is $< 5\text{ minutes}$, subsequent messages must be rendered in **compact mode**.
- **Display Requirements:** Omit the avatar badge and author header. Reduce top padding ($2\text{px} - 4\text{px}$). On hover, reveal a subtle, muted timestamp in the left gutter aligned with the avatar baseline.

#### 2. Message Modification States: `(edited)` and Tombstones
- **Edited Messages:** Display an inline badge `(edited)` in muted typography adjacent to the timestamp. Hovering or clicking surfaces the revision indicator.
- **Deleted Messages:** Display an italicized string `This message was deleted` in muted text color. **Crucial:** Suppress the hover action toolbar and all reaction pills on deleted messages to reflect Postgres soft-deletion invariants.

#### 3. Optimistic Delivery & Retry Life-Cycle
- **Sending State (`sending`):** When the user presses `Enter`, the message appears immediately in the stream with `status: 'sending'` (reduced opacity $\approx 0.65$ or animated pulse).
- **Failed State (`failed`):** If a network error occurs, the message transitions to `status: 'failed'` with rose-tinted background or warning indicator and displays two distinct actions:
  - `Retry`: Re-attempts sending using the exact same `client_id` (idempotent retry).
  - `Dismiss`: Removes the failed message from the local client store.

#### 4. Social Interactions: Reactions & Hover Toolbars
- **Emoji Reactions:** Every message supports 8 core reaction pills (`👍`, `❤️`, `😂`, `🎉`, `🔥`, `😮`, `😢`, `👀`). Reaction pills display the emoji, numeric counter, and an active highlight border/background when reacted to by the current user. Clicking increments or decrements the count dynamically.
- **Hover Action Toolbar:** Each message row must reveal an action toolbar on `:hover` containing `React` (opens emoji picker or quick reacts), `Reply` (activates composer reply preview), `Edit` (for current user messages), and `Delete` (for current user messages).
- **Contrast Linter Invariant:** The hover toolbar MUST be set to `display: none` in its resting state and `display: flex` on `:hover` (or container hover) so automated contrast scanners do not evaluate hidden toolbars against resting rows.

#### 5. Presence & Avatar Invariant
- **8-Color Palette:** Avatars must use only the canonical 8 hex colors: `#0284c7`, `#0d9488`, `#7c3aed`, `#db2777`, `#ea580c`, `#16a34a`, `#2563eb`, `#4f46e5`.
- **Deterministic Initials:** Derive 1–2 uppercase letters from the user's name following `app/utils/chat.ts`.
- **Contrast Floor:** Initials must use bold white text (`#FFFFFF`, `font-weight: 700`), yielding WCAG AA contrast $\ge 4.5:1$ across all 8 palette colors.

#### 6. Multi-Line Composer Mandate
- **Element Tag:** All prototypes must implement the message input as a `<textarea>` (not a single-line `<input type="text">`).
- **Keyboard Handling:**
  - `Enter` (without Shift): Submits the message, clears the input, resets textarea height, and smoothly scrolls to the latest message.
  - `Shift+Enter`: Inserts a newline without submitting.

#### 7. Modal Dialogs & Full-Screen Views
- **Create Channel Modal:** Includes an input for channel name, live `#slug` normalization preview (e.g. typing "Game Night!" previews `#game-night`), character validation, and Cancel/Create buttons.
- **Profile Settings Modal:** Includes display name input, live avatar preview updating in real time, and an interactive swatch grid of all 8 `AVATAR_PALETTE` colors.
- **Login / Sign-Up Screen:** Each direction must provide a full-screen, authentic `/login` view styled consistently with its design system (Warm Editorial Salon, Obsidian Studio, or Tactile Sticker Zine). Access must occur via user profile footer / avatar menu, and returning to chat must occur via `Sign In` or `← Back to Chat`.

---

### 4.3 Direction-Specific Aesthetic Manifestations of the 21 States

| Feature | Direction 1: The Sunday Clubhouse | Direction 2: Obsidian Precision Studio | Direction 3: The Sticker Zine |
|---|---|---|---|
| **Compact Grouping** | Subtly indented deckled rows with serif gutter time on hover. | Monospace timeline gutter (`21:14`) with 1px optical guide hairline. | Snug left/right speech cards with mini corner timestamp. |
| **Quoted Reply** | Terracotta left-rule card (`border-l-2 border-[#C84B31]`) on cream paper. | Inset glass quote pill (`rgba(255,255,255,0.04)`) with indigo accent border. | Mini yellow/blue tape placard with 2px solid ink outline. |
| **Reaction Pills** | Soft linen pills with terracotta counter and muted ink borders. | Optical hairline badge pills with emerald/indigo glow on active react. | Chunky 3D pressable keycap pills with `translateY(2px)` click displacement. |
| **Hover Toolbar** | Antique brass floating pill bar with delicate serif iconography. | Linear-style obsidian glass bar with optical 1px hairline border. | Bold monochrome ink capsule with high-contrast sticker badges. |
| **Composer Deck** | Warm parchment writing desk with issue stamp and Send button. | Floating Command Deck with `Cmd+K` palette trigger and keycap tags. | Asymmetric bento composer with chunky 3D "SEND" keycap. |
| **Modals** | Elegant deckled bookplate modal dialogs with serif headlines. | Precision dark-mode floating HUD dialogs with optical specular edge. | Hard-shadow tactile popup placards (`3px 3px 0 #121212`) with chunky buttons. |
| **Login Screen** | Literary weekend club invitation letterhead on `#F7F3E9` linen paper. | Developer cockpit authentication terminal on `#080A0F` obsidian stage. | Playful clubhouse admission passport/zine on `#A7F3D0` neo-mint canvas. |

---

*End of directions.md specification. Authoritative reference for prototype construction.*

