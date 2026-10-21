# Friend Privacy, App Passphrase Gate, User Settings, and Mobile Action Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement instant mutual friendship privacy, isolate online presence to friends only, gate the entire app behind the E2EE passphrase, display account details (like email) in user settings, and resolve the mobile chat bubble three-dots overlay.

**Architecture:**
1. **Friend Privacy & Instant Mutual Friendship:**
   - Two-way friendship: Adding a friend by email establishes a mutual connection for both users. Removing a friend severs the connection in both directions.
   - User Isolation: Unconnected users cannot see each other's profiles or presence. Users find each other only via exact email lookup (`findUserByEmail`).
   - Online Friends Filter: Presence sync filters out anyone who is not in the user's friends list (`contacts`).
2. **Full-Screen App Passphrase Gate:**
   - On `/`, if `e2eeStatus !== 'unlocked'`, render `E2eeGate.vue` full-screen. Hide sidebar, navigation rail, and all chat views until unlocked.
3. **User Profile Settings Enrichment:**
   - `ProfileSettingsModal.vue` displays account email (read-only), user UUID with copy action, and account creation date.
4. **Mobile Message Actions Placement:**
   - `MessageActionsMenu.vue` drops `absolute right-2 top-2` and adopts inline flex positioning so it never overlays the message bubble on small screens.

**Tech Stack:** Nuxt 4, Vue 3, Supabase (Postgres, Realtime, RLS), Tailwind CSS, Vitest + `@vue/test-utils`.

---

## Global Constraints
- Pass all unit and component tests: `npm test`.
- Preserve E2EE invariants: messages encrypted client-side with AES-GCM-256 and channel AAD.
- SSR-safe client storage: guard `typeof window !== 'undefined'` and `typeof sessionStorage !== 'undefined'`.
- Clean error recovery: if a friend is deleted or presence disconnects, the app stays operational.

---

### Task 1: Mobile Three Dots Positioning Fix in `MessageActionsMenu.vue`
**Files:**
- Modify: `app/components/MessageActionsMenu.vue`
- Modify: `app/components/MessageViewport.vue`
- Test: `tests/components/messageActionsMenu.test.ts`
- Test: `tests/components/chatUi.test.ts`

- [ ] Inspect and update root element in `app/components/MessageActionsMenu.vue`:
  - Replace `absolute right-2 top-2 z-20 md:hidden` with `relative z-20 md:hidden shrink-0 self-center opacity-70 hover:opacity-100 active:opacity-100 transition-opacity`.
  - Ensure action menu dropdown floats properly without getting clipped (`right-0 top-full` or dynamic based on sender side).
- [ ] In `app/components/MessageViewport.vue`:
  - Ensure `MessageActionsMenu` is styled in flex flow with proper spacing next to message column: `:class="item.isSender ? 'order-first mr-1.5' : 'order-last ml-1.5'"`.
- [ ] Run `npm test tests/components/messageActionsMenu.test.ts` to verify actions open and trigger properly.

---

### Task 2: Passphrase Full-Screen App Gate in `app/pages/index.vue`
**Files:**
- Modify: `app/pages/index.vue`
- Test: `tests/components/indexPage.test.ts`

- [ ] In `app/pages/index.vue`:
  - Wrap entire chat workspace (sidebar, navigation rail, active chat stage) inside a container conditionally rendered ONLY when `e2eeStatus === 'unlocked'`.
  - When `e2eeStatus !== 'unlocked'` (`locked`, `loading`, `unconfigured`), render `E2eeGate.vue` in a dedicated full-screen layout filling the viewport.
  - Ensure no sidebar or navigation items leak into DOM while locked.
- [ ] Update `tests/components/indexPage.test.ts`:
  - Add test asserting that when `mockE2eeState.status.value = 'locked'`, `ChatSidebar` is not mounted/visible and `E2eeGate` is displayed.
  - Assert that once unlocked, the main application shell and sidebar mount and `initializeChat()` executes.

---

### Task 3: Show Email and Account Details in `ProfileSettingsModal.vue`
**Files:**
- Modify: `app/components/ProfileSettingsModal.vue`
- Test: `tests/components/chatUi.test.ts`

