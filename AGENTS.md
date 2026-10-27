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
- **Windows CLI Tooling:** GitHub CLI (`gh`) is often at `C:\Program Files\GitHub CLI\gh.exe` if not present in default `$env:PATH`. When invoking `gh pr create` or `gh issue create` with multiline Markdown in PowerShell, never pass multiline string literals in `--body "..."` (PowerShell argument parsing splits and corrupts unescaped newlines/quotes); always write the text to a temporary file and use `--body-file <path>` (cleaning up the temp file after).
- **Windows Line Endings:** Git with `core.autocrlf = true` checks out CRLF. Normalize or match exact CRLF when applying targeted file edits. If targeted edits fail due to CRLF mismatches, normalize to LF via `node -e 'fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"))'` before editing. Scripts with shebangs (`#!/usr/bin/env node`) must preserve LF via `.gitattributes` (`scripts/* text eol=lf`) because a CRLF shebang causes Vite/Rollup imports in Vitest suites to fail with `SyntaxError: Invalid or unexpected token`.
- **Primary Git Branch (`master`):** The repository's default and production base branch is `master` (not `main`). Always specify `--base master` when creating PRs (`gh pr create --base master`) or merging development branches.

## 3. Architecture & Directory Layout

The codebase separates **Supabase/Realtime I/O orchestration** from **pure, testable state factories** and **presentational Vue components**:

