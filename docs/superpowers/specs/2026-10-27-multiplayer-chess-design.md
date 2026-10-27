# Invite-room chess

Approved: app-native concept #1 from the supplied desktop/mobile references. Two signed-in players only; no AI, local play, spectators, clocks, or changes to Caro.

## Experience and visual system

`/chess?room=<uuid>` is a durable invite/reopen URL. Creator plays White; the first other signed-in visitor takes Black atomically. Existing participants reopen without changing seats. Full rooms reject other users without revealing state. Completed games remain read-only; Create room starts a separate game.

Use existing app typeface, --ap-canvas, --ap-stage, --ap-text-primary/secondary and --ap-glass-border. Board-specific semantic tokens use sage (#7e9e87), pale green (#e9eedf), ivory pieces (#fffdf5), dark pieces (#25323a), and blue focus (#007aff). Keep piece colors stable in either theme and outline ivory pieces for contrast. 8×8 board, a8 upper left, White at bottom; coordinate labels, selected-square outline, legal-destination dots, keyboard arrow navigation and Enter/Space selection. Promotion is an explicit native select with all four choices.

Desktop: app header above [board | status / players / invite / moves]. Mobile: header, board, then status panel, without horizontal page overflow. Rounded app surfaces and restrained borders; no marketing decoration or animation.

## Trust boundary

A single chess_games row contains seats, FEN, server-produced SAN history, count, turn, status/result. Participant-only SELECT RLS; no direct client writes. Create/join SECURITY DEFINER RPCs derive actor from auth.uid(); join locks the row and cannot occupy both seats.

Nitro authenticates via serverSupabaseUser, derives verified sub/id, uses serverSupabaseServiceRole to read the authoritative row, checks participant/turn/count/status, reconstructs chess.js history and verifies FEN, applies only requested from/to/promotion. A service-role-only commit RPC locks the row and checks actor, expected count, expected FEN and active status before atomic update. Client FEN/SAN/winner/turn/result are rejected. SAN history preserves repetition detection. Automatic chess.js draw adjudication includes stalemate, repetition, insufficient material and fifty moves.

Realtime invalidates the single-row snapshot; subscription/reconnect triggers a refetch. Version guards prevent stale room responses. Moves stay disabled while disconnected/loading/submitting. Refresh errors fail closed; retry re-establishes subscription. No optimistic board mutation.

## Release validation

Test-first engine/security, database privileges/concurrency where PostgreSQL exists, then composable/UI slices. Full tests/build/diff checks and independent final review. Server secret is runtime-only; absent configuration must fail closed. Live Supabase and visual validation must be reported accurately.
