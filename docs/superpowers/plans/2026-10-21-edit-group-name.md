# Edit Group Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow group members to edit group conversation titles directly in the Group Info modal with optimistic UI updates and instant Supabase database persistence.

**Architecture:** Add `updateGroupTitle` composable function in `useChatRoom.ts` with optimistic local state update and rollback on failure. Add inline edit trigger and form to `GroupInfoModal.vue` emitting `updateTitle`. Wire the modal event in `index.vue` to update the active conversation.

**Tech Stack:** Vue 3, Nuxt 4, Supabase JS client, Tailwind CSS, Lucide icons, Vitest.

## Global Constraints
- Target table: `public.conversations` with column `title` and `updated_at`.
- Validation rule: Title must be between 1 and 100 characters when trimmed.
- RLS policy: Uses existing `Authenticated users can update accessible conversations` check.
- Realtime: Leverages existing `postgres_changes` listener for `conversations` table updates in `useChatRoom.ts`.

---

### Task 1: Add `updateGroupTitle` composable method and unit tests in `useChatRoom`

**Files:**
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `supabase.from('conversations').update({ title, updated_at }).eq('id', conversationId)`, `conversations.value`
- Produces: `updateGroupTitle(conversationId: string, title: string): Promise<{ error: string | null }>` exported from `useChatRoom()`

- [ ] **Step 1: Write failing unit tests in `tests/composables/useChatRoom.test.ts`**

Add tests for `updateGroupTitle`:
```typescript
  it('validates title and updates group title in state and database', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Original Title', ['u-bob'])

    // Empty title rejected
    const emptyRes = await room.updateGroupTitle(group.id, '   ')
    expect(emptyRes.error).toBe('Group title must be 1–100 characters.')

    // Valid title update
    const successRes = await room.updateGroupTitle(group.id, 'Renamed Team')
    expect(successRes.error).toBeNull()

    const updated = room.conversations.value.find(c => c.id === group.id)
    expect(updated?.title).toBe('Renamed Team')
  })

  it('rolls back title in state if database update fails', async () => {
    const room = useChatRoom()
    const group = await room.createGroup('Stable Group', ['u-bob'])

    mockConversationsUpdateError = { message: 'Database update rejected' }
    const res = await room.updateGroupTitle(group.id, 'Failing Rename')
    expect(res.error).toBe('Database update rejected')

    const current = room.conversations.value.find(c => c.id === group.id)
    expect(current?.title).toBe('Stable Group')
  })
```
Also update `mockConversationsDb` mock in `tests/composables/useChatRoom.test.ts` to support `.update()`:
```typescript
let mockConversationsUpdateError: { message: string } | null = null
```
Inside the `table === 'conversations'` mock:
```typescript
            update: vi.fn().mockImplementation((payload: any) => ({
              eq: vi.fn().mockImplementation((_col: string, val: string) => {
                if (mockConversationsUpdateError) {
                  return Promise.resolve({ error: mockConversationsUpdateError })
                }
                const conv = mockConversationsDb.find(c => c.id === val)
                if (conv) {
                  Object.assign(conv, payload)
                }
                return Promise.resolve({ error: null })
              }),
            })),
```
Reset `mockConversationsUpdateError = null` in `beforeEach`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL because `room.updateGroupTitle` is not a function.

- [ ] **Step 3: Implement `updateGroupTitle` in `app/composables/useChatRoom.ts`**

