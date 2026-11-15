# Dependency security review — 2026-11-16

Scope: [issue #145](https://github.com/truonghoangthuan/nuxt-chat-app/issues/145), baseline `c4b12ea`, release 0.14.1. This is a dependency assessment, not evidence of an exploited application or a live production penetration test.

## Framework patch

- Nuxt and its version-coupled packages: 4.6.3 → 4.6.4.
- Nitro: 2.13.5 → 2.13.6, as required by Nuxt's security release.
- Regenerated the compatible Nuxt dependency graph; no blanket `npm audit fix`, direct dependency downgrades, overrides, authentication changes or migrations.
- Node requirements remain `^22.22.3 || ^24.15.0 || >=26.0.0`.
- Upstream release changes include sanitized unexpected production SSR errors, constrained workspace discovery, encoded-slash route matching, and safer Nitro caching/proxy rules. The application has no custom wildcard proxy/redirect or cache route rules to migrate; existing server handlers still need their own authentication and input checks.

References:
- [Nuxt 4.6.4 release and compatibility notes](https://github.com/nuxt/nuxt/releases/tag/v4.6.4)
- [Leading-double-slash route-check bypass](https://github.com/advisories/GHSA-r99w-jh2x-3mg9)
- [Development workspace file exposure](https://github.com/advisories/GHSA-mjrq-cffv-q4qc)

## Audit reassessment

`npm audit --json`, before/after on this machine:

| Affected package entries (including propagated findings) | Before | After |
| --- | ---: | ---: |
| Low | 2 | 4 |
| Moderate | 14 | 8 |
| High / Critical | 0 / 0 | 0 / 0 |
| Total | 16 | 12 |

The two cited Nuxt advisories no longer occur. Nuxt and `@nuxt/nitro-server` still appear as **low** propagated findings through Nitro's tooling, not those fixed advisories. Node-forge and `@vercel/nft` also disappear from the audit findings after compatible graph resolution. Counts are dated registry results, not a permanent zero-vulnerability claim.

Remaining findings and disposition:

- **[VF5] Glob/minimatch tooling:** `@vue/test-utils → js-beautify → glob@13.0.6` and `editorconfig → minimatch@10.2.6`; Nitro's `archiver@8 → readdir-glob@3` also uses that minimatch. Advisories concern cancellation bypass/filesystem traversal and pattern amplification. These are dependency/build/test paths, not demonstrated unauthenticated application exploits. Do not run builds/tests on untrusted filesystem trees or attacker-supplied glob patterns. A later focused tooling refresh should assess test-utils 2.6.0 and upstream archiver/readdir-glob support; no forced transitive major-version override here.
- **[VF3] Deepmerge prototype poisoning:** `nitropack → @rollup/plugin-node-resolve → deepmerge@4.3.1`. Registry latest remains 4.3.1 at review time; no patched same-line release selected. Keep build configuration trusted and revisit upstream. Not an assertion that arbitrary runtime payloads are safe.

Audit still exits nonzero for remaining advisories. `npm audit fix --force` proposes test-utils downgrade and is intentionally not used. Re-run the audit when updating these parents; do not suppress or relabel the residual findings as fixed.

## Verification boundaries

The lockfile-floor tests detect regressions below the patched Nuxt/Nitro releases; they do not reproduce upstream vulnerabilities or replace the audit. Full application tests/build and local HTTP smoke results are recorded in the linked PR. Missing local Supabase credentials mean real login, database/RLS, realtime delivery and hosted deployment are not verified by this patch. Desktop bootstrap code and its live-server model are unchanged.
