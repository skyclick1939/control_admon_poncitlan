# Tasks: ARCA Platform Evolution

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2400–3000 total across 5 phases |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main (auto-selected default — auto-chain needs no team decision; override before PR2 if a different strategy is preferred) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Per-Phase Line Estimate

| Phase | Est. lines | Risk |
|---|---|---|
| 0 — Security (DB only) | ~80 | Low |
| 1a — Vite/Vitest tooling + money + escape | ~350 | Medium |
| 1b — Extraction (`app.ts` + 5 features) + config.yaml flip | ~950 | High |
| 2 — Roles + MFA | ~460 | Medium-High |
| 3 — Public view + bank config | ~430 | Medium-High |
| 4 — Lifecycle | ~180 | Low |

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Phase 0 security fix | PR1 | N/A — no test runner exists pre-Vitest | Manual smoke login vs live Supabase | Replay `supabase/sql/phase0_down.sql`; re-enable signup |
| 2 | Vite/Vitest tooling + `money.ts` + `escape.ts` | PR2 | `npx vitest run src/lib` | `npm run build` | `git revert`; delete `src/lib`, build config files |
| 3 | Extract `index.html` into `app.ts` + 5 features; flip TDD flag | PR3 | `npx vitest run` (regression) | `npm run dev` manual click-through | `git revert` single commit; promote prior Vercel deploy |
| 4 | Roles + MFA (DB + UI) | PR4 | Manual SQL: aal1/aal2/anon cases | Live aal2 login smoke test | Drop new policies/trigger/table; restore Phase-0 policies |
| 5 | Public view + bank config | PR5 | `curl /api/debt-view` + postbuild grep | Vercel preview: `/vista/`, `/api/debt-view` | Remove `api/debt-view.ts`, vista entry; drop `configuracion_bancaria` |
| 6 | Lifecycle (`activo`, RESTRICT) | PR6 | Manual SQL: `23503` case | Manual UI retire/delete on preview | Re-add `ON DELETE CASCADE`; keep `activo` (additive) |

## Phase 0: Security Fix — Live Shared DB (sign-off gated, no code)

**Sign-off record**: the project owner gave explicit, separate authorization for this specific live-production change (flipping `disable_signup` and revoking `anon` grants on the shared Supabase project) before any task below executed, in direct response to the orchestrator's explicit request for that sign-off. That authorization is recorded in Engram as part of this project's session history (project `control_admon_poncitlan`, session summary and observation trail covering the `evolucion-plataforma-arca` change) — it is a human-given approval captured in conversation, not something re-derivable from repository files alone. A future session picking this change up from files only should treat Phase 0 as already-authorized-and-executed (see task status below) rather than needing to re-request sign-off for work that already ran.

- [x] 0.1 Snapshot `pg_policies` (4 tables) + current `disable_signup`; write DOWN script `supabase/sql/phase0_down.sql` recreating both verbatim.
- [x] 0.2 Confirm the `disable_signup` field live via the Supabase Management API `config/auth` GET (research C13) — supersedes the Dashboard-visual-confirmation approach (research C14) since this change uses the Management API directly, not the Dashboard UI.
- [x] 0.3 Flip `disable_signup: true` via the Supabase Management API `config/auth` PATCH; verified with a follow-up GET.
- [x] 0.4 `revoke all on public.miembros, public.cargos, public.registro_apoyos, public.registro_pagos from anon`; verified zero rows in `information_schema.role_table_grants` for `anon` on those 4 tables afterward.
- [x] 0.5 Audited `auth.users` against the known-operator list (D8). Conclusion: no unrecognized/attacker account found — nobody exploited the open-signup vulnerability. See `phase0-account-audit.md` for the full disposition of all 9 accounts. Nothing to delete or ban.
- [x] 0.6 Smoke check: confirmed `pg_policies` and `information_schema.role_table_grants` for `authenticated` on the 4 tables are byte-identical before and after 0.3+0.4 — the `authenticated` blanket policies are untouched, so existing sessions (`fors@gmail.com`, `alexis@gmail.com`) keep working exactly as before. Read back `phase0_down.sql` and confirmed it fully reverses 0.3 (re-enable signup instructions) + 0.4 (re-grant anon) + recreates the exact prior policies.

## Phase 1: Vite + TypeScript + Money + Escaping (no DB change)

