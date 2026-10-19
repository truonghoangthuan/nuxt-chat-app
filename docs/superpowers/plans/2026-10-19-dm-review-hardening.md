# Direct Messages Review Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 7 review findings from `/caveman-review` covering realtime channel isolation, floating promise rejections, schema RLS creation checks, composer mention caret positioning, and UI accessibility/lifecycle hygiene.

**Architecture:** Extract a testable `shouldProcessChannelMessage` guard in `useChatRoom.ts` to prevent unread leaks from unresolvable channels, attach `.catch()` handlers to floating realtime queries, enforce `created_by` ownership in `supabase/schema.sql`, calculate exact caret offsets in `MessageComposer.vue`, and bind native `disabled` and cleanup timers in Vue components.

**Tech Stack:** Nuxt 4, Vue 3, Supabase Postgres / Realtime, Vitest, `@vue/test-utils`

**Spec:** `docs/superpowers/specs/2026-10-19-direct-messages.md`

## Global Constraints

- Preserve all existing tests and pass `npm test` with 0 failures.
- Adhere to AGENTS.md invariant: multi-tab presence, RLS isolation, and optimistic UI client_id preservation.
- Keep composable state pure and SSR-safe.

## Review Focus

- Realtime message arrives for an inaccessible or unresolvable channel -> message is ignored and never alters unread state.
- Realtime profile fetch fails over network -> caught without unhandled promise rejection.
- Mention autocomplete inserted in middle of text -> caret placed immediately after `@Name ` rather than snapped to textarea end.
- StartDmModal unmounted while submission timeout is running -> timer cleared cleanly.
- Current user in online friends list -> button carries native `disabled` attribute preventing keyboard focus/activation.

---

### Task 1: Realtime message & channel safety in `useChatRoom.ts`

**Files:**
- Modify: `app/composables/useChatRoom.ts:540-570,680-700`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `canUserAccessChannel` from `~/utils/chat`
- Produces: `shouldProcessChannelMessage(channel: Channel | undefined | null, currentUserId?: string | null): boolean`

- [ ] **Step 1: Write the failing unit tests for `shouldProcessChannelMessage`**

In `tests/composables/useChatRoom.test.ts`:
```ts
it('shouldProcessChannelMessage returns false for null/undefined channel or unauthorized DM', () => {
  expect(shouldProcessChannelMessage(undefined, 'u-1')).toBe(false)
  expect(shouldProcessChannelMessage(null, 'u-1')).toBe(false)

  const unauthorizedDm = {
    id: 'dm-1',
    is_dm: true,
    dm_user_a: 'u-2',
    dm_user_b: 'u-3',
  } as Channel
  expect(shouldProcessChannelMessage(unauthorizedDm, 'u-1')).toBe(false)

  const authorizedDm = {
    id: 'dm-2',
    is_dm: true,
    dm_user_a: 'u-1',
    dm_user_b: 'u-2',
  } as Channel
  expect(shouldProcessChannelMessage(authorizedDm, 'u-1')).toBe(true)

  const publicChannel = {
    id: 'c-1',
    is_dm: false,
  } as Channel
  expect(shouldProcessChannelMessage(publicChannel, 'u-1')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: FAIL with `shouldProcessChannelMessage is not defined`

- [ ] **Step 3: Implement `shouldProcessChannelMessage` and guard in `app/composables/useChatRoom.ts`**

Export pure helper:
```ts
export function shouldProcessChannelMessage(
  channel: Channel | undefined | null,
  currentUserId?: string | null,
): boolean {
  if (!channel) return false
  return canUserAccessChannel(channel, currentUserId)
}
```
Update realtime message subscription in `setupDbChangesSubscription`:
```ts
if (!shouldProcessChannelMessage(targetChannel, currentId)) {
  return
}
```
Add `.catch(() => {})` to floating promise on line 689:
```ts
supabase
  .from('profiles')
  .select('id, display_name, avatar_color')
  .eq('id', peerId)
  .single()
  .then(({ data: peerProfile }) => {
    if (peerProfile) {
      profilesCache.set(peerProfile.id, peerProfile as Profile)
      if (!allProfiles.value.some(p => p.id === peerProfile.id)) {
        allProfiles.value = [...allProfiles.value, peerProfile as Profile]
      }
    }
  })
  .catch(() => {})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(chat): guard unknown channel messages and catch realtime profile rejections"
