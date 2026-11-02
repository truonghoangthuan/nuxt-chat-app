# Refactor Profile Settings & User Profile Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ProfileSettingsModal.vue` into a responsive, screen-fitting modal with scrollable content and pinned header/footer, and fix `UserProfileModal.vue` and chat queries so the Bank QR code reliably displays when clicking another user's avatar.

**Architecture:** 
1. **Responsive Profile Settings Modal (`ProfileSettingsModal.vue`):** Wrap the modal in a constrained container (`max-h-[90vh]` or `max-h-[calc(100vh-3rem)]`, `w-full max-w-xl md:max-w-2xl`) featuring a fixed header, a pinned footer (always accessible Cancel and Save buttons), and an internal scrollable body (`overflow-y-auto`). Organize controls with clean visual segmentation or tabs (Profile vs. Appearance/Preferences) and a responsive 2-column grid on desktop where appropriate so users never experience vertical cutoff. Preserve all functional `data-test` hooks and emit contracts.
2. **Bank QR Code Resolution in User Profile Modal (`UserProfileModal.vue` & queries):** Update PostgREST select projections in `useChatRoom.ts` and `useChatMediaUpload.ts` to include `bank_qr_url` in `author:profiles!messages_user_id_fkey(...)`. In `UserProfileModal.vue` and `index.vue`, ensure profile data resolution fetches or falls back to `supabase.from('profiles')` if `bank_qr_url` is missing from the passed author snippet, and add responsive viewport scrolling (`max-h-[85vh] overflow-y-auto`) so the enlarged QR code fits within any display.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS, Supabase PostgREST client, Lucide icons, Vitest + `@vue/test-utils`.

**Spec:**
- User requirement 1: User setting dialog is too big and not responsive, does not fit inside the screen. Refactor to improve UI/UX.
- User requirement 2: Show the bank QR code inside the user information dialog when clicking on another user avatar.

---

## Global Constraints

- Preserve all existing `data-test` hooks (`data-test="avatar-url"`, `data-test="color-swatch-*"`, `data-test="bank-qr-preview"`, `data-test="bank-qr-upload-btn"`, `data-test="bank-qr-remove-btn"`, `data-test="profile-email"`, `data-test="profile-user-id"`, `data-test="profile-created-at"`, `data-test="copy-user-id-btn"`, `data-test="theme-mode-toggle"`, `data-test="theme-option-default"`, `data-test="theme-option-vscode"`, `data-test="theme-option-yahoo"`, `data-test="theme-option-telegram"`, `data-test="confetti-toggle"`, `data-test="user-bank-qr"`, `data-test="copy-profile-email"`, `data-test="copy-profile-id"`, `data-test="start-dm-btn"`, `data-test="close-profile-modal"`).
- Preserve PostgREST multi-FK embedding discipline: all joined profile queries must explicitly reference `author:profiles!messages_user_id_fkey(...)` to prevent `PGRST201` errors.
- Never project non-existent columns (no `channel_id` on `public.messages`).
- Maintain SSR-safe state fallback discipline (`typeof useState !== 'undefined'`) and Vitest compatibility.
- Ensure light/dark mode contrast tokens remain compliant with semantic variables (`--ap-text-primary`, `--ap-text-secondary`, `--ap-text-muted`).

---

## Review Focus

1. **Screen Overflow on Short Viewports:** On screens with height < 800px (e.g. 768px laptop or mobile browser with toolbars), `ProfileSettingsModal` and `UserProfileModal` must never be pushed off screen; header and action buttons must remain visible with the body scrolling smoothly.
2. **Missing `bank_qr_url` in Message Author Objects:** When clicking an avatar from message history, real-time incoming messages, or channel peer headers, `item.message.author` or peer profile must contain `bank_qr_url` or fetch it dynamically without error.
3. **Empty Bank QR Code State in User Profile:** If a user has not uploaded a Bank QR code (`bank_qr_url` is null/empty), `UserProfileModal.vue` must handle this gracefully without blank image frames or layout distortion.
4. **Form Submission & State Preservation in Profile Settings:** Editing fields across responsive columns or tabs must preserve all state, validation rules (`isValidDisplayName`, `isValidAvatarColor`, `isValidAvatarUrl`), and emit payload formats.
5. **Image Lightbox & Full-Size QR Viewing:** Clicking the bank QR code in `UserProfileModal` should allow opening or viewing clearly without breaking modal dismissal.

