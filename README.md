# Nuxt 4 Real-Time Friends Chat App

A modern, resilient, end-to-end encrypted real-time web chat application built with **Nuxt 4**, **Supabase**, **Tailwind CSS v4**, and **shadcn-nuxt**. Designed for friends and small teams with direct messages, group chats, encrypted media attachments, and a Slack/Discord-inspired precision interface.

---

## Features

### End-to-End Encryption (E2EE)
- **Client-Side AES-GCM-256**: All message bodies and image attachments are encrypted in the browser before transmission.
- **PBKDF2 Key Derivation**: Master key derived from a shared workspace secret phrase (600,000 iterations of PBKDF2-HMAC-SHA256).
- **Authenticated Additional Data (AAD)**: Ciphertext bound to conversation UUIDs to prevent cross-channel tampering.
- **Database Trigger Enforcement**: Postgres trigger `enforce_message_e2ee_envelope()` rejects any non-encrypted message inserts (`e2ee:v1:...`).
- **Zero-Exposure Passphrase Gate**: Workspace UI remains unmounted (`E2eeGate.vue`) until passphrase derivation succeeds; derived keys persist only in session storage and volatile memory.

### Direct Messages & Group Conversations
- **Direct Messages**: 1-on-1 private messaging between mutual contacts.
- **Group Chats**: Multi-member conversations with ownership roles (`owner`, `member`), group info modal, member management, and leave controls.
- **Persistent Unread Tracking**: Per-user `conversation_reads` tracking unread message badges across sessions.

### Contacts & Privacy
- **Mutual Friendships**: Bidirectional friend requests and removals executed through atomic Postgres security-definer RPCs (`add_mutual_friend`, `remove_mutual_friend`).
- **Scoped Profile Visibility**: Row-Level Security (RLS) ensures user profiles are visible only to self, mutual friends, and co-members of shared conversations.
- **Email Lookup**: Privacy-safe email search modal (`lookup_profile_by_email`).

### Real-Time Messaging & Ephemeral Signals
- **Supabase Realtime**: Instant message broadcasting and reaction updates via `postgres_changes`.
- **Global Presence**: `presence:global` channel tracking online contacts with multi-tab deduplication.
- **Typing Indicators**: Real-time per-conversation typing broadcasts with automatic idle expiry.
- **Optimistic UI**: Messages render immediately with UUID `client_id` for idempotent deduplication and retry/dismiss handling on failure.

### Multiplayer Caro
- **Invite-link rooms**: Create a private two-player 15×15 game and invite someone with a room link.
- **Server-authoritative turns**: Supabase validates turns, occupied cells, wins, and draws; seated players receive room updates through Realtime.

### Rich Interactions & Search
- **Emoji Reactions**: Live reaction counter pills with optimistic local toggling.
- **Pinned Messages**: Pin important messages per conversation via atomic `toggle_pin_message` RPC.
- **Replies & Mentions**: Quoted message previews with click-to-scroll navigation and `@mention` highlighting.
- **Message Editing & Soft Deletes**: Inline edit tracking (`(edited)` badge) and soft-deletion tombstones (`deleted_at`).
- **In-Memory Decrypted Search**: Real-time client-side keyword search over decrypted chat history with match highlighting (`<mark>`) without leaking plaintext over the network. Use **All senders** to narrow keyword matches to a friend; Enter / Shift+Enter cycles matches and Escape closes search. Only loaded messages (including decrypted attachment captions) are searched; load older history to extend the search. Sender filters stay in memory and reset when switching conversations or reopening search.

