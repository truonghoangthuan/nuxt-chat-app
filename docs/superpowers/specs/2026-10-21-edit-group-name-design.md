# Edit Group Name Feature Design

## Overview
Allow any member of a group conversation to edit the group name directly from the Group Info modal. The change updates Supabase database, propagates immediately to other members via existing Realtime subscriptions, and updates local state optimistically.

## Context & Architecture
- **Supabase schema & RLS**:
  - `public.conversations` table contains `title text` with constraint `group_title_required` (`type = 'direct' or (type = 'group' and title is not null and char_length(trim(title)) > 0))`.
  - Existing RLS policy `Authenticated users can update accessible conversations` already authorizes any conversation member (`can_access_conversation(id)`) to update `conversations`.
  - Realtime publication `supabase_realtime` already includes `conversations`.
- **Realtime Sync**:
  - `useChatRoom.ts` already listens to `postgres_changes` on `conversations` with event `UPDATE` and patches the matching conversation in `conversations.value`.

## Component & Composable Changes

### 1. `app/composables/useChatRoom.ts`
Add method:
```typescript
async function updateGroupTitle(conversationId: string, title: string): Promise<{ error: string | null }>
```
- **Validation**:
  - Requires authenticated profile (`currentProfile`).
  - Conversation must exist in `conversations.value` and have `type === 'group'`.
  - `cleanTitle = title.trim()` must have length between 1 and 100 characters.
- **Optimistic update**:
  - Save previous title in memory for rollback.
  - Mutate `conversations.value` matching `conversationId` with new title and new `updated_at`.
- **Persistence**:
  - Call Supabase:
    ```typescript
    const { error } = await supabase
      .from('conversations')
      .update({ title: cleanTitle, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
    ```
  - If error, rollback `conversations.value` title to previous title and return `{ error: error.message }`.
  - If success, return `{ error: null }`.
- Export `updateGroupTitle` from `useChatRoom()`.

### 2. `app/components/GroupInfoModal.vue`
- **State**:
  - `isEditingTitle = ref(false)`
  - `editedTitle = ref('')`
  - `titleError = ref<string | null>(null)`
  - `isSavingTitle = ref(false)`
- **Emits**:
  - `(e: 'updateTitle', newTitle: string): Promise<boolean | void> | void`
- **Behavior**:
  - Clicking pencil icon button (`data-test="edit-title-btn"`):
    - Sets `isEditingTitle = true`, `editedTitle = groupTitle.value`, `titleError = null`.
    - Automatically focuses the input.
  - Cancel button / Escape key:
    - Sets `isEditingTitle = false`, `titleError = null`.
  - Submit / Save (Enter key or checkmark button `data-test="save-title-btn"`):
    - Validates `editedTitle.trim().length > 0 && editedTitle.trim().length <= 100`.
    - If valid, sets `isSavingTitle = true`, emits `updateTitle`, resets `isEditingTitle = false` on success.
    - If empty, displays `titleError = 'Group name cannot be empty.'`.
    - If > 100 characters, displays `titleError = 'Group name must be 100 characters or less.'`.
  - When `isOpen` switches to `false` or conversation changes, reset editing state.

### 3. `app/pages/index.vue`
- Bind `@update-title="handleUpdateGroupTitle"` on `<GroupInfoModal>`.
- `handleUpdateGroupTitle(newTitle: string)`:
  - Invokes `await updateGroupTitle(activeConversationId.value, newTitle)`.

## Testing Plan
- **Unit Tests (`tests/composables/useChatRoom.test.ts`)**:
  - Test `updateGroupTitle`:
    - Validates empty title and rejects with error.
    - Successfully updates group title in Supabase and local `conversations.value`.
    - Rolls back title if Supabase returns an error.
- **Component Tests (`tests/components/GroupModals.test.ts`)**:
  - Test `GroupInfoModal.vue`:
    - Renders edit title button (`data-test="edit-title-btn"`).
    - Clicking edit button displays title input and save/cancel buttons.
    - Canceling resets back to static title.
    - Submitting valid title emits `updateTitle` with trimmed text.
    - Submitting whitespace or empty title displays validation error without emitting.
