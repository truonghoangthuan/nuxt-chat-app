# Conversation Confetti Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unconditional every-message confetti with a per-conversation dictionary (`confetti_words`) where any member can add/remove trigger words and confetti only fires when a message or image caption matches the conversation's dictionary.

**Architecture:** Add `confetti_words text[] not null default '{}'` to `public.conversations` so dictionary state piggybacks on existing conversation queries, RLS policies, and Realtime `UPDATE` events. Add pure dictionary normalization/matching helpers in `app/utils/confetti.ts`, optimistic update actions in `app/composables/useConversations.ts`, a `ConfettiDictionaryModal.vue` accessible from both the chat header and `GroupInfoModal.vue`, and gate `triggerConfetti()` in `app/pages/index.vue` with `matchesConfettiDictionary`.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Supabase Postgres & Realtime, Tailwind CSS, Vitest + `@vue/test-utils`.

**Spec:** `docs/superpowers/specs/2026-10-26-confetti-dictionary-design.md`

## Global Constraints

- Zero new npm dependencies and zero new database tables (reuse `public.conversations`).
- Conversations default to an empty dictionary `[]` (no confetti triggers until words are added).
- Matching is case-insensitive substring matching (`matchesConfettiDictionary`) across both text messages and image captions (`parseImagePayload(content)?.caption`).
- Preserve user-level `confettiEnabled` toggle (`ProfileSettingsModal`) and initial/paginated history suppression (`isLoadingHistory` / `hasLoadedHistoryForConv`).

---

### Task 1: Schema, Types & Pure Confetti Dictionary Matcher (`supabase/schema.sql`, `app/types/chat.ts`, `app/utils/confetti.ts`)

**Files:**
- Modify: `supabase/schema.sql:611-615`
- Modify: `app/types/chat.ts:30-43`
- Modify: `app/utils/confetti.ts:470-483`
- Test: `tests/utils/confetti.test.ts`

**Interfaces:**
- Produces:
  - `Conversation.confetti_words?: string[]` in `app/types/chat.ts`
  - `export function normalizeConfettiWord(word: string): string` in `app/utils/confetti.ts`
  - `export function sanitizeConfettiWords(words: string[]): string[]` in `app/utils/confetti.ts`
  - `export function matchesConfettiDictionary(text: string | null | undefined, dictionary: string[] | null | undefined): boolean` in `app/utils/confetti.ts`

- [ ] **Step 1: Write failing unit tests in `tests/utils/confetti.test.ts`**

Append dictionary helper tests to `tests/utils/confetti.test.ts`:

```typescript
import {
  normalizeConfettiWord,
  sanitizeConfettiWords,
  matchesConfettiDictionary,
} from '~/utils/confetti'

describe('Confetti dictionary helpers (app/utils/confetti.ts)', () => {
  it('normalizes and deduplicates confetti words including comma-separated entries', () => {
    expect(normalizeConfettiWord('  Chúc Mừng!  ')).toBe('chúc mừng!')
    expect(sanitizeConfettiWords(['  Party ', 'PARTY', 'congrats,  hooray ', '', '   '])).toEqual([
      'party',
      'congrats',
      'hooray',
    ])
  })

  it('returns false when dictionary or text is empty', () => {
    expect(matchesConfettiDictionary('congrats on the release!', [])).toBe(false)
    expect(matchesConfettiDictionary('congrats on the release!', null)).toBe(false)
    expect(matchesConfettiDictionary('', ['congrats'])).toBe(false)
    expect(matchesConfettiDictionary(undefined, ['congrats'])).toBe(false)
  })

  it('matches case-insensitively when message contains any dictionary word or phrase', () => {
    const dict = ['congrats', 'rõ ràng', 'ship it']
    expect(matchesConfettiDictionary('Big CONGRATS team!', dict)).toBe(true)
    expect(matchesConfettiDictionary('Rõ ràng là tuyệt vời', dict)).toBe(true)
    expect(matchesConfettiDictionary('Let us SHIP IT today', dict)).toBe(true)
    expect(matchesConfettiDictionary('Just a normal message', dict)).toBe(false)
  })
})
```

- [ ] **Step 2: Run Vitest on `tests/utils/confetti.test.ts` to verify failure**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: FAIL (`normalizeConfettiWord`, `sanitizeConfettiWords`, `matchesConfettiDictionary` are not exported).

- [ ] **Step 3: Add schema column, type field, and pure helpers**

