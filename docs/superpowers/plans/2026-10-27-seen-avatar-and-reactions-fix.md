# Seen By Avatar Circle & Message Reactions Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the capsule-shaped seen-by user avatar into a clean circular avatar badge and fix the PGRST204 `channel_id` error when fetching/adding message reactions.

**Architecture:** Extend `UserAvatar.vue` with `size="xs"` (16px) and `shape="circle"` (`rounded-full`), positioning `img` inside a `relative overflow-hidden` container to eliminate stretching. Strip obsolete `channel_id` from `useChatRoom.ts` reaction insert payloads and add an idempotent SQL migration dropping legacy channel policies and ensuring `conversation_id` on `public.message_reactions`.

**Tech Stack:** Vue 3, Nuxt 4, Tailwind CSS, Supabase / PostgREST, Vitest.

## Global Constraints

- Never pass `channel_id` to `public.message_reactions` inserts or filters; always use `conversation_id`.
- Drop legacy RLS policies on `public.message_reactions` before creating scoped policies to prevent PostgREST column evaluation errors.
- Preserve functional `data-test` attributes and profile click triggers (`viewProfile`).

---

### Task 1: Add `size="xs"` and `shape="circle"` support to `UserAvatar.vue`

**Files:**
- Modify: `app/components/UserAvatar.vue`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `displayName`, `avatarColor`, `avatarUrl`, `size`, `shape`
- Produces: Circular or squircle avatar badge rendered at 16px (`xs`), 28px (`sm`), 36px (`md`), 44px (`lg`), 64px (`xl`), or 80px (`2xl`)

- [ ] **Step 1: Write failing unit test for `UserAvatar` circle shape and `xs` size**

Add to `tests/components/chatUi.test.ts`:

```typescript
  it('UserAvatar renders circular shape with xs size', () => {
    const wrapper = mount(UserAvatar, {
      props: {
        displayName: 'Alice',
        size: 'xs',
        shape: 'circle',
      },
    })
    const inner = wrapper.find('div > div')
    expect(inner.classes()).toContain('w-4')
    expect(inner.classes()).toContain('h-4')
    expect(inner.classes()).toContain('rounded-full')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/chatUi.test.ts -t "UserAvatar renders circular shape with xs size"`
Expected: FAIL (types / classes do not match).

- [ ] **Step 3: Update `UserAvatar.vue` implementation**

In `app/components/UserAvatar.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { getAvatarInitials, getAvatarColor } from '~/utils/chat'

const props = withDefaults(
  defineProps<{
    displayName: string
    avatarColor?: string
    avatarUrl?: string | null
    showOnline?: boolean
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    shape?: 'squircle' | 'circle'
  }>(),
  {
    avatarColor: '',
    avatarUrl: '',
    showOnline: false,
    size: 'md',
    shape: 'squircle',
  },
)

const initials = computed(() => getAvatarInitials(props.displayName || '?'))
const bgColor = computed(() => props.avatarColor || getAvatarColor(props.displayName || 'seed'))

const sizeClasses = computed(() => {
  const isCircle = props.shape === 'circle'
  if (props.size === 'xs') return `w-4 h-4 ${isCircle ? 'rounded-full' : 'rounded-[4px]'} text-[8px]`
  if (props.size === 'sm') return `w-7 h-7 ${isCircle ? 'rounded-full' : 'rounded-[7px]'} text-[11px]`
  if (props.size === 'lg') return `w-11 h-11 ${isCircle ? 'rounded-full' : 'rounded-[11px]'} text-sm`
  if (props.size === 'xl') return `w-16 h-16 ${isCircle ? 'rounded-full' : 'rounded-[16px]'} text-xl`
  if (props.size === '2xl') return `w-20 h-20 ${isCircle ? 'rounded-full' : 'rounded-[20px]'} text-2xl`
  return `w-9 h-9 ${isCircle ? 'rounded-full' : 'rounded-[9px]'} text-[13px]`
})

const dotClasses = computed(() => {
  if (props.size === 'xs') return 'w-1.5 h-1.5 -bottom-0.5 -right-0.5'
  if (props.size === 'sm') return 'w-2 h-2 -bottom-0.5 -right-0.5'
  if (props.size === 'lg') return 'w-3 h-3 -bottom-0.5 -right-0.5'
  if (props.size === 'xl') return 'w-3.5 h-3.5 -bottom-0.5 -right-0.5'
  if (props.size === '2xl') return 'w-4 h-4 -bottom-0.5 -right-0.5 ring-[3px]'
  return 'w-2.5 h-2.5 -bottom-0.5 -right-0.5'
})
</script>

<template>
  <div class="inline-flex items-center justify-center shrink-0">
    <div
      class="relative flex items-center justify-center font-bold tracking-tight text-white select-none overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.2)]"
      :class="sizeClasses"
      :style="{ backgroundColor: bgColor }"
      :title="displayName"
    >
      <img
        v-if="avatarUrl"
        :key="avatarUrl"
        :src="avatarUrl"
        alt=""
        class="absolute inset-0 w-full h-full object-cover"
        referrerpolicy="no-referrer"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      {{ initials }}
    </div>
    <span
      v-if="showOnline"
      class="absolute block rounded-full ring-2 ring-[var(--ap-stage)] bg-emerald-500"
      :class="dotClasses"
    ></span>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/chatUi.test.ts -t "UserAvatar renders circular shape with xs size"`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add app/components/UserAvatar.vue tests/components/chatUi.test.ts
