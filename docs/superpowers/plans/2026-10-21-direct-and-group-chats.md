# Direct Contacts, Group Messaging & Bubble UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove public channels and replace with Telegram/iMessage/Messenger-style contact-based direct messaging, multi-user group chats by email, and an asymmetrical chat bubble UI.

**Architecture:** A clean database reset defines `profiles` (with synced emails), `contacts`, `conversations` (`direct` and `group`), and `conversation_members`. A unified composable (`useChatRoom.ts`) coordinates contacts, conversation lifecycle, realtime events, and AES-GCM-256 E2EE bound to `conversation_id`. The UI features a single unified conversation sidebar and Telegram-inspired chat bubbles (right-aligned indigo bubbles for the sender, left-aligned surface cards for others with avatars and group headers).

**Tech Stack:** Nuxt 4, Vue 3 (Composition API), Supabase (@nuxtjs/supabase, Postgres RLS, Realtime), Tailwind CSS v4, WebCrypto API (AES-GCM-256 + PBKDF2), Vitest + @vue/test-utils (happy-dom).

## Global Constraints

- Never commit secrets; use environment variables `SUPABASE_URL` and `SUPABASE_KEY`.
- Preserve E2EE invariants: all messages must use `e2ee:v1:<iv>:<ciphertext>` client-side encryption with `conversation_id` bound as Authenticated Additional Data (AAD).
- All composables must guard `typeof useState !== 'undefined'` for SSR and Vitest compatibility.
- Optimistic messages must generate a UUID `client_id`, enter the store with `status: 'sending'`, and reuse `client_id` on retry.
- Every task must finish with passing unit/component tests (`npm test`).

---

### Task 1: Database Schema & Domain Types

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `app/types/chat.ts`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: Supabase Postgres Auth schema (`auth.users`), WebCrypto types.
- Produces: `Conversation`, `ConversationMember`, `Contact`, `ChatMessage` (with `conversation_id`), and updated `Profile` (with `email`).

- [ ] **Step 1: Write test for new domain interfaces and types in `tests/utils/chat.test.ts`**

Add tests to ensure conversation helper functions and type guards handle direct and group conversations:

```typescript
import { describe, it, expect } from 'vitest'
import { isValidEmail, formatConversationTitle, getDirectPeer } from '~/utils/chat'
import type { Conversation, Profile } from '~/types/chat'

describe('Conversation utilities', () => {
  it('validates email addresses accurately', () => {
    expect(isValidEmail('alice@example.com')).toBe(true)
    expect(isValidEmail('bob.smith+chat@domain.co.uk')).toBe(true)
    expect(isValidEmail('invalid-email')).toBe(false)
    expect(isValidEmail('@nodomain.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('formats conversation title for direct chats and groups', () => {
    const peer: Profile = { id: 'u2', email: 'bob@example.com', display_name: 'Bob', avatar_color: '#0284c7' }
    const directChat: Conversation = {
      id: 'c1',
      type: 'direct',
      title: null,
      created_by: 'u1',
      created_at: new Date().toISOString(),
      peer,
    }
    expect(formatConversationTitle(directChat, 'u1')).toBe('Bob')

    const groupChat: Conversation = {
      id: 'c2',
      type: 'group',
      title: 'Project Alpha',
      created_by: 'u1',
      created_at: new Date().toISOString(),
    }
    expect(formatConversationTitle(groupChat, 'u1')).toBe('Project Alpha')
  })

  it('resolves direct peer correctly', () => {
    const me: Profile = { id: 'u1', email: 'me@example.com', display_name: 'Me', avatar_color: '#0284c7' }
    const peer: Profile = { id: 'u2', email: 'peer@example.com', display_name: 'Peer', avatar_color: '#10b981' }
    const conv: Conversation = {
      id: 'c1',
      type: 'direct',
      title: null,
      created_by: 'u1',
      created_at: new Date().toISOString(),
      members: [
        { conversation_id: 'c1', user_id: 'u1', role: 'owner', joined_at: '', profile: me },
        { conversation_id: 'c1', user_id: 'u2', role: 'member', joined_at: '', profile: peer },
      ],
    }
    expect(getDirectPeer(conv, 'u1')?.id).toBe('u2')
    expect(getDirectPeer(conv, 'u2')?.id).toBe('u1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL (`isValidEmail`, `formatConversationTitle`, `getDirectPeer` not defined).

- [ ] **Step 3: Update `supabase/schema.sql`**

Replace the legacy channels table with `profiles` (with `email`), `contacts`, `conversations`, `conversation_members`, and update `messages` (`conversation_id`), `message_reactions`, `conversation_reads`, RLS policies, trigger `handle_new_user()`, and publication:

```sql
-- Profiles table with email
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_color text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

