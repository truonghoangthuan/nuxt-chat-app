# Client-Side Decrypted Message Search & User Profile Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement client-side decrypted message search across active conversation messages with in-header search bar, match navigation, keyword `<mark>` highlighting, smooth jump-to-message with ring highlight, enlarged user profile dialog avatars, and click-to-view profile triggers across chat headers and rosters.

**Architecture:** A pure utility layer in `app/utils/chat.ts` filters decrypted messages and segments text for keyword highlighting. `MessageViewport.vue` exposes `jumpToMessage` and wraps matching substrings in `<mark>`. A dedicated `MessageSearchBar.vue` provides in-header search inputs, match counters, and next/prev controls, integrated into `app/pages/index.vue` with `Cmd+F` / `Ctrl+F` shortcuts. `UserAvatar.vue` adds `xl` and `2xl` sizing options, `UserProfileModal.vue` uses an enlarged 80px avatar, and member avatar/name clicks in header and group info modal trigger the profile modal.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Tailwind CSS, Lucide icons (`Search`, `ChevronUp`, `ChevronDown`, `X`), Vitest with `@vue/test-utils` and `happy-dom`.

## Global Constraints

- Never send plaintext message content or search queries to the Supabase server or database.
- Search must operate strictly in-memory on decrypted `ChatMessage` objects in the active store.
- Preserve all existing `MessageViewport.vue`, `UserProfileModal.vue`, and `index.vue` data-test attributes and component contracts.
- Maintain SSR and Vitest safety by guarding window/document references.

---

### Task 1: Core Search & Highlighting Pure Functions in `app/utils/chat.ts`

**Files:**
- Modify: `app/utils/chat.ts:175-185` (export `escapeRegExp`), `app/utils/chat.ts:400+` (append functions)
- Test: `tests/utils/chat.test.ts`

**Interfaces:**
- Consumes:
  - `ChatMessage` from `~/types/chat`
  - `isImagePayload`, `parseImagePayload` from `~/utils/image`
- Produces:
  - `export function filterMessagesByKeyword(messages: ChatMessage[], query: string): ChatMessage[]`
  - `export interface HighlightSegment { text: string; isMatch: boolean }`
  - `export function highlightTextSegments(text: string, query: string): HighlightSegment[]`

- [ ] **Step 1: Write the failing unit tests for search filtering and keyword segmentation**

In `tests/utils/chat.test.ts`, add test cases for `filterMessagesByKeyword` and `highlightTextSegments`:

```typescript
describe('filterMessagesByKeyword', () => {
  const baseMessage: ChatMessage = {
    id: 'm1',
    client_id: 'c1',
    conversation_id: 'conv1',
    user_id: 'u1',
    content: 'Hello world from Nuxt chat',
    created_at: '2026-10-22T10:00:00Z',
    status: 'sent',
  }

  it('returns empty array when query is blank or whitespace', () => {
    expect(filterMessagesByKeyword([baseMessage], '')).toEqual([])
    expect(filterMessagesByKeyword([baseMessage], '   ')).toEqual([])
  })

  it('matches messages case-insensitively by content substring', () => {
    const m2 = { ...baseMessage, id: 'm2', content: 'Another message about cats' }
    const results = filterMessagesByKeyword([baseMessage, m2], 'WORLD')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('m1')
  })

  it('skips deleted messages', () => {
    const deleted = { ...baseMessage, id: 'm2', deleted_at: '2026-10-22T10:05:00Z' }
    const results = filterMessagesByKeyword([deleted], 'world')
    expect(results).toHaveLength(0)
  })

  it('skips undecryptable messages', () => {
    const undecryptable = { ...baseMessage, id: 'm2', encryption: 'undecryptable' as const }
    const results = filterMessagesByKeyword([undecryptable], 'world')
    expect(results).toHaveLength(0)
  })

  it('matches image caption if message content is an image payload', () => {
    const imageMsg: ChatMessage = {
      ...baseMessage,
      id: 'm3',
      content: JSON.stringify({
        images: [{ path: 'p1', iv: 'iv1' }],
        caption: 'Sunset at the beach',
      }),
    }
    const results = filterMessagesByKeyword([imageMsg], 'beach')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('m3')
  })
})

describe('highlightTextSegments', () => {
  it('returns entire text with isMatch false if query is blank', () => {
    expect(highlightTextSegments('Hello world', '')).toEqual([
      { text: 'Hello world', isMatch: false },
    ])
  })

  it('splits text into matching and non-matching segments', () => {
    expect(highlightTextSegments('Hello world, what a world!', 'world')).toEqual([
      { text: 'Hello ', isMatch: false },
      { text: 'world', isMatch: true },
      { text: ', what a ', isMatch: false },
      { text: 'world', isMatch: true },
      { text: '!', isMatch: false },
    ])
  })

  it('safely handles regex special characters in query', () => {
    expect(highlightTextSegments('Price is $100.00 today', '$100.00')).toEqual([
      { text: 'Price is ', isMatch: false },
      { text: '$100.00', isMatch: true },
      { text: ' today', isMatch: false },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: FAIL with "filterMessagesByKeyword is not defined" or "highlightTextSegments is not defined".

- [ ] **Step 3: Implement `filterMessagesByKeyword` and `highlightTextSegments` in `app/utils/chat.ts`**

Export `escapeRegExp` and add the implementations in `app/utils/chat.ts`:

```typescript
import { isImagePayload, parseImagePayload } from '~/utils/image'

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface HighlightSegment {
  text: string
  isMatch: boolean
}

