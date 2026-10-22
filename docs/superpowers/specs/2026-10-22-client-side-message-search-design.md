# Client-Side Decrypted Message Search & User Profile Dialog Design Specification

## Overview

Messages in `nuxt-chat-app` are stored end-to-end encrypted (AES-GCM-256) in Postgres. The server cannot perform `LIKE` queries or full-text indexing without access to the encryption key. Therefore, search across message text must happen entirely on the client after messages are decrypted in memory.

In addition, member profiles can be viewed in a dedicated `UserProfileModal` dialog. This specification covers both the client-side search feature and the enhancement to make member avatars in the user profile dialog significantly larger, ensuring member avatars and names across headers, rosters, and chat views reliably open this profile modal.

---

## 1. Core Search Logic (`app/utils/chat.ts`)

### 1.1 In-Memory Message Filter

```typescript
export function filterMessagesByKeyword(
  messages: ChatMessage[],
  query: string,
): ChatMessage[]
```

**Filtering Rules:**
1. If `query.trim()` is empty, return an empty array `[]`.
2. Normalize query to lowercase: `const normalized = query.trim().toLowerCase()`.
3. Filter `messages`:
   - Skip messages with `deleted_at` set.
   - Skip messages with `encryption === 'undecryptable'`.
   - If message is an image payload (`isImagePayload(message.content)`):
     - Extract caption via `parseImagePayload(message.content)?.caption`.
     - Match if `caption?.toLowerCase().includes(normalized)`.
   - Otherwise (standard text message):
     - Match if `message.content.toLowerCase().includes(normalized)`.
4. Return array of matched `ChatMessage` objects in chronological order (matching the loaded array order).

### 1.2 Keyword Text Segmentation

```typescript
export interface HighlightSegment {
  text: string
  isMatch: boolean
}

export function highlightTextSegments(
  text: string,
  query: string,
): HighlightSegment[]
```

**Segmentation Rules:**
1. If `!query?.trim()` or `!text`, return `[{ text, isMatch: false }]`.
2. Escape regex characters in `query.trim()`: `const escaped = escapeRegExp(query.trim())`.
3. Split text by regex `new RegExp(`(${escaped})`, 'gi')`.
4. Return segments mapping non-empty split parts to `{ text: part, isMatch: part.toLowerCase() === query.trim().toLowerCase() }`.

---

## 2. Viewport Highlighting & Auto-Scroll (`app/components/MessageViewport.vue`)

### 2.1 Jump to Message Method
Expose `jumpToMessage(messageId: string): void` via `defineExpose`:
- Locate the DOM element via `document.getElementById('message-' + messageId)` or query selector `[data-message-id="${messageId}"]`.
- Trigger smooth scroll: `el.scrollIntoView({ behavior: 'smooth', block: 'center' })`.
- Set `highlightedMessageId.value = messageId`.
- Set a 2500ms timeout to clear `highlightedMessageId` if it has not changed.
- Existing `jumpToPinnedMessage` refactored to delegate to `jumpToMessage`.

### 2.2 Search Query Prop & Keyword Highlighting
- Add prop `searchQuery?: string` (default: `''`).
- Inside the text message rendering block (and image caption rendering block):
  - For normal text segments (`!seg.isMention && !seg.isLink && !seg.isCode`), pass text through `highlightTextSegments(seg.text, searchQuery)`.
  - Matched chunks (`chunk.isMatch`) are rendered in `<mark class="bg-amber-400/40 dark:bg-amber-400/50 text-inherit rounded-xs px-0.5">`.
  - Non-matching chunks are rendered as plain text.

---

## 3. In-Header Search Bar & UX (`app/pages/index.vue` and `app/components/MessageSearchBar.vue`)

### 3.1 Trigger & Shortcuts
- A `Search` icon button in the header toolbar (`data-test="open-search-btn"`).
- Global keyboard shortcut: `Cmd+F` (Mac) or `Ctrl+F` (Windows/Linux) when chat workspace is mounted toggles search bar open and focuses input.
- `Escape` key closes the search bar and clears the active query.

### 3.2 Search Controls & State
- State in `index.vue` and `MessageSearchBar.vue`:
  - `isSearchOpen = ref(false)`
  - `searchQuery = ref('')`
  - `searchActiveIndex = ref(0)`
- Matched messages computed:
  ```typescript
  const searchResults = computed(() =>
    filterMessagesByKeyword(messages.value, searchQuery.value)
  )
  ```
- Match counter displayed:
  - Empty query: counter hidden.
  - Matches > 0: `"${searchActiveIndex + 1} of ${searchResults.length}"`.
  - Matches === 0: `"No results"`.
- Navigation controls:
  - Prev button (`↑` / `ChevronUp`, `data-test="search-prev-btn"`): moves index to `(index - 1 + length) % length` and calls `jumpToMessage`.
  - Next button (`↓` / `ChevronDown`, `data-test="search-next-btn"`): moves index to `(index + 1) % length` and calls `jumpToMessage`.
  - Enter in search input jumps to next match; Shift+Enter jumps to prev match.
  - Close button (`✕` / `X`, `data-test="search-close-btn"`): closes bar, resets query and active index.

---

## 4. User Profile Dialog Avatar Size & Trigger Enhancements

### 4.1 Enlarged Avatar in `UserProfileModal.vue` & `UserAvatar.vue`
- Update `UserAvatar.vue`:
  - Extend `size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'`
  - Support `xl`: `w-16 h-16 rounded-[16px] text-xl` (64px) with dot `w-3.5 h-3.5`
  - Support `2xl`: `w-20 h-20 rounded-[20px] text-2xl` (80px) with dot `w-4 h-4`
- Update `UserProfileModal.vue`:
  - Upgrade modal avatar from `size="lg"` (44px) to `size="2xl"` (80px).
  - Add frosted iridescent border ring `ring-4 ring-black/5 dark:ring-white/10 shadow-xl`.

### 4.2 Member Profile Modal Triggers
- Ensure clicking on member avatar or name triggers `UserProfileModal`:
  1. **Message Viewport:**
     - In group / DM chat messages: recipient avatar click and group sender header click emit `viewProfile`.
  2. **Direct Chat Header (`index.vue`):**
     - Clicking the peer avatar or name in header triggers `handleViewProfile(activeConversation.peer)`.
  3. **Group Members Roster (`GroupInfoModal.vue`):**
     - Clicking a member avatar or name in the members roster emits `viewProfile(member.profile)` to open `UserProfileModal`.

---

## 5. Testing Strategy

1. **Unit Tests (`tests/utils/chat.test.ts`):**
   - Test `filterMessagesByKeyword` with:
     - Empty query returns `[]`.
     - Substring match (case-insensitive).
     - Filtering out `deleted_at` messages.
     - Filtering out undecryptable messages.
     - Matching against image captions in image payloads.
   - Test `highlightTextSegments` with:
     - Empty query returns original text with `isMatch: false`.
     - Single and multiple matches with case preservation.
     - Regex special characters safely escaped.

2. **Component Tests (`tests/components/MessageViewportSearch.test.ts`, `tests/components/MessageSearchBar.test.ts`, `tests/components/UserProfileModal.test.ts`):**
   - Renders search toggle button in header.
   - Opening search reveals input field and navigation buttons.
   - Prev/Next buttons trigger jump to matching message.
   - Keyword highlighting renders `<mark>` tags in `MessageViewport`.
   - `UserAvatar` supports `xl` and `2xl` sizes.
   - `UserProfileModal` renders `size="2xl"` avatar.
   - Clicking member avatar or name in header and roster triggers profile modal.
