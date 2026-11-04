# Ra phố MVP: run, verify, and roll out

## Use

Select an existing **group** conversation, then choose **Ra phố** in the conversation tabs or sidebar Activities. Opening the view does not join automatically. Choose **Ngồi cùng bàn** to publish street presence, **Mời trà** for an ephemeral invitation, and **Rời bàn** to leave. Switching conversations or leaving the view tears down the street subscription. Normal messaging remains the default; direct conversations have no street.

The street shares the existing group's encrypted message timeline and composer. It does not create an additional public chat or send text through Broadcast. Occupancy/display names are metadata visible to the authorized room and realtime provider, not E2EE metadata. Presence is a social indicator, not an authoritative identity or permission check.

## Backend prerequisite (not applied by this PR)

An authorized operator must review and apply:

`supabase/migrations/202611040001_street_realtime_authorization.sql`

It adds authenticated group-member policies on `realtime.messages` and restrictive `street:` namespace guards so older broad permissive policies do not bypass street membership. It does not change existing public typing/music topics, project-wide realtime settings, message tables or encryption configuration. Supabase already manages RLS on `realtime.messages`; do not add ALTER TABLE or create functions in its managed schema.

Before application, inspect existing project policies and test against a staging Supabase project. Apply only with separate deployment/database approval. The UI must fail visibly if private subscriptions are unavailable; there is no public fallback. Realtime authorization is cached at channel join: membership revocation is not immediate eviction of an existing socket.

## Local checks performed

- `npm ci` without lockfile changes.
- `npm test`: 66 files, 754 passed and one optional PostgreSQL policy test skipped without its environment variable.
- With `STREET_PGLITE_MODULE` set to a scratch-installed `@electric-sql/pglite/dist/index.js`: **66 files, 755 passed**. The factory suite is **21 passed**, including policy installation twice, malformed topics, member/nonmember/direct/anonymous access, and broad legacy grants. This is local PostgreSQL policy execution with fixture auth helpers, not live Supabase Realtime.
- `npm run build`: successful. Local Supabase URL/key are absent, so related warnings are expected. No live backend credentials were fabricated.
- Browser: actual Vue page/components in a clearly labelled local fixture harness. Verified explicit join, roster, tea, local fixture chat submission, speech and draft retention on street entry. No runtime errors during these checks. Fixed the independently reproduced mobile action clipping by allowing the scene to shrink inside its grid row. Verified leave controls and composer bounds at 390x844, 390x667 and 390x600; no horizontal page overflow.
- No new dependencies. Existing audit: 2 low and 13 moderate advisories, no high/critical; not blanket-updated in this feature.

## Still required before production rollout

- Apply policies to approved staging/live target and verify two real group accounts see each other join/leave/invite tea, including late join and reconnect.
- Verify a nonmember and anonymous client cannot subscribe, track or broadcast to a private street topic.
- Verify real encrypted message send/receive while in the street; local browser fixture chat is not proof of live delivery or backend encryption integration.
- Review membership-revocation behavior with Supabase's join-time authorization cache.

No migration execution, deployment or merge was performed in this task.
