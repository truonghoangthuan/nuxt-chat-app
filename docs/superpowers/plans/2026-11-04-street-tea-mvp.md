# Ra phố MVP implementation and verification plan

1. Inspect latest master and existing conversation / encryption / realtime invariants. Record group-only scope and approved original illustration.
2. Parallel vertical slices: realtime lifecycle + private channel policies; presentational illustrated scene; parent owns page/sidebar integration and speech lifecycle.
3. Test-first each behavior: explicit entry/no autojoin; group-only/private scope; pending joins and leave/switch races; valid roster/multi-tab; tea; only fresh text bubbles; mobile and reduced motion.
4. Integrate using existing MessageViewport + slotted MessageComposer. Keep it mounted across street/messages toggles so drafts and attachment state survive. Exit street on view change / group change / membership loss / logout / disposal.
5. Run focused tests, full npm test, npm run build, dependency audit (do not blanket-fix unrelated advisories), independent review. Exercise actual rendered Vue components in browser at desktop/mobile with clearly marked fixture transport if local Supabase environment is unavailable.
6. Save verified execution details and local run/rollout instructions. No remote issue writes, commit, push, merge, database migration application or deployment in this delivery.

## Required live rollout gate

Operator approval to apply the realtime authorization migration to the intended Supabase project, review existing realtime policies, then use two real group accounts plus a nonmember to verify private Presence/Broadcast and existing encrypted chat end-to-end. Do not call mocked/harness results live backend verification.