### Encrypted Attachments & Customization
- **Encrypted Media Grid**: Upload and view encrypted images stored in a private Supabase storage bucket (`message-attachments`) with automatic client-side blob caching.
- **Lightbox Viewer**: Full-screen image preview modal with zoom and pan support (`ImageViewerModal.vue`).
- **Custom Backgrounds**: Conversation-specific wallpaper customization stored in `chat-backgrounds` bucket.
- **Service Worker Desktop Notifications**: Native Action Center notifications via `public/sw.js` with audio chimes.
- **Adaptive Dark / Light Theme**: Obsidian Precision Studio dark theme paired with high-contrast light mode tokens.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | [Nuxt 4](https://nuxt.com/) (Vue 3 Composition API, `<script setup lang="ts">`) |
| **Backend & Auth** | [Supabase](https://supabase.com/) (`@nuxtjs/supabase`) — PostgreSQL 15+, Auth, Realtime, Storage |
| **Cryptography** | Web Crypto API (`AES-GCM-256`, `PBKDF2-HMAC-SHA256`) |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`), [shadcn-nuxt](https://shadcn-vue.com/), Lucide Icons |
| **Testing** | [Vitest](https://vitest.dev/), `@vue/test-utils`, `happy-dom` |

---

## Prerequisites & Supabase Setup

Use a Node.js release supported by Nuxt 4.6.3: **22.22.3+ on Node 22**, **24.15.0+ on Node 24**, or **26+**. Install the locked dependency graph with `npm ci`. Older Node 20 releases are not supported by this Nuxt version.

### 1. Database Schema & RLS

1. Create a project at [supabase.com](https://supabase.com).
2. Navigate to the **SQL Editor** in your Supabase dashboard.
3. Paste and run the entire contents of [`supabase/schema.sql`](./supabase/schema.sql). This configures:
   - Tables: `profiles`, `contacts`, `conversations`, `conversation_members`, `messages`, `message_reactions`, `conversation_reads`, `e2ee_config`, `caro_games`, `caro_moves`, `chess_games`.
   - Security: Row-Level Security (RLS) policies and security-definer helper functions.
   - Storage Buckets: Private `message-attachments` and public `chat-backgrounds` with RLS policies.
   - Realtime Publication: `supabase_realtime` publication for all relevant tables.
   - Envelopes: Database trigger enforcing `e2ee:v1:` ciphertexts on `messages`.

For existing projects that already applied the schema, run only the additive **Caro** and/or **Chess** sections at the end of `supabase/schema.sql` as needed, in the SQL Editor as the database owner. Apply the Caro section from `-- Caro: apply this entire section` through `commit;`; apply Chess from `-- BEGIN CHESS` through `-- END CHESS`, including its transaction. The earlier schema setup is not fully rerunnable. New projects running the full schema file already include both games.

### 2. Generate E2EE Master Key

Generate the PBKDF2 salt, verifier, and SQL seed for your workspace secret phrase:

```bash
node scripts/generate-e2ee-config.mjs "<your-secret-passphrase-at-least-12-chars>"
```

Copy the generated `INSERT INTO public.e2ee_config ...` query and execute it in your Supabase SQL Editor.

### 3. Authentication Settings

In **Authentication → Providers → Email** in your Supabase dashboard:
- For rapid local development: Disable **Confirm email** so accounts can log in immediately upon registration.
- For production: Keep **Confirm email** enabled; confirmation links automatically route through `/confirm`.

---

## Environment Variables

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

Populate with your Supabase project credentials. These names are read by `@nuxtjs/supabase`:

```dotenv
NUXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NUXT_PUBLIC_SUPABASE_KEY=<your-anon-public-key>
# Required only for online Chess; server-side only, never prefix with NUXT_PUBLIC_
NUXT_SUPABASE_SECRET_KEY=<your-secret-key-or-legacy-service-role-key>
```

---

## Getting Started

Install dependencies:

```bash
npm install
```

Start local development server:

```bash
npm run dev
```

The application runs at `http://localhost:3000`.

---

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Launch Nuxt 4 development server on `http://localhost:3000` |
| `npm test` | Run unit and component test suites with Vitest (`vitest run`) |
| `npm run build` | Build optimized production bundle |
| `npm run preview` | Preview production build locally |
| `npm run generate` | Pre-render static pages |
| `node scripts/generate-e2ee-config.mjs "<phrase>"` | Derive salt/verifier and output SQL seed for workspace E2EE |

---

## Project Structure

```text
├── app/
│   ├── assets/
│   │   └── css/main.css            # Tailwind CSS v4 design tokens and theme variables
│   ├── components/
│   │   ├── ui/                     # shadcn-nuxt accessible UI primitives (dialog, button, etc.)
│   │   ├── ChessBoard.vue          # Keyboard-accessible chessboard and promotion picker
│   │   ├── ChatSidebar.vue         # Conversations list, friends roster, unread counters, user status
│   │   ├── ConnectionBanner.vue    # Network reconnection state banner with retry action
│   │   ├── ContactsModal.vue       # Friends address book, email lookup, and mutual connection actions
│   │   ├── CreateGroupModal.vue    # Group creation dialog with multi-contact picker
│   │   ├── GroupInfoModal.vue      # Group settings, member roster, role management, leave group
│   │   ├── E2eeGate.vue            # Passphrase unlock gate before mounting workspace
│   │   ├── MessageComposer.vue     # Textarea composer with draft persistence, attachments, and shortcuts
│   │   ├── MessageImageGrid.vue    # Encrypted multi-image attachment grid
│   │   ├── MessageSearchBar.vue    # In-memory keyword search bar over decrypted history
│   │   ├── MessageViewport.vue     # Upward infinite scroll, scroll anchors, reactions, pins
│   │   ├── ImageViewerModal.vue    # Full-screen image lightbox modal
│   │   └── UserProfileModal.vue    # Interactive user profile modal with avatar display
│   ├── composables/
│   │   ├── useChatRoom.ts          # Supabase realtime and query orchestrator across channels
│   │   ├── useCaroGame.ts          # Authoritative Caro room RPCs and realtime state
│   │   ├── useChessGame.ts         # Invite-room, realtime state and move submission
│   │   ├── useE2ee.ts              # Session key cache, phrase derivation, verifier validation
│   │   ├── useMessagesState.ts     # Pure message store: optimistic UI, dedup, cursors, ordering
│   │   ├── useNotification.ts      # Service worker notifications and toast alerts
│   │   ├── usePresenceState.ts     # Multi-tab presence deduplication
│   │   ├── useTypingState.ts       # Realtime typing activity tracker with expiry
│   │   └── useConnectionManager.ts # Exponential backoff state machine for network reconnections
│   ├── pages/
│   │   ├── index.vue               # Main chat workspace shell
│   │   ├── caro.vue                # Invite-link multiplayer Caro board
│   │   ├── chess.vue               # Invite-link online chess board
│   │   ├── login.vue               # Sign-in and account registration view
│   │   └── confirm.vue             # Supabase email confirmation callback handler
│   ├── types/
│   │   ├── chat.ts                 # Domain interfaces (Profile, Conversation, ChatMessage, etc.)
│   │   ├── chess.ts                # Chess room and move-state types
│   │   └── notification.ts         # Notification toast and event types
│   └── utils/
│       ├── caro.ts                 # Caro board and five-in-a-row helpers
│       ├── authRedirect.ts         # Validates local post-auth return paths
│       ├── crypto.ts               # WebCrypto AES-GCM-256 + PBKDF2 encryption/decryption utilities
│       ├── chat.ts                 # Pure helpers (initials, avatar palette, date formatters)
│       └── sound.ts                # Audio chime generator
├── public/
│   └── sw.js                       # Service worker for background desktop notifications
├── server/
│   ├── api/chess/move.post.ts      # Authenticated server-authoritative move endpoint
│   └── utils/chessMove.ts          # Chess rules and persisted move-history validation
├── scripts/
│   └── generate-e2ee-config.mjs    # CLI helper generating public.e2ee_config SQL insert
├── supabase/
│   └── schema.sql                  # Complete database schema, RLS policies, triggers, and realtime setup
└── tests/
    ├── components/                 # Component integration tests
    ├── composables/                # State factory and composable unit tests
    ├── server/                     # Server route and chess rules tests
    ├── integration/                # Isolated PostgreSQL/RLS integration checks
    └── utils/                      # Pure helper unit tests
```

---

## Security & Architectural Guarantees

1. **Zero Plaintext on Wire/Disk**: All message text and media payloads are encrypted client-side using `AES-GCM-256`. Supabase Postgres stores only ciphertext envelopes (`e2ee:v1:<iv>:<ciphertext>`).
2. **Deterministic Message Ordering**: Messages sorted by `(created_at ASC, id ASC)`. History pagination uses composite cursors (`created_at.lt, id.lt`) to prevent message skipping or duplication.
3. **Idempotent Delivery**: Client-generated UUIDs (`client_id`) protect against duplicate sends during network retries.
4. **Relational Disambiguation**: PostgREST joins specify explicit foreign key constraints (`author:profiles!messages_user_id_fkey(...)`) to prevent HTTP 300 relationship ambiguity.
5. **In-Memory Search**: Search runs strictly client-side on decrypted messages in local memory; no search terms or decrypted bodies are ever sent to the server.

### Online Chess

Open **Play Chess** in the sidebar. A signed-in creator plays White; another signed-in user opening the UUID invite link takes Black. Both players can reopen that URL, including after checkmate or a draw. Completed games are read-only; **New room** creates a separate game. No AI, local two-player mode, spectators or clocks are included.

Before enabling Chess:

1. In the Supabase SQL Editor, apply the complete section between `-- BEGIN CHESS` and `-- END CHESS` in [`supabase/schema.sql`](supabase/schema.sql), including its transaction. It is additive and can be applied independently to existing installations; do not rerun unrelated setup. New installations can run the full schema. The section creates participant-only read policies, create/join RPCs, a server-only atomic move RPC, and adds `chess_games` to the existing `supabase_realtime` publication.
2. Configure `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_KEY` as above. Set **`NUXT_SUPABASE_SECRET_KEY`** in the Nuxt server environment to this project's Supabase secret key (or legacy service-role key). Restart the server. Never place this key under `runtimeConfig.public`, in a `NUXT_PUBLIC_*` variable, browser code, or version control. Static-only hosting cannot validate Chess moves; deploy a Nitro server.
3. Sign in with two distinct accounts, create/copy/open a room link, and verify turn changes in both browsers. A missing server key fails closed with “Chess server is not configured.”

The browser submits only source/destination squares, optional promotion and expected move count. Nitro authenticates the user, reads authoritative state with the server helper, validates through `chess.js`, and commits through a row-locked compare-and-set RPC restricted to `service_role`. Stored SAN history preserves repetition detection after reopening. Draws are automatically adjudicated for stalemate, threefold repetition, insufficient material and the fifty-move rule. Chess moves are not E2EE chat messages; both participants and the server can read them.

Board controls: click/tap a piece then a marked destination, or use arrow keys and Enter/Space. Promotion offers queen, rook, bishop and knight. White stays at the bottom for both players. A connection failure disables moves; use **Reconnect**/**Retry** to fetch authoritative state.

Validation:

```bash
npm test
node tests/integration/chess-postgres.mjs
```

The PostgreSQL integration script requires Docker and a local `postgres:17-alpine` image. It creates/removes an isolated container without host ports or real credentials, checking RLS, grants, simultaneous joins/moves and completed-room reopening. Its minimal `auth.uid()` fixture tests PostgreSQL permissions/transactions, not hosted Supabase JWT verification or Realtime delivery.