export function filterMessagesByKeyword(
  messages: ChatMessage[],
  query: string,
): ChatMessage[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return messages.filter((msg) => {
    if (msg.deleted_at || msg.encryption === 'undecryptable') {
      return false
    }

    if (isImagePayload(msg.content)) {
      const payload = parseImagePayload(msg.content)
      return Boolean(payload?.caption && payload.caption.toLowerCase().includes(q))
    }

    return msg.content.toLowerCase().includes(q)
  })
}

export function highlightTextSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const q = query.trim()
  if (!q || !text) {
    return [{ text, isMatch: false }]
  }

  const escaped = escapeRegExp(q)
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)

  return parts
    .filter(Boolean)
    .map((part) => ({
      text: part,
      isMatch: part.toLowerCase() === q.toLowerCase(),
    }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/chat.test.ts`
Expected: PASS with all tests green.

- [ ] **Step 5: Commit changes**

```bash
git add app/utils/chat.ts tests/utils/chat.test.ts
git commit -m "feat(utils): add filterMessagesByKeyword and highlightTextSegments"
```

---

### Task 2: Jump-to-Message Expose & Keyword Highlighting in `MessageViewport.vue`

**Files:**
- Modify: `app/components/MessageViewport.vue`
- Create: `tests/components/MessageViewportSearch.test.ts`

**Interfaces:**
- Consumes:
  - `highlightTextSegments` from `~/utils/chat`
  - Prop `searchQuery?: string`
- Produces:
  - `defineExpose({ jumpToMessage })`
  - `<mark>` tags around matched substrings in text bubbles and image captions

- [ ] **Step 1: Write component tests for `jumpToMessage` and keyword `<mark>` rendering**

Create `tests/components/MessageViewportSearch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageViewport from '~/components/MessageViewport.vue'
import type { ChatMessage } from '~/types/chat'

describe('MessageViewport search highlighting & jump', () => {
  const sampleMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      client_id: 'client-1',
      conversation_id: 'conv-1',
      user_id: 'user-1',
      content: 'Antigravity super secret message',
      created_at: '2026-10-22T10:00:00Z',
      status: 'sent',
    },
    {
      id: 'msg-2',
      client_id: 'client-2',
      conversation_id: 'conv-1',
      user_id: 'user-2',
      content: 'Another regular note here',
      created_at: '2026-10-22T10:01:00Z',
      status: 'sent',
    },
  ]

  it('highlights matching keywords with mark tags when searchQuery prop is provided', () => {
    const wrapper = mount(MessageViewport, {
      props: {
        messages: sampleMessages,
        currentUserId: 'user-1',
        searchQuery: 'secret',
      },
    })

    const marks = wrapper.findAll('mark')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks[0].text()).toBe('secret')
  })

  it('exposes jumpToMessage method which sets highlightedMessageId', async () => {
    const wrapper = mount(MessageViewport, {
      props: {
        messages: sampleMessages,
        currentUserId: 'user-1',
      },
      attachTo: document.body,
    })

    const vm = wrapper.vm as any
    expect(typeof vm.jumpToMessage).toBe('function')

    vm.jumpToMessage('msg-1')
    await wrapper.vm.$nextTick()

    const bubble = wrapper.find('[data-message-id="msg-1"] [data-test="message-bubble-msg-1"]')
    expect(bubble.classes()).toContain('ring-2')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/MessageViewportSearch.test.ts`
Expected: FAIL (searchQuery prop not rendering `<mark>`, vm.jumpToMessage undefined).

- [ ] **Step 3: Implement `jumpToMessage` and `<mark>` rendering in `MessageViewport.vue`**

In `app/components/MessageViewport.vue`:
1. Add `searchQuery?: string` to `defineProps<{ ... }>()` with default `''`.
2. Import `highlightTextSegments` from `~/utils/chat`.
3. Generalize `jumpToPinnedMessage` into `jumpToMessage`:
```typescript
function jumpToMessage(messageId: string) {
  const el = document.getElementById(`message-${messageId}`) || viewportRef.value?.querySelector(`[data-message-id="${messageId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightedMessageId.value = messageId
    setTimeout(() => {
      if (highlightedMessageId.value === messageId) {
        highlightedMessageId.value = null
      }
    }, 2500)
  }
}

function jumpToPinnedMessage(messageId: string) {
  jumpToMessage(messageId)
}

defineExpose({
  jumpToMessage,
})
```
4. In standard text message rendering and image caption rendering, replace:
```vue
<span v-else>{{ seg.text }}</span>
```
with:
```vue
<template v-else>
  <template v-if="searchQuery">
    <template v-for="(chunk, cIdx) in highlightTextSegments(seg.text, searchQuery)" :key="cIdx">
      <mark
        v-if="chunk.isMatch"
        class="bg-amber-400/40 dark:bg-amber-400/50 text-inherit rounded-xs px-0.5"
      >{{ chunk.text }}</mark>
      <span v-else>{{ chunk.text }}</span>
    </template>
  </template>
  <span v-else>{{ seg.text }}</span>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/MessageViewportSearch.test.ts`
Expected: PASS.
Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit changes**

```bash
git add app/components/MessageViewport.vue tests/components/MessageViewportSearch.test.ts
git commit -m "feat(viewport): expose jumpToMessage and support searchQuery keyword highlighting"
```

---

### Task 3: In-Header Search Bar Component & Integration in `app/pages/index.vue`

**Files:**
- Create: `app/components/MessageSearchBar.vue`
- Modify: `app/pages/index.vue`
- Create: `tests/components/MessageSearchBar.test.ts`

**Interfaces:**
- Consumes:
  - `ChatMessage` from `~/types/chat`
  - `filterMessagesByKeyword` from `~/utils/chat`
- Produces:
  - Header search toggle button (`data-test="open-search-btn"`)
  - Search input with auto-focus, result counter, prev/next navigation, and close button
  - `Cmd+F` / `Ctrl+F` and `Escape` keyboard shortcuts

- [ ] **Step 1: Write component tests for `MessageSearchBar.vue`**

Create `tests/components/MessageSearchBar.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageSearchBar from '~/components/MessageSearchBar.vue'
import type { ChatMessage } from '~/types/chat'

describe('MessageSearchBar', () => {
  const sampleMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      client_id: 'c-1',
      conversation_id: 'conv-1',
      user_id: 'u-1',
      content: 'Apples are delicious fruits',
      created_at: '2026-10-22T10:00:00Z',
      status: 'sent',
    },
    {
      id: 'msg-2',
      client_id: 'c-2',
      conversation_id: 'conv-1',
      user_id: 'u-2',
      content: 'Oranges and apples in a basket',
      created_at: '2026-10-22T10:01:00Z',
      status: 'sent',
    },
  ]

  it('renders input and updates counter as user types', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: '',
      },
    })

    const input = wrapper.find('[data-test="search-input"]')
    expect(input.exists()).toBe(true)

    await input.setValue('apples')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['apples'])

    await wrapper.setProps({ modelValue: 'apples' })
    const counter = wrapper.find('[data-test="search-count"]')
    expect(counter.text()).toContain('1 of 2')
  })

  it('cycles through results with next and prev buttons', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: 'apples',
      },
    })

    const nextBtn = wrapper.find('[data-test="search-next-btn"]')
    await nextBtn.trigger('click')

    expect(wrapper.emitted('jump')?.[0]).toEqual(['msg-2'])

    const prevBtn = wrapper.find('[data-test="search-prev-btn"]')
    await prevBtn.trigger('click')
    expect(wrapper.emitted('jump')?.[1]).toEqual(['msg-1'])
  })

  it('emits close on close button click and escape key', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: 'apples',
      },
    })

    const closeBtn = wrapper.find('[data-test="search-close-btn"]')
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()

    const input = wrapper.find('[data-test="search-input"]')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')?.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/MessageSearchBar.test.ts`
Expected: FAIL (file not found).

- [ ] **Step 3: Create `app/components/MessageSearchBar.vue`**

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ChatMessage } from '~/types/chat'
import { filterMessagesByKeyword } from '~/utils/chat'
import { Search, ChevronUp, ChevronDown, X } from '@lucide/vue'

const props = defineProps<{
  messages: ChatMessage[]
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'jump', messageId: string): void
  (e: 'close'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const currentIndex = ref(0)

const results = computed(() =>
  filterMessagesByKeyword(props.messages, props.modelValue)
)

watch(
  () => props.modelValue,
  () => {
    currentIndex.value = 0
    if (results.value.length > 0) {
      emit('jump', results.value[0].id)
    }
  },
)

function jumpNext() {
  if (results.value.length === 0) return
  currentIndex.value = (currentIndex.value + 1) % results.value.length
  emit('jump', results.value[currentIndex.value].id)
}

function jumpPrev() {
  if (results.value.length === 0) return
  currentIndex.value = (currentIndex.value - 1 + results.value.length) % results.value.length
  emit('jump', results.value[currentIndex.value].id)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) {
      jumpPrev()
    } else {
      jumpNext()
    }
  }
}

onMounted(() => {
  inputRef.value?.focus()
  if (results.value.length > 0) {
    emit('jump', results.value[0].id)
  }
})
</script>

<template>
  <div
    data-test="message-search-bar"
    class="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/90 dark:bg-white/10 backdrop-blur-xl border border-black/10 dark:border-white/15 shadow-sm text-xs"
  >
    <Search class="w-3.5 h-3.5 text-[var(--ap-text-muted)] shrink-0 ml-1" />
    <input
      ref="inputRef"
      :value="modelValue"
      type="text"
      placeholder="Search messages..."
      data-test="search-input"
      class="w-32 sm:w-48 bg-transparent text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus:outline-none text-xs"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown="handleKeydown"
    />

    <span
      v-if="modelValue.trim()"
      data-test="search-count"
      class="text-[11px] font-mono text-[var(--ap-text-muted)] shrink-0 px-1"
    >
      {{ results.length > 0 ? `${currentIndex + 1} of ${results.length}` : 'No results' }}
    </span>

    <button
      type="button"
      data-test="search-prev-btn"
      title="Previous result (Shift+Enter)"
      :disabled="results.length <= 1"
      class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] disabled:opacity-30 cursor-pointer"
      @click="jumpPrev"
    >
      <ChevronUp class="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      data-test="search-next-btn"
      title="Next result (Enter)"
      :disabled="results.length <= 1"
      class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-secondary)] disabled:opacity-30 cursor-pointer"
      @click="jumpNext"
    >
      <ChevronDown class="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      data-test="search-close-btn"
      title="Close search (Esc)"
      class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] cursor-pointer"
      @click="emit('close')"
    >
      <X class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
