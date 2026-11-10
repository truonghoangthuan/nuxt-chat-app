# My Team — Nuxt 4 Real-Time Encrypted Chat & Workspace

**My Team** is a modern, resilient, end-to-end encrypted real-time chat workspace built with **Nuxt 4**, **Vue 3**, **Supabase**, **Tailwind CSS v4**, **Three.js**, and **Tauri v2**. Designed for friends and teams with 1-on-1 direct messages, group chats, encrypted media & meme libraries, synchronized YouTube music rooms, interactive multiplayer activities (Caro, Chess, Street Tea Stall, 3D Incense Courtyard), and a native **Windows Desktop App (`.exe` / `.msi`)**.

---

## Download for Windows (`Releases`)

Pre-built Windows 10/11 desktop installers (with the Ubuntu Circle of Friends desktop icon and native Windows System Tray support) are published directly to the [**GitHub Releases**](../../releases) tab:

1. Open the [**Releases**](../../releases) tab on GitHub and select the latest release.
2. Under **Assets**, download either:
   - **`My.Team_<version>_x64-setup.exe`** (NSIS Windows installer — recommended)
   - **`My.Team_<version>_x64_en-US.msi`** (MSI Windows package)
3. Launch **My Team** and enter your live workspace server URL (e.g., your deployed Nuxt 4 URL or `http://localhost:3000`).
4. Closing the window (`X`) minimizes **My Team** to the **Windows System Tray** so background music playback and real-time notifications stay active. Right-click the tray icon for **Open My Team**, **Hide to Tray**, or **Quit My Team**.

---

## Features

### End-to-End Encryption (E2EE)
- **Client-Side AES-GCM-256**: All message bodies, image attachments, and shared room memes are encrypted in the browser before transmission (`e2ee:v1:<iv>:<ciphertext>`).
- **PBKDF2 Key Derivation**: Master key derived from a shared workspace secret phrase (600,000 iterations of `PBKDF2-HMAC-SHA256`) and validated against `public.e2ee_config.verifier`.
- **Authenticated Additional Data (AAD)**: Ciphertext is cryptographically bound to the conversation UUID to prevent cross-channel ciphertext splicing.
- **Database Trigger Enforcement**: Postgres trigger `enforce_message_e2ee_envelope()` rejects any plaintext message inserts or updates.
- **Transparent Non-Blocking Hydration**: Workspace hydration executes unconditionally on mount while derived keys live strictly in tab `sessionStorage` and memory; undecryptable messages remain isolated to individual bubbles (`🔒 Unable to decrypt this message`).

### Direct Messages & Group Conversations
- **Direct Messages**: 1-on-1 private messaging between mutual friends.
- **Group Chats**: Multi-member conversations with ownership roles (`owner`, `member`), automatic ownership succession on owner departure, group info modal, member management, and leave controls.
- **Persistent Unread Tracking & Tab Badge**: Per-user `conversation_reads` tracking unread message badges across sessions, plus live unread count in the browser tab title (`(3) Tin nhắn mới — My Team`) and background tab unread tracking.
- **Conversation List Filters**: Filter the sidebar by **All**, **Unread**, **Direct**, or **Groups**, combined with name/email search and sorted by newest activity.

### Contacts, Profiles & Privacy
- **Mutual Friendships**: Bidirectional friend connections and removals executed via atomic Postgres `SECURITY DEFINER` RPCs (`add_mutual_friend`, `remove_mutual_friend`).
- **Scoped Profile Visibility**: Row-Level Security (RLS) restricts profile reads to self, mutual friends, and shared conversation co-members, paired with a privacy-safe email lookup (`lookup_profile_by_email`).
- **Unified Profile Settings & Payment QR**: Interactive profile modal (`ProfileSettingsModal.vue`, `UserProfileModal.vue`) featuring live avatar preview, custom avatar & payment **Bank QR** uploads (with automatic Data-URL fallback), verified email badge, and one-click UUID copy.

### Real-Time Messaging & Ephemeral Signals
- **Supabase Realtime**: Instant message delivery, edits, deletions, and reaction updates via `postgres_changes`.
- **Global Presence & Seen-By Receipts**: `presence:global` channel tracking online contacts with multi-tab deduplication, plus per-message seen avatar indicators (`computeSeenByMessageId`).
- **Typing Indicators & Buzz Alerts**: Real-time per-conversation typing broadcasts with idle expiry and Yahoo-style Buzz alerts.
- **Optimistic UI**: Outgoing messages render immediately with a client UUID (`client_id`) for idempotent deduplication and one-click retry/dismiss on network failure.
- **Long-Message Draft Protection**: Live character counter near the 4,000 UTF-16 unit limit that preserves oversized drafts in memory until shortened.