In `app/composables/useChatRoom.ts`:
```typescript
  async function updateGroupTitle(
    conversationId: string,
    title: string,
  ): Promise<{ error: string | null }> {
    const cleanTitle = title?.trim()
    if (!cleanTitle || cleanTitle.length > 100) {
      return { error: 'Group title must be 1–100 characters.' }
    }

    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv || targetConv.type !== 'group') {
      return { error: 'Group conversation not found.' }
    }

    const previousTitle = targetConv.title
    const nowIso = new Date().toISOString()

    // Optimistic update
    targetConv.title = cleanTitle
    targetConv.updated_at = nowIso

    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          title: cleanTitle,
          updated_at: nowIso,
        })
        .eq('id', conversationId)

      if (error) {
        // Rollback
        targetConv.title = previousTitle
        return { error: error.message || 'Failed to update group title.' }
      }

      return { error: null }
    } catch (err: any) {
      targetConv.title = previousTitle
      return { error: err?.message || 'Failed to update group title.' }
    }
  }
```
Add `updateGroupTitle` to the returned object of `useChatRoom`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "feat(chat): add updateGroupTitle to useChatRoom composable"
```

---

### Task 2: Implement inline title editing in `GroupInfoModal.vue` and component tests

**Files:**
- Modify: `app/components/GroupInfoModal.vue`
- Test: `tests/components/GroupModals.test.ts`

**Interfaces:**
- Consumes: `props.conversation.title`
- Produces: `emit('updateTitle', newTitle: string)`

- [ ] **Step 1: Write failing component tests in `tests/components/GroupModals.test.ts`**

Add tests for title editing in `GroupInfoModal.vue`:
```typescript
  it('renders edit button and toggles inline title input', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })

    const editBtn = wrapper.find('[data-test="edit-title-btn"]')
    expect(editBtn.exists()).toBe(true)

    // Not editing initially
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)

    // Click edit button -> input appears with current title
    await editBtn.trigger('click')
    const input = wrapper.find('[data-test="edit-title-input"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Secret Agents')

    // Click cancel button -> returns to static view
    const cancelBtn = wrapper.find('[data-test="cancel-edit-title-btn"]')
    await cancelBtn.trigger('click')
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="group-title"]').text()).toBe('Secret Agents')
  })

  it('validates title and emits updateTitle event when saved', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })

    await wrapper.find('[data-test="edit-title-btn"]').trigger('click')
    const input = wrapper.find('[data-test="edit-title-input"]')
    const form = wrapper.find('[data-test="edit-title-form"]')

    // Empty title
    await input.setValue('   ')
    await form.trigger('submit')
    expect(wrapper.emitted('updateTitle')).toBeUndefined()
    expect(wrapper.find('[data-test="title-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="title-error"]').text()).toContain('Group name cannot be empty.')

    // Valid title
    await input.setValue('Delta Squad')
    await form.trigger('submit')
    expect(wrapper.emitted('updateTitle')).toHaveLength(1)
    expect(wrapper.emitted('updateTitle')![0]).toEqual(['Delta Squad'])
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/GroupModals.test.ts`
Expected: FAIL because `[data-test="edit-title-btn"]` is not found.

- [ ] **Step 3: Implement inline title edit in `app/components/GroupInfoModal.vue`**

Import `Pencil`, `Check`, `X` from `@lucide/vue`.
Update `emit`:
```typescript
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'addMember', email: string): void
  (e: 'leave', conversationId: string): void
  (e: 'updateTitle', newTitle: string): void
}>()
```
Add state and helpers:
```typescript
const isEditingTitle = ref(false)
const editedTitle = ref('')
const titleError = ref<string | null>(null)

function startEditTitle() {
  editedTitle.value = props.conversation?.title || ''
  titleError.value = null
  isEditingTitle.value = true
}

function cancelEditTitle() {
  isEditingTitle.value = false
  titleError.value = null
}

