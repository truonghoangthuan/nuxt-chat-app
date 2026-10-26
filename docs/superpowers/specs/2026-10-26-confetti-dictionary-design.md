# Conversation Confetti Dictionary — Design Spec

**Date:** 2026-10-26  
**Topic:** Replace every-message confetti with a per-conversation/group confetti trigger dictionary managed by conversation members

## 1. Goals & Requirements

1. **No More Confetti on Every Message:**
   - Outgoing and incoming messages must NOT trigger confetti unconditionally.
   - New and existing conversations start with an empty dictionary (`confetti_words = '{}'`), meaning zero confetti fires until members add words.
2. **Per-Conversation Confetti Dictionary (Direct & Group Chats):**
   - Every member in a direct or group conversation can add as many words/phrases as they want and remove existing words.
   - Words are stored on `public.conversations.confetti_words` (`text[] not null default '{}'`), normalized (trimmed, lowercased, deduplicated), and synchronized across all conversation members in real time via existing `public.conversations` `UPDATE` subscriptions.
3. **Case-Insensitive Substring Matching (`matchesConfettiDictionary`):**
   - When sending a text message, sending an image with a caption, or receiving a new realtime message in the active conversation, confetti triggers if and only if the message text (or image caption) contains at least one word/phrase from `activeConversation.confetti_words` (case-insensitive substring match).
   - User-level `confettiEnabled` toggle (`ProfileSettingsModal`) and historical pagination suppression (`isLoadingHistory` / `hasLoadedHistoryForConv`) continue to be respected.
4. **Accessible Management UI:**
   - **Stage Header Button (`data-test="open-confetti-dictionary-btn"`):** Available in both Direct and Group conversations beside the Chat Wallpaper button.
   - **Group Info Modal Shortcut (`data-test="group-confetti-dictionary-btn"`):** Opens the dictionary modal from `GroupInfoModal.vue`.
   - **`ConfettiDictionaryModal.vue`:** Allows members to add single or comma-separated words/phrases, view active dictionary chips, and remove words.

## 2. Architecture & Component Boundaries (Ponytail Minimalist)

- **Database Schema (`supabase/schema.sql`):**
  - `alter table public.conversations add column if not exists confetti_words text[] not null default '{}';`
  - Uses existing `conversations` RLS policies (`can_access_conversation(id)` for `SELECT` and `UPDATE`) and Realtime publication. Zero new tables or policies.
- **Types (`app/types/chat.ts`):**
  - Extend `Conversation` interface with `confetti_words?: string[]`.
- **Pure Helpers (`app/utils/confetti.ts`):**
  - `normalizeConfettiWord(word: string): string` — `word.trim().toLowerCase()`.
  - `sanitizeConfettiWords(words: string[]): string[]` — splits comma-separated inputs if needed, normalizes, filters empty strings, deduplicates via `Set`.
  - `matchesConfettiDictionary(text: string | null | undefined, dictionary: string[] | null | undefined): boolean` — returns `true` iff both `text` and `dictionary` are non-empty and `text.toLowerCase()` includes at least one normalized entry in `dictionary`.
- **State & Persistence (`app/composables/useConversations.ts` & `app/composables/useChatRoom.ts`):**
  - `loadConversations()` hydrates `confetti_words: Array.isArray(c.confetti_words) ? c.confetti_words : []`.
  - `updateConfettiWords(conversationId: string, words: string[])`, `addConfettiWord(conversationId: string, word: string)`, and `removeConfettiWord(conversationId: string, word: string)` perform optimistic updates on `conversations.value` with rollback on Supabase error.
- **UI Components (`app/components/ConfettiDictionaryModal.vue`, `app/components/GroupInfoModal.vue`, `app/pages/index.vue`):**
  - `ConfettiDictionaryModal.vue` renders an input form (`data-test="confetti-word-input"`, `data-test="confetti-word-add-btn"`), word chips (`data-test="confetti-word-chip"`), remove buttons (`data-test="confetti-word-remove-btn"`), and empty state (`data-test="confetti-words-empty"`).
  - `app/pages/index.vue` gates `triggerConfetti()` behind `matchesConfettiDictionary(...)` in `handleSendMessage`, `handleSendImages`, and the realtime incoming message watcher.