### Rich Interactions, Memes & Search
- **Emoji Reactions & Reactor Breakdown**: Live reaction pills with optimistic toggling and hover/focus popovers showing who reacted.
- **Pinned Messages, Replies & Mentions**: Pin important messages via `toggle_pin_message`, quote-reply with click-to-scroll navigation, and highlight `@mentions`.
- **Message Editing & Soft Deletes**: Inline edit tracking (`(edited)` badge) and soft-deletion tombstones (`deleted_at`).
- **Conversation Meme Library**: Shared per-conversation encrypted meme/sticker library in the right utility panel (`RightUtilityPanel.vue`) supporting image and animated GIF uploads, one-click sending, and safe metadata removal that preserves historical chat bubbles.
- **Celebration Confetti Dictionary**: Per-conversation trigger words (`ConfettiDictionaryModal.vue`, `ConfettiOverlay.vue`) that launch zero-dependency 2D Canvas confetti and emoji bursts when matched.
- **In-Memory Decrypted Search**: Real-time client-side search (`MessageSearchBar.vue`) over loaded decrypted history with `<mark>` highlighting, filterable by **All types**, **Images**, **Links**, **Pinned only**, sender, and local date range without sending search queries over the network.

### Shared YouTube Music Room & Media Session
- **Same-Origin Proxied Audio & Video**: Searches, Vietnam trending feeds, thumbnails, and byte-range media streams route through Nitro server endpoints (`/api/youtube/search`, `/api/youtube/trending`, `/api/youtube/thumbnail`, `/api/youtube/stream`) powered by KOQC Piped—bypassing corporate firewall blocks on third-party media domains.
- **Synchronized Playback & Picture-in-Picture (PiP)**: Real-time room broadcast sync (`useMusicPlayer.ts`) with a 2-second drift deadband, late-joiner elapsed timestamp handshake, one-click **Tune In** autoplay unblocking, and expandable **Video PiP** (`YouTubeVideoPip.vue`).
- **Queue Management, Shuffle & History Search**: Drag-and-drop queue reordering, one-click **Shuffle** for upcoming tracks, in-memory **History** search by song title/artist/friend, and encrypted chat activity pills for play/pause/skip/stop milestones.
- **OS Media Session API**: Syncs track metadata, artwork, scrubber position, and lock-screen / notification-shade transport controls (`play`, `pause`, `nexttrack`, `seekto`) for continuous background playback on mobile PWAs and desktop.

### Stealth Boss Key Mode & Multi-UI Themes
- **Stealth Boss Key (`StealthOverlay.vue`)**: Instant fullscreen screen cover (`z-[9999]`) triggered by a customizable keyboard shortcut (`useStealthMode.ts`). Supports custom cover images or decoy screens, customizable decoy browser tab titles, strict notification chime muting, and uninterrupted background music playback.
- **Multi-UI Personality Themes (`useTheme.ts`)**: Switch independently between UI personalities (**Default Cupertino**, **VSCode Studio**, **Yahoo! Messenger**) and color modes (**Dark** / **Light**).

### Encrypted Attachments & Lightbox
- **Encrypted Media Grid**: Multi-photo encrypted uploads stored in private Supabase Storage (`message-attachments`) with bounded LRU `blob:` URL caching and automatic storage cleanup on partial failure.
- **Arrange Before Sending**: Keyboard-accessible **Move earlier / Move later** controls on queued photo previews before sending.
- **Zoomable Lightbox Viewer (`ImageViewerModal.vue`)**: Full-screen decrypted image viewer with 100%–400% zoom, pan, keyboard shortcuts (`+`/`=`, `-`, `0`, Left/Right arrows, `Escape`), and custom conversation wallpapers (`chat-backgrounds`).