---

### Task 1: Add `bank_qr_url` to Message Author Queries & Profile Fetching

**Files:**
- Modify: `app/composables/useChatRoom.ts:770, 1346, 1397, 1540, 1547, 1641, 1648`
- Modify: `app/composables/useChatMediaUpload.ts:211, 218`
- Modify: `app/pages/index.vue:481-484`
- Test: `tests/composables/useChatRoom.test.ts` (or relevant composable suite)

**Interfaces:**
- Consumes: `author:profiles!messages_user_id_fkey(...)`
- Produces: Query results projecting `bank_qr_url` alongside `id, display_name, avatar_color, avatar_url, email`.

- [ ] **Step 1: Write test verifying message author projection includes bank_qr_url**

In `tests/composables/useChatRoom.test.ts`, add test asserting `bank_qr_url` is included in author profile mapping when loading messages.

- [ ] **Step 2: Update `useChatRoom.ts` and `useChatMediaUpload.ts` queries**

Update all occurrences of:
```typescript
author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url, email)
```
and
```typescript
author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)
```
to include `bank_qr_url`:
```typescript
author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url, email, bank_qr_url)
```

- [ ] **Step 3: Update `handleViewProfile` in `app/pages/index.vue` to fetch full profile if `bank_qr_url` is undefined**

