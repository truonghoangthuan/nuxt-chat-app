# Design Spec: Direct Contacts, Group Messaging & Bubble Chat UI

- **Date:** 2026-10-21
- **Status:** Approved
- **Author:** Antigravity & User

---

## 1. Overview & Product Requirements

This specification transitions `nuxt-chat-app` from a Slack-style public channels application to a modern personal messaging platform modeled after **Telegram, iMessage, Facebook Messenger, and Microsoft Teams**.

### Core Goals:
1. **Remove Public Channels:** Eliminate separate public channels (`#general`, `#random`, custom slug channels) entirely.
2. **Contact Discovery & Address Book:** Users discover each other by email address, add contacts directly to their personal address book, and initiate 1-on-1 direct conversations immediately.
3. **Group Messaging by Email:** Users can create named group conversations by selecting existing contacts or typing any registered user's email address. Any group member can view the roster, add more members by email, or leave the group.
4. **Conversational Bubble UI:** Modern asymmetrical chat bubble layout in the message stage:
   - **Sender (You):** Right-aligned indigo bubbles (`bg-indigo-600 dark:bg-indigo-500 text-white`) with grouped corners, inline timestamp, and delivery status ticks (`Sending...` / `✓✓` / `Failed`).
   - **Others:** Left-aligned surface cards (`bg-[var(--fp-surface-elevated)] border border-[var(--fp-border)]`) with sender avatars pinned to the cluster bottom, distinct sender name headers in group chats, and inline timestamps.
   - **Clustering:** Consecutive messages sent within 5 minutes are grouped tightly (`gap-1`) with rounded bubble corners conforming to Telegram/Messenger aesthetics.
5. **Preserve End-to-End Encryption (E2EE):** Retain client-side AES-GCM-256 message encryption, PBKDF2 passphrase unlocking, and Postgres envelope enforcement (`e2ee:v1:...`), binding `conversation_id` as Authenticated Additional Data (AAD).

---

## 2. Database Schema (`supabase/schema.sql`)

A clean schema reset replaces legacy channel structures with unified conversations, members, and contacts.

### 2.1 Profiles Table & Email Sync
```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_color text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));
```
* **Trigger `handle_new_user()`:** Copies `new.email`, extracts default display name and avatar color on user registration, and updates on conflict.
* **RLS Policies:** Authenticated users can view all profiles (to search contacts and render avatars) and update only their own profile row.

### 2.2 Contacts Table (Personal Address Book)
```sql
create table if not exists public.contacts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_user_id),
  constraint contacts_no_self_check check (user_id <> contact_user_id)
);

create index if not exists contacts_user_idx on public.contacts (user_id);
```
* **RLS Policies:**
  - `select`: `auth.uid() = user_id`
  - `insert`: `auth.uid() = user_id`
  - `delete`: `auth.uid() = user_id`

### 2.3 Conversations & Members Table
```sql
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_title_required check (type = 'direct' or (type = 'group' and title is not null and char_length(trim(title)) > 0))
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conv_members_user_idx on public.conversation_members (user_id);
```
* **Direct Pair Determinism:** For 1-on-1 chats, duplicate conversation creation is prevented by checking existing pairs before insert and handling race conditions idempotently.
* **Access Helper Function:**
```sql
create or replace function public.can_access_conversation(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = cid
      and cm.user_id = auth.uid()
  );
$$;
```
* **RLS Policies:**
  - `conversations`: Select allowed if `can_access_conversation(id)`. Insert allowed for authenticated users.
  - `conversation_members`: Select allowed if `can_access_conversation(conversation_id)`. Insert allowed if `can_access_conversation(conversation_id)` or user is conversation creator. Delete allowed for self (leaving group).

### 2.4 Messages, Reactions & Reads
```sql
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 24000),
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conv_cursor_idx
  on public.messages (conversation_id, created_at desc, id desc);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create table if not exists public.conversation_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
```
* **RLS Policies:**
  - View, insert, and update on `messages`, `message_reactions`, and `conversation_reads` are guarded by `can_access_conversation(conversation_id)`.
