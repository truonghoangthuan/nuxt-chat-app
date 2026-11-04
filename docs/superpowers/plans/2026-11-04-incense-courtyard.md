# Incense courtyard implementation/verification plan

Scope: issue #126, isolated `feat/incense-courtyard` worktree. Parent reviews/publishes; no commits, push, PR, merge, deployment or live SQL from the implementer.

1. Inspect repository invariants, activity entry, membership schema and approved v2 files. CodeGraph unavailable; direct source inspection used.
2. RED → GREEN persistence tracer: require explicit completion, coalesce writes, persist before success. Extend with failed retry UUID retention, unavailable schema and stale generation/close tests.
3. RED → GREEN database tracer: scratch PostgreSQL fixture initially fails on missing migration; implement/check migration twice, authenticated membership/RLS, derived actor, idempotence and cooldown. Do not confuse single-connection PGlite with live multi-session concurrency.
4. RED → GREEN renderer timeline and real Vue tracer: absolute-time poses, once-only completion, skip, reduced motion, disposal; replace only preview UI/storage bindings, preserve licensed geometry and assets in readable modules.
5. RED → GREEN Activities/page entry: selected conversation, real profile, stable chat composer, close on auth/conversation changes.
6. Exercise the real Vue component in a clearly labeled scratch Vite harness because local Supabase configuration is absent. Check full phase trace, desktop/mobile, light/dark, failed save/retry, WebGL loss, close/reopen and schema gate. Browser-discovered regressions receive test-first fixes (dark scoped tokens, stale success, unavailable empty history, late orphan decode, HDR loader deprecation).
7. Run `npm ci`, complete `npm test`, production build, asset digest verifier, SQL fixture and whitespace checks. Keep large evidence under coding-profile scratch and record concise outcomes/remaining live rollout gate in the runbook.

Gate after local completion: independent parent review followed by authorized publication. Operator-authorized Supabase migration and real member/nonmember/multi-session checks remain separate rollout gates.