- [ ] In `app/components/ProfileSettingsModal.vue`:
  - Add read-only "Account Email" field displaying `profile?.email || 'No email registered'`.
  - Add account metadata badge/section: User ID (UUID) with a quick "Copy ID" button, and "Member Since" formatted date if `profile?.created_at` exists.
  - Style cleanly with Tailwind matching design tokens (`bg-[var(--fp-input-bg)]`, `text-[var(--fp-text-primary)]`, `border-[var(--fp-border)]`).
- [ ] Add unit test in `tests/components/chatUi.test.ts` verifying `ProfileSettingsModal` renders the user's email address and account info.

---

### Task 4: Online Friends Filter — Only Show Added Friends
**Files:**
- Modify: `app/composables/useChatRoom.ts`
- Modify: `app/components/ChatSidebar.vue`
- Test: `tests/composables/useChatRoom.test.ts`
- Test: `tests/components/chatUi.test.ts`

- [ ] In `app/composables/useChatRoom.ts`:
  - Update `onlineFriends` derivation / assignment:
    - On presence sync (`presenceChannel.on('presence', { event: 'sync' })`), filter the deduplicated presence list by checking if each `presence.id` exists in `contacts.value.map(c => c.contact_user_id)`.
    - Never include random non-friend users in `onlineFriends`.
    - Maintain sort by `display_name`.
- [ ] In `tests/composables/useChatRoom.test.ts`:
  - Add test ensuring that if an online user is NOT in `contacts`, they are excluded from `onlineFriends`.
  - Add test ensuring that when an online user IS in `contacts`, they appear in `onlineFriends`.
- [ ] Run `npm test tests/composables/useChatRoom.test.ts`.

---

### Task 5: Instant Mutual Friendship (Two-Way Add & Remove) & Profile Isolation
**Files:**
- Modify: `supabase/schema.sql`
- Modify: `app/composables/useChatRoom.ts`
- Modify: `app/components/ContactsModal.vue`
- Test: `tests/composables/useChatRoom.test.ts`
- Test: `tests/components/ContactsModal.test.ts`

- [ ] In `supabase/schema.sql`:
  - Add helper function / policies for mutual contacts:
    - When User A adds User B, create/ensure reciprocal contact: insert `(A, B)` and `(B, A)` (e.g. `public.add_mutual_friend(target_user_id uuid)` security definer function or trigger).
    - When User A removes User B, delete reciprocal contact: delete where `(user_id = A and contact_user_id = B) or (user_id = B and contact_user_id = A)` (`public.remove_mutual_friend(target_user_id uuid)`).
    - Update `public.profiles` RLS policy so users can only select:
      1. Their own profile (`auth.uid() = id`)
      2. Profiles of users in `public.contacts` where `user_id = auth.uid()`
      3. Profiles of shared conversation members (`can_access_conversation`)
    - Provide secure RPC `public.lookup_profile_by_email(search_email text)` for finding a user to add by exact email.
- [ ] In `app/composables/useChatRoom.ts`:
  - Update `addContact(contactUserId)`:
    - Call the mutual friend function / RPC (or reciprocal insert), optimistically updating `contacts.value`.
  - Update `removeContact(contactUserId)`:
    - Call the mutual remove function / RPC (or reciprocal delete), optimistically removing from `contacts.value`.
  - Remove `loadAllProfiles()` global indiscriminate query. Replace with loading profiles of contacts and conversation members.
  - Wire Realtime listener for `contacts` table (already handles INSERT and DELETE) to keep both users synchronized live.
- [ ] In `app/components/ContactsModal.vue`:
  - Update UI labels and messaging to reflect "Friends" (e.g., "Add Friend", "Friends list", "Remove Friend").
- [ ] Run test suites:
  - `npm test tests/composables/useChatRoom.test.ts`
  - `npm test tests/components/ContactsModal.test.ts`

---

### Task 6: Full Regression Verification Gate
**Files:**
- All touched files

- [ ] Run full test suite: `npm test`.
- [ ] Verify 100% of test suites pass without warnings or regressions.
- [ ] Perform local verification check for production build: `npm run build`.