* **Triggers:**
  - `enforce_message_e2ee_envelope()` continues to reject inserts/updates where `content not like 'e2ee:v1:%'`.
* **Realtime Publication:**
  - `supabase_realtime` publishes `conversations`, `conversation_members`, `messages`, `message_reactions`, `profiles`.
* **Storage Bucket:**
  - `message-attachments` policies use `conversations/<conversation_id>/...` and enforce `can_access_conversation()`.

---

## 3. Domain Model & Types (`app/types/chat.ts`)

```typescript
export type ConversationType = 'direct' | 'group'

export interface ConversationMember {
  conversation_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  profile?: Profile | null
}

export interface Conversation {
  id: string
  type: ConversationType
  title: string | null
  created_by: string | null
  created_at: string
  updated_at?: string
  members?: ConversationMember[]
  peer?: Profile | null            // For direct conversations
  lastMessage?: ChatMessage | null  // For sidebar snippet
  unreadCount?: number
}

export interface Contact {
  user_id: string
  contact_user_id: string
  created_at: string
  profile: Profile
}

export interface ChatMessage {
  id: string
  client_id: string
  conversation_id: string
  user_id: string
  content: string
  created_at: string
  status: MessageStatus
  author?: Profile
  reply_to_id?: string | null
  reply_to?: ReplyTarget | null
  edited_at?: string | null
  deleted_at?: string | null
  reactions?: MessageReaction[]
  encryption?: MessageEncryptionState
}

export interface TimelineMessageItem {
  message: ChatMessage
  showDateDivider: boolean
  dateLabel: string
  isSender: boolean
  isFirstInGroup: boolean
  isLastInGroup: boolean
  showSenderHeader: boolean
  showUnreadDivider?: boolean
}
```

---

## 4. User Interaction Flows & Components

### 4.1 Unified Sidebar (`ChatSidebar.vue`)
* Replaces the old Channels/DMs sections with a **single unified conversations list**.
* **Header Bar:**
  - App brand & user avatar with presence indicator.
  - Quick action buttons:
    - **Contacts (`Users` icon):** Opens `ContactsModal`.
    - **New Chat (`Plus` icon):** Dropdown/modal with options: *"New Direct Message"* or *"New Group Chat"*.
    - **Theme Toggle & Profile Settings:** Ghost buttons in the header or bottom rail.
* **Search Input:** Filters existing conversations by title, peer name, or recent messages.
* **Conversation List Items:**
  - **Direct Conversation:** Displays peer's `UserAvatar` with live online dot, peer display name, last message snippet, relative time, and unread pill.
  - **Group Conversation:** Displays group initials avatar or group badge, group title, `X members` or last sender snippet (*"Sarah: Let's do it"*), relative time, and unread pill.

### 4.2 Contact Management Modal (`ContactsModal.vue`)
* **Search & Discovery:**
  - Input field to search registered users by email address.
  - Shows result card with avatar, name, and email:
    - If already in contacts: shows *"In Contacts"* pill and a *"Message"* button.
    - If not yet added: displays an *"Add Contact"* button.
* **Contact Directory:**
  - Lists all saved contacts alphabetically with online/offline presence status.
  - Clicking any contact immediately triggers `openOrCreateDirectChat(contact.id)`.
  - Delete icon to remove a contact from your address book.

### 4.3 Group Creation & Management
* **`CreateGroupModal.vue`:**
  - Field: Group Title (e.g. *"Design Sprint"*).
  - Field: Add members by selecting from saved contacts or typing registered emails.
  - Selected members appear as removable chips.
  - *"Create Group"* button invokes `createGroup(title, memberUserIds)`.
* **`GroupInfoModal.vue`:**
  - Clickable from stage header.
  - Shows full member roster with avatars, roles (`Owner` vs `Member`), and online status.
  - *"Add Member"* form to invite additional users by email.
  - *"Leave Group"* button with confirmation.