### Multiplayer Games & Interactive Activities
- **Multiplayer Caro (`/caro`)**: Invite-link 15×15 Gomoku rooms with server-authoritative turn, win, and draw validation via Supabase RPCs and Realtime updates.
- **Online Chess (`/chess`)**: Two-player invite-link chess rooms validated server-side via `chess.js` and row-locked compare-and-set PostgreSQL RPCs (`/api/chess/move`), with automatic stalemate, threefold repetition, insufficient material, and 50-move draw adjudication.
- **Street Tea Stall (`/street`)**: Private group tea-stall hangout activity.
- **3D Incense Courtyard (`/incense`)**: Member-only interactive Three.js 3D courtyard activity.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | [Nuxt 4](https://nuxt.com/) (Vue 3 Composition API, `<script setup lang="ts">`) |
| **Desktop Shell** | [Tauri v2](https://v2.tauri.app/) (Rust, Windows Edge WebView2, System Tray, NSIS `.exe` & WiX `.msi`) |
| **Backend & Realtime** | [Supabase](https://supabase.com/) (`@nuxtjs/supabase`) — PostgreSQL, Auth, Realtime, Storage |
| **Cryptography** | Web Crypto API (`AES-GCM-256`, `PBKDF2-HMAC-SHA256`) |
| **Styling & 3D** | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`), [Three.js](https://threejs.org/), Lucide Icons (`@lucide/vue`) |
| **Testing** | [Vitest](https://vitest.dev/), `@vue/test-utils`, `happy-dom` |

---

## Prerequisites & Supabase Setup

Use a Node.js release supported by Nuxt 4.6.3: **22.22.3+ on Node 22**, **24.15.0+ on Node 24**, or **26+**.

### 1. Database Schema & RLS
1. Create a project at [supabase.com](https://supabase.com) and open the **SQL Editor**.
2. Paste and execute [`supabase/schema.sql`](./supabase/schema.sql). This provisions all tables (`profiles`, `contacts`, `conversations`, `conversation_members`, `messages`, `message_reactions`, `conversation_reads`, `e2ee_config`, `caro_games`, `caro_moves`, `chess_games`), RLS policies, `SECURITY DEFINER` RPCs, storage buckets (`message-attachments`, `chat-backgrounds`, `profile-media`), `supabase_realtime` publications, and the `enforce_message_e2ee_envelope()` trigger.

### 2. Generate E2EE Master Key
Generate the PBKDF2 salt, verifier, and SQL seed for your workspace secret phrase:

```bash
node scripts/generate-e2ee-config.mjs "<your-secret-passphrase-at-least-12-chars>"
```

Execute the printed `INSERT INTO public.e2ee_config ...` SQL statement in the Supabase SQL Editor.

### 3. Environment Variables
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

```dotenv
NUXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=<your-anon-public-key>
# Required for online Chess; server-side only, never prefix with NUXT_PUBLIC_
NUXT_SUPABASE_SECRET_KEY=<your-secret-key-or-legacy-service-role-key>
```

---

## Getting Started & Available Scripts

```bash
npm install
npm run dev
```

The web workspace runs at `http://localhost:3000`.

| Command | Description |
| --- | --- |
| `npm run dev` | Start Nuxt 4 development server at `http://localhost:3000` |
| `npm test` | Run all unit and component test suites (`vitest run`) |
| `npm run build` | Build production Nuxt bundle |
| `npm run preview` | Preview production build locally |
| `npm run tauri:prepare` | Rasterize `src-tauri/icons/ubuntu-logo.svg` into PWA/Tauri PNGs + Windows `.ico` and build the Tauri frontend bootstrapper |
| `npm run tauri:dev` | Launch Tauri v2 Windows desktop app connected to local Nuxt dev server |
| `npm run tauri:build` | Build release Windows `.exe` (NSIS) and `.msi` (WiX) installers in `src-tauri/target/release/bundle/` |
| `node scripts/generate-e2ee-config.mjs "<phrase>"` | Derive PBKDF2 salt/verifier and output SQL seed for workspace E2EE |

---

## Project Structure

```text
├── .github/workflows/
│   └── windows-desktop.yml         # CI workflow building & publishing Windows .exe/.msi to GitHub Releases
├── app/
│   ├── components/                 # ChatSidebar, MessageViewport, MessageComposer, RightUtilityPanel,
│   │                               # MusicPlayerBar, MusicQueuePanel, YouTubeSearchModal, YouTubeVideoPip,
│   │                               # StealthOverlay, ChessBoard, ConfettiOverlay, ProfileSettingsModal, etc.
│   ├── composables/                # useChatRoom, useMessagesState, useE2ee, useMusicPlayer, useStealthMode,
│   │                               # useCaroGame, useChessGame, useTheme, usePwaInstall, useNotification, etc.
│   ├── middleware/
│   │   └── auth.global.ts          # Route guard redirecting unauthenticated users to /login
│   ├── pages/
│   │   ├── index.vue               # Main chat workspace shell
│   │   ├── caro.vue                # Invite-link multiplayer Caro board
│   │   ├── chess.vue               # Invite-link online Chess board
│   │   ├── street.vue              # Private group tea-stall hangout activity
│   │   ├── incense.vue             # Member-only 3D courtyard activity
│   │   ├── login.vue               # Sign-in / registration screen
│   │   └── confirm.vue             # Supabase email confirmation callback handler
│   ├── types/                      # TypeScript domain interfaces (chat.ts, chess.ts, notification.ts)
│   └── utils/                      # Pure helpers (crypto.ts, chat.ts, youtube.ts, caro.ts, version.ts, etc.)
├── public/
│   ├── manifest.webmanifest        # Standalone PWA manifest
│   └── sw.js                       # Service worker for Action Center notifications & PWA installability
├── scripts/
│   ├── generate-e2ee-config.mjs    # CLI helper generating public.e2ee_config SQL insert
│   ├── generate-pwa-icons.mjs      # Zero-dep SVG-to-PNG & Windows .ico generator from ubuntu-logo.svg
│   └── prepare-tauri-frontend.mjs  # Live-server WebView2 bootstrapper generator
├── server/
│   ├── api/chess/move.post.ts      # Authenticated server-authoritative chess move endpoint
│   ├── api/youtube/                # Same-origin KOQC Piped search, trending, thumbnail, and stream proxies
│   └── utils/chessMove.ts          # Chess rules and persisted SAN move-history validation
├── src-tauri/                      # Tauri v2 Windows desktop crate
│   ├── icons/                      # ubuntu-logo.svg, 32x32.png, 128x128.png, 128x128@2x.png, icon.ico
│   ├── src/lib.rs                  # Windows system tray menu & close-to-tray handler
│   └── tauri.conf.json             # App metadata, NSIS/MSI bundle & window configuration
├── supabase/
│   └── schema.sql                  # Complete PostgreSQL schema, RLS policies, triggers & realtime setup
└── tests/                          # Vitest unit, component, composable, server & integration test suites
```
