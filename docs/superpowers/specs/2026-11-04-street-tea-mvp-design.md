# Ra phố — group-scoped 2D tea-stall MVP

## Approved direction

Original 2D illustrated Vietnamese tea stall approved in chat. Preserve the supplied stall/awning/tree/stools/motorbike illustration. Extend the existing chat, not a new social network or replacement messenger. Preview source: coding-profile scratch/khu-pho-preview.html.

## User story

As a member of a group conversation, I can deliberately open its street, sit with other group members, exchange tea invitations and continue the same encrypted conversation while seeing short speech bubbles over their characters.

## Acceptance criteria

- Existing normal messaging remains the default. Sidebar activity and group tab open the street; direct conversations never expose a street.
- Opening the view alone does not publish presence. Explicit join/leave controls own street presence; group selection, view exit, membership loss and unmount tear it down.
- Real roster only, one visible person per account even across tabs; deterministic seating and visible overflow roster. No sample identities in production.
- Private Supabase Realtime topic `street:CONVERSATION_UUID`, authorized to authenticated group members through realtime.messages RLS. No public-channel fallback.
- Presence carries only display identity/session information, no email or message contents. Tea invitations are ephemeral, validated and bounded.
- Continue using the existing MessageViewport and slotted MessageComposer with sendMessage E2EE and database RLS. Reuse its draft, retry, history and attachment behavior.
- Speech bubbles reflect only newly observed, sent, decryptable text messages while joined, not history pagination or pre-join messages. Expire automatically and clear on leave/switch.
- Animated vehicles, pause control, reduced-motion support, keyboard join and legible responsive controls. No audio or autoplay dependency.
- Tests cover lifecycle races, errors, multiple clients, invalid payloads, access scope, actual page wiring and mobile layout; run full suite/build and rendered browser checks.

## Non-goals

Global public street, walking physics, currencies, monetization, missions, voice, audio ambience, live schema deployment, or changes to encryption/authentication.

## Privacy boundary and rollout

A group is the authorization boundary. Private realtime policies require an operator-reviewed migration; until applied to the target Supabase project, private subscription must fail visibly, not silently fall back to public transport. Existing message storage and crypto remain unchanged. Display names and street occupancy are visible to authorized group peers and the realtime server (not E2EE metadata). Chat text remains client-encrypted on its existing transport.

## Local delivery scope

Worktree: D:/Projects/nuxt-chat-street; branch: feat/street-tea-mvp; base: 9483f9e3f8372b66fc613ea18a8d3ae15ff17fdd. Initial local-only delivery scope was superseded by the user's explicit request to commit/push and open a PR. Publishing the feature branch/PR is authorized; merge, live database migration application and deployment are not. CodeGraph CLI/tool unavailable in this environment; inspect source directly.
