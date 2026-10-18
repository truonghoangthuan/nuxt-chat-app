# Root `AGENTS.md` Specification

**Date:** 2026-10-18  
**Project:** Nuxt 4 Real-Time Friends Chat App (`nuxt-chat-app`)  
**Target File:** `AGENTS.md` (repository root)

---

## 1. Purpose & Scope

Define a single, high-signal root `AGENTS.md` file that equips AI coding agents (Antigravity, Claude Code, Codex, Cursor) with the exact operational commands, architecture boundaries, domain/realtime invariants, testing standards, and workflow rules for `nuxt-chat-app`.

### Constraints
- **Format:** Plain Markdown without YAML frontmatter (standalone `AGENTS.md` files in Antigravity are always active for the repository root and all subdirectories).
- **Size:** ~120–150 lines (~5–7 KB), staying well below Antigravity's 24,000-byte per-file rule cap and 20,000-token aggregate rules budget.
- **Accuracy:** Every file path, script command, composable name, and database table/policy referenced in `AGENTS.md` must match the current on-disk codebase.

---

## 2. Section-by-Section Structure

### Section 1: Project Overview & Tech Stack
- **Summary:** Real-time Slack-style public channel chat app for friends.
- **Tech Stack:**
  - **Framework:** Nuxt 4 (`app/` directory layout) + Vue 3 (Composition API, `<script setup lang="ts">`)
  - **Backend / Auth / Realtime:** Supabase (`@nuxtjs/supabase`) — Email/Password Auth, Postgres with Row-Level Security (RLS), Realtime (`postgres_changes`, Broadcast, Presence)
  - **Styling:** Tailwind CSS (`@nuxtjs/tailwindcss`) with class-based dark mode (`dark` class on `<html>`, persisted under `localStorage['nuxt-chat-theme']`)
  - **Testing:** Vitest + `@vue/test-utils` running in `happy-dom`

### Section 2: Commands & Environment
- `npm run dev` — Start Nuxt dev server on `http://localhost:3000`
- `npm test` — Run all Vitest unit and component test suites (`vitest run`)
- `npm run build` — Build for production
- `npm run preview` — Preview production build
- Required environment variables in `.env` (from `.env.example`): `SUPABASE_URL`, `SUPABASE_KEY`
- Database setup located in `supabase/schema.sql` (`public.profiles`, `public.channels`, `public.messages`, triggers, RLS policies, composite index `messages_channel_cursor_idx`, and `supabase_realtime` publication).

### Section 3: Architecture & Directory Layout
Document the separation between orchestration, pure testable state factories, and UI components:
- `app/composables/useChatRoom.ts` — Central orchestrator managing Supabase queries and three Realtime channels:
  - `presence:global` (online friends presence sync)
  - `chat:db_changes` (`postgres_changes` `INSERT` on `public.messages` and `public.channels`)
  - `typing:<channelId>` (Broadcast `typing` events with 1500ms client throttle and 3000ms expiry)
- **Pure State Stores / Factories** (designed to be unit-tested without live Supabase sockets):
  - `app/composables/useMessagesState.ts` (`createMessagesStore`) — Optimistic additions, server confirmation reconciliation, duplicate filtering, cursor extraction, gap merging, and deterministic ordering.
  - `app/composables/useTypingState.ts` (`createTypingTracker`) — Per-user typing expiration timers and formatted typing labels.
  - `app/composables/usePresenceState.ts` (`deduplicatePresenceState`) — Deduplicates multi-tab presence payloads by `user_id`.
  - `app/composables/useConnectionManager.ts` (`createConnectionManager`) — Connection state machine (`connected` | `reconnecting` | `disconnected`) and countdown timers.
- **Auth & Theme Composables:**
  - `app/composables/useAuthProfile.ts` (`useAuthProfile`, `extractAuthUserId`) — Auth actions and `public.profiles` lookup/upsert fallback.
  - `app/composables/useTheme.ts` (`useTheme`) — Dark/light theme state and DOM class synchronization.
- **Utilities & Types:**
  - `app/utils/chat.ts` — Pure helpers (`normalizeChannelSlug`, `isValidChannelSlug`, `calculateBackoffDelay`, `getAvatarInitials`, `getAvatarColor`, `isValidMessageContent`).
  - `app/types/chat.ts` — Core TypeScript contracts (`Profile`, `Channel`, `ChatMessage`, `MessageStatus`, `ConnectionStatus`, `TypingUser`).