-- Contacts table (address book)
create table if not exists public.contacts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_user_id),
  constraint contacts_no_self_check check (user_id <> contact_user_id)
);

-- Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conversation members table
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
```

- [ ] **Step 4: Update `app/types/chat.ts`**

Update `Profile` to include `email: string`, replace `Channel` with `Conversation` and `ConversationMember`, define `Contact`, and update `ChatMessage`, `MessageReaction`, and `ConversationRead` to use `conversation_id`.

- [ ] **Step 5: Implement pure helpers in `app/utils/chat.ts`**

Add `isValidEmail`, `formatConversationTitle`, and `getDirectPeer` to `app/utils/chat.ts`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add supabase/schema.sql app/types/chat.ts app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat: reset schema for contacts, conversations and update domain types"
```

---

### Task 2: Pure Utilities for Bubble Timeline Grouping & Mentions

**Files:**
- Modify: `app/utils/chat.ts`
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `currentUserId`, `currentDisplayName`.
- Produces: `TimelineMessageItem` with bubble clustering flags (`isSender`, `isFirstInGroup`, `isLastInGroup`, `showSenderHeader`, `dateLabel`).

- [ ] **Step 1: Write test for message bubble clustering in `tests/utils/chat.test.ts`**

```typescript
describe('Message bubble clustering (Telegram style)', () => {
  it('groups consecutive messages from the same sender within 5 minutes', () => {
    const t0 = new Date('2026-10-21T10:00:00Z').toISOString()
    const t1 = new Date('2026-10-21T10:02:00Z').toISOString()
    const t2 = new Date('2026-10-21T10:10:00Z').toISOString()

    const messages: ChatMessage[] = [
      { id: 'm1', client_id: 'c1', conversation_id: 'conv1', user_id: 'u1', content: 'e2ee:v1:test', created_at: t0, status: 'sent' },
      { id: 'm2', client_id: 'c2', conversation_id: 'conv1', user_id: 'u1', content: 'e2ee:v1:test', created_at: t1, status: 'sent' },
      { id: 'm3', client_id: 'c3', conversation_id: 'conv1', user_id: 'u2', content: 'e2ee:v1:test', created_at: t2, status: 'sent' },
    ]

    const timeline = buildMessageTimeline(messages, new Date('2026-10-21T12:00:00Z'), {
      currentUserId: 'u1',
      isGroup: true,
    })

    expect(timeline[0].isSender).toBe(true)
    expect(timeline[0].isFirstInGroup).toBe(true)
    expect(timeline[0].isLastInGroup).toBe(false)
    expect(timeline[0].showSenderHeader).toBe(false) // sender never shows name header

    expect(timeline[1].isSender).toBe(true)
    expect(timeline[1].isFirstInGroup).toBe(false)
    expect(timeline[1].isLastInGroup).toBe(true)

    expect(timeline[2].isSender).toBe(false)
    expect(timeline[2].isFirstInGroup).toBe(true)
    expect(timeline[2].isLastInGroup).toBe(true)
    expect(timeline[2].showSenderHeader).toBe(true) // other user in group shows header on first message
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL (`isSender` or clustering properties missing/mismatched).

- [ ] **Step 3: Implement `buildMessageTimeline` enhancements in `app/utils/chat.ts`**

Update `buildMessageTimeline` to compute `isSender = msg.user_id === currentUserId`, `isFirstInGroup`, `isLastInGroup`, and `showSenderHeader = !isSender && isGroup && isFirstInGroup`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat: add bubble clustering and sender header logic to timeline builder"
```

---

### Task 3: Messages State Store Refactoring

**Files:**
- Modify: `app/composables/useMessagesState.ts`
- Test: `tests/composables/useMessagesState.test.ts`

**Interfaces:**
- Consumes: `conversationId: string`, `ChatMessage`.
- Produces: `createMessagesStore()` operating on `conversationId`.

- [ ] **Step 1: Write test for conversation-bound message store in `tests/composables/useMessagesState.test.ts`**

Update tests to pass `conversationId` instead of `channelId`, ensuring message reconciliation, deduplication, optimistic insertion, and cursor pagination operate bounded to the conversation.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/composables/useMessagesState.test.ts`
Expected: FAIL (`channel_id` vs `conversation_id` mismatch).

- [ ] **Step 3: Update `app/composables/useMessagesState.ts`**

Update properties and methods in `createMessagesStore` to replace `channel_id` references with `conversation_id`, preserving optimistic UI (`sending`, `sent`, `failed`), idempotent dedup by `(id, client_id)`, and composite cursor pagination.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useMessagesState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add app/composables/useMessagesState.ts tests/composables/useMessagesState.test.ts
git commit -m "refactor: update messages store for conversation-based state"
```

