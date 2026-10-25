# Mobile Chat Bubble Width Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix chat message bubbles and sender headers getting crushed into 1-word-per-line vertical columns on mobile screens.

**Architecture:** The Frosted Action Toolbar in `app/components/MessageViewport.vue` currently uses `flex opacity-0 ... shrink-0` as an in-flow flex sibling inside each message row. Because `opacity-0` still reserves layout width (~240px–310px with `shrink-0`), it starves the `min-w-0` message column of horizontal space on mobile viewports. Positioning the toolbar `absolute` (floating above the message row with `pointer-events-none` until hovered/focused) removes it from normal flex flow so message bubbles receive their full `max-w-[85%]` width.

**Tech Stack:** Nuxt 4, Vue 3, Tailwind CSS, Vitest (`@vue/test-utils`)

## Global Constraints

- Preserve all `data-test` hooks (`react-*`, `pin-*`, `reply-*`, `edit-*`, `delete-*`, `message-bubble-*`).
- Do not reintroduce `hidden` on the reaction toolbar (existing test asserts `expect(toolbar?.className).not.toContain('hidden')` and `toContain('group-hover:opacity-100')`).
- Ensure the hidden (`opacity-0`) toolbar has `pointer-events-none` (and restores `pointer-events-auto` on hover/focus/active) so it never intercepts taps on messages underneath.

---

### Task 1: Float the Message Action Toolbar Out of Flex Flow

**Files:**
- Modify: `app/components/MessageViewport.vue:520-580`
- Test: `tests/components/chatUi.test.ts:1330-1356`

**Interfaces:**
- Consumes: `MessageViewport.vue` message row `.group.relative.flex.w-full`
- Produces: Out-of-flow `absolute` action toolbar that does not consume horizontal flex space in the message row.

- [x] **Step 1: Update the test in `tests/components/chatUi.test.ts` to assert the toolbar is positioned `absolute` out of flex flow**

```ts
    it('renders reaction toolbar out of flex flow so mobile message bubbles are not squeezed', () => {
      const wrapper = mount(MessageViewport, {
        props: {
          conversationId: 'c-1',
          currentUserId: 'u-alice',
          messages: [
            {
              id: 'm-sent',
              client_id: 'c-1',
              channel_id: 'c-1',
              user_id: 'u-alice',
              content: 'Sent message',
              created_at: '2026-10-18T10:00:00Z',
              status: 'sent',
              author: { id: 'u-alice', display_name: 'Alice', avatar_color: '#0284c7' },
            },
          ],
        },
      })

      expect(wrapper.find('[data-test="open-mobile-actions"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="react-m-sent-👍"]').exists()).toBe(true)
      const toolbar = wrapper.find('[data-test="react-m-sent-👍"]').element.closest('div')
      expect(toolbar?.className).not.toContain('hidden')
      expect(toolbar?.className).toContain('group-hover:opacity-100')
      expect(toolbar?.className).toContain('absolute')
      expect(toolbar?.className).toContain('pointer-events-none')
      expect(toolbar?.className).toContain('group-hover:pointer-events-auto')
    })
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts -t "renders reaction toolbar"`
Expected: FAIL with `expected '...flex opacity-0...' to contain 'absolute'`

- [x] **Step 3: Position the Frosted Action Toolbar `absolute` in `app/components/MessageViewport.vue`**

Replace lines 520–526 in `app/components/MessageViewport.vue`:

```vue
          <!-- Frosted Action Toolbar (Hover on Desktop, Tap/Focus on Touch) -->
          <div
            v-if="item.message.status === 'sent' && !item.message.deleted_at"
            class="absolute -top-3 z-20 flex opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto active:opacity-100 active:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity items-center gap-0.5 bg-white/95 dark:bg-[#1a1d28]/95 backdrop-blur-xl border border-black/10 dark:border-white/15 rounded-full px-2 py-0.5 shadow-xl max-w-[calc(100%-0.5rem)] overflow-x-auto"
            :class="item.isSender ? 'right-0' : 'left-11 max-w-[calc(100%-2.75rem)]'"
          >
```

- [x] **Step 4: Run test suite to verify all tests pass**

Run: `npm test`
Expected: PASS across all test suites

- [ ] **Step 5: Commit**

```bash
git add app/components/MessageViewport.vue tests/components/chatUi.test.ts
git commit -m "fix(ui): float message action toolbar out of flex flow on mobile"
```
