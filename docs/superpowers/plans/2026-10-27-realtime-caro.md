# Real-Time Caro Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-27-realtime-caro-design.md`

## Constraints

- Nuxt 4, Vue 3, Supabase Auth/Postgres/Realtime, Vitest; no runtime dependencies.
- Database is authoritative: clients may render optimistically only if they reconcile to RPC/realtime state; no direct game-table writes.
- Work on `feat/realtime-caro-game` from freshly pulled `master`; do not deploy or alter the live Supabase project.

## Tasks

### 1. Pure rules and board tests (RED → GREEN)
- [x] Add tests for board hydration, legal coordinates, five-in-a-row in four directions, gaps/opponent interruption, and draw detection.
- [x] Run focused tests and observe 8 expected failures from the unimplemented helpers.
- [x] Implement helpers in `app/utils/caro.ts` and verify tests pass.

### 2. Supabase schema and RPCs
- [x] Add idempotent game/move tables, indexes, constraints, participant-only RLS, and read-only client grants.
- [x] Add safe `SECURITY DEFINER` create/join/move RPCs with `auth.uid()`, transaction/row locking, and server-side turn/board/win/draw validation.
- [x] Add game and move tables to Realtime publication; inspect policies, grants, function search paths, and concurrent move behavior.

### 3. App state and route
- [x] Add a typed `useCaroGame` composable for RPCs, authoritative fetches, room-scoped realtime subscription, cleanup, and reconnect refresh.
- [x] Add `/caro` create/wait/join/play/results UI, invite copy action, clear error/loading states, responsive accessible 15×15 board, and keyboard focus.
- [x] Add a sidebar entry point and test its navigation.
- [x] Add page/composable tests using mocked Supabase auth, RPCs, and channels; verify state updates and cleanup.

### 4. Verification/review
- [x] Run focused tests, all tests, production build, and `git diff --check`.
- [x] Review final diff independently for SQL/RLS security, participant restrictions, concurrent turns, route lifecycle, and accessibility. Check documented schema upgrade prerequisite.

### 5. Publish
- [x] Commit and push the feature branch; open a PR to `master` describing the schema prerequisite, behavior, tests, and limitations.
- [x] Verify the PR URL and checks: GitGuardian and Vercel Preview Comments passed; Vercel deployment is blocked by project access; Supabase Preview was skipped.

## Implementation verification notes

- Focused suite: 19 tests passed across helper, composable, and page/sidebar suites.
- Full `npm test`: 420 tests passed across 34 files.
- `npm run build`: passed after restoring the lockfile-pinned dependencies with `npm ci`; package manifests were unchanged. The build emits existing missing-Supabase-environment and duplicated-auto-import warnings.
- `git diff --check`: passed.
- Independent final diff review: no concrete blockers or security findings.
- Local PostgreSQL 17 smoke: applied the exact Caro SQL section twice; verified rerunnable DDL, Realtime publication membership, RLS visibility, anonymous/direct-write denial, room lifecycle, invalid moves, all four win directions, final-state rejection, full-board draw, and two concurrent same-turn requests (exactly one committed).
- Live Supabase Auth/Realtime transport and two-browser delivery have not been tested; the local SQL smoke used an isolated minimal `auth.uid()` shim.
- Apply the Caro SQL section before use; see `docs/superpowers/caro-setup.md`.
