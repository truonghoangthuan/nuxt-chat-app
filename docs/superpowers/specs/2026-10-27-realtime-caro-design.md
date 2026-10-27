# Real-Time Caro — Design Spec

**Date:** 2026-10-27
**Topic:** Invite-link, two-player Caro game inside the chat app

## Outcome and Assumptions

**Confirmed:** Build a multiplayer Caro game in this chat app, starting from current `master`, and deliver it as a PR.

**Assumed defaults:** Two authenticated players; one creates a room and shares its invite URL; the second opens it and takes the vacant seat. Use a 15×15 board, alternating X/O, and five-or-more consecutive stones in any direction to win. Persist game state and synchronize moves live.

One opponent seat per room; spectators, timers, undo, rematch, and public matchmaking are out of scope. No chat content is stored in game tables; only the two seated players can read the game. Use the app's existing Supabase Auth/Postgres/Realtime and theme tokens; add no runtime dependency.

## User Flow

1. Open **Play Caro** from the chat sidebar.
2. Create a room; it opens in a waiting state with a copyable invite link.
3. A second signed-in user opens the invite link and joins the vacant seat.
4. Both players see whose turn it is, click/tap an empty square, and see updates without refreshing.
5. Invalid/out-of-turn moves are rejected by the database. A win/draw is final for that room.

## Architecture and Security

- Add `caro_games` and `caro_moves` to the idempotent Supabase schema. Track room players/status/current turn on the game row and append-only coordinates/turns in moves.
- Enable RLS: only seated players can read their game and its moves. Revoke direct client writes. Expose narrowly scoped `SECURITY DEFINER` RPCs to create/join a room and place a move; lock the game row while validating a move so concurrent requests cannot take the same turn.
- Publish game/move changes through Supabase Realtime. The client subscribes to one room and refetches authoritative state after subscription/reconnect.
- A room UUID link grants an authenticated visitor the opportunity to take the empty second seat, not read the game before joining. No spectator access.
- Update `supabase/schema.sql`; installation/upgrade requires applying the updated schema to the Supabase project. Do not change production infrastructure as part of this PR.

## UI / Accessibility

- Add a dedicated `/caro` page that supports create and invite-link join.
- Add a visible Play Caro entry point in the chat sidebar.
- Reuse existing app theme tokens; keep the board centered and responsive, with a horizontally scrollable minimum-width board on narrow screens.
- Use real buttons for cells, meaningful row/column labels, visible keyboard focus, sufficient X/O contrast, and an `aria-live` turn/status announcement.
- Provide explicit loading, waiting, error, turn, win, and draw states; disable cells when the game is not active or it is not the player's turn.

## Acceptance Criteria

- A signed-in user can create a room and copy a working invite URL.
- A second signed-in user opening the URL joins the room; a third user cannot join or read it.
- Both players see moves/status in realtime and after reload.
- Database RPCs reject out-of-range, occupied, out-of-turn, nonparticipant, and post-finish moves; a full board draws.
- Five contiguous moves in any of four directions win; fewer than five, gaps, and opponent stones do not.
- Automated tests cover board/win logic and the page's create/join/move/realtime behavior; test suite and production build pass.
- PR documents the one-time updated-schema prerequisite and any check limitations.
