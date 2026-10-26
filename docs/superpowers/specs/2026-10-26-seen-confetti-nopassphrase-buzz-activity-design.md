# Seen Receipts, Confetti Setting, Passphrase Removal, Yahoo Buzz & Activity Attribution — Design Spec

**Date:** 2026-10-26  
**Status:** Ready for review

## 1. Intent & Goals

Deliver five user-requested capabilities with minimal new surface area and full backward compatibility:

1. **Seen by Who (Messenger-style Read Receipts):** Show mini member avatars beneath the latest message each conversation member has read, with a `"Seen by ..."` tooltip and profile click trigger.
2. **Confetti On/Off in User Settings:** Allow users to enable or disable celebration confetti in `ProfileSettingsModal.vue` (`localStorage['nuxt-chat-confetti-enabled']`, defaulting to `true`).
3. **Remove Application Passphrase Prompt:** Remove `E2eeGate.vue` from the entry flow and auto-unlock `useE2ee` transparently using a deterministic workspace key so users enter chat immediately after login while keeping encrypted messages and attachments working.
4. **Yahoo-Style Buzz Button (`⚡ Buzz!`):** Add a Buzz button with a 5-second cooldown to `MessageComposer.vue` that inserts a persistent buzz event in the timeline, shakes the chat window, and plays a two-tone buzz audio effect.
5. **Show Who Changed Background or Group Name:** Persist and render centered system activity pills in the conversation timeline whenever a member updates the group title or changes/resets the conversation wallpaper.

## 2. Non-Goals & Anti-Goals

