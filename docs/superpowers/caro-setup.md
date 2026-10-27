# Caro setup and verification

Before using `/caro`, apply the **entire Caro section** at the end of `supabase/schema.sql` (from `-- Caro: apply this entire section` through `commit;`) in your Supabase SQL Editor as the database owner. It is transactional and rerunnable. Existing projects should apply this section alone: earlier unrelated sections of the schema contain non-idempotent policy declarations. New installations need the existing app schema as well. Enable the existing `supabase_realtime` publication before applying the section; the section adds both game tables when that publication exists.

The app needs its usual `SUPABASE_URL` and `SUPABASE_KEY`, with two signed-in accounts. Open **Play Caro**, create a room, and share its address (`/caro?room=<uuid>`). A signed-in recipient claims the vacant O seat. If prompted to sign in first, reopen the invite link after signing in. X starts. Completed rooms are read-only and may be reopened by their participants.

Only seated players can select either game or move rows. Knowing a room UUID does not grant read access; the join RPC grants the vacant seat atomically. All direct client writes are revoked, and there are no write RLS policies. RPCs require authentication, use a fixed search path, and expose only game metadata (no profile email or chat content). Join and move RPCs lock the game row; moves are append-only through the client API. A successful move transaction inserts its coordinate and advances the room state together. Unique coordinate and turn constraints provide additional safeguards. Realtime events trigger authoritative reads, including after reconnect; the client never places an optimistic stone.

## Local checks

- `npx vitest run tests/utils/caro.test.ts tests/composables/useCaroGame.test.ts tests/components/caroPage.test.ts`
- `npm test`
- `npm run build`
- `git diff --check`

For a backend smoke test, use two isolated signed-in browser sessions and a third nonparticipant. Check create/join/reload, all four win directions, out-of-turn/occupied/out-of-range/post-finish RPC rejections, simultaneous move requests, and reconnect recovery. Verify the third user cannot select either table or join a full room, and anonymous users cannot execute the RPCs. Also verify direct authenticated insert/update/delete attempts fail. Do not run these checks against production without authorization.

The unit/component tests mock the Supabase client boundary. Separately, the exact Caro SQL section was applied twice to an isolated PostgreSQL 17 container using a minimal `auth.uid()` shim. That verified rerunnable DDL, publication membership, participant-only reads, denial of anonymous/direct writes, turn/range/occupancy checks, all four win directions, draw handling, and serialization of simultaneous same-turn requests. This does not verify Supabase Auth itself or delivery through a live Supabase Realtime service; use two signed-in browser sessions for that final deployment check.