1. In `supabase/schema.sql` (right after `add column if not exists background_url text;`):
```sql
-- Migration: add confetti_words dictionary array to conversations
alter table public.conversations
  add column if not exists confetti_words text[] not null default '{}';
```

2. In `app/types/chat.ts`:
```typescript
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
  background_url?: string | null
  confetti_words?: string[]
}
```

3. In `app/utils/confetti.ts`:
```typescript
export function normalizeConfettiWord(word: string): string {
  return word.trim().toLowerCase()
}

export function sanitizeConfettiWords(words: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of words) {
    for (const part of raw.split(',')) {
      const normalized = normalizeConfettiWord(part)
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        result.push(normalized)
      }
    }
  }
  return result
}

export function matchesConfettiDictionary(
  text: string | null | undefined,
  dictionary: string[] | null | undefined,
): boolean {
  if (!text || !dictionary || dictionary.length === 0) return false
  const haystack = text.toLowerCase()
  for (const entry of dictionary) {
    const needle = normalizeConfettiWord(entry)
    if (needle && haystack.includes(needle)) {
      return true
    }
  }
  return false
}
```

- [ ] **Step 4: Run Vitest on `tests/utils/confetti.test.ts` to verify pass**

Run: `npx vitest run tests/utils/confetti.test.ts`  
Expected: PASS.

---

### Task 2: Conversation Dictionary Actions in `useConversations.ts` & `useChatRoom.ts`

**Files:**
- Modify: `app/composables/useConversations.ts`
- Modify: `app/composables/useChatRoom.ts`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `sanitizeConfettiWords`, `normalizeConfettiWord` from `~/utils/confetti`
- Produces:
  - `updateConfettiWords(conversationId: string, words: string[]): Promise<{ error: string | null }>`
  - `addConfettiWord(conversationId: string, word: string): Promise<{ error: string | null }>`
  - `removeConfettiWord(conversationId: string, word: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Write failing composable tests in `tests/composables/useChatRoom.test.ts`**

Add tests in `tests/composables/useChatRoom.test.ts` verifying:
1. `addConfettiWord` optimistically appends normalized word(s) to `activeConversation.confetti_words` and calls `supabase.from('conversations').update({ confetti_words: [...], updated_at: ... }).eq('id', convId)`.
2. `removeConfettiWord` removes a word from `activeConversation.confetti_words` and persists to Supabase.
3. On Supabase error, `updateConfettiWords` rolls back `targetConv.confetti_words` to its previous array and returns `{ error }`.

- [ ] **Step 2: Run Vitest on `tests/composables/useChatRoom.test.ts` to verify failure**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`  
Expected: FAIL (`addConfettiWord` / `removeConfettiWord` / `updateConfettiWords` not defined).

- [ ] **Step 3: Implement `updateConfettiWords`, `addConfettiWord`, and `removeConfettiWord`**

1. In `app/composables/useConversations.ts`:
```typescript
import { sanitizeConfettiWords, normalizeConfettiWord } from '~/utils/confetti'
```
Add inside `createConversationsActions`:
```typescript
  async function updateConfettiWords(
    conversationId: string,
    words: string[],
  ): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }

    const sanitized = sanitizeConfettiWords(words)
    const prevWords = [...(targetConv.confetti_words || [])]
    const prevUpdated = targetConv.updated_at
    const nowIso = new Date().toISOString()

    targetConv.confetti_words = sanitized
    targetConv.updated_at = nowIso

    try {
      const { error: dbError } = await supabase
        .from('conversations')
        .update({ confetti_words: sanitized, updated_at: nowIso })
        .eq('id', conversationId)

      if (dbError) {
        targetConv.confetti_words = prevWords
        targetConv.updated_at = prevUpdated
        return { error: dbError.message || 'Failed to update confetti dictionary.' }
      }

      return { error: null }
    } catch (err: any) {
      targetConv.confetti_words = prevWords
      targetConv.updated_at = prevUpdated
      return { error: err?.message || 'Failed to update confetti dictionary.' }
    }
  }

  async function addConfettiWord(
    conversationId: string,
    wordInput: string,
  ): Promise<{ error: string | null }> {
    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }
    const existing = targetConv.confetti_words || []
    const next = sanitizeConfettiWords([...existing, wordInput])
    if (next.length === existing.length) {
      return { error: null }
    }
    return updateConfettiWords(conversationId, next)
  }

  async function removeConfettiWord(
    conversationId: string,
    wordToRemove: string,
  ): Promise<{ error: string | null }> {
    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }
    const normalizedTarget = normalizeConfettiWord(wordToRemove)
    const existing = targetConv.confetti_words || []
    const next = existing.filter(w => normalizeConfettiWord(w) !== normalizedTarget)
    return updateConfettiWords(conversationId, next)
  }
```
Return `updateConfettiWords`, `addConfettiWord`, `removeConfettiWord` from `createConversationsActions`.

