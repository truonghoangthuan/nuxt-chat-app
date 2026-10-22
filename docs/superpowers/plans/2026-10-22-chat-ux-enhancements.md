# Chat UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 chat UX enhancements: hover-based reaction toolbar replacing 3-dots, external timestamp placement outside bubbles, user profile view modal on avatar/name click, auto-focus input on reply, and persistent scroll-to-bottom button when scrolled up.

**Architecture:** Pure component updates across `MessageViewport.vue`, `MessageComposer.vue`, and `index.vue`, plus a new presentational component `UserProfileModal.vue`. All existing event contracts and test attributes are preserved.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Tailwind CSS, `@lucide/vue`, Vitest, `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-22-chat-ux-enhancements-design.md`

## Global Constraints
- Preserve all existing `data-test` attributes (`data-test="delivery-indicator-*"`, `data-test="scroll-to-bottom"`).
- Preserve dark/light adaptive styling tokens (`--ap-stage`, `--ap-text-primary`, `--ap-text-secondary`, `--ap-text-muted`).
- All tests must pass: `npm test`.

## Review Focus
- Touch vs Mouse hover toolbar access: Ensure message toolbar can be activated via touch/focus on mobile devices.
- Outgoing vs Incoming timestamp symmetry: Ensure sender timestamps are outside to the left and recipient timestamps outside to the right without layout shifts.
- Scroll-to-bottom edge cases: Ensure button appears when scrolling up even with 0 unread messages, and properly hides upon reaching the bottom.
- Missing email in profile resolution: Ensure profile modal gracefully displays "No email available" or fetches if missing.
- Rapid reply clicking: Ensure focus is cleanly regained in composer even when replying to consecutive messages.

---

### Task 1: Auto-Focus Message Composer on Reply

**Files:**
- Modify: `app/components/MessageComposer.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `props.replyingTo: ChatMessage | null`
- Produces: `textareaRef.value?.focus()` on `props.replyingTo` change

- [x] **Step 1: Write the failing test in `tests/components/chatUi.test.ts`**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement watcher in `app/components/MessageComposer.vue`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: Persistent Scroll-to-Bottom Button

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `isNearBottom: Ref<boolean>`, `unreadNewCount: Ref<number>`, `scrollToBottom(smooth: boolean)`
- Produces: Floating scroll-to-bottom button when `!isNearBottom`

- [x] **Step 1: Write the failing test in `tests/components/chatUi.test.ts`**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Update scroll-to-bottom template in `app/components/MessageViewport.vue`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: Move Timestamps Outside Chat Bubble

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `item.isSender: boolean`, `item.message.created_at: string`, `item.message.status: MessageStatus`
- Produces: Timestamp & delivery indicator rendered outside bubble (to the right of recipient messages, to the left of sender messages)

- [x] **Step 1: Write test in `tests/components/chatUi.test.ts` checking timestamp position**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Restructure timestamp in `app/components/MessageViewport.vue`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: Hover-Based Reaction Selection Toolbar (Remove 3-Dots)

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `REACTION_EMOJIS`, `emit('toggleReaction')`, `emit('reply')`, `emit('togglePin')`
- Produces: Direct hover toolbar for all viewports; removes 3-dots button trigger

- [x] **Step 1: Write test verifying hover reaction bar is rendered without 3-dots button**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Update `MessageViewport.vue`**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 5: User Profile View Modal

**Files:**
- Create: `app/components/UserProfileModal.vue`
- Modify: `app/components/MessageViewport.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/UserProfileModal.test.ts`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- `UserProfileModal.vue` Props:
  - `isOpen: boolean`
  - `profile: Profile | null`
  - `isOnline?: boolean`
  - `isCurrentUser?: boolean`
- `UserProfileModal.vue` Emits:
  - `(e: 'close'): void`
  - `(e: 'startDm', userId: string): void`
- `MessageViewport.vue` Emits:
  - `(e: 'viewProfile', profile: Profile): void`

- [x] **Step 1: Write component tests for `UserProfileModal.vue`**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Create `app/components/UserProfileModal.vue`**
- [x] **Step 4: Wire `viewProfile` events in `MessageViewport.vue` and `app/pages/index.vue`**
- [x] **Step 5: Run all tests to verify they pass**
- [x] **Step 6: Commit**

---

### Task 6: Final Integration Verification

**Files:**
- Entire codebase

- [x] **Step 1: Run complete test suite**
- [x] **Step 2: Verify production build**
