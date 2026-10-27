# Implementation plan

1. Confirm installed Supabase helpers/configuration; add only chess.js.
2. RED engine and move-boundary tests; implement server validation and Nitro adapter; GREEN.
3. RED schema contract/security tests; additive Chess SQL with locked create/join/commit, grants, RLS and realtime; GREEN. Run real PostgreSQL validation if safely available.
4. RED room state and board/page interaction tests; implement guarded realtime composable, accessible board, responsive page and navigation; GREEN.
5. Document setup, run full tests/build/diff checks, inspect desktop/mobile if available, independent final review and resolve findings.

No push, PR, deployment or secrets. Local commits optional. Record actual validation in the final report.