In `handleViewProfile`:
```typescript
async function handleViewProfile(profile: Profile) {
  selectedUserProfile.value = profile
  isUserProfileModalOpen.value = true
  if (profile?.id && profile.bank_qr_url === undefined && typeof useSupabaseClient === 'function') {
    try {
      const supabase = useSupabaseClient()
      const { data } = await supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle()
      if (data && selectedUserProfile.value?.id === profile.id) {
        selectedUserProfile.value = { ...selectedUserProfile.value, ...data }
      }
    } catch {
      // ignore
    }
  }
}
```

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run tests/composables/useChatRoom.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add app/composables/useChatRoom.ts app/composables/useChatMediaUpload.ts app/pages/index.vue
git commit -m "fix(chat): include bank_qr_url in message author select projections"
```

---

### Task 2: Refactor `UserProfileModal.vue` for Bank QR Display and Responsive Fit

**Files:**
- Modify: `app/components/UserProfileModal.vue`
- Test: `tests/components/UserProfileModal.test.ts`

**Interfaces:**
- Consumes: `props.profile` (with `bank_qr_url`), `props.isOpen`, `props.isOnline`, `props.isCurrentUser`
- Produces: Responsive modal card (`max-h-[85vh] flex flex-col`) with scrollable body, prominent Bank QR card, scan instructions, and full-size preview.

- [ ] **Step 1: Write failing test in `tests/components/UserProfileModal.test.ts` for responsive scroll and bank QR layout**

Add assertions in `tests/components/UserProfileModal.test.ts`:
```typescript
it('ensures modal container has max height and scrollable body for responsive fitting', () => {
  const wrapper = mount(UserProfileModal, {
    props: {
      isOpen: true,
      profile: {
        id: 'u-1',
        display_name: 'Vua hải tặc',
        email: 'mvl1510@gmail.com',
        avatar_color: '#f59e0b',
        bank_qr_url: 'https://example.com/qr.png',
      },
    },
  })
  expect(wrapper.find('.overflow-y-auto').exists()).toBe(true)
  expect(wrapper.find('[data-test="user-bank-qr"]').exists()).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/UserProfileModal.test.ts`
Expected: FAIL due to missing `.overflow-y-auto` class.

- [ ] **Step 3: Refactor `UserProfileModal.vue`**

1. Add outer scroll containment to card:
```html
<div
  class="messenger-dialog-surface relative w-full max-w-sm max-h-[85vh] rounded-3xl bg-white/95 dark:bg-[#161824]/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col z-10 transition-all text-[var(--ap-text-primary)]"
  @click.stop
>
```
2. Split into fixed close button + scrollable inner body (`overflow-y-auto p-6 space-y-4`) + sticky/pinned action button at bottom (`p-4 pt-0 border-t border-black/5 dark:border-white/5` or contained within).
3. Enhance Bank QR card visual treatment with high contrast background, clear scan/payment label, copy link / enlarge button, and optional empty indicator or clean collapse when null.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/UserProfileModal.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit changes**

```bash
git add app/components/UserProfileModal.vue tests/components/UserProfileModal.test.ts
git commit -m "feat(profile): make UserProfileModal responsive with scrollable bank QR card"
```

---

### Task 3: Refactor `ProfileSettingsModal.vue` for Responsive Layout & Screen Fit

**Files:**
- Modify: `app/components/ProfileSettingsModal.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `props.isOpen`, `props.profile`, `useTheme()`, `getConfettiEnabled()`
- Produces: Screen-fitted dialog (`max-h-[90vh] flex flex-col`, `w-full max-w-xl md:max-w-2xl`) with:
  - Fixed sticky header (Title, subtitle, close button)
  - Scrollable content body (`overflow-y-auto flex-1 p-6`)
  - Sticky footer (Cancel button, Save changes button)
  - Responsive 2-column or tabbed layout grouping Profile & Identity on one side/tab, and Application Theme, Preferences & Account info on the other.
- Preserves all 13 `data-test` attributes and form save contract.

- [ ] **Step 1: Write test in `tests/components/chatUi.test.ts` asserting responsive container and fixed footer**

Add tests in `tests/components/chatUi.test.ts`:
```typescript
it('ProfileSettingsModal has max-height constraint and scrollable body for responsiveness', async () => {
  const ProfileSettingsModal = (await import('~/components/ProfileSettingsModal.vue')).default
  const wrapper = mount(ProfileSettingsModal, {
    props: {
      isOpen: true,
      profile: {
        id: 'u-1',
        display_name: 'Alice',
        avatar_color: '#0284c7',
      },
    },
  })
  expect(wrapper.find('.overflow-y-auto').exists()).toBe(true)
  expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts -t "ProfileSettingsModal has max-height constraint"`
Expected: FAIL due to missing `.overflow-y-auto`.

- [ ] **Step 3: Refactor `ProfileSettingsModal.vue` template & styling**

1. Restructure container:
   - Outer shell: `fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md`
   - Dialog card: `messenger-dialog-surface profile-settings-surface w-full max-w-xl md:max-w-2xl max-h-[90vh] md:max-h-[85vh] rounded-3xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#161824]/95 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--ap-text-primary)]`
2. Header:
   - Pinned top header with `p-5 pb-3 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0`
3. Body:
   - Scrollable `overflow-y-auto flex-1 p-5 sm:p-6 space-y-5 scrollbar-thin`
   - Responsive layout: On desktop (`md:`), group sections logically:
     - Left column / Group 1: Live Preview, Display Name, Avatar image URL, Avatar Color swatches, Bank QR Code.
     - Right column / Group 2: Account Email & ID details card, Application Theme selector (Theme options + Dark mode toggle), Celebration Confetti toggle.
4. Footer:
   - Pinned bottom footer: `p-4 sm:p-5 pt-3 border-t border-black/5 dark:border-white/5 flex justify-end gap-2.5 shrink-0 bg-white/80 dark:bg-[#161824]/80 backdrop-blur-md`
   - Cancel button and Submit button always visible regardless of screen height.

- [ ] **Step 4: Run all ProfileSettingsModal tests to verify complete compatibility**

Run: `npx vitest run tests/components/chatUi.test.ts -t "ProfileSettingsModal"`
Expected: All tests PASS.

- [ ] **Step 5: Commit changes**

```bash
git add app/components/ProfileSettingsModal.vue tests/components/chatUi.test.ts
git commit -m "feat(settings): refactor ProfileSettingsModal to responsive screen-fitting layout"
```

---

### Task 4: Full Suite Verification & Visual Regression Check

**Files:**
- All touched files

- [ ] **Step 1: Run full Vitest test suite**

Run: `npm test`
Expected: 100% test suites pass without regression.

- [ ] **Step 2: Run Nuxt build check**

Run: `npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Verification commit**

```bash
git commit --allow-empty -m "chore: verify refactored dialogs pass all tests and build"
```