---

### Task 4: Chat Room Composable Contacts & Conversations State

**Files:**
- Modify: `app/composables/useChatRoom.ts`
- Modify: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: Supabase client, `useAuthProfile`, `useE2ee`.
- Produces: `conversations`, `activeConversationId`, `contacts`, `findUserByEmail`, `addContact`, `removeContact`, `openOrCreateDirectChat`, `createGroup`, `addMemberToGroup`, `leaveGroup`, `sendMessage` (E2EE bound to `conversation_id`).

- [ ] **Step 1: Write unit test in `tests/composables/useChatRoom.test.ts` for contact discovery and direct/group conversations**

```typescript
describe('useChatRoom contacts and conversations', () => {
  it('finds user by email and adds to contacts', async () => {
    // Mock supabase select profiles and insert contacts
  })

  it('creates direct conversation idempotently', async () => {
    // Mock openOrCreateDirectChat
  })

  it('creates group conversation with participant list', async () => {
    // Mock createGroup
  })

  it('allows members to leave group', async () => {
    // Mock leaveGroup
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL.

- [ ] **Step 3: Refactor `app/composables/useChatRoom.ts`**

- Replace channels state with `conversations: ref<Conversation[]>([])`, `activeConversationId: ref<string | null>(null)`, and `contacts: ref<Contact[]>([])`.
- Implement `findUserByEmail(email: string)`.
- Implement `addContact(contactUserId: string)` and `removeContact(contactUserId: string)`.
- Implement `openOrCreateDirectChat(peerUserId: string)` with duplicate-pair handling.
- Implement `createGroup(title: string, memberUserIds: string[])`.
- Implement `addMemberToGroup(conversationId: string, email: string)`.
- Implement `leaveGroup(conversationId: string)`.
- Update `sendMessage`, `sendImages`, and decryption routines to pass `conversation_id` as Authenticated Additional Data (AAD) for AES-GCM-256.
- Update realtime postgres changes listener for `messages`, `conversations`, and `conversation_members`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat: implement contact management, group chats and conversation realtime in useChatRoom"
```

---

### Task 5: Contacts Modal & Address Book Component

**Files:**
- Create: `app/components/ContactsModal.vue`
- Create: `tests/components/ContactsModal.test.ts`

**Interfaces:**
- Props: `isOpen: boolean`, `contacts: Contact[]`, `onlineUserIds: string[]`, `currentUserId?: string`.
- Emits: `close`, `selectContact(userId: string)`, `addContactByEmail(email: string)`, `removeContact(userId: string)`.

- [ ] **Step 1: Write component test in `tests/components/ContactsModal.test.ts`**

Verify email search input displays search results, emits `addContactByEmail`, renders contacts list with presence badges, and emits `selectContact` when clicked.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/components/ContactsModal.test.ts`
Expected: FAIL (component does not exist).

- [ ] **Step 3: Implement `app/components/ContactsModal.vue`**

Build dialog with:
- Top search bar: "Find user by email...".
- Search result preview with avatar, display name, email, and "Add to Contacts" / "Message" button.
- Contact list: Alphabetical cards showing `UserAvatar` with live online dot, display name, email, "Message" button, and "Remove" trash icon.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/ContactsModal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add app/components/ContactsModal.vue tests/components/ContactsModal.test.ts
git commit -m "feat: add ContactsModal for email discovery and address book management"
```

---

### Task 6: Group Creation & Info Modals

**Files:**
- Create: `app/components/CreateGroupModal.vue`
- Create: `app/components/GroupInfoModal.vue`
- Create: `tests/components/GroupModals.test.ts`

**Interfaces:**
- `CreateGroupModal`: Props `isOpen: boolean`, `contacts: Contact[]`. Emits `close`, `create(payload: { title: string, memberUserIds: string[], invitedEmails: string[] })`.
- `GroupInfoModal`: Props `isOpen: boolean`, `conversation: Conversation | null`, `currentUserId?: string`, `onlineUserIds: string[]`. Emits `close`, `addMember(email: string)`, `leave(conversationId: string)`.

- [ ] **Step 1: Write component tests in `tests/components/GroupModals.test.ts`**

Test group creation form validation (title required, at least one member selected), contact chips toggling, and group info member list rendering + leave button.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/components/GroupModals.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `CreateGroupModal.vue` and `GroupInfoModal.vue`**