2. In `app/composables/useChatRoom.ts`:
- In `loadConversations` (around line 746), include `confetti_words: Array.isArray(c.confetti_words) ? c.confetti_words : (existingConv?.confetti_words || []),`.
- Destructure and re-export `updateConfettiWords`, `addConfettiWord`, `removeConfettiWord` from `conversationsActions`.

- [ ] **Step 4: Run Vitest on `tests/composables/useChatRoom.test.ts` to verify pass**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`  
Expected: PASS.

---

### Task 3: `ConfettiDictionaryModal.vue`, `GroupInfoModal.vue` Shortcut & `app/pages/index.vue` Integration

**Files:**
- Create: `app/components/ConfettiDictionaryModal.vue`
- Modify: `app/components/GroupInfoModal.vue`
- Modify: `app/pages/index.vue`
- Test: `tests/components/chatUi.test.ts`
- Test: `tests/components/indexPage.test.ts`

**Interfaces:**
- Consumes: `matchesConfettiDictionary` from `~/utils/confetti`, `addConfettiWord`, `removeConfettiWord` from `useChatRoom()`
- Produces:
  - `app/components/ConfettiDictionaryModal.vue` with `data-test="confetti-dictionary-modal"`, `data-test="confetti-word-input"`, `data-test="confetti-word-add-btn"`, `data-test="confetti-word-chip"`, `data-test="confetti-word-remove-btn"`, `data-test="confetti-words-empty"`
  - `data-test="open-confetti-dictionary-btn"` in `app/pages/index.vue` stage header
  - `data-test="group-confetti-dictionary-btn"` in `app/components/GroupInfoModal.vue`

- [ ] **Step 1: Write failing UI & page tests in `tests/components/chatUi.test.ts` and `tests/components/indexPage.test.ts`**

1. In `tests/components/chatUi.test.ts`:
   - Test `ConfettiDictionaryModal` renders empty state when `confetti_words` is empty, emits `addWord` on form submit, and renders chips + emits `removeWord` when clicking a chip's remove button.
   - Test `GroupInfoModal` renders `[data-test="group-confetti-dictionary-btn"]` and emits `openConfettiDictionary`.
2. In `tests/components/indexPage.test.ts`:
   - Update confetti tests so:
     - Sending or receiving a message when `activeConversation.confetti_words` is `[]` (or undefined) does NOT trigger confetti (`burstKey` stays `0`).
     - Sending a text or image caption matching `activeConversation.confetti_words` (e.g. `['congratulation', 'ok', 'cool', 'rõ ràng']`) increments `burstKey` once and activates `ConfettiOverlay`.
     - Receiving a realtime message from another user in the active chat triggers `ConfettiOverlay` ONLY when its content or image caption matches `activeConversation.confetti_words`.

- [ ] **Step 2: Run Vitest on `chatUi.test.ts` and `indexPage.test.ts` to verify failure**

Run: `npx vitest run tests/components/chatUi.test.ts tests/components/indexPage.test.ts`  
Expected: FAIL (`ConfettiDictionaryModal.vue` does not exist yet, and `index.vue` still triggers confetti on every message).

- [ ] **Step 3: Create `ConfettiDictionaryModal.vue`, update `GroupInfoModal.vue`, and wire `app/pages/index.vue`**

1. Create `app/components/ConfettiDictionaryModal.vue`:
```vue
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Sparkles, Plus, X } from '@lucide/vue'
import type { Conversation } from '~/types/chat'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    conversation: Conversation | null
  }>(),
  {
    isOpen: false,
    conversation: null,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'addWord', word: string): void
  (e: 'removeWord', word: string): void
}>()

const newWord = ref('')
const inputError = ref<string | null>(null)

const words = computed(() => props.conversation?.confetti_words || [])

function handleAdd() {
  const trimmed = newWord.value.trim()
  if (!trimmed) {
    inputError.value = 'Please enter a word or phrase.'
    return
  }
  inputError.value = null
  emit('addWord', trimmed)
  newWord.value = ''
}

