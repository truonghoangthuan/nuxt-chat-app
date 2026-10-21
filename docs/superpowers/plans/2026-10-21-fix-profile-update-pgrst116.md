# Fix Profile Update PGRST116 Error Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the PostgREST 406 / PGRST116 "The result contains 0 rows" error when updating user display names by ensuring profile row existence via idempotent upsert with email, fixing fallback profile initialization, and backfilling auth users.

**Architecture:** In `app/composables/useAuthProfile.ts`, switch `updateProfile` from fragile `.update()` to idempotent `.upsert()` including required `email`, and fix `ensureProfile` fallback profile creation to include `email` so `public.profiles` not-null constraints are never violated. In `supabase/schema.sql`, add an idempotent backfill for existing `auth.users` who lack a profile row. In `vitest.config.ts`, exclude `.worktrees/**` to preserve `npm test` gatekeeper isolation.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Supabase (@nuxtjs/supabase, PostgreSQL RLS, PostgREST), Vitest, Happy-DOM.

## Global Constraints

- Never break existing TypeScript interfaces: `Profile` requires `id: string`, `email: string`, `display_name: string`, `avatar_color: string`.
- Preserve RLS compliance: `auth.uid() = id` must be satisfied for all profile insert/update operations.
- Vitest/SSR compatibility: guard `typeof useState !== 'undefined'` in composables.
- Run `npm test` and ensure 100% test pass before completion.

## Review Focus

- Profile update for existing profile row: updates display_name, avatar_color, avatar_url without altering email or duplicating rows.
- Profile update for user whose database row does not exist yet (orphaned auth user): successfully inserts new profile row with valid email, avoiding PGRST116.
- Profile fallback initialization in `ensureProfile`: supplies `email: authUser.email || ''` so Postgres `email text not null` constraint does not fail.
- Supabase auth token expiry / missing authUser: calls `supabase.auth.getUser()` when authUser or userId is absent to refresh session.
- Vitest test runner isolation: does not discover test suites from `.worktrees/`.

---

### Task 1: Vitest Worktree Exclusion & useAuthProfile Unit Test Suite

**Files:**
- Modify: `vitest.config.ts:13-16`
- Create: `tests/composables/useAuthProfile.test.ts`

**Interfaces:**
- Consumes: `useAuthProfile` from `app/composables/useAuthProfile.ts`
- Produces: Test coverage verifying `ensureProfile` and `updateProfile` include `email` and handle missing database rows.

- [ ] **Step 1: Exclude `.worktrees/**` in `vitest.config.ts`**

Update `vitest.config.ts` to add `exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.nuxt/**', '**/.output/**']` inside `test`.

- [ ] **Step 2: Write failing unit tests in `tests/composables/useAuthProfile.test.ts`**

Create test file testing:
1. `ensureProfile()` provides `email` when upserting fallback profile.
2. `updateProfile()` uses `upsert` with `email` and succeeds even if profile was not previously in the database (preventing PGRST116).

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthProfile, extractAuthUserId } from '~/composables/useAuthProfile'

const mockAuthUser = {
  id: '3e4b0b6f-9370-4c40-ba71-5dcec6bef736',
  email: 'testuser@example.com',
  user_metadata: {
    display_name: 'Original Name',
    avatar_color: '#0284c7',
  },
}

let mockSupabase: any

vi.mock('#imports', () => ({
  useSupabaseUser: () => ({ value: mockAuthUser }),
  useSupabaseClient: () => mockSupabase,
}))