Implement `CreateGroupModal` with group title input, contact multiselect, email add-on-the-fly, chips list, and submit button.
Implement `GroupInfoModal` with member roster (avatars, roles, online dots), add member input, and leave group action.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/GroupModals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add app/components/CreateGroupModal.vue app/components/GroupInfoModal.vue tests/components/GroupModals.test.ts
git commit -m "feat: add CreateGroupModal and GroupInfoModal components"
```

---

### Task 7: Conversational Bubble Viewport (`MessageViewport.vue`)

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Modify: `tests/components/chatUi.test.ts`

**Interfaces:**
- Props: `messages: ChatMessage[]`, `conversationId?: string | null`, `isGroup?: boolean`, `peerName?: string`, `currentUserId?: string`, etc.
- Emits: `retry`, `dismiss`, `reply`, `edit`, `delete`, `toggleReaction`, `selectImage`.

- [ ] **Step 1: Update component test in `tests/components/chatUi.test.ts` to assert bubble classes and alignment**

Assert that:
- Sender messages render with `justify-end` and bubble class `bg-indigo-600` (or accent).
- Recipient messages render with `justify-start`, avatar, and in group chats render sender display name above first message of cluster.
- Delivery indicator (`✓✓` or sending clock) renders for sender messages.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `app/components/MessageViewport.vue`**

- Replace flat Slack rows with asymmetric flex containers:
  - Sender: `flex justify-end`, `bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl`, tailored corners (`rounded-br-sm`), delivery tick and time inside bubble.
  - Recipient: `flex justify-start items-end gap-2`, `bg-[var(--fp-surface-elevated)] border text-[var(--fp-text-primary)] rounded-2xl rounded-bl-sm`, avatar on bottom of cluster, sender display name above first bubble in groups.
- Cluster consecutive messages from same sender with `gap-1` spacing.
- Embed reply quotes, image grid, reaction pills, and hover action menu into bubble structure.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add app/components/MessageViewport.vue tests/components/chatUi.test.ts
git commit -m "feat: style MessageViewport with Telegram-style chat bubbles and alignment"
```

---

### Task 8: Unified Conversation Sidebar (`ChatSidebar.vue`)

**Files:**
- Modify: `app/components/ChatSidebar.vue`
- Modify: `tests/components/chatUi.test.ts`

**Interfaces:**
- Props: `conversations: Conversation[]`, `activeConversationId: string | null`, `unreadCounts: Record<string, number>`, `unreadMentions: Record<string, number>`, `onlineFriends: Profile[]`, `currentUser: Profile | null`, etc.
- Emits: `selectConversation`, `openContacts`, `openNewChat`, `openCreateGroup`, `openProfileSettings`, `toggleTheme`, `logout`.

- [ ] **Step 1: Update test in `tests/components/chatUi.test.ts` for unified conversations list**

Verify that sidebar lists direct and group conversations, displays live online dots for direct peers, renders unread pills, and emits `openContacts` and `openCreateGroup`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `app/components/ChatSidebar.vue`**

- Remove separate "Channels" and "Direct Messages" sections.
- Add search bar to filter conversations.
- Render unified list of conversation items (avatar, title, last snippet, timestamp, unread badge).
- Add top toolbar buttons for **Contacts (`Users` icon)**, **New Direct Chat**, and **New Group**.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add app/components/ChatSidebar.vue tests/components/chatUi.test.ts
git commit -m "feat: redesign ChatSidebar into unified conversation list with contacts trigger"
```

---

### Task 9: Page Integration, Legacy Channel Removal & Full Verification

**Files:**
- Modify: `app/pages/index.vue`
- Delete: `app/components/CreateChannelModal.vue`
- Delete: `app/components/StartDmModal.vue`
- Test: All tests (`npm test`)
- Build: Local build test (`npm run build`)

- [ ] **Step 1: Wire all new modals and conversation states in `app/pages/index.vue`**

- Wire `activeConversation`, `conversations`, `contacts`, `openOrCreateDirectChat`, `createGroup`, `addMemberToGroup`, `leaveGroup`.
- Replace `CreateChannelModal` and `StartDmModal` with `ContactsModal`, `CreateGroupModal`, and `GroupInfoModal`.
- Update stage header to show direct peer or group details with clickable info trigger.

- [ ] **Step 2: Remove obsolete components**

Delete `app/components/CreateChannelModal.vue` and `app/components/StartDmModal.vue`.

- [ ] **Step 3: Run all unit and component tests**

Run: `npm test`
Expected: All 14+ test suites pass with 0 failures.

- [ ] **Step 4: Run production build check**

Run: `npm run build`
Expected: Nuxt production build succeeds without TypeScript or bundling errors.

- [ ] **Step 5: Commit Task 9**

```bash
git add app/pages/index.vue app/components/ tests/
git rm -f app/components/CreateChannelModal.vue app/components/StartDmModal.vue
git commit -m "feat: complete page integration for direct contacts, group messaging and bubble UI"
```