- **Middleware, Pages & Components:**
  - `app/middleware/auth.global.ts` — Redirects unauthenticated users to `/login` (allowing `/login` and `/confirm`) and authenticated users away from `/login` to `/`.
  - `app/pages/` — `index.vue`, `login.vue`, `confirm.vue`.
  - `app/components/` — `ChatSidebar.vue`, `MessageViewport.vue`, `MessageComposer.vue`, `CreateChannelModal.vue`, `ConnectionBanner.vue`, `UserAvatar.vue`.

### Section 4: Critical Domain & Realtime Invariants
Explicitly mandate the invariants that must never be broken when modifying the codebase:
1. **Auth User ID Resolution (`extractAuthUserId`):** `@nuxtjs/supabase` `useSupabaseUser()` can return a decoded JWT payload where the user's UUID is stored on `.sub` rather than `.id`. Always use `extractAuthUserId(authUser)` (with fallback to `supabase.auth.getUser()`) before querying or inserting into `profiles`, `channels`, or `messages`, otherwise RLS checks (`auth.uid() = user_id`) will fail.
2. **Idempotent Message Sending & Retries (`client_id`):** Every message generates a client UUID (`client_id`) before insert. Retrying a failed message (`retryMessage`) must reuse the original `client_id`. If Supabase returns a duplicate-key / unique-constraint error (`isDuplicateKeyError`), treat it as an idempotent success by fetching the existing row by `client_id` and marking the message `'sent'`.
3. **Channel Isolation & Race-Condition Guards:**
   - In `selectChannel(channelId)`, verify `activeChannelId.value === channelId` after awaiting the Supabase query before mutating history state.
   - Always pass `currentChannelId` to `messagesStore.setInitialHistory(rows, channelId)` so pending (`sending`/`failed`) or newly arrived messages from another channel are never mixed into the active channel.
   - Incoming realtime messages (`handleIncomingRealtimeMessage`) for non-active channels increment `unreadCounts[channel_id]` instead of mutating `messagesStore`.
4. **Deterministic Ordering & Cursor Pagination:**
   - Confirmed (`status === 'sent'`) messages sort by `created_at ASC, id ASC`; pending (`sending` / `failed`) messages remain at the end of the list.
   - Upward pagination (`loadOlderMessages`) fetches `PAGE_SIZE = 40` rows using composite cursor filter `created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id)` ordered by `created_at DESC, id DESC`, then reverses and prepends while preserving viewport scroll offset (`MessageViewport.vue`).
5. **Vitest / SSR State Fallback:** Composables using Nuxt's `useState` (`useAuthProfile`, `useTheme`) must check `typeof useState !== 'undefined'` and fall back to a module-scoped `ref` so Vitest suites can execute directly without booting the full Nuxt runtime.

### Section 5: Testing Standards
- Path aliases `~` and `@` map to `./app` in `vitest.config.ts`.
- Test structure mirrors `app/`:
  - `tests/utils/chat.test.ts`
  - `tests/composables/useMessagesState.test.ts`, `useRealtimeStates.test.ts`, `useChatRoom.test.ts`
  - `tests/components/chatUi.test.ts`
- **Verification Rule:** Run `npm test` after any code change. Any bugfix or new stateful behavior must include a corresponding unit or component test in `tests/`.

### Section 6: Agent Workflow & Customizations
- **CodeGraph First:** `.codegraph/` is present at the repository root. Always query `codegraph_explore` (MCP tool) or `codegraph explore "<query>"` (CLI) before falling back to `grep`, `find`, or manual file reads when exploring symbols or call paths.
- **Karpathy Guidelines (`.agents/skills/karpathy-guidelines/SKILL.md`):**
  - *Think Before Coding:* Surface assumptions and trade-offs early; ask rather than guessing.
  - *Simplicity First:* Write the minimum code required; avoid speculative abstractions.
  - *Surgical Changes:* Touch only lines required by the task; match existing code style.
  - *Goal-Driven Execution:* Define verifiable criteria and run `npm test` to confirm.
- **Design & Spec Conventions:**
  - Consult workspace UI/design skills in `.agents/skills/` (`frontend-design`, `ui-styling`, `ui-ux-pro-max`, `design-system`) when building or restyling components.
  - Store design specs in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`.

---

## 3. Acceptance Criteria

1. `AGENTS.md` exists at `/Users/truonghoangthuan/Documents/Coding/personal/nuxt-chat-app/AGENTS.md`.
2. Contains no YAML frontmatter and is under 24,000 bytes.
3. Accurately documents all commands, architecture layers, the 5 core invariants, testing conventions, and agent workflow rules.
4. All existing tests (`npm test`) continue to pass.
