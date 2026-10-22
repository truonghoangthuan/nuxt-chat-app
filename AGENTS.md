# AGENTS.md — Nuxt 4 Real-Time Friends Chat App

Operational guide and architectural invariants for AI coding agents working in `nuxt-chat-app`.

## 1. Project Overview & Tech Stack

A lightweight, resilient Slack-style real-time chat web app for friends across public topic channels.

- **Framework:** Nuxt 4 (`app/` directory structure) & Vue 3 (`<script setup lang="ts">`, Composition API)
- **Backend / Auth / Realtime:** Supabase (`@nuxtjs/supabase`) — Email/Password Auth, Postgres with Row-Level Security (RLS), Realtime (`postgres_changes`, Broadcast, Presence)
- **Styling:** Tailwind CSS (`@nuxtjs/tailwindcss`) with class-based dark mode (`dark` class on `<html>`, persisted in `localStorage['nuxt-chat-theme']`)
- **Testing:** Vitest + `@vue/test-utils` (`happy-dom` environment)

## 2. Commands & Environment

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Nuxt development server at `http://localhost:3000` |
| `npm test` | Run all unit and component test suites once (`vitest run`) |
| `npm run build` | Build application for production |
| `npm run preview` | Preview production build locally |
| `node scripts/generate-e2ee-config.mjs "<phrase>"` | Generate PBKDF2 salt, verifier, and SQL seed for E2EE master key setup |

- **Environment Variables:** Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_KEY`.
- **Database Schema:** `supabase/schema.sql` defines `public.profiles`, `public.channels`, `public.messages`, `public.e2ee_config`, the `on_auth_user_created` profile-creation trigger, the `enforce_message_e2ee_envelope` trigger, RLS policies, the composite cursor index `messages_channel_cursor_idx`, and the `supabase_realtime` publication.

## 3. Architecture & Directory Layout

The codebase separates **Supabase/Realtime I/O orchestration** from **pure, testable state factories** and **presentational Vue components**:

```text
├── app/
│   ├── components/
│   │   ├── ChatSidebar.vue         # Channel list, unread badges, online friends, theme & logout controls
│   │   ├── ConnectionBanner.vue    # Reconnecting / disconnected banner with countdown & manual retry
│   │   ├── ContactsModal.vue       # Contacts address book & email lookup modal
│   │   ├── CreateGroupModal.vue    # Group creation modal with multi-select contacts
│   │   ├── GroupInfoModal.vue      # Group info, member list, add member & leave modal
│   │   ├── E2eeGate.vue            # Passphrase unlock form & unconfigured/loading gate
│   │   ├── MessageComposer.vue     # Textarea composer (Enter to send, Shift+Enter newline, typing hook)
│   │   ├── MessageViewport.vue     # Upward infinite scroll, scroll-lock preservation, new-message pill, E2EE badges
│   │   └── UserAvatar.vue          # Deterministic color badge + 1-2 character initials
│   ├── composables/
│   │   ├── useChatRoom.ts          # Central orchestrator wiring Supabase queries & 3 Realtime channels
│   │   ├── useE2ee.ts              # Session storage key cache, config query, phrase derivation & validation
│   │   ├── useMessagesState.ts     # Pure store (createMessagesStore): optimistic UI, dedup, ordering, cursors
│   │   ├── useTypingState.ts       # Pure tracker (createTypingTracker): per-user typing expiry & label
│   │   ├── usePresenceState.ts     # Pure helper (deduplicatePresenceState): multi-tab presence dedup
│   │   ├── useConnectionManager.ts # State machine (createConnectionManager): exponential backoff & retry
│   │   ├── useAuthProfile.ts       # Auth actions, JWT user ID extraction, profile fetch/upsert fallback
│   │   └── useTheme.ts             # Dark/light mode toggle with SSR-safe state fallback
│   ├── middleware/
│   │   └── auth.global.ts          # Route guard redirecting unauthenticated users to /login
│   ├── pages/
│   │   ├── index.vue               # Main chat workspace shell
│   │   ├── login.vue               # Sign-in / sign-up screen
│   │   └── confirm.vue             # Supabase email confirmation callback handler
│   ├── types/
│   │   └── chat.ts                 # Domain interfaces (Profile, Channel, ChatMessage, TypingUser, E2eeConfig, statuses)
│   └── utils/
│       ├── chat.ts                 # Pure helpers (slugs, backoff math, avatar colors/initials, validation)
│       └── crypto.ts               # WebCrypto AES-GCM-256 + PBKDF2 encryption, decryption, base64url helpers
├── scripts/
│   └── generate-e2ee-config.mjs    # CLI helper generating public.e2ee_config SQL insert
├── supabase/
│   └── schema.sql                  # Idempotent SQL schema, RLS policies, seed channels, e2ee config, realtime setup
└── tests/
    ├── utils/                      # Unit tests for pure helpers (chat.test.ts, crypto.test.ts)
    ├── composables/                # Unit tests for stores & orchestrator (useMessagesState, useRealtimeStates, useChatRoom, useTheme, useE2ee)
    └── components/                 # Component tests (chatUi.test.ts)