```

- [ ] **Step 4: Wire `MessageSearchBar` into `app/pages/index.vue`**

In `app/pages/index.vue`:
1. Import `MessageSearchBar` and `Search` icon.
2. Add search state:
```typescript
const isSearchOpen = ref(false)
const searchQuery = ref('')
const messageViewportRef = ref<{ jumpToMessage: (id: string) => void } | null>(null)

function handleToggleSearch() {
  isSearchOpen.value = !isSearchOpen.value
  if (!isSearchOpen.value) {
    searchQuery.value = ''
  }
}

function handleCloseSearch() {
  isSearchOpen.value = false
  searchQuery.value = ''
}

function handleJumpSearchResult(messageId: string) {
  messageViewportRef.value?.jumpToMessage(messageId)
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    isSearchOpen.value = true
  } else if (e.key === 'Escape' && isSearchOpen.value) {
    handleCloseSearch()
  }
}
```
3. Register `handleGlobalKeydown` in `onMounted` / `onUnmounted`.
4. In `<header class="h-14 ...">`, in header right:
```vue
<!-- Search Bar or Toggle Button -->
<MessageSearchBar
  v-if="isSearchOpen"
  :messages="messages"
  v-model="searchQuery"
  @jump="handleJumpSearchResult"
  @close="handleCloseSearch"