describe('useAuthProfile', () => {
  beforeEach(() => {
    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockAuthUser }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn(),
    }
  })

  it('extracts auth user id from id or sub claims', () => {
    expect(extractAuthUserId({ id: 'u-123' })).toBe('u-123')
    expect(extractAuthUserId({ sub: 'u-456' })).toBe('u-456')
    expect(extractAuthUserId(null)).toBeNull()
  })

  it('includes email when creating fallback profile in ensureProfile', async () => {
    let upsertPayload: any = null
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn().mockImplementation((payload) => {
            upsertPayload = payload
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: payload, error: null }),
              }),
            }
          }),
        }
      }
      return {}
    })

    const { ensureProfile } = useAuthProfile()
    const prof = await ensureProfile()

    expect(prof).not.toBeNull()
    expect(upsertPayload).not.toBeNull()
    expect(upsertPayload.email).toBe('testuser@example.com')
  })

  it('uses upsert with email in updateProfile so missing profile row does not throw PGRST116', async () => {
    let upsertCalled = false
    let upsertPayload: any = null

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          upsert: vi.fn().mockImplementation((payload) => {
            upsertCalled = true
            upsertPayload = payload
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: payload, error: null }),
              }),
            }
          }),
        }
      }
      return {}
    })

    const { updateProfile } = useAuthProfile()
    const result = await updateProfile('New Display Name', '#0284c7', '')

    expect(result.error).toBeNull()
    expect(upsertCalled).toBe(true)
    expect(upsertPayload.display_name).toBe('New Display Name')
    expect(upsertPayload.email).toBe('testuser@example.com')
    expect(upsertPayload.id).toBe('3e4b0b6f-9370-4c40-ba71-5dcec6bef736')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/composables/useAuthProfile.test.ts`
Expected: FAIL because `updateProfile` currently calls `.update()` and `ensureProfile` does not set `email` in `fallbackProfile`.

---

### Task 2: Implement Fix in `useAuthProfile.ts`

**Files:**
- Modify: `app/composables/useAuthProfile.ts:56-77,96-138`

**Interfaces:**
- Consumes: `useSupabaseClient`, `useSupabaseUser`, `Profile` type
- Produces: `ensureProfile`, `updateProfile` with complete `email` property and idempotent `.upsert()` behavior.

- [ ] **Step 1: Fix `ensureProfile` fallback profile creation**

In `app/composables/useAuthProfile.ts`:
1. Extract `fallbackEmail = authUser.email || ''`.
2. Add `email: fallbackEmail` to `fallbackProfile`.
3. Handle error response from `upsert`.

- [ ] **Step 2: Fix `updateProfile` to resolve auth user and use `upsert`**

In `app/composables/useAuthProfile.ts`:
1. Resolve `authUser` and `userId` via `extractAuthUserId(authUser)`. If missing or authUser has no email, call `supabase.auth.getUser()`.
2. Extract `email = authUser?.email || currentProfile.value?.email || ''`.
3. Change `supabase.from('profiles').update(...)` to `supabase.from('profiles').upsert(...)` with payload `{ id: userId, email, display_name: cleanName, avatar_color: avatarColor, avatar_url: cleanAvatarUrl || null }`.
4. Keep `currentProfile.value` in sync with the returned profile.

- [ ] **Step 3: Run unit tests to verify they pass**

Run: `npx vitest run tests/composables/useAuthProfile.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts app/composables/useAuthProfile.ts tests/composables/useAuthProfile.test.ts
git commit -m "fix(auth): prevent PGRST116 on profile update with idempotent upsert and email sync"
```

---

### Task 3: Database Schema Backfill Migration & Runbook

**Files:**
- Modify: `supabase/schema.sql:68-75`

**Interfaces:**
- Consumes: `auth.users` table
- Produces: SQL backfill query ensuring all existing users in `auth.users` have corresponding entries in `public.profiles`.

- [ ] **Step 1: Add idempotent user backfill query to `supabase/schema.sql`**

Append or insert after `on_auth_user_created` trigger in `supabase/schema.sql`:

```sql
-- Backfill: insert profiles for any existing auth.users lacking a profile row
insert into public.profiles (id, email, display_name, avatar_color)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Friend'
  ),
  coalesce(u.raw_user_meta_data->>'avatar_color', '#0284c7')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
```

- [ ] **Step 2: Commit schema enhancement**

```bash
git add supabase/schema.sql
git commit -m "fix(db): add idempotent profile backfill for existing auth users"
```