```

## 4. Critical Domain & Realtime Invariants

Never violate these invariants when modifying auth, messaging, pagination, or composables:

1. **Auth User ID Resolution (`extractAuthUserId`):**
   - `@nuxtjs/supabase`'s `useSupabaseUser()` may return decoded JWT claims where the user's UUID resides in `.sub` rather than `.id`.
   - Always resolve the user ID via `extractAuthUserId(authUser)` (with fallback to `supabase.auth.getUser()` in `useAuthProfile.ts`) before reading or writing `profiles`, `channels`, or `messages` so Postgres RLS checks (`auth.uid() = user_id`) succeed.

2. **Optimistic UI & Idempotent Retries (`client_id`):**
   - Every outgoing message generates a UUID `client_id` on the client and enters `messagesStore` with `status: 'sending'`.
   - `retryMessage(clientId)` must reuse the existing `client_id` rather than generating a new one.
   - If Supabase returns a duplicate-key / unique-constraint error (`isDuplicateKeyError`) on insert, treat it as an idempotent success by selecting the existing row by `client_id` and calling `markMessageSent`.

3. **Channel Isolation & Race-Condition Guards:**
   - In `selectChannel(channelId)`, always check `if (activeChannelId.value !== channelId) return` after awaiting the history query so stale responses from rapid channel switching are discarded.
   - Always pass `channelId` to `messagesStore.setInitialHistory(chronological, channelId)` so pending (`sending` / `failed`) or newly arrived confirmed messages from a previous channel never bleed into the newly selected channel.
   - In `handleIncomingRealtimeMessage`, messages for non-active channels must only increment `unreadCounts[row.channel_id]` and must not be appended to `messagesStore`.

4. **Deterministic Message Ordering & Cursor Pagination:**
   - Confirmed messages (`status === 'sent'`) are deduplicated by both `id` and `client_id` and sorted by `(created_at ASC, id ASC)`. Pending messages (`sending` / `failed`) stay appended at the end.
   - History pagination (`loadOlderMessages`) fetches `PAGE_SIZE = 40` rows using composite cursor comparison `created_at.lt."<ts>",and(created_at.eq."<ts>",id.lt."<id>")` ordered by `created_at DESC, id DESC`, reverses the page, and prepends via `prependHistoryPage`.

5. **Vitest / SSR State Fallback:**
   - Composables that use Nuxt's `useState` (`useAuthProfile.ts`, `useTheme.ts`) must guard `typeof useState !== 'undefined'` and fall back to a module-scoped `ref` so unit tests run directly in Vitest without requiring the full Nuxt runtime.

6. **End-to-End Encryption (E2EE) Invariants & Key Management:**
   - All messages are encrypted client-side using AES-GCM-256 (`e2ee:v1:<iv-base64url>:<ciphertext-base64url>`) before insertion or update. The channel ID is bound as Authenticated Additional Data (AAD) to prevent cross-channel ciphertext splicing.
   - Postgres trigger `enforce_message_e2ee_envelope()` rejects plaintext inserts or updates (`new.content not like 'e2ee:v1:%'`).
   - The workspace key is derived from a shared secret phrase using PBKDF2-HMAC-SHA256 (600,000 iterations) and validated against `public.e2ee_config.verifier`. The derived key is stored only in tab `sessionStorage` (`nuxt-chat-e2ee-key`) and memory, never persisted to disk or sent to the server.
   - **Initial Seed & Reset Runbook:** Generate the `public.e2ee_config` SQL seed via:
     ```bash
     node scripts/generate-e2ee-config.mjs "<secret-phrase>"
     ```
     Execute the resulting SQL query in the Supabase SQL Editor. If the secret phrase is rotated or reset, re-run this script and update `public.e2ee_config`. Existing messages encrypted under previous keys will gracefully display as `🔒 Unable to decrypt this message` (`encryption: 'undecryptable'`).

7. **Theme Token Discipline (No Hardcoded Dark Assumptions in Light Mode):**
   - Never hardcode `text-white/*` or opaque dark mode assumptions on elements nested inside containers styled with adaptive CSS variables (`--ap-sidebar`, `--ap-stage`, `--ap-canvas`).
   - Always bind semantic text variables (`--ap-text-primary`, `--ap-text-secondary`, `--ap-text-muted`) or paired Tailwind variants (`bg-black/5 dark:bg-white/8`, `text-slate-900 dark:text-white`) so unselected conversations, input text, timestamps, and incoming bubbles remain accessible and high-contrast in both Light and Dark modes.

8. **Asynchronous Layout-Aware Viewport Pinning (Images & Channel Open):**
   - Opening or switching to a chat must reliably anchor the scroll position at the latest message.
   - Encrypted attachments and rich media decrypt asynchronously and attach `blob:` URLs after the initial message history render.
   - Viewports must couple `scrollToBottom` with layout-aware triggers: image load capture (`@load.capture="onViewportImageLoad"`), a `ResizeObserver` observing scroll container expansion, and `pendingScrollOnOpen` tracking so late layout shifts maintain bottom-pinning without jumping when the user intentionally scrolls up.

9. **Test-Asserted Class & Attribute Preservation (Component Restyling):**
   - When restyling UI components (`MessageViewport.vue`, `MessageComposer.vue`, `ChatSidebar.vue`), never drop or alter legacy CSS classes or input attribute strings that test suites explicitly assert (e.g., `text-[var(--fp-text-muted)]`, `bg-indigo-600`, and `placeholder="Message #${channel}"`).
   - Layer new visual styling tokens (such as Apple Fluid gradient or frosted glass classes) alongside asserted tokens rather than removing them, ensuring visual fidelity without breaking unit and component test assertions.

## 5. Testing Standards

- **Path Aliases:** Both `~` and `@` resolve to `./app` in Nuxt and `vitest.config.ts`.
- **Test-First Discipline:** Keep state transitions in pure factories (`useMessagesState.ts`, `useTypingState.ts`, `usePresenceState.ts`, `useConnectionManager.ts`) or exported helpers so they can be tested deterministically in `tests/` without live network calls.
- **Verification Gate:** Always run `npm test` and confirm all test suites pass before claiming any task or bugfix is complete.

## 6. Agent Workflow Rules

- **CodeGraph First (`.codegraph/`):** This repository is indexed by CodeGraph. Always call `codegraph_explore` (MCP tool) or run `codegraph explore "<symbols or question>"` **before** using `grep`, `find`, or reading files manually when locating symbols, tracing call paths, or checking blast radius.
- **Karpathy Guidelines (`.agents/skills/karpathy-guidelines/SKILL.md`):**
  1. *Think Before Coding:* State assumptions explicitly and ask when requirements are ambiguous.
  2. *Simplicity First:* Write the minimum code that solves the problem; no speculative abstractions.
  3. *Surgical Changes:* Touch only the lines required by the request; match existing formatting and patterns.
  4. *Goal-Driven Execution:* Turn every change into a verifiable test check (`npm test`).
- **Workspace Skills & Docs:**
  - Use the workspace UI/design skills in `.agents/skills/` (`frontend-design`, `ui-styling`, `ui-ux-pro-max`, `design-system`) when designing or restyling UI components.
  - Save design specifications in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`.