```

---

### Task 2: DM schema RLS creation policy hardening in `supabase/schema.sql`

**Files:**
- Modify: `supabase/schema.sql:232-242`

**Interfaces:**
- Consumes: Postgres RLS `public.channels`
- Produces: Hardened insert policy checking `created_by` for DM channels

- [ ] **Step 1: Update channel insert RLS policy in `supabase/schema.sql`**

Update policy definition:
```sql
drop policy if exists "Authenticated users can create channels" on public.channels;
create policy "Authenticated users can create channels"
  on public.channels for insert
  to authenticated
  with check (
    (not is_dm and (auth.uid() = created_by or created_by is null))
    or (is_dm and (auth.uid() = dm_user_a or auth.uid() = dm_user_b) and (auth.uid() = created_by or created_by is null))
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "fix(schema): require created_by match auth user on DM channel creation"
```

---

### Task 3: Composer caret positioning in `app/components/MessageComposer.vue`

**Files:**
- Modify: `app/components/MessageComposer.vue:53-66`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `activeMention` reactive state, `applyMentionAutocomplete` from `~/utils/chat`
- Produces: Precise caret placement at end of inserted mention

- [ ] **Step 1: Write failing component test in `tests/components/chatUi.test.ts`**

```ts
it('MessageComposer sets selectionRange right after mention token when selected', async () => {
  const wrapper = mount(MessageComposer, {
    props: {
      channelSlug: 'general',
      knownProfiles: [{ id: 'u-2', display_name: 'Bob', avatar_color: '#0284c7' }],
    },
    attachTo: document.body,
  })
  const textarea = wrapper.find('textarea')
  const el = textarea.element as HTMLTextAreaElement
  el.value = 'Hello @Bo there'
  el.selectionStart = 9
  el.selectionEnd = 9
  await textarea.trigger('input')

  // Select mention
  await textarea.trigger('keydown', { key: 'Enter' })
  await wrapper.vm.$nextTick()

  expect(el.value).toBe('Hello @Bob  there')
  expect(el.selectionStart).toBe(11) // 'Hello @Bob ' length
  wrapper.unmount()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (selectionStart is not set to 11)

- [ ] **Step 3: Implement exact caret positioning in `selectMention`**

In `app/components/MessageComposer.vue`:
```ts
function selectMention(profile: Profile) {
  if (!activeMention.value) return
  const prefix = content.value.slice(0, activeMention.value.startIndex)
  const insertedToken = `@${profile.display_name} `
  const newCaretPos = prefix.length + insertedToken.length

  content.value = applyMentionAutocomplete(
    content.value,
    activeMention.value,
    profile.display_name,
  )
  cursorIndex.value = newCaretPos
  selectedMentionIndex.value = 0
  nextTick(() => {
    const el = textareaRef.value
    if (el) {
      el.focus()
      el.setSelectionRange(newCaretPos, newCaretPos)
    }
    autoResize()
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageComposer.vue tests/components/chatUi.test.ts
git commit -m "fix(composer): preserve caret position immediately following mention autocomplete"
```

---

### Task 4: Accessibility and timer cleanup in `StartDmModal.vue` and `ChatSidebar.vue`

**Files:**
- Modify: `app/components/StartDmModal.vue:69-76,98-104`
- Modify: `app/components/ChatSidebar.vue:214-225`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: Modal props/events, sidebar friend list
- Produces: `aria-label="Close"`, timer lifecycle cleanup, native `:disabled` on current user row

- [ ] **Step 1: Write failing component tests in `tests/components/chatUi.test.ts`**

```ts
it('StartDmModal close button has aria-label Close and clears submit timer on unmount', () => {
  const wrapper = mount(StartDmModal, {
    props: { isOpen: true, friends: [] },
  })
  const closeBtn = wrapper.find('button[aria-label="Close"]')
  expect(closeBtn.exists()).toBe(true)
  expect(closeBtn.text()).toBe('×')
  wrapper.unmount()
})

it('ChatSidebar disables button for self in online friends', () => {
  const wrapper = mount(ChatSidebar, {
    props: {
      channels: [],
      activeChannelId: null,
      unreadCounts: {},
      onlineFriends: [{ id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' }],
      currentUser: { id: 'u-1', display_name: 'Alice', avatar_color: '#0284c7' },
      isDark: false,
      connectionStatus: 'connected',
      isOpenMobile: false,
    },
  })
  const selfBtn = wrapper.find('[data-test="online-friend-u-1"]')
  expect(selfBtn.attributes('disabled')).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: FAIL (missing `aria-label` or `disabled` attribute)

- [ ] **Step 3: Implement fixes in `StartDmModal.vue` and `ChatSidebar.vue`**

In `app/components/StartDmModal.vue`:
Add `aria-label="Close"` to close button:
```vue
<button
  type="button"
  aria-label="Close"
  class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xl font-bold leading-none"
  @click="emit('close')"
>
  ×
</button>
```
Store and clean timeout:
```ts
let submitTimeout: ReturnType<typeof setTimeout> | null = null

function handleSelect(friendId: string) {
  if (isSubmitting.value) return
  isSubmitting.value = true
  emit('selectFriend', friendId)
  if (submitTimeout) clearTimeout(submitTimeout)
  submitTimeout = setTimeout(() => {
    isSubmitting.value = false
    submitTimeout = null
  }, 1000)
}

onUnmounted(() => {
  if (submitTimeout) {
    clearTimeout(submitTimeout)
    submitTimeout = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})
```

In `app/components/ChatSidebar.vue`:
Add `:disabled="Boolean(currentUser && friend.id === currentUser.id)"` to online friend button:
```vue
<button
  v-for="friend in onlineFriends"
  :key="friend.id"
  type="button"
  :data-test="`online-friend-${friend.id}`"
  :disabled="Boolean(currentUser && friend.id === currentUser.id)"
  class="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition-colors text-left"
  :class="currentUser && friend.id === currentUser.id ? 'cursor-default opacity-80' : 'cursor-pointer'"
  @click="onOnlineFriendClick(friend)"
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/StartDmModal.vue app/components/ChatSidebar.vue tests/components/chatUi.test.ts
git commit -m "fix(ui): add close aria-label, cleanup submit timer, and disable self online row"
```

---

### Task 5: Complete Verification Suite

**Files:**
- Test: all test suites under `tests/`

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: 6 passed test files, 65+ passed tests, 0 failures.

- [ ] **Step 2: Verify git status is clean**

Run: `git status --short`
Expected: Clean working tree.