function handleSaveTitle() {
  const trimmed = editedTitle.value.trim()
  if (!trimmed) {
    titleError.value = 'Group name cannot be empty.'
    return
  }
  if (trimmed.length > 100) {
    titleError.value = 'Group name must be 100 characters or less.'
    return
  }
  titleError.value = null
  emit('updateTitle', trimmed)
  isEditingTitle.value = false
}
```
Reset `isEditingTitle.value = false` in `watch(() => props.isOpen)`.
In template header:
```vue
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[var(--fp-border)] flex items-center justify-between shrink-0">
        <div class="min-w-0 flex-1 mr-3">
          <!-- Static Title View -->
          <div v-if="!isEditingTitle" class="flex items-center gap-2">
            <h3 data-test="group-title" class="fp-font-display text-[16px] font-bold text-[var(--fp-text-primary)] truncate">
              {{ groupTitle }}
            </h3>
            <button
              type="button"
              data-test="edit-title-btn"
              aria-label="Edit group name"
              class="w-6 h-6 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] flex items-center justify-center cursor-pointer transition-colors shrink-0"
              @click="startEditTitle"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Edit Title Form -->
          <div v-else>
            <form data-test="edit-title-form" class="flex items-center gap-1.5" @submit.prevent="handleSaveTitle">
              <input
                v-model="editedTitle"
                data-test="edit-title-input"
                type="text"
                maxlength="100"
                class="flex-1 min-w-0 px-2.5 py-1 text-sm font-semibold rounded-[6px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] focus:outline-none focus:border-indigo-500"
                placeholder="Group name"
                autofocus
                @keydown.esc="cancelEditTitle"
              />
              <button
                type="submit"
                data-test="save-title-btn"
                aria-label="Save group name"
                class="w-7 h-7 rounded-[6px] bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <Check class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-test="cancel-edit-title-btn"
                aria-label="Cancel editing"
                class="w-7 h-7 rounded-[6px] border border-[var(--fp-border)] text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                @click="cancelEditTitle"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </form>
            <p v-if="titleError" data-test="title-error" class="text-xs text-rose-500 font-medium mt-1">
              {{ titleError }}
            </p>
          </div>

          <p data-test="member-count" class="text-xs text-[var(--fp-text-secondary)] mt-0.5">
            {{ memberCountText }}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] text-lg font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0"
          @click="handleClose"
        >
          ×
        </button>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/GroupModals.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add app/components/GroupInfoModal.vue tests/components/GroupModals.test.ts
git commit -m "feat(ui): add inline group name editing to GroupInfoModal"
```

---

### Task 3: Wire `updateTitle` in `index.vue` and update test mocks

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `updateGroupTitle` from `useChatRoom`
- Connects: `<GroupInfoModal @update-title="handleUpdateGroupTitle" />`

- [ ] **Step 1: Write failing test in `tests/components/indexPage.test.ts`**

Add test verifying `handleUpdateGroupTitle` passes through to `updateGroupTitle`:
```typescript
  it('calls updateGroupTitle when GroupInfoModal emits update-title', async () => {
    const wrapper = mount(IndexPage)
    await flushPromises()

    const modal = wrapper.findComponent({ name: 'GroupInfoModal' })
    expect(modal.exists()).toBe(true)

    mockChatRoomState.activeConversationId.value = 'conv-grp-1'
    await modal.vm.$emit('updateTitle', 'Renamed Group')

    expect(mockChatRoomState.updateGroupTitle).toHaveBeenCalledWith('conv-grp-1', 'Renamed Group')
  })
```
Add `updateGroupTitle: vi.fn().mockResolvedValue({ error: null })` to `mockChatRoomState` in `tests/components/indexPage.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/indexPage.test.ts`
Expected: FAIL because `GroupInfoModal` is not wired to call `updateGroupTitle`.

- [ ] **Step 3: Wire `updateGroupTitle` in `app/pages/index.vue`**

Destructure `updateGroupTitle` from `useChatRoom()` in `app/pages/index.vue`:
```typescript
const {
  ...
  updateGroupTitle,
} = useChatRoom()
```
Add handler function:
```typescript
async function handleUpdateGroupTitle(newTitle: string) {
  if (activeConversationId.value) {
    await updateGroupTitle(activeConversationId.value, newTitle)
  }
}
```
Bind event on `<GroupInfoModal>`:
```vue
    <!-- Group Info Modal -->
    <GroupInfoModal
      :is-open="isGroupInfoModalOpen"
      :conversation="activeConversation"
      :current-user-id="currentProfile?.id"
      :online-user-ids="onlineFriends.map(f => f.id)"
      @close="isGroupInfoModalOpen = false"
      @add-member="handleAddMember"
      @leave="handleLeaveGroup"
      @update-title="handleUpdateGroupTitle"
    />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/indexPage.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All test suites PASS (22+ files).

- [ ] **Step 6: Commit changes**

```bash
git add app/pages/index.vue tests/components/indexPage.test.ts
git commit -m "feat(pages): connect group title editing in index page"
```