function handleClose() {
  newWord.value = ''
  inputError.value = null
  emit('close')
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

watch(
  () => props.isOpen,
  (open) => {
    newWord.value = ''
    inputError.value = null
    if (typeof window !== 'undefined') {
      if (open) {
        window.addEventListener('keydown', onKeyDown)
      } else {
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})
</script>

<template>
  <div
    v-if="isOpen && conversation"
    data-test="confetti-dictionary-backdrop"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    @click.self="handleClose"
  >
    <div
      data-test="confetti-dictionary-modal"
      class="w-full max-w-md rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
    >
      <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Sparkles class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-[15px] font-semibold text-white/95 tracking-tight">
              Confetti Dictionary
            </h3>
            <p class="text-xs text-white/45">
              Messages containing these words trigger celebration effects
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-lg font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <div class="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scroll">
        <form data-test="confetti-word-form" class="flex gap-2" @submit.prevent="handleAdd">
          <input
            v-model="newWord"
            data-test="confetti-word-input"
            type="text"
            maxlength="80"
            placeholder="Add word or phrase (comma-separated)..."
            class="flex-1 min-w-0 px-3.5 py-2 text-xs rounded-xl border border-white/10 bg-white/8 text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-amber-500/50"
          />
          <button
            type="submit"
            data-test="confetti-word-add-btn"
            class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </form>

        <p v-if="inputError" data-test="confetti-word-error" class="text-xs text-rose-400 font-medium">
          {{ inputError }}
        </p>

        <div v-if="words.length === 0" data-test="confetti-words-empty" class="py-6 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
          <p class="text-xs text-white/50">
            No trigger words yet. Add words above so messages celebrate automatically!
          </p>
        </div>

        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="word in words"
            :key="word"
            data-test="confetti-word-chip"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-200"
          >
            <span>{{ word }}</span>
            <button
              type="button"
              data-test="confetti-word-remove-btn"
              :aria-label="`Remove ${word}`"
              class="w-4 h-4 rounded-full hover:bg-white/15 flex items-center justify-center text-amber-200/70 hover:text-white cursor-pointer transition-colors"
              @click="emit('removeWord', word)"
            >
              <X class="w-3 h-3" />
            </button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
```

2. In `app/components/GroupInfoModal.vue`:
- Import `Sparkles` from `@lucide/vue` and add `(e: 'openConfettiDictionary'): void` to `defineEmits`.
- Add the shortcut button right below `[data-test="group-change-background-btn"]`:
```vue
        <button
          type="button"
          data-test="group-confetti-dictionary-btn"
          class="w-full flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 text-xs font-semibold transition cursor-pointer"
          @click="emit('openConfettiDictionary')"
        >
          <span class="flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-amber-400" />
            Confetti Dictionary
          </span>
          <span class="text-[11px] text-white/40">
            {{ (conversation.confetti_words?.length || 0) }} words →
          </span>
        </button>
```

3. In `app/pages/index.vue`:
- Import `Sparkles` from `@lucide/vue`, `ConfettiDictionaryModal` from `~/components/ConfettiDictionaryModal.vue`, `matchesConfettiDictionary` from `~/utils/confetti`, and `isImagePayload`, `parseImagePayload` from `~/utils/image`.
- Destructure `addConfettiWord`, `removeConfettiWord` from `useChatRoom()`.
- Add `const isConfettiDictionaryModalOpen = ref(false)` and handlers `handleAddConfettiWord(word: string)` and `handleRemoveConfettiWord(word: string)`.
- In `handleSendMessage(content)`:
```typescript
  if (matchesConfettiDictionary(content, activeConversation.value?.confetti_words)) {
    triggerConfetti()
  }
```
- In `handleSendImages(files, caption)`:
```typescript
  if (matchesConfettiDictionary(caption, activeConversation.value?.confetti_words)) {
    triggerConfetti()
  }
```
- In the incoming Realtime `messages` watcher:
```typescript
      } else if (newest.user_id !== currentProfile.value?.id && !newest.deleted_at && newest.encryption !== 'undecryptable') {
        const msgText = isImagePayload(newest.content)
          ? parseImagePayload(newest.content)?.caption
          : newest.content
        if (matchesConfettiDictionary(msgText, activeConversation.value?.confetti_words)) {
          triggerConfetti()
        }
      }
```
- Add header button `data-test="open-confetti-dictionary-btn"` beside `open-chat-background-btn`, wire `@open-confetti-dictionary="isConfettiDictionaryModalOpen = true"` on `GroupInfoModal`, and mount `<ConfettiDictionaryModal>`.

- [ ] **Step 4: Run full test suite to verify all tests pass**

Run: `npm test`  
Expected: All test suites PASS.