/>
<button
  v-else
  type="button"
  data-test="open-search-btn"
  title="Search messages (Cmd+F)"
  class="p-1.5 rounded-full bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-black/10 dark:border-white/10 text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] transition cursor-pointer"
  @click="handleToggleSearch"
>
  <Search class="w-4 h-4" />
</button>
```
5. Pass ref and search prop to `MessageViewport`:
```vue
<MessageViewport
  ref="messageViewportRef"
  :messages="messages"
  :search-query="searchQuery"
  ...
/>
```

- [ ] **Step 5: Run tests to verify all tests pass**

Run: `npx vitest run tests/components/MessageSearchBar.test.ts`
Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit changes**

```bash
git add app/components/MessageSearchBar.vue app/pages/index.vue tests/components/MessageSearchBar.test.ts
git commit -m "feat(search): add in-header MessageSearchBar with match cycling and shortcuts"
```

---

### Task 4: Enlarged Avatar in `UserProfileModal.vue` & Member Profile Triggers across Header & Roster

**Files:**
- Modify: `app/components/UserAvatar.vue`
- Modify: `app/components/UserProfileModal.vue`
- Modify: `app/components/GroupInfoModal.vue`
- Modify: `app/pages/index.vue`
- Modify: `tests/components/UserProfileModal.test.ts`
- Modify: `tests/components/GroupModals.test.ts`

**Interfaces:**
- Consumes:
  - `Profile` from `~/types/chat`
  - `UserAvatar` size options
- Produces:
  - `size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'` in `UserAvatar.vue`
  - 80px enlarged avatar in `UserProfileModal.vue` (`size="2xl"`)
  - Clickable avatar and name in direct chat header (`index.vue`) opening `UserProfileModal`
  - Clickable member avatar and name in `GroupInfoModal.vue` emitting `viewProfile` to open `UserProfileModal`