```text
├── app/
│   ├── components/
│   │   ├── ChatSidebar.vue         # Channel list, unread badges, online friends, theme & logout controls
│   │   ├── ConfettiDictionaryModal.vue # Word chips, comma-separated add, delete trigger words
│   │   ├── ConfettiOverlay.vue     # Raycast-style dual-cannon confetti & funny particle canvas overlay
│   │   ├── ConnectionBanner.vue    # Reconnecting / disconnected banner with countdown & manual retry
│   │   ├── ContactsModal.vue       # Contacts address book & email lookup modal
│   │   ├── CreateGroupModal.vue    # Group creation modal with multi-select contacts
│   │   ├── GroupInfoModal.vue      # Group info, member list, add member & leave modal
│   │   ├── E2eeGate.vue            # Passphrase unlock form & unconfigured/loading gate
│   │   ├── MessageComposer.vue     # Textarea composer (Enter to send, Shift+Enter newline, typing hook)
│   │   ├── MessageViewport.vue     # Upward infinite scroll, scroll-lock preservation, new-message pill, E2EE badges
│   │   ├── MusicPlayerBar.vue      # Persistent synchronized audio player bar (scrubber, play/pause, volume, tune-in)
│   │   ├── UserAvatar.vue          # Deterministic color badge + 1-2 character initials
│   │   └── YouTubeSearchModal.vue  # In-app YouTube video search and room track selection modal
│   ├── composables/
│   │   ├── useChatRoom.ts          # Central orchestrator wiring Supabase queries & 3 Realtime channels
│   │   ├── useE2ee.ts              # Session storage key cache, config query, phrase derivation & validation
│   │   ├── useMessagesState.ts     # Pure store (createMessagesStore): optimistic UI, dedup, ordering, cursors
│   │   ├── useMusicPlayer.ts       # Shared playback state, seek sync, volume, autoplay detection & broadcast
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
│       ├── crypto.ts               # WebCrypto AES-GCM-256 + PBKDF2 encryption, decryption, base64url helpers
│       └── youtube.ts              # YouTube Data API & InnerTube search parsers, duration formatting
├── server/
│   └── api/
│       └── youtube/
│           └── search.get.ts       # Keyless InnerTube search endpoint with optional YOUTUBE_API_KEY fallback
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
   - **PBKDF2 Salt Immutability & Safe Seeding Discipline:**
     - The PBKDF2 salt in `public.e2ee_config.salt` is the immutable cryptographic anchor for all historical ciphertext. Never overwrite an existing salt in migrations or seed scripts (`ON CONFLICT (id) DO NOTHING;` only).
     - Never provide SQL snippets containing `ON CONFLICT (id) DO UPDATE SET salt = excluded.salt...` unless an explicit, operator-confirmed cryptographic reset of all past history is intended.
     - When introducing default/transparent auto-unlock, the application's hardcoded or environment secret phrase MUST match the actual existing workspace phrase that originally encrypted the database, never an arbitrary placeholder.
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

9. **Component Restyling vs. Structural Redesign Discipline:**
   - **Functional Invariants (Strictly Preserved):** Always preserve functional `data-test` hooks (`data-test="open-contacts"`, `data-test="open-start-dm"`, `data-test="open-create-group"`, `data-test="load-older-button"`), event emits, keyboard shortcuts (Enter / Shift+Enter), and accessibility roles.
   - **Visual Restyling (In-Place):** When performing visual tweaks within an existing layout, layer new visual tokens alongside legacy asserted tokens (e.g., keeping asserted placeholder substrings or utility classes) so tests pass without modification.
   - **Structural Layout Redesign (Authorized Modernization):** When an approved design demo or explicit user request calls for replacing layout architecture (e.g., unifying a 2-pane rail+drawer into a single 1-pane sidebar), refactor the component structure cleanly rather than hacking phantom DOM elements. Immediately update obsolete structural assertions in the corresponding test suite (e.g., `tests/components/chatUi.test.ts`) while verifying all functional and interaction assertions remain green.
   - **Full-App Scope Default:** Unless explicitly scoped down, application-wide UI redesigns apply holistically across all surfaces: Main Workspace, Message Viewport, Composer Dock, Auth/Login, E2EE Gates, and all Modals.

10. **Postgres RLS Permissive Combining & Tightening Rule:**
    - Postgres evaluates multiple permissive RLS policies using `OR`. Adding a restrictive policy while an older `using (true)` policy remains active leaves data exposed.
    - When tightening security on existing tables (`profiles`, `contacts`), always explicitly drop legacy permissive policies (`DROP POLICY IF EXISTS ...`) before defining scoped rules.

11. **Mutual Friendship & Realtime Contact Profile Resolution:**
    - Friend relationships are strictly bidirectional, created and removed via atomic `SECURITY DEFINER` RPCs (`add_mutual_friend`, `remove_mutual_friend`).
    - `public.profiles` RLS restricts reads to self, mutual friends, and shared channel co-members. Peer profile lookups must happen *after* friendship row insertion.
    - On realtime `contacts` `INSERT` events, if peer profile is missing from memory, asynchronously query Supabase (`fetchProfile`) and merge into `contactsProfiles` store.

12. **Transparent Auto-Unlock & Non-Blocking Workspace Hydration:**
    - Chat workspace hydration (`initializeChat()`, `fetchConversations()`, `fetchContacts()`, Realtime subscriptions) must execute unconditionally on page mount and must NEVER be blocked by E2EE initialization (`initializeE2ee()`).
    - If E2EE derivation fails, is delayed, or encounters an unrecognized key, the sidebar, conversation roster, contacts, and message timelines must still mount and render.
    - Decryption failures must remain isolated to individual message bubbles (`encryption: 'undecryptable'`, rendering `🔒 Unable to decrypt this message`) rather than stalling the application shell in an empty or unmounted state.

13. **Native Windows & OS Web Notifications Discipline (Service Worker & Action Center):**
    - **Background & Minimized Tab Delivery:** Modern Chromium on Windows throttles or drops `new window.Notification()` from background or sleeping tabs. Always route desktop notifications through `ServiceWorkerRegistration.showNotification()` via `public/sw.js` when available, falling back to `window.Notification` only in unsupported environments.
    - **V8 Garbage Collection Retention:** Retain all instantiated `window.Notification` objects in a module-level `activeNotifications: Set<any>` until `onclose` or `onclick` fires to prevent premature V8 garbage collection from dropping Windows Action Center toasts.
    - **Absolute Asset Paths:** Windows Notification Platform XML parsers reject relative icon paths (`/favicon.ico`). Always resolve absolute URLs using `${window.location.origin}/...`.
    - **Proactive Permission UX:** Browser `Notification.permission` defaults to `'default'`. Never assume notifications are active without permission; surface a non-intrusive permission banner triggered by explicit user gestures.

14. **PostgREST Multi-FK Embedding Disambiguation (`PGRST201`):**
    - When a table has multiple foreign keys referencing the same target table (e.g., `messages.user_id` and `messages.pinned_by` -> `profiles.id`, or `contacts.user_id` and `contacts.contact_user_id` -> `profiles.id`), PostgREST cannot infer relationship embedding without explicit disambiguation.
    - Every join query MUST explicitly name the foreign key constraint: e.g., `author:profiles!messages_user_id_fkey(...)` or `profile:profiles!contacts_contact_user_id_fkey(*)`. Bare `author:profiles(...)` will fail in production with HTTP 300 / `PGRST201`.

15. **Schema Column Projection Discipline (`42703`), PostgREST Schema Cache (`PGRST204`), DDL Table Existence (`42P01`) & PL/pgSQL Delimiters:**
    - **Projection Discipline:** Never project unmigrated, renamed, or obsolete columns (e.g., `channel_id` on `public.messages`) in Supabase `.select()` projections; PostgREST translates them to SQL queries that immediately fail with HTTP 400 (`code: 42703`). Always project actual schema columns (`conversation_id`).
    - **PostgREST Schema Cache & RLS Column Evaluation (`PGRST204`):** PostgREST error `PGRST204: Could not find the '<column>' column of '<table>' in the schema cache` occurs on `SELECT` queries (including `select('*')`) if an active PostgreSQL RLS policy references a renamed or dropped column (such as `can_access_channel(channel_id)` on `public.message_reactions`). Migrations renaming or dropping table columns must explicitly `DROP POLICY IF EXISTS` for all legacy policies before creating new scoped policies (`can_access_conversation(conversation_id)`).
    - **Client Mutation Payload Sanitization:** Even when TypeScript models retain deprecated transitional aliases for in-memory UI compatibility (e.g., `MessageReaction.channel_id?: string`), payloads passed to `supabase.from('...').insert(...)` or `.update(...)` must explicitly exclude deprecated/dropped properties so PostgREST never rejects the payload with `PGRST204`.
    - **DDL Table Existence Discipline:** Never write `ALTER TABLE` DDL migrations for deprecated, transitional, or uncreated tables (e.g., `public.channels` which was replaced by `public.conversations`). Always inspect `supabase/schema.sql` to confirm a table actually exists in the active schema before modifying it, avoiding Postgres `42P01` ("relation does not exist") execution failures.
    - **PL/pgSQL Body Delimiters:** Always enclose PostgreSQL function bodies in `as $$ ... $$;`. Single `$` is a syntax error in PostgreSQL. In JS scripts or string replacement helpers, never use `str.replace(target, '...$$...')` directly because JS treats `$$` as an unescape pattern for a literal `$`; always use `str.replace(target, () => '...$$...')` or `split/join`.

16. **Composer Drafts & Attachment Captions Discipline:**
    - **Per-Conversation Draft Persistence:** Composer draft text must be keyed in memory by `conversationKey = props.conversationId || props.channelSlug`. Switching conversations must save the outgoing conversation draft, restore the incoming draft, and clear any uncommitted local file attachments to prevent cross-channel leaks. Sending a message (text or attachment) must clear the draft for that conversation.
    - **Non-Destructive Attachment Queuing:** Queueing file attachments must never wipe typed composer text (`content.value = ''`) or disable the textarea. Keep the input enabled with an attachment-specific placeholder (e.g., `'Add a caption...'`) so users can add or edit captions.
    - **Encrypted Payload & Retry Coupling:** Attachment captions must be serialized inside the encrypted AES-GCM-256 payload envelope (`ImageMessagePayload.caption?: string`) alongside attachment metadata, never sent in plaintext. Attachment retry tracking (`pendingImageFiles`) must retain the caption alongside the file array so retries resend both together.
    - **Viewport Mention & Link Tokenization:** In `MessageViewport.vue`, attachment captions rendered below `MessageImageGrid.vue` must pass through `tokenizeMessageMentions` so that `@mentions`, links, and inline code formatting behave identically to standard text messages.

17. **Client-Side E2EE Search & Decrypted Highlight Discipline:**
    - Because message content is E2EE encrypted with AES-GCM-256 in Postgres, all content search operations MUST execute strictly in-memory over decrypted `ChatMessage` objects in active store (`filterMessagesByKeyword`). Never attempt server-side `LIKE` / full-text search queries or transmit search query text over the wire.
    - Search matching must gracefully filter out `deleted_at` tombstones and `undecryptable` envelopes, while extracting plaintext captions from parsed image payloads (`parseImagePayload(content)?.caption`).
    - Keyword highlighting in viewports must segment text via `highlightTextSegments` and apply non-destructive `<mark>` wrappers around matched substrings, while auto-scrolling with `jumpToMessage` preserves the surrounding conversation timeline context rather than destructively truncating the viewport message array.

18. **Consistent Member Profile Triggers & Avatar Hierarchy:**
    - Any rendered member avatar or display name across conversations (direct chat headers, message recipient avatars, sender headers, and group members rosters) must support interactive inspection via `UserProfileModal.vue` (`viewProfile`).
    - `UserAvatar.vue` maintains a unified size scale (`xs`: 16px, `sm`: 28px, `md`: 36px, `lg`: 44px, `xl`: 64px, `2xl`: 80px), where modal profile dialogs anchor on `size="2xl"` (80px) and seen-by status badges anchor on `size="xs"` (16px).
    - **Shape & Containment Invariant:** `UserAvatar.vue` supports `shape?: 'squircle' | 'circle'`. Sizing, border radius (`rounded-full` vs `rounded-[...]`), `relative` positioning, and `overflow-hidden` are strictly encapsulated on the inner badge element containing the `<img>` and initials fallback. Outer flex parent wrappers must not deform or stretch avatars into non-square capsules/pills.

19. **Client-Side E2EE Media, Link, and Content Aggregations:**
    - Any feature that aggregates or indexes messages across conversation history (such as `extractMediaFromMessages` for media galleries, `extractLinksFromMessages` for link indexes, or in-memory keyword search) must execute strictly client-side on decrypted in-memory `ChatMessage` rows.
    - Aggregation routines must filter out soft-deleted tombstones (`deleted_at`) and undecryptable rows (`encryption === 'undecryptable'`), while inspecting both direct message content and parsed image captions (`parseImagePayload(msg.content)?.caption`).

20. **Message Row Floating Action Bar Out-of-Flow Discipline:**
    - Action toolbars (reactions, pin, reply, edit, delete) rendered inside message rows must NEVER exist as in-flow flex siblings (`flex shrink-0` or `opacity-0` in flow) alongside message bubble columns.
    - `opacity-0` preserves intrinsic layout dimensions (~240px–310px), starving `min-w-0` message columns and crushing chat bubbles into narrow vertical 1-word columns on mobile/small viewports while truncating sender headers.
    - Action toolbars MUST be taken out of layout flow (`absolute -top-3 z-20`, aligned `right-0` for sender, `left-11` for recipient) and coupled with `pointer-events-none` (restoring `pointer-events-auto` on `:hover`, `:focus-within`, and `:active`) so hidden toolbars neither steal clicks nor consume horizontal flex space.

21. **Chat Stage Background Continuity & Slotted Composer Dock Discipline:**
    - `MessageViewport.vue` renders `[data-test="chat-background-layer"]` (`absolute inset-0 z-0`) and the adaptive contrast scrim (`[data-test="chat-background-scrim"]`) when `background_url` is configured.
    - To avoid disjoint wallpaper cuts or duplicated `background-size: cover` seams above the message composer, `MessageComposer.vue` must NEVER be mounted as a sibling container outside `MessageViewport.vue`.
    - `MessageViewport.vue` isolates the scrollable timeline and `[data-test="scroll-to-bottom"]` button inside an inner `relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden` container and renders `<slot />` directly beneath it.
    - In `app/pages/index.vue`, `MessageComposer.vue` must be slotted inside `MessageViewport` so one continuous wallpaper and scrim layer spans the full height of the chat stage, while `relative z-10` on `MessageComposer.vue` ensures composer controls and autocomplete dropdowns cleanly stack above `z-0`.

22. **Lightweight Native UI Primitives & Nuxt Component Collision Guard (`NUXT_B3011`):**
    - **Nuxt Component Discovery Collision:** In Nuxt 4 (`app/components/`), never create nested subdirectories containing both `Component.vue` and `index.ts` re-exports for the same component. Nuxt auto-registers both files under the same component name, generating `WARN [NUXT_B3011] Two component files resolving to the same name`.
    - **Flat UI Hierarchy:** Store primitive UI components directly in `app/components/ui/` (e.g. `app/components/ui/Button.vue`, `app/components/ui/Input.vue`) with standard default exports and direct imports (`import Button from '~/components/ui/Button.vue'`).
    - **Native Vue 3 Primitives:** Prefer standard Vue 3 `defineModel()` and native HTML elements styled with Tailwind over heavy external headless wrappers (`reka-ui`, `class-variance-authority`, `@vueuse/core`, `cn`).

23. **Legacy CSS Token Deprecation & Test Assertion Coexistence:**
    - When replacing legacy CSS tokens (`--om-*`, `--fp-*`) with semantic Apple Fluid tokens (`--ap-*`), verify if any test suites assert specific legacy class strings (e.g. `text-[var(--fp-text-muted)]`).
    - To safely modernize without breaking invariant test suites:
      1. Define a backward-compatible alias in `app/assets/css/main.css` mapped to the semantic token (e.g. `--fp-text-muted: var(--ap-text-muted);`).
      2. Keep the asserted legacy class alongside the semantic class on the target element (`text-[var(--fp-text-muted)] text-[var(--ap-text-muted)]`).

24. **Optimistic Mutation Rollback & Reversible State Stores:**
    - Any optimistic UI mutation on active message state (`editMessage`, `deleteMessage`, `toggleReaction`, `updateGroupTitle`, `togglePinMessage`) must capture the pre-mutation baseline state before updating stores.
    - If the backend RPC or Postgres mutation returns an error or rejects, the orchestrator MUST explicitly revert `messagesStore` / reactive state back to the captured baseline values (`reconcileUpdatedMessage`, `applyReactionAdded`/`applyReactionRemoved`) and return `{ error }` rather than leaving phantom edits/deletions in memory.

25. **Concurrent Entity Creation Coalescing & Advisory Lock Discipline:**
    - **Client-Side Request Coalescing:** Any client-side action that gets or creates shared unique entities (such as `openOrCreateDirectChat(peerId)`) must deduplicate rapid concurrent invocations using an in-flight Promise map (`Map<string, Promise<T>>`) so simultaneous clicks or triggers share a single network call.
    - **Database Transactional Advisory Locks:** In PostgreSQL schema, functions creating bidirectional or unique 1-to-1 relationships (`get_or_create_direct_conversation`) must acquire a transactional advisory lock (`pg_advisory_xact_lock`) derived deterministically from the sorted entity UUIDs (e.g. `min(user_a, user_b) || max(user_a, user_b)`) to prevent concurrent insert race conditions.

26. **Celebration Triggers, Dictionary Gating & History Boundary Discipline:**
    - **Per-Conversation Trigger Dictionaries (`confetti_words`):** Message celebration effects (confetti, audio cues, canvas micro-interactions) must never trigger unconditionally on every message. They must be gated behind per-conversation trigger dictionaries stored on `public.conversations.confetti_words` (`text[] not null default '{}'`), synced across all conversation members in real time via existing `public.conversations` `UPDATE` subscriptions.
    - **Empty Default & Case-Insensitive Substring Match:** New and existing conversations default to an empty dictionary (`[]`), keeping celebration effects suppressed until members explicitly add trigger words. Matching (`matchesConfettiDictionary`) must evaluate case-insensitively against trimmed, lowercased, and deduplicated entries.
    - **Decrypted Rich Media & Caption Inspection:** Dictionary matching must evaluate both direct message text and decrypted image/attachment captions (`isImagePayload(content) ? parseImagePayload(content)?.caption : content`).
    - **History Boundary Suppression:** Reactive watchers monitoring message collections for celebration effects must NEVER evaluate historical messages fetched during initial conversation load or cursor pagination (`isLoadingHistory.value` or initial history render). Maintain an explicit baseline tracker (`prevConfettiMessageId` / `hasLoadedHistoryForConv`) so celebration watchers only evaluate freshly appended realtime messages arriving in an active viewport.
    - **O(1) Selector Discipline (No Deep Traversal):** Celebration watchers on message stores MUST watch an O(1) selector (such as array length + tail message ID) rather than deep-watching (`deep: true`) the entire message collection, preventing synchronous O(N) object-graph traversals on every reaction, status change, or optimistic insert.

27. **SPA Service Worker & Global Event Listener Teardown:**
    - Global browser event listeners registered in page components—including `navigator.serviceWorker.addEventListener('message', handler)` and `window.addEventListener('keydown', handler)`—must always reference named function handlers and be explicitly unregistered in `onUnmounted`. Anonymous inline listener closures cause listener accumulation, memory leaks, and zombie navigation calls across route transitions.

28. **Zero-Dependency Canvas Micro-Interactions, Stacking Triggers & Accessibility Discipline:**
    - **Zero External Dependencies:** Celebration and particle effects (such as Raycast-style confetti) must use native HTML5 2D Canvas and pure mathematical physics helpers rather than external npm packages (`canvas-confetti`).
    - **Pure State & Physics Testability:** Decouple particle state calculation (`createBurst`, `stepParticles`) from canvas rasterization (`drawParticles`). This ensures physics (drag, gravity, 3D tilt, culling) can be verified deterministically in headless test runners (Happy-DOM / Vitest) where `getContext('2d')` is unavailable.
    - **HiDPI Fill-Rate & Reflow Discipline:** Full-viewport transparent canvas overlays rendered above backdrop-filtered DOM layers (`backdrop-blur-xl`) must cap `cachedDpr <= 1.25` (cutting GPU clear/composite fill-rate by up to 75% on Retina/4K displays) and isolate compositor layers with `will-change: transform`. Never call `canvas.getBoundingClientRect()` during burst spawn; read `window.innerWidth`/`innerHeight` to prevent synchronous main-thread layout reflows.
    - **Offscreen Glyph Sprite Caching & State Batching:** In high-frequency 2D Canvas particle loops (60–120fps), never call `ctx.fillText` with rotated/scaled emoji strings or repeatedly push/pop the context state stack with per-particle `ctx.save()` / `ctx.restore()`. Pre-render unique emoji glyphs once onto an offscreen canvas sprite and blit via `ctx.drawImage()`, and batch affine transforms via `ctx.setTransform(a, b, c, d, e, f)` with a single frame-level `save()`/`restore()`.
    - **Dual-Prop Trigger Deduplication:** When components support both visibility (`active: boolean`) and stacking increments (`burstKey: number`), deduplicate triggers using internal tracking (`lastSpawnedBurstKey`) so initial activation does not double-spawn particles.
    - **Accessibility (`prefers-reduced-motion`):** Always query `window.matchMedia('(prefers-reduced-motion: reduce)')`. When active, immediately emit completion or scale particles down to a gentle transition.
    - **Timer & Frame Teardown:** Canvas animation loops (`requestAnimationFrame`) must couple with a safety timeout fallback and cleanly cancel all frame handles and timers on unmount or deactivation.

29. **Windows PWA Installability, High-DPI Icons & Single-Use Prompt Discipline:**
    - **High-DPI PNG Shortcut Generation:** Chromium on Windows requires raster PNG icons (`192x192` and `512x512`) declared in `public/manifest.webmanifest` to generate native Windows Start Menu and Taskbar `.ico` shortcuts. Generate these using pure Node built-ins (`node:zlib` + `node:fs`) via `scripts/generate-pwa-icons.mjs` without adding heavy image-processing npm dependencies (`sharp`, `canvas`).
    - **Service Worker Pass-Through Fetch:** Chromium on Windows requires an active `fetch` listener in `public/sw.js` to satisfy PWA installability criteria. Never call `event.respondWith()` or cache E2EE messages, WebSockets, or Supabase responses; keep the fetch handler as a no-op pass-through (`self.addEventListener('fetch', () => {})`).
    - **Single-Use `BeforeInstallPromptEvent` Invariant:** Chromium invalidates a `BeforeInstallPromptEvent` immediately after `.prompt()` is invoked. Composables (`usePwaInstall.ts`) must nullify the stored event reference and reset `canInstall.value = false` before awaiting `prompt()` or `userChoice` to prevent invalid re-invocations.
    - **Standalone Mode & E2EE Gate Isolation:** When `window.matchMedia('(display-mode: standalone)').matches` is true, mark `isInstalled = true` and suppress in-app install buttons. Register the service worker at root mount (`initPwaInstall`) so browser address-bar install prompts work on the initial login / gate screens, while mounting in-app install controls strictly inside the unlocked workspace (`ChatSidebar.vue`).

30. **Multi-UI Personality Themes & Composable Mock Discipline:**
    - **Two-Axis Theme Architecture (`uiTheme` + `isDark`):** The application decouples UI personality (`uiTheme: 'default' | 'vscode' | 'yahoo'`) from color mode (`isDark: boolean`), persisting them independently in `localStorage['nuxt-chat-ui-theme']` and `localStorage['nuxt-chat-theme']`. `useTheme.ts` binds both to `document.documentElement` (`data-theme="<theme>"` attribute, `theme-<theme>` class, and `.dark` class).
    - **Functional Invariance Across Clone Layouts:** Structural theme clones (e.g., VSCode Activity Bar, editor tab bar, line-number gutter, and terminal composer; Yahoo! Messenger title bar, menu strip, inline transcript author, and Buzz toolbar) transform visual layout, typography, and chrome while strictly retaining all underlying functional `data-test` hooks (`message-bubble-<id>`, `conversation-item-<id>`, `open-contacts`, `open-start-dm`, `open-create-group`, `composer-deck`), keyboard shortcuts, and event emits so test suites remain 100% green across all themes.
    - **Defensive Lifecycle Invocations & Composable Test Mock Sync:** In root views and components (`app/pages/index.vue`), lifecycle calls on composable exports (such as `initTheme?.()`) must use optional chaining to prevent runtime crashes when test suites (`tests/components/indexPage.test.ts`) isolate composables with `vi.mock('~/composables/useTheme')`. When adding new methods or refs to core composables, all existing partial test mocks in `tests/` must be synchronized.

31. **Realtime Broadcast Media Sync, Zero-DDL Discipline & Autoplay "Tune In" Pattern:**
    - **Zero-DDL Ephemeral Room Sync:** Fast-moving or transient conversation state (such as shared media playback, scrubber position, play/pause state, or cursor positions) must NEVER require new Postgres columns or tables that risk PostgREST schema cache errors (`PGRST204`). Synchronize ephemeral state using Supabase Realtime Broadcast on conversation channels (`typing:${conversationId}`). Persist only immutable milestones to the database via existing encrypted `public.messages` system payloads (`event: 'music_play'`).
    - **Late-Joiner Elapsed Timestamp Handshake:** When subscribing to a conversation, if local playback state is empty, broadcast `type: 'request_state'`. Any active room peer responds with `type: 'sync_state'` carrying `positionSec` and `updatedAt`, allowing late joiners to compute current elapsed time (`positionSec + (now - updatedAt) / 1000`) without server-side clocks.
    - **Browser Autoplay Policy & "Tune In" Fallback:** Modern browser security blocks unprompted audio/video autoplay triggered remotely over Realtime without prior user gesture interaction. Audio players (YouTube IFrame API / Web Audio) must catch playback rejections, set `autoplayBlocked = true`, and surface a prominent, one-click "Tune In" button (`data-test="music-unblock-btn"`) rather than failing silently.
    - **Keyless Upstream Fallback Discipline:** Server routes querying third-party APIs (such as `/api/youtube/search`) should implement a keyless fallback (e.g. InnerTube POST search) so the application functions out-of-the-box with zero API key configuration, while upgrading to official API keys (`YOUTUBE_API_KEY`) when provided in `.env`.
    - **Composable Mock Completeness:** When adding new methods or subscriptions to `useChatRoom.ts`, page components must guard execution with `typeof fn === 'function'` in lifecycle hooks, and corresponding mock fixtures in `tests/components/indexPage.test.ts` must be updated immediately to prevent `TypeError: <fn> is not a function` during test runs.


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
