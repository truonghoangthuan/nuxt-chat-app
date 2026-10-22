# Chat UX Enhancements Design Specification

## Overview & User Intent

Users requested five key UX improvements to the chat experience:
1. **Hover-Based Message Reactions:** Eliminate the 3-dots button on messages. Show the reaction emoji toolbar directly when hovering over a message (and toggle on tap for touch devices without hover).
2. **External Timestamp Placement:** Move message timestamps outside the chat bubble to reduce clutter. Place timestamps to the right of incoming messages (small, muted) and to the left of outgoing messages (symmetrical, with delivery status `✓✓` / sending indicator).
3. **User Profile View Modal:** Clicking on any user's avatar or display name in the chat displays a modal with their avatar, display name, email (with copy option), user ID, and an action button to initiate a direct message.
4. **Auto-Focus on Reply:** When clicking "Reply" on any message, automatically transfer focus to the message input composer textarea.
5. **Scroll-to-Bottom Button:** Provide an intuitive floating "scroll to bottom" button whenever the user has scrolled up away from the bottom of the message viewport.

## Requirements & Scope

### 1. Hover-Based Message Action Toolbar
- **Removal of 3-dots Trigger:** Remove `<MessageActionsMenu>` (the 3-dots `...` dropdown) from `MessageViewport.vue`.
- **Hover Toolbar Display:** The message action toolbar containing emojis (`👍`, `❤️`, `😂`, `🎉`, `🔥`, `😮`, `😢`, `👀`), Pin/Unpin, Reply, and author actions (Edit, Delete) appears on message hover (`group-hover:opacity-100 transition-opacity`).
- **Responsive & Touch Support:** Remove `hidden md:flex` restriction so the toolbar operates across all screen sizes. On touch devices (`@media (hover: none)`), tapping/focusing a message bubble reveals the toolbar via `active:opacity-100 focus-within:opacity-100`.

### 2. External Timestamp & Delivery Indicator Placement
- **Incoming Messages:**
  - Placed outside the bubble, aligned to the bottom right of the message bubble (`self-end mb-1 ml-2`).
  - Styled small with monospace font: `text-[10.5px] font-mono text-[var(--ap-text-muted)] select-none`.
- **Outgoing (Sender) Messages:**
  - Placed outside the bubble, aligned to the bottom left of the sender message bubble (`self-end mb-1 mr-2`).
  - Displays formatted timestamp (`formatTime(message.created_at)`) and delivery status (`✓✓` or animated sending spinner) outside the blue sender bubble.
- **Bubble Interior:**
  - Cleaned up: only quoted reply previews, image grid / code / text content, and `(edited)` / legacy encryption badges reside inside the bubble.

### 3. User Profile Modal (`UserProfileModal.vue`)
- **Trigger Points in `MessageViewport.vue`:**
  - Recipient avatar: clicking emits `viewProfile` with the author `Profile`.
  - Group sender header name: clicking emits `viewProfile` with the author `Profile`.
  - Visual affordance: `cursor-pointer hover:opacity-80 transition-opacity` and hover underline on author name.
- **Modal Component (`UserProfileModal.vue`):**
  - Renders when `isOpen` is true and `profile` is provided.
  - Shows:
    - Large `UserAvatar` (size `lg` or `xl`, 64px) with avatar color or photo.
    - Display name with `@` handle.
    - Email address with a one-click copy button.
    - User UUID with a one-click copy button.
    - Online / Offline badge status (via prop `isOnline`).
    - "Send Direct Message" button (if not own profile).
  - Emits:
    - `close`
    - `startDm(userId: string)`

### 4. Reply Auto-Focus
- **`MessageComposer.vue` Behavior:**
  - Add watcher on `props.replyingTo`.
  - When `replyingTo` changes to a non-null message, trigger `nextTick(() => textareaRef.value?.focus())`.
  - Ensures the cursor is immediately ready for typing without an extra mouse click.

### 5. Scroll-to-Bottom Floating Button
- **`MessageViewport.vue` Behavior:**
  - Render button whenever `!isNearBottom` (scrolled up > 120px from bottom).
  - When `unreadNewCount > 0`: Display existing pill `↓ {{ unreadNewCount }} new message(s)`.
  - When `unreadNewCount === 0`: Display a sleek, frosted floating circular button with a down chevron icon (`ChevronDown` from `@lucide/vue`) and `data-test="scroll-to-bottom"`.
  - Clicking triggers smooth scroll: `scrollToBottom(true)`.

## Non-Goals & Boundaries
- Retain existing message deduplication, cursor pagination, and end-to-end encryption.
- Maintain existing test assertions on functional `data-test` hooks (`delivery-indicator-*`, `reply-quote-*`, `scroll-to-bottom`).