- [ ] **Step 1: Write/update tests for enlarged avatar and roster click-to-profile**

In `tests/components/UserProfileModal.test.ts`, update assertions to verify `size="2xl"` avatar is rendered:

```typescript
it('renders enlarged 2xl avatar in user profile modal', () => {
  const wrapper = mount(UserProfileModal, {
    props: {
      isOpen: true,
      profile: sampleProfile,
    },
  })

  const avatar = wrapper.findComponent({ name: 'UserAvatar' })
  expect(avatar.exists()).toBe(true)
  expect(avatar.props('size')).toBe('2xl')
})
```

In `tests/components/GroupModals.test.ts`, add test for clicking member in roster emits `viewProfile`:

```typescript
it('emits viewProfile when clicking a member item in the roster', async () => {
  const wrapper = mount(GroupInfoModal, {
    props: {
      isOpen: true,
      conversation: sampleConversation,
    },
  })

  const memberItem = wrapper.find('[data-test="member-item-user-2"]')
  expect(memberItem.exists()).toBe(true)

  await memberItem.trigger('click')
  expect(wrapper.emitted('viewProfile')).toBeTruthy()
  expect(wrapper.emitted('viewProfile')?.[0][0]).toEqual(sampleConversation.members[1].profile)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/UserProfileModal.test.ts tests/components/GroupModals.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `UserAvatar.vue` to support `xl` and `2xl`**

In `app/components/UserAvatar.vue`:
```typescript
const props = withDefaults(
  defineProps<{
    displayName: string
    avatarColor?: string
    avatarUrl?: string | null
    showOnline?: boolean
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  }>(),
  {
    avatarColor: '',
    avatarUrl: '',
    showOnline: false,
    size: 'md',
  },
)

const sizeClasses = computed(() => {
  if (props.size === 'sm') return 'w-7 h-7 rounded-[7px] text-[11px]'
  if (props.size === 'lg') return 'w-11 h-11 rounded-[11px] text-sm'
  if (props.size === 'xl') return 'w-16 h-16 rounded-[16px] text-xl'
  if (props.size === '2xl') return 'w-20 h-20 rounded-[20px] text-2xl'
  return 'w-9 h-9 rounded-[9px] text-[13px]'
})