git commit -m "feat(ui): add size xs and circle shape to UserAvatar"
```

---

### Task 2: Update `MessageViewport.vue` seen-by display to circular avatar

**Files:**
- Modify: `app/components/MessageViewport.vue:990-1013`
- Test: `tests/components/chatUi.test.ts`

**Interfaces:**
- Consumes: `seenByMap[item.message.id]`
- Produces: Circular `UserAvatar` badges with `size="xs"` and `shape="circle"`

- [ ] **Step 1: Update `MessageViewport.vue` seen-by rendering**

Replace lines 990-1013 in `app/components/MessageViewport.vue`:

```vue
        <!-- Seen By Badges -->
        <div
          v-if="seenByMap[item.message.id]?.length"
          :data-test="`seen-by-${item.message.id}`"
          class="flex items-center gap-1 mt-0.5 mb-1"
          :class="item.isSender ? 'justify-end pr-1' : 'justify-start pl-11'"
          :title="`Seen by ${seenByMap[item.message.id].map(p => p.display_name).join(', ')}`"
        >
          <div
            v-for="peer in seenByMap[item.message.id]"
            :key="peer.id"
            class="transition-transform hover:scale-110 cursor-pointer"
            :title="`Seen by ${peer.display_name}`"
            @click="emit('viewProfile', peer)"
          >
            <UserAvatar
              :display-name="peer.display_name"
              :avatar-color="peer.avatar_color"
              :avatar-url="peer.avatar_url"
              size="xs"
              shape="circle"
              class="ring-1 ring-black/10 dark:ring-white/20 shadow-xs"
            />
          </div>
        </div>
