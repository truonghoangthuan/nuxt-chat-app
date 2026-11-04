# Một nén bình an — integration design

Related issue: #126. Approved visual source: `D:/Projects/previews/incense-courtyard-v2`.

## Product boundary

An **Explore** surface with a secondary deliberate ritual action. Open it from Activities for the currently selected conversation (group or direct). Opening is not joining Presence and never records a milestone. Existing chat/composer remain mounted behind the modal.

Preserve v2's complete asset-backed 3D courtyard, Sam rig, hand IK, approach/bow/place/retreat, local PBR maps, HDR and smoke. Keep the quiet paper/serif composition with an adaptive dark mode. No iframe, preview localStorage, wishes, payments, rankings or online roster publication.

## State and authorization

Vue owns UI/lifecycle and a pure persistence controller. The lazy renderer owns only disposable visual resources and emits completion, not success. The authenticated Supabase client calls membership-checked `list_incense_events` / `offer_incense` RPCs. SQL derives actor/time, locks current membership, serializes per-actor writes, checks idempotent client UUID before a 60-second per-conversation cooldown, and denies direct client mutations. Confirmed rows alone enter history. Retry retains its request UUID. Conversation/auth changes and close invalidate old completions.

History is the newest 30 persisted milestones with current profile names and relative/exact timestamps. Reopen refreshes from the database; no live Presence/Broadcast or realtime history subscription is introduced. Metadata is access-controlled, not E2EE, and this distinction is stated in the UI.

## Lifecycle and rollout

All renderer imports and 21 MB human/texture downloads begin only after explicit entry and successful membership/history authorization. Abort pending fetches, dispose late decodes, frame loops, observers, controls, skeletons, maps and GPU context on close or rendering failure. Pause hidden tabs. Reduced motion freezes ambient rendering and completes deliberate rituals once without the sequence. A WebGL failure keeps an explicit accessible nonanimated path.

Ship an idempotent reviewed migration, not a live database change. Absent schema is an explicit unavailable state with no enabled offering or fabricated empty shared history. See `docs/incense-courtyard.md` for operator gates and verification boundaries.