- **Non-Goals:** Breaking existing `e2ee:v1:` database triggers or requiring manual re-encryption of historical messages; adding external npm dependencies.
- **Anti-Goals:** Spamming Buzz without a client cooldown; firing Buzz shake or Confetti on historical messages during initial channel load or upward pagination (`AGENTS.md` Invariant #26).

## 3. Technical Design

### 3.1 Seen by Who (`supabase/schema.sql`, `app/utils/chat.ts`, `app/composables/useChatRoom.ts`, `app/components/MessageViewport.vue`)

1. **Database & Realtime (`supabase/schema.sql`):**
   - Replace the self-only `SELECT` policy on `public.conversation_reads` with conversation-scoped access:
     ```sql
     drop policy if exists "Users can view their own conversation reads" on public.conversation_reads;
     drop policy if exists "Users can view accessible conversation reads" on public.conversation_reads;
     create policy "Users can view accessible conversation reads"
       on public.conversation_reads for select
       to authenticated
       using (public.can_access_conversation(conversation_id));
     alter table public.conversation_reads replica identity full;
     ```
   - Include `'conversation_reads'` in the `supabase_realtime` publication table array.
2. **State & Realtime Sync (`app/composables/useChatRoom.ts`):**
   - Maintain `conversationReadsByConv = ref<Record<string, Record<string, string>>>({})` mapping `conversationId -> { [userId]: last_read_at }`.
   - Hydrate all accessible rows from `public.conversation_reads` inside `loadConversationReadsAndUnreads()`.
   - Listen to `postgres_changes` (`INSERT` and `UPDATE`) on `public.conversation_reads` in `setupDbChangesSubscription()` to update `conversationReadsByConv` live.
   - Update the local user's entry in `conversationReadsByConv` inside `markConversationRead()`.
3. **Pure Read-Receipt Placement Helper (`app/utils/chat.ts`):**
   - `computeSeenByMessageId(params: { messages: ChatMessage[]; readsByUser?: Record<string, string>; profiles: Profile[]; currentUserId?: string }): Record<string, Profile[]>`:
     - Iterates over each profile (`user.id !== currentUserId`) who has a `readIso = readsByUser[user.id]`.
     - Finds the latest confirmed, non-deleted message (`msg.status === 'sent' && !msg.deleted_at`) with `Date.parse(msg.created_at) <= Date.parse(readIso)` and `msg.user_id !== user.id`.
     - Groups matching `Profile[]` under that `message.id`.
4. **Timeline Rendering (`app/components/MessageViewport.vue`):**
   - Accept `readReceipts?: Record<string, string>` and `members?: Profile[]` props.
   - Render `[data-test="seen-by-${item.message.id}"]` beneath the message row when `seenByMap[item.message.id]?.length > 0`, displaying mini `UserAvatar` badges and a `"Seen by Alice, Bob"` label/tooltip. Clicking an avatar emits `viewProfile`.

### 3.2 Confetti Toggle in User Settings (`app/components/ProfileSettingsModal.vue`, `app/pages/index.vue`)

1. **Persistence Key:** `STORAGE_KEY_CONFETTI = 'nuxt-chat-confetti-enabled'` in `app/utils/confetti.ts` with helpers `getConfettiEnabled(): boolean` (default `true`) and `setConfettiEnabled(enabled: boolean): void`.
2. **Settings Modal (`app/components/ProfileSettingsModal.vue`):**
   - Accept optional `confettiEnabled?: boolean` prop (defaulting to `getConfettiEnabled()`).
   - Render an accessible toggle switch `[data-test="confetti-toggle"]` labeled `"Celebration Confetti"` inside the settings form and include `confettiEnabled` in the `@save` payload (and persist via `setConfettiEnabled`).
3. **Workspace Gate (`app/pages/index.vue`):**
   - Maintain `confettiEnabled = ref(getConfettiEnabled())`, updated on profile settings save.
   - Guard `triggerConfetti()` with `if (!confettiEnabled.value) return`.

### 3.3 Remove Application Passphrase (`app/composables/useE2ee.ts`, `app/pages/index.vue`, `supabase/schema.sql`)

1. **Transparent Auto-Unlock (`app/composables/useE2ee.ts`):**
   - Export `DEFAULT_E2EE_PHRASE = 'nuxt-chat-default-workspace-phrase-2026'` and deterministic `DEFAULT_E2EE_CONFIG: E2eeConfig`.
   - In `initializeE2ee()`:
     - If `sessionStorage['nuxt-chat-e2ee-key']` holds a valid cached key, import it and set `status.value = 'unlocked'`.
     - Otherwise fetch `public.e2ee_config` (falling back to `DEFAULT_E2EE_CONFIG` if unconfigured or unreachable), derive the AES-GCM-256 `CryptoKey` using `DEFAULT_E2EE_PHRASE`, cache the exported key in `sessionStorage`, set `key.value = derivedKey`, and set `status.value = 'unlocked'`.
   - Keep `unlockWithPhrase` and `clearE2eeSession` exported for backward compatibility with unit tests.
2. **Workspace Shell (`app/pages/index.vue`):**
   - Remove `<E2eeGate>` from `app/pages/index.vue` so the chat workspace mounts directly on load.

### 3.4 System Event Envelopes for Yahoo Buzz & Conversation Attribution (`app/types/chat.ts`, `app/utils/chat.ts`, `app/utils/sound.ts`)

1. **Unified Encrypted System Payload (`app/types/chat.ts` & `app/utils/chat.ts`):**
   - Reuse the JSON-in-E2EE-envelope pattern established by `ImageMessagePayload`:
     ```ts
     export type SystemEventType = 'buzz' | 'group_rename' | 'background_change' | 'background_reset'

     export interface SystemMessagePayload {
       type: 'system'
       event: SystemEventType
       actorName: string
       detail?: string
     }
     ```
   - Helpers in `app/utils/chat.ts`:
     - `serializeSystemMessage(payload: SystemMessagePayload): string`
     - `isSystemPayload(content?: string | null): boolean`
     - `parseSystemPayload(content?: string | null): SystemMessagePayload | null`
     - `formatSystemMessageText(payload: SystemMessagePayload): string`:
       - `'buzz'` -> `⚡ ${payload.actorName} buzzed the chat!`
       - `'group_rename'` -> `${payload.actorName} changed the group name to "${payload.detail || ''}"`
       - `'background_change'` -> `${payload.actorName} changed the chat wallpaper${payload.detail ? ` to ${payload.detail}` : ''}`
       - `'background_reset'` -> `${payload.actorName} reset the chat wallpaper`
2. **Action Hooks in `app/composables/useChatRoom.ts`:**
   - `sendBuzz()`: sends a message with `serializeSystemMessage({ type: 'system', event: 'buzz', actorName: current.display_name })`.
   - `updateGroupTitle()`: after updating `conversations.title`, sends `group_rename` system message.
   - `updateChatBackground()` & `removeChatBackground()`: after updating `conversations.background_url`, sends `background_change` (with preset label or `'a custom image'`) or `background_reset` system message.
3. **Buzz Audio & Window Shake (`app/utils/sound.ts`, `app/assets/css/main.css`, `app/components/MessageComposer.vue`, `app/pages/index.vue`):**
   - `playBuzzSound()` in `app/utils/sound.ts`: synthesizes a classic two-pulse low-frequency buzz chime via Web Audio API.
   - `.animate-buzz-shake` keyframe in `app/assets/css/main.css`: 600ms horizontal/rotational shake animation on `<main>` (`data-test="chat-stage-main"`).
   - `MessageComposer.vue`: adds `[data-test="buzz-button"]` with a 5-second cooldown timer (`buzzCooldown > 0`) that emits `@buzz`.
   - `app/pages/index.vue`: triggers `triggerBuzzShake()` + `playBuzzSound()` when sending a buzz or when a new realtime buzz message arrives in the active conversation after history load.
4. **Timeline & Sidebar Rendering (`app/components/MessageViewport.vue`, `app/components/ChatSidebar.vue`, `app/composables/useNotification.ts`):**
   - `MessageViewport.vue`: renders `isSystemPayload(item.message.content)` as a centered pill (`[data-test="system-message-${item.message.id}"]`), with distinct amber/rose styling when `event === 'buzz'`.
   - `ChatSidebar.vue` & `useNotification.ts`: format system payloads via `formatSystemMessageText` so sidebar previews and notifications display human-readable text instead of raw JSON.