### 4.4 Bubble Chat Viewport (`MessageViewport.vue`)
* **Right-Aligned Sender Bubbles:**
  - Container: `flex justify-end`
  - Style: `bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl`
  - Corner tailoring: `rounded-br-sm` on the last bubble of a cluster; `rounded-r-md` on middle bubbles.
  - Status & time inside bubble: Translucent timestamp with `Sending...`, double check `✓✓`, or failed retry badge.
  - Action menu: Hover bar positioned on the left side of the bubble.
* **Left-Aligned Recipient Bubbles:**
  - Container: `flex justify-start items-end gap-2`
  - Avatar: `UserAvatar` shown at the bottom of the cluster.
  - Group Header: Sender name in subtle colored font above the first message of the cluster (omitted in 1-on-1s).
  - Style: `bg-[var(--fp-surface-elevated)] border border-[var(--fp-border)] text-[var(--fp-text-primary)] rounded-2xl` with `rounded-bl-sm` on bottom bubble.
  - Action menu: Hover bar positioned on the right side of the bubble.
* **Replies, Reactions & Attachments:**
  - Reply banners inside the bubble with quote lines.
  - Encrypted image grids fit neatly inside bubble boundaries.
  - Reaction summary pills attach smoothly to the bottom corner of the bubble.

---

## 5. Composable Architecture (`useChatRoom.ts`)

Central orchestrator refactored to handle conversations and contacts:

```typescript
export function useChatRoom() {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const activeConversation = computed<Conversation | null>(() => ...)
  const contacts = ref<Contact[]>([])

  // Contact actions
  async function findUserByEmail(email: string): Promise<Profile | null>
  async function addContact(contactUserId: string): Promise<void>
  async function removeContact(contactUserId: string): Promise<void>
  async function loadContacts(): Promise<void>

  // Conversation actions
  async function selectConversation(conversationId: string): Promise<void>
  async function openOrCreateDirectChat(peerUserId: string): Promise<Conversation>
  async function createGroup(title: string, memberUserIds: string[]): Promise<Conversation>
  async function addMemberToGroup(conversationId: string, email: string): Promise<void>
  async function leaveGroup(conversationId: string): Promise<void>

  // Messaging actions (E2EE bound to conversation_id)
  async function sendMessage(content: string, replyToId?: string | null): Promise<void>
  async function sendImages(files: File[]): Promise<void>
  async function retryMessage(clientId: string): Promise<void>
  async function editMessage(messageId: string, newContent: string): Promise<void>
  async function deleteMessage(messageId: string): Promise<void>
  async function toggleReaction(messageId: string, emoji: string): Promise<void>
}
```

### Invariants:
1. **Conversation Isolation:** Rapid switching checks `if (activeConversationId.value !== id) return` after awaiting queries.
2. **E2EE AAD Binding:** `encryptMessageRow(msg, key, conversationId)` binds `conversation_id` as Authenticated Additional Data to prevent ciphertext replay across conversations.
3. **Optimistic Retries:** `clientId` reuse on retry with `isDuplicateKeyError` reconciliation.

---

## 6. Testing & Verification Plan

1. **Pure Utilities (`tests/utils/chat.test.ts`):**
   - Test email validation and normalization.
   - Test timeline bubble grouping: `isSender`, `isFirstInGroup`, `isLastInGroup`, `showSenderHeader`.
2. **Messages Store (`tests/composables/useMessagesState.test.ts`):**
   - Test optimistic messages, deduplication, and cursor pagination bounded to `conversation_id`.
3. **Chat Room Composable (`tests/composables/useChatRoom.test.ts`):**
   - Test direct conversation deduplication and creation.
   - Test group conversation creation with participant list.
   - Test adding contact by email and leaving groups.
4. **UI Components (`tests/components/chatUi.test.ts`):**
   - Verify `MessageViewport.vue` renders sender messages on the right side (`justify-end`) with indigo bubble class.
   - Verify recipient messages render on the left side (`justify-start`) with avatars and group sender headers.
   - Verify `ChatSidebar.vue` renders unified conversation items and triggers modals.
5. **Quality Gate:** Run `npm test` and verify that all test suites pass with 0 failures.
