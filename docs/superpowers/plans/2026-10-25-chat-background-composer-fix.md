# Chat Background Composer Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the conversation background image and contrast scrim to cover the area behind the message input dock (`MessageComposer`), eliminating the solid stage bar below the message list.

**Architecture:** `MessageViewport.vue` currently renders `[data-test="chat-background-layer"]` (`absolute inset-0 z-0`) inside its own root box, while `MessageComposer.vue` is mounted as a sibling below `MessageViewport` in `app/pages/index.vue`. By adding a default `<slot />` at the bottom of `MessageViewport.vue` (while keeping the scrollable message area and floating scroll-to-bottom button inside an inner `relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden` container) and slotting `MessageComposer` inside `MessageViewport`, one continuous background image and scrim layer spans both the message timeline and the floating composer dock.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS, Vitest, `@vue/test-utils`

## Global Constraints

- Preserve `[data-test="chat-background-layer"]`, `[data-test="chat-background-scrim"]`, `[data-test="scroll-to-bottom"]`, and `[data-test="composer-deck"]` hooks.
- Keep `scroll-to-bottom` anchored above the composer (`absolute bottom-3 right-6 z-10` relative to the inner scroll stage, not overlapping the composer).
- Ensure both the inner scroll stage and `MessageComposer` stack above `chat-background-layer` (`z-0`) via `relative z-10`.

---

### Task 1: Slot `MessageComposer` inside `MessageViewport` background container

**Files:**
- Modify: `app/components/MessageViewport.vue:346-365`, `app/components/MessageViewport.vue:915-933`
- Modify: `app/components/MessageComposer.vue:332-334`
- Modify: `app/pages/index.vue:577-619`
- Test: `tests/components/chatUi.test.ts:1738-1748`
- Test: `tests/components/indexPage.test.ts:339-355`

**Interfaces:**
- Consumes: `MessageViewport` props (`backgroundUrl?: string | null`)
- Produces: Default `<slot />` inside `MessageViewport.vue` rendered beneath the scrollable viewport container and above `[data-test="chat-background-layer"]`.

- [x] **Step 1: Write the failing tests in `tests/components/chatUi.test.ts` and `tests/components/indexPage.test.ts`**

In `tests/components/chatUi.test.ts`, update the `MessageViewport` background test (around line 1738):

```ts
    it('renders chat background layer covering both message scroll area and default composer slot', () => {
      const wrapper = mount(MessageViewport, {
        props: {
          messages: [],
          backgroundUrl: 'preset:aurora',
        },
        slots: {
          default: '<div data-test="slotted-composer">Composer Dock</div>',
        },
      })
      const bgLayer = wrapper.find('[data-test="chat-background-layer"]')
      expect(bgLayer.exists()).toBe(true)
      expect(wrapper.find('[data-test="chat-background-scrim"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="slotted-composer"]').exists()).toBe(true)
      expect(bgLayer.element.parentElement).toBe(wrapper.element)
      expect(wrapper.element.contains(wrapper.find('[data-test="slotted-composer"]').element)).toBe(true)
    })
```

In `tests/components/indexPage.test.ts`, add a test verifying `MessageComposer` is rendered inside `MessageViewport` so the background covers the composer area:

```ts
  it('mounts MessageComposer inside MessageViewport so conversation background covers the composer dock', async () => {
    mockChatRoomState.activeConversationId.value = 'conv-1'
    mockChatRoomState.activeConversation.value = {
      id: 'conv-1',
      type: 'group',
      title: 'General',
      background_url: 'preset:aurora',
    }
    const wrapper = mount(IndexPage)
    const viewport = wrapper.findComponent({ name: 'MessageViewport' })
    const bgLayer = viewport.find('[data-test="chat-background-layer"]')
    const composerDeck = viewport.find('[data-test="composer-deck"]')

    expect(bgLayer.exists()).toBe(true)
    expect(composerDeck.exists()).toBe(true)
  })
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/chatUi.test.ts tests/components/indexPage.test.ts`
Expected: FAIL (`slotted-composer` not rendered in `MessageViewport` and `composer-deck` not found inside `MessageViewport` in `IndexPage`).

- [x] **Step 3: Implement minimal layout changes in `MessageViewport.vue`, `MessageComposer.vue`, and `app/pages/index.vue`**

In `app/components/MessageViewport.vue` (around lines 346-365 and 915-933), wrap the pinned banner, scroll container, and floating scroll-to-bottom button in `<div class="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">`, and render `<slot />` after it:

```vue
<template>
  <div class="relative flex-1 flex flex-col min-h-0 bg-transparent overflow-hidden">
    <!-- Chat Background Layer & Adaptive Contrast Scrim -->
    <div
      v-if="backgroundStyle"
      data-test="chat-background-layer"
      class="absolute inset-0 pointer-events-none transition-all duration-300 z-0"
      :style="backgroundStyle"
    >
      <div
        data-test="chat-background-scrim"
        class="absolute inset-0 bg-white/70 dark:bg-[#0d0f17]/75 backdrop-blur-[1px]"
      />
    </div>

    <div class="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
      <!-- Pinned Messages Banner -->
```

And at the bottom of `app/components/MessageViewport.vue` (around lines 915-933):

```vue
      <!-- Floating "Scroll to Bottom" Button / Pill -->
      <button
        v-if="!isNearBottom"
        type="button"
        data-test="scroll-to-bottom"
        class="absolute bottom-3 right-6 z-10 transition-all cursor-pointer backdrop-blur-md shadow-lg"
        :class="unreadNewCount > 0
          ? 'px-3.5 py-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium shadow-blue-500/30 animate-bounce flex items-center gap-1.5'
          : 'w-9 h-9 rounded-full bg-white/80 dark:bg-[#1a1d28]/90 hover:bg-white dark:hover:bg-[#1a1d28] border border-black/10 dark:border-white/10 text-[var(--ap-text-primary)] flex items-center justify-center shadow-black/10 hover:scale-105 active:scale-95'"
        :aria-label="unreadNewCount > 0 ? `${unreadNewCount} new messages` : 'Scroll to bottom'"
        @click="scrollToBottom(true)"
      >
        <span v-if="unreadNewCount > 0">↓ {{ unreadNewCount }} new message{{ unreadNewCount > 1 ? 's' : '' }}</span>
        <ChevronDown v-else class="w-4 h-4 text-[var(--ap-text-secondary)]" />
      </button>
    </div>

    <slot />
  </div>
</template>
```

In `app/components/MessageComposer.vue` (line 333), add `relative z-10` so the composer dock stacks above `chat-background-layer`:

```vue
<template>
  <div class="relative z-10 p-4 bg-transparent shrink-0">
```

In `app/pages/index.vue` (lines 577-619), nest `<MessageComposer>` inside `<MessageViewport>`:

```vue
        <!-- Message Viewport -->
        <MessageViewport
          ref="messageViewportRef"
          :messages="messages"
          :search-query="searchQuery"
          :background-url="activeConversation?.background_url || activeChannel?.background_url"
          :conversation-id="activeConversationId"
          :channel-id="activeConversationId || activeChannelId"
          :is-dm="activeConversation?.type === 'direct' || Boolean(activeChannel?.is_dm)"
          :is-group="activeConversation?.type === 'group'"
          :peer-name="activeConversation?.type === 'direct' ? (activeConversation.peer?.display_name || 'Friend') : (activeConversation?.title || '')"
          :has-more-history="hasMoreHistory"
          :is-loading-history="isLoadingHistory"
          :current-user-id="currentProfile?.id"
          :current-display-name="currentProfile?.display_name"
          :last-read-at="activeChannelUnreadSince"
          :load-older="loadOlderMessages"
          @retry="retryMessage"
          @dismiss="dismissMessage"
          @reply="replyingTo = $event"
          @edit="editMessage($event.messageId, $event.content)"
          @delete="deleteMessage($event)"
          @toggle-reaction="toggleReaction($event.messageId, $event.emoji)"
          @select-image="handleOpenLightbox"
          @toggle-pin="togglePinMessage"
          @view-profile="handleViewProfile"
        >
          <!-- Message Composer -->
          <MessageComposer
            :conversation-id="activeConversationId || activeChannelId"
            :channel-slug="activeConversation?.type === 'direct' ? (activeConversation.peer?.display_name || 'friend') : (activeConversation?.title || activeChannel?.slug || 'chat')"
            :is-dm="activeConversation?.type === 'direct' || Boolean(activeChannel?.is_dm)"
            :typing-label="typingLabel"
            :disabled="connectionStatus !== 'connected'"
            :replying-to="replyingTo"
            :mention-candidates="knownProfiles"
            @send="handleSendMessage"
            @typing="notifyTyping"
            @cancel-reply="replyingTo = null"
            @send-images="handleSendImages"
          />
        </MessageViewport>
```

- [x] **Step 4: Run test suite to verify all tests pass**

Run: `npm test`
Expected: PASS across all test suites.

- [x] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue app/components/MessageComposer.vue app/pages/index.vue tests/components/chatUi.test.ts tests/components/indexPage.test.ts
git commit -m "fix(ui): extend conversation background image behind message composer"
```