const dotClasses = computed(() => {
  if (props.size === 'sm') return 'w-2 h-2 -bottom-0.5 -right-0.5'
  if (props.size === 'lg') return 'w-3 h-3 -bottom-0.5 -right-0.5'
  if (props.size === 'xl') return 'w-3.5 h-3.5 -bottom-0.5 -right-0.5'
  if (props.size === '2xl') return 'w-4 h-4 -bottom-0.5 -right-0.5 ring-[3px]'
  return 'w-2.5 h-2.5 -bottom-0.5 -right-0.5'
})
```

- [ ] **Step 4: Update `UserProfileModal.vue` with `size="2xl"` avatar**

In `app/components/UserProfileModal.vue`:
```vue
      <!-- Profile Header (Avatar + Name + Status) -->
      <div class="flex flex-col items-center text-center gap-3.5 mt-2">
        <UserAvatar
          :display-name="profile.display_name"
          :avatar-color="profile.avatar_color"
          :avatar-url="profile.avatar_url"
          :show-online="isOnline"
          size="2xl"
          class="ring-4 ring-black/5 dark:ring-white/10 shadow-xl"
        />

        <div class="flex flex-col items-center gap-1">
          <h3 class="text-lg font-bold text-[var(--ap-text-primary)] tracking-tight">
            {{ profile.display_name }}
          </h3>
...
```

- [ ] **Step 5: Wire `viewProfile` click triggers in `GroupInfoModal.vue` and `index.vue` header**

In `app/components/GroupInfoModal.vue`:
1. Add emit:
```typescript
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'leave', conversationId: string): void
  (e: 'addMember', email: string): void
  (e: 'updateTitle', newTitle: string): void
  (e: 'viewProfile', profile: Profile): void
}>()
```
2. In Member Roster row:
```vue
<div
  v-for="member in members"
  :key="member.user_id"
  :data-test="`member-item-${member.user_id}`"
  class="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
  @click="member.profile && emit('viewProfile', member.profile)"
>
```

In `app/pages/index.vue`:
1. In header direct chat peer avatar and name:
```vue
<div
  class="min-w-0 flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
  @click="activeConversation?.peer && handleViewProfile(activeConversation.peer)"
>
  <UserAvatar
    :display-name="activeConversation.peer?.display_name || 'Friend'"
    :avatar-color="activeConversation.peer?.avatar_color"
    :avatar-url="activeConversation.peer?.avatar_url"
    :show-online="onlineFriends.some(f => f.id === activeConversation?.peer?.id)"
    size="sm"
  />
  <div class="min-w-0 flex items-center gap-2">
    <h2 class="text-[14px] font-semibold text-[var(--ap-text-primary)] flex items-center gap-1 truncate">
      <span class="text-blue-500 dark:text-blue-400 font-mono">@</span>
      <span class="truncate">{{ activeConversation.peer?.display_name || 'Direct Message' }}</span>
    </h2>
...
```
2. On `<GroupInfoModal ...>`:
```vue
<GroupInfoModal
  :is-open="isGroupInfoModalOpen"
  :conversation="activeConversation"
  :current-user-id="currentProfile?.id"
  :online-user-ids="onlineFriends.map(f => f.id)"
  @close="isGroupInfoModalOpen = false"
  @leave="handleLeaveGroup"
  @add-member="handleAddMember"
  @update-title="handleUpdateGroupTitle"
  @view-profile="handleViewProfile"
/>
```

- [ ] **Step 6: Run tests to verify all tests pass**

Run: `npx vitest run tests/components/UserProfileModal.test.ts tests/components/GroupModals.test.ts`
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit changes**

```bash
git add app/components/UserAvatar.vue app/components/UserProfileModal.vue app/components/GroupInfoModal.vue app/pages/index.vue tests/components/UserProfileModal.test.ts tests/components/GroupModals.test.ts
git commit -m "feat(profile): enlarge avatar to 2xl in UserProfileModal and add viewProfile triggers in header and group roster"
```

---

### Task 5: Full Test Suite Verification & Integration Check

**Files:**
- Test: All test files in `tests/`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: 295+ tests passing across all suites.

- [ ] **Step 2: Check build verification**

Run: `npm run build`
Expected: Production build succeeds with 0 errors.

- [ ] **Step 3: Verification before completion**

Run: `git status`
Expected: Clean working tree.