```

- [ ] **Step 2: Run tests to verify seen-by tests pass**

Run: `npx vitest run tests/components/chatUi.test.ts -t "MessageViewport renders seen-by avatar badges"`
Expected: PASS.

- [ ] **Step 3: Commit changes**

```bash
git add app/components/MessageViewport.vue
git commit -m "fix(ui): render seen-by avatars as circular badges"
```

---

### Task 3: Strip `channel_id` from `useChatRoom.ts` `toggleReaction` insert payload

**Files:**
- Modify: `app/composables/useChatRoom.ts:1966-1987`
- Test: `tests/composables/useChatRoom.test.ts`

**Interfaces:**
- Consumes: `toggleReaction(messageId, emoji)`
- Produces: PostgREST-safe `insert` payload `{ message_id, conversation_id, user_id, emoji }`

- [ ] **Step 1: Write test verifying `message_reactions` insert does not send `channel_id`**

Add to `tests/composables/useChatRoom.test.ts`:

```typescript
  it('toggleReaction inserts into message_reactions with conversation_id and without channel_id', async () => {
    const room = useChatRoom()
    await room.createGroup('Reaction Test Team', ['u-bob'])
    await room.sendMessage('Target msg')
    const msg = room.messages.value[0]

    let insertedPayload: any = null
    const origFrom = mockSupabase.from
    mockSupabase.from = vi.fn((table: string) => {
      const res = origFrom(table)
      if (table === 'message_reactions') {
        res.insert = vi.fn().mockImplementation((payload: any) => {
          insertedPayload = payload
          return Promise.resolve({ error: null })
        })
      }
      return res
    })

    const res = await room.toggleReaction(msg.id, '🚀')
    expect(res.error).toBeNull()
    expect(insertedPayload).toBeDefined()
    expect(insertedPayload.conversation_id).toBeDefined()
    expect(insertedPayload.channel_id).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "toggleReaction inserts into message_reactions"`
Expected: FAIL (`insertedPayload.channel_id` is defined).

- [ ] **Step 3: Modify `toggleReaction` in `app/composables/useChatRoom.ts`**

In `app/composables/useChatRoom.ts` (lines 1966-1987):

```typescript
    } else {
      const optimisticReaction: MessageReaction = {
        message_id: messageId,
        conversation_id: conversationId,
        channel_id: conversationId,
        user_id: current.id,
        emoji,
      }
      messagesStore.applyReactionAdded(optimisticReaction)
      const { error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          conversation_id: conversationId,
          user_id: current.id,
          emoji,
        })
      if (error) {
        messagesStore.applyReactionRemoved({
          message_id: messageId,
          user_id: current.id,
          emoji,
        })
        return { error: error.message }
      }
      return { error: null }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/composables/useChatRoom.test.ts -t "toggleReaction inserts into message_reactions"`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add app/composables/useChatRoom.ts tests/composables/useChatRoom.test.ts
git commit -m "fix(chat): strip obsolete channel_id from message_reactions insert payload"
```

---

### Task 4: Provide idempotent Postgres migration for `public.message_reactions`

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: Clean, idempotent SQL dropping legacy channel policies and ensuring `conversation_id` is indexed and enforced with RLS.

- [ ] **Step 1: Update `supabase/schema.sql` section 5**

In `supabase/schema.sql`, replace lines 452-482 with:

```sql
-- Drop any legacy channel-based policies that fail PostgREST schema cache
drop policy if exists "Authenticated users can view message reactions" on public.message_reactions;
drop policy if exists "Authenticated users can view accessible message reactions" on public.message_reactions;
drop policy if exists "Authenticated users can insert their own reactions" on public.message_reactions;
drop policy if exists "Authenticated users can insert accessible reactions" on public.message_reactions;
drop policy if exists "Authenticated users can delete their own reactions" on public.message_reactions;
drop policy if exists "Authenticated users can delete accessible reactions" on public.message_reactions;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

-- Ensure conversation_id column exists if table was migrated from channel_id
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'conversation_id'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'channel_id'
    ) then
      alter table public.message_reactions rename column channel_id to conversation_id;
    else
      alter table public.message_reactions add column conversation_id uuid references public.conversations(id) on delete cascade;
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'channel_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'conversation_id'
  ) then
    alter table public.message_reactions drop column if exists channel_id cascade;
  end if;
end;
$$;

drop index if exists public.message_reactions_channel_idx;

alter table public.message_reactions replica identity full;
alter table public.message_reactions enable row level security;

create index if not exists message_reactions_conv_idx
  on public.message_reactions (conversation_id, message_id);

create policy "Authenticated users can view accessible message reactions"
  on public.message_reactions for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

create policy "Authenticated users can insert accessible reactions"
  on public.message_reactions for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_access_conversation(conversation_id));

create policy "Authenticated users can delete accessible reactions"
  on public.message_reactions for delete
  to authenticated
  using (auth.uid() = user_id and public.can_access_conversation(conversation_id));
```

- [ ] **Step 2: Run all tests to verify whole suite stays green**

Run: `npm test`
Expected: 399+ tests pass.

- [ ] **Step 3: Commit changes**

```bash
git add supabase/schema.sql
git commit -m "fix(db): ensure idempotent message_reactions conversation_id migration and policy drop"
```