- [x] 1.1 Create `package.json`, `tsconfig.json`, `vite.config.ts` (multi-entry stub); install vite, typescript, vitest, pinned Tailwind Vite plugin, chart.js, `@supabase/supabase-js`.
- [x] 1.2 RED: `src/lib/money.test.ts` — `splitEvenly` (1–40 shares × 0.01/100.00/33.33), `allocateFifo` (settle/partial/overpay), `toCents` NaN/Infinity — failing (module absent).
- [x] 1.3 GREEN: implement `src/lib/money.ts` (`toCents`, `toPesos`, `formatMXN`, `splitEvenly`, `allocateFifo`) to pass 1.2.
- [x] 1.4 RED: `src/lib/escape.test.ts` — `<script>`, `"`, `'`, `&`, `<img onerror>` — failing.
- [x] 1.5 GREEN: implement `src/lib/escape.ts` (`escapeHtml`, `setText`) to pass 1.4.
- [x] 1.6 Create `src/lib/supabase.ts`, `src/lib/types.ts` (incl. row types), `src/app.ts` (shared state + `refresh()` callback), `src/main.ts`.
- [x] 1.7 Extract `src/features/auth/{index.ts,session.ts}` from `index.html` (login/logout only; MFA lands in Phase 2).
- [x] 1.8 Extract `src/features/dashboard/{index.ts,charts.ts}`; replace `innerHTML +=` with `escapeHtml`/`setText`.
- [x] 1.9 Extract `src/features/miembros/{index.ts,repo.ts}`; escape output at `index.html:561, 605`.
- [x] 1.10 Extract `src/features/apoyos/{index.ts,repo.ts}`; replace the unrounded `index.html:658` float split with `splitEvenly`; escape `index.html:705`.
- [x] 1.11 Extract `src/features/pagos/{index.ts,repo.ts}`; replace the `index.html:793` `<= 0.001` epsilon with `allocateFifo`; escape `index.html:752`; surface `unappliedCents > 0` as a UI warning/block instead of silently dropping the surplus.
- [x] 1.12 Create `.env.example` documenting `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; set both in Vercel project settings.
- [x] 1.13 Flip `openspec/config.yaml`: `strict_tdd: true`, `test_command: "vitest run"`, `framework: "vitest"` (moved here from Phase 4 — enforces Vitest before the two security-critical phases below).

## Phase 2: Roles + MFA

**SQL status — APPLIED live 2026-09-13, sign-off obtained.** The project owner explicitly authorized live execution of 2.1-2.5 against the shared Supabase project in this session's conversation (same pattern as Phase 0's sign-off). Executed in order via the Management API `database/query` endpoint, each step verified read-back before the next ran: `app_admins` table + `is_admin()`/`is_superadmin()` created (both `search_path=""` confirmed) → exactly one superadmin row seeded (`fors@gmail.com`) → the old 8 blanket policies confirmed dropped and the new `is_admin()`-scoped policies confirmed present on all 5 tables → the 3 AAL2 policies confirmed `RESTRICTIVE` on insert/update/delete only (never a bare FOR-less one) → the guard trigger confirmed present (`trg_guard_ultimo_superadmin`, 1 row). `anon` confirmed with zero grants on `app_admins`. `supabase/sql/phase2_down.sql` (rollback script, reviewed against `phase0_down.sql`) exists and was ready before this ran, matching Phase 0's rollback-readiness practice.

- [x] 2.1 `supabase/sql/phase2_roles.sql`: `app_admins` DDL, `is_admin()`/`is_superadmin()` as `security definer` with `set search_path = ''` (D3 — avoids infinite recursion); revoke/grant execute; applied and verified live.
- [x] 2.2 Seed the first superadmin row by SQL (bootstrap — no UI path exists yet); applied — exactly one row (`fors@gmail.com`, `rol='superadmin'`) verified live.
- [x] 2.3 `supabase/sql/phase2_rls.sql`: drop the 4 blanket `ALL to authenticated` policies **plus the 4 blanket SELECT policies** (deviation from the literal task text — see design deviation note below and the file's own header comment) — dropping only the 4 ALL policies would have left the old SELECT-for-any-authenticated policy live, still passing reads for non-admins (Postgres OR-combines permissive policies); add `is_admin()`-scoped policies on the 5 tables that exist as of Phase 2 (`configuracion_bancaria` is Phase 3); applied and verified live.
- [x] 2.4 `supabase/sql/phase2_aal2.sql`: 3 separate `as restrictive for insert|update|delete` AAL2 policies on `app_admins` — never a bare FOR-less restrictive policy (defaults to `FOR ALL`, would block every session's `aal1` role SELECT); applied and verified live (confirmed `RESTRICTIVE`, confirmed scoped to insert/update/delete only).
- [x] 2.5 `supabase/sql/phase2_guard.sql`: `guard_ultimo_superadmin()` + `AFTER UPDATE OR DELETE ... FOR EACH STATEMENT` trigger — statement-level, not an RLS `USING` check (D5, unsound for multi-row demotions); applied and verified live (trigger present).
- [ ] 2.6 Manual SQL test: aal1 insert/update on `app_admins` refused, aal2 succeeds, anon denied on all 6 tables, demoting/deleting the last superadmin raises `ultimo_superadmin_protegido`. **Not done** — this requires testing as real `anon`/`aal1`/`aal2` sessions through the actual app or Supabase client; the Management API used for 2.1-2.5 runs as an elevated role that bypasses RLS entirely, so it cannot exercise this test. Needs a human (or a future live-session test) logging in as `fors@gmail.com`, enrolling MFA, and trying the denied/allowed operations for real.
- [x] 2.7 Create `src/features/auth/mfa.ts`: enroll/challenge/verify + forced-enrollment gate for superadmin sessions.
- [x] 2.8 Create `src/features/admin/index.ts`: admin list, add/remove/change role; map `ultimo_superadmin_protegido` to a Spanish UI message.

**Follow-up (not a numbered task, closed 2026-09-13, commit `78d29b9`):** 2.7/2.8 shipped self-contained and unit-tested but were never mounted into `main.ts`/`index.html`. Closed by adding an "Administración" nav item + view (hidden for non-admins via a new `checkCurrentAdmin` RLS-backed check in `admin/repo.ts`) and a forced-enrollment gate in `main.ts` that blocks a superadmin without a verified TOTP factor from reaching the dashboard until `enrollTotp`/`verifyTotp` completes. `initAdmin` now returns `AdminApi.refresh` (mirrors `PagosApi`) so the admin list loads once a session exists instead of failing under RLS at pre-login page load. Client-side only, per design.md — the real boundary stays the database's restrictive AAL2 policy on `app_admins` writes. Not covered: per-session AAL2 re-challenge before an already-enrolled superadmin's admin-panel writes on a fresh (aal1) session — out of scope for this follow-up, flagged for a future task.

## Phase 3: Public View + Bank Config

**SQL status — APPLIED live 2026-09-14.** `supabase/sql/phase3_bank_config.sql` (+ `phase3_bank_config_down.sql`) were executed against the live Supabase project "arca" via the Management API, with explicit project-owner sign-off obtained beforehand (same precedent as Phase 0, Phase 2). Read-back verification: `pg_policies` shows exactly 1 policy on `configuracion_bancaria`, `information_schema.role_table_grants` shows 0 rows for `anon` on this table, and the `id=1` seed row exists.

- [x] 3.1 `supabase/sql/phase3_bank_config.sql`: `configuracion_bancaria` DDL (singleton `check (id = 1)`), `is_admin()` policies, seed row; apply. **Applied live 2026-09-14, read-back verified.** One deviation from the literal design.md RLS table: since `CREATE POLICY`'s `FOR` clause accepts only one of `ALL|SELECT|INSERT|UPDATE|DELETE` (never a comma list), and design.md gives SELECT and every write the identical `is_admin()` predicate for this table, the script uses a single `admins_all_configuracion_bancaria` `FOR ALL` policy — mirroring phase2_rls.sql's `admins_all_*` policies on the 4 original tables, not two separate SELECT/write policies.
- [x] 3.2 Create `src/features/admin/bank-config.ts` (admin-only read/write UI). Split into `bank-config.ts` (DOM wiring + `initBankConfig`), a pure `clabe.ts` (`isValidClabe`, unit-tested) and `mapBankConfigError` added to the existing `errors.ts`/`errors.test.ts`, plus `fetchBankConfig`/`updateBankConfig` added to the existing `repo.ts` — same file-split convention Phase 2 used for `admin/index.ts` (`repo.ts`, `errors.ts`) and `auth/mfa.ts` (`mfa-gate.ts`). Mounted inside the shared `#admin-content` view (reachable by any `app_admins` row, not superadmin-only — matches the bank-config spec's `is_admin()` write gate, not the module-boundary diagram's "(superadmin-only)" label, which describes the admin-CRUD sub-panel's own `is_superadmin()` gate, not this one).
- [x] 3.3 Create `api/debt-view.ts`: `service_role` client (`persistSession:false`), no query parameters (D7), explicit column list only (never `select('*')`), `405` on non-GET, `502` on Supabase failure with server-only logging, `Cache-Control: s-maxage=60`; add `DebtViewResponse` to `src/lib/types.ts`. Pure aggregation (group-by-member, sum to cents, sort descending) extracted to `src/lib/debt-view.ts` and unit-tested (mirrors `money.ts`'s D6 pattern); the handler itself is thin, untested I/O glue, consistent with `repo.ts`'s established untested-DB-boundary convention. No live invocation was possible or attempted (no `service_role` credentials exist in this environment, and `configuracion_bancaria` doesn't exist live yet) — verified via unit tests + `tsc --noEmit` + code review only.
- [x] 3.4 Create `vista/index.html` + `src/public-view.ts` (imports `lib/escape`/`lib/types` only, never `lib/supabase.ts`); add the `vista` entry to `vite.config.ts` `rollupOptions.input`. Verified by inspecting the actual built `dist/assets/vista-*.js` chunk: zero occurrences of `supabase` (confirmed with a real, non-dead-code-eliminated build — see 3.5's note on the `VITE_SUPABASE_*` build guard). `money.ts`'s `formatMXN` was deliberately NOT imported (would violate the literal "escape/types only" import restriction); a 3-line `formatCentsMXN` is duplicated inline instead.
- [x] 3.5 Set unprefixed `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in Vercel (server-only, **Secret** type, Production+Preview); add a `postbuild` script grepping `dist/` for `service_role`, non-zero exit on match. Postbuild script functionally verified (RED/GREEN with an injected leak). Env vars set by the project owner 2026-09-14. **Bug found and fixed while verifying live**: `api/debt-view.ts` 500'd with `FUNCTION_INVOCATION_FAILED` — Vercel transpiles `api/*.ts` per-file with the project's own `tsc` and runs the output as plain Node ESM, which (unlike Vite) requires explicit `.js` extensions on relative imports; `api/debt-view.ts` -> `src/lib/debt-view.ts` -> `src/lib/money.ts` used extensionless imports that work under Vite's `moduleResolution: "bundler"` but not under Node's ESM loader. Fixed by adding `.js` extensions to both hops (commit `7532aad`); also hardened the handler with a top-level `try/catch` so any future unhandled error returns the documented `502`, not a raw platform `500` (commit `62338c5`). Confirmed live: `GET /api/debt-view` → `200` with real aggregated data.
- [x] 3.6 Manual E2E on the live deploy: `/vista/` with no session shows debt + bank and nothing else — confirmed via a real browser screenshot (title, total pendiente, banco placeholder, ranking de deudores; no login/admin UI present, no console errors). `/vista/` and `/api/debt-view` both resolve (`200`). **XSS-escaping not tested by inserting a live payload into production `miembros`** — code review confirms `public-view.ts` passes every user-controlled field (`nickname`, `banco`, `clabe`, `titular`) through `lib/escape.ts`'s `escapeHtml` before any `innerHTML` write, and `escapeHtml` is already exhaustively unit-tested (Phase 1, spec safe-rendering); judged not worth writing a throwaway XSS payload into real member data to re-prove behavior already covered by tests. Ran against production (this project pushes straight to `main`; there is no separate preview-deploy flow in use), not a Vercel preview deploy as the task text literally says.

## Phase 4: Lifecycle

- [ ] 4.1 `supabase/sql/phase4_activo.sql`: `alter table miembros add column activo boolean not null default true`; apply.
- [ ] 4.2 Read real FK constraint names via `information_schema`; `supabase/sql/phase4_restrict.sql` drops and recreates both `cargos`/`registro_pagos` → `miembros` FKs as `ON DELETE RESTRICT`; apply.
- [ ] 4.3 Add retire/reactivate UI (`activo` toggle) + delete-with-confirm mapping Postgres `23503` → "Este miembro tiene historial financiero; usa Retirar."
- [ ] 4.4 Exclude `activo=false` members from the apoyo candidate list, pago selector, and `api/debt-view.ts`.
- [ ] 4.5 Manual SQL test: deleting a member with cargos/pagos refused (`23503`); deleting one with none succeeds; retiring preserves history.
