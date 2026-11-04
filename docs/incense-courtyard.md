# Incense courtyard: rollout and verification

Issue: #126. This feature is an opt-in **Activities → Thắp nhang · Một nén bình an** modal for the selected conversation, including direct conversations. Ordinary chat and drafts remain mounted. No Presence, online roster publication, prayer text, donation flow, encryption change or external ritual service is introduced.

## Operator rollout gate — not applied by this change

1. Review `supabase/migrations/202611040002_incense_activity.sql` against a staging database with the existing `profiles`, `conversations`, `conversation_members` and `can_access_conversation(uuid)` schema.
2. With separate operator authorization, apply that migration in staging, then reload the PostgREST schema cache if necessary. It is idempotent; no live migration was executed during implementation.
3. Sign in as two real co-members plus a nonmember. Verify member history, correct actor/profile/time, conversation isolation, anon/nonmember rejection and direct INSERT/UPDATE/DELETE rejection. Confirm existing encrypted messaging still works.
4. Use separate authenticated connections/tabs to race the **same UUID** (one event, identical returned row) and **different UUIDs** for the same actor/conversation (one event, all other attempts hit the 60-second cooldown). Test another member independently and membership removal while a request is pending. A UUID reused in another room/by another actor must fail. An authenticated former member cannot retry even a previously successful UUID.
5. Only after that gate, authorize the production migration/deployment. Until schema readiness, the modal explicitly says the courtyard is unavailable, disables offering and does not invent local shared history. Existing app deployment integrations are not changed here.

The database derives actor from `auth.uid()` and timestamp from its own clock. Current membership is locked for the transaction; writes serialize with a per-actor advisory transaction lock. Duplicate identity is checked before cooldown. Clients have SELECT with membership RLS but no direct mutation grants; only the authenticated RPC can record an offering.

Rollback: disable/revert the activity entry/frontend first; retain the table/milestones unless an operator separately authorizes deletion. No existing chat data or cryptographic settings need changing.

## Runtime behavior

- The newest **30** persisted milestones are read on open. Own confirmed offerings are merged by event ID. Reopen to refresh other members' history; this version does not subscribe to realtime history.
- Names are current profile display names; timestamps are relative and carry an exact localized `title` and ISO `datetime`. Names use escaped Vue interpolation and open the existing profile inspector through the page.
- Milestone metadata is membership-protected **not E2EE**; the UI states this. It contains no private wishes or user-written text.
- Completion of the visual ritual starts persistence, not a success toast. Failed writes retain their request UUID for retry; no history/success appears until the server confirms. Closing invalidates callbacks but cannot roll back a database request already accepted by the server; reopen reads authoritative history.
- The unchanged **21,109,960-byte** CC0 rig, all texture maps and HDR are same-origin and lazy. Three.js **0.180.0** is the only added dependency. Asset bytes/source/license manifest and a served MIT notice live in `public/incense/`.
- Renderer responsibilities are split into assets, environment, human IK, timeline and lifecycle modules. Fetches abort on teardown; late image/GLB decodes are disposed instead of attached. Frame loops, observers, controls, skeletons, textures and GPU context are released on close or WebGL failure. A hidden tab pauses rendering; poses resume from absolute elapsed time.
- OS/user reduced motion completes each deliberately started offering once and freezes ambient animation, rendering again only for interaction/layout changes. WebGL/context loss has an explicit nonanimated accessible offering path. Escape, tab wrap and opener-focus restoration work; the modal scrolls internally on short screens.

## Reproducible local verification

```sh
npm ci
npm test
npm run build
node scripts/verify-incense-assets.mjs
```

Observed final results after the historical-actor profile-navigation regression fix: **73 test files passed; 775 tests passed, 1 existing skipped (776 total)**. Production build completed successfully in **7.96s**. There is no existing project lint/typecheck script; the Nuxt build compiles Vue/TS but is not a full `vue-tsc` audit.

Observed RED→GREEN checkpoints covered initial controller/module absence, failed-save retry/error handling, stale generation and denied history writes, missing SQL migration, timeline/real component absence, Activities/page wiring, stale previous success during a new animation, scoped dark tokens, unavailable history's false empty state, orphan-decode texture cleanup and the supported HDR decoder. The final suite has no new skipped tests.

For isolated PostgreSQL/auth fixtures, install `@electric-sql/pglite` **outside the repository** and pass its absolute ESM module path:

```sh
PGLITE_MODULE="C:/path/to/scratch/node_modules/@electric-sql/pglite/dist/index.js" node scripts/test-incense-sql.mjs
```

Observed pass: migration applied twice; server-derived actor/profile; stable duplicate row; member history; anon/nonmember rejection; membership RLS; forged direct insert denial; cross-room UUID rejection; cooldown; null UUID; revoked membership. This fixture uses PostgreSQL and a fixture `auth.uid()`, not live Supabase. PGlite's single connection does **not** verify real multi-session lock contention or PostgREST transport. Those remain the rollout gate above.

Asset verifier passed **17 unchanged approved-v2 hashes**, embedded CC0 declaration and the **56-joint** Sam rig.

## Browser evidence and limits

Local Supabase URL/key were absent, so a scratch Vite harness renders the **actual production `IncenseCourtyard.vue` plus actual WebGL renderer** with visibly labeled, in-memory fixture identities/persistence. No mock history is shipped in the app. It imports the real app stylesheet and compiles repository Tailwind sources.

Authoring-machine evidence directory (not committed):
`C:/Users/PC/AppData/Local/hermes/profiles/coding/cache/scratch/incense-evidence/`

- Final captures: `desktop-light.png`, `desktop-dark.png` (**1440×1000**); `mobile-light.png`, `mobile-dark.png` (**390×844**); plus `desktop-bow.png`, `schema-unavailable.png`.
- `final-layout.json`: four final theme/viewport checks, correct computed light/dark colors, no horizontal overflow, one canvas, offering button above its clipping boundary.
- `checks.jsonl`: chronological checks, including a pre-fix dark-token observation followed by the corrected result; also the full five-motion-phase trace and persistence transition, double-click, failed-save/same-UUID retry, skip, mid-sequence reduced motion, schema gate, context-loss fallback, GPU disposal, restored opener focus, OS reduced-motion static-image equality and native Tab wrap. Use `final-layout.json`, not the earlier dark entry, as the final layout verdict.
- Full suite/build output: `full-test.log`, `build.log`. The final asset-loading check had empty runtime warning/error arrays. A short laptop **1264×569** action-clipping regression was reproduced and fixed; **390×640** offering visibility was checked too.

The scratch harness is same-machine only at `http://127.0.0.1:4186/`; restart from the coding-profile scratch `incense-harness/server.mjs` with the installed absolute Node executable if needed. It is not a deployable app route, external preview or proof of live Supabase persistence/delivery. Physical-phone performance, live auth/PostgREST and true concurrent PostgreSQL sessions remain unverified.

Build warnings: missing local Supabase URL/key; the intentional lazy Three.js chunk is about **649 kB** minified (**168 kB gzip**) and triggers Vite's >500 kB advisory. Initial/final `npm ci` reported **15 existing audit findings (2 low, 13 moderate)** in the unchanged dependency graph; only pinned Three.js was added, no blanket audit fix was run. A Windows `npm ci` retry was needed after stopping the scratch Vite server that had locked a native Rolldown binary.

Visual fidelity retains approved v2's game-quality, asset-backed courtyard, not photorealism: the original procedural architecture/foliage and skeletal motion still have the preview's close-up hand/cloth/foot-sliding limits. The integration was compared with the original desktop screenshot; it is not the paid Sketchfab reference asset.
