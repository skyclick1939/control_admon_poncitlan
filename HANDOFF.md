# HANDOFF — control_admon_poncitlan

Read this file first in any new session working on this project. It is a thin pointer to the canonical documentation, not a copy of it — the files it points to are the source of truth; this file is a map.

## What this project is

A club/organization expense-tracking app ("Control de Gastos Poncitlán"), being migrated to Vite + TypeScript (see below), live on Vercel, backed by a Supabase Postgres project named "arca" (ref `qjswicjxwsbwnxrrowsi`) that is **shared** with an unrelated system (a different, separate "arca" national-chapters project, still in approval — never touch its tables, listed by name in the Facts section below).

## Active change: `evolucion-plataforma-arca`

A full SDD (Spec-Driven Development) cycle, planned and partially executed via the `gentle-ai` ecosystem (`/gentle-sdd-*` commands / native `sdd-*` subagents). Turns the single-file app into a robust, tested, role-based platform: closes a critical open security hole (done), migrates to Vite+TypeScript (done), adds a superadmin/admin role model with TOTP MFA (done), and will add a public no-login debt dashboard and a bank-account info panel (not started).

**First command to run in a new session**: `gentle-ai sdd-status evolucion-plataforma-arca --cwd <repo> --json --instructions` — this is the authoritative, machine-readable status (dependency states, next recommended phase, blockers). As of this handoff it reports **26/38 tasks complete, `nextRecommended: apply`**. Trust its JSON over any prose summary, including this file, if they ever disagree.

## Where the documentation lives (canonical, versioned in this repo)

- `openspec/config.yaml` — project-wide SDD rules/guardrails; `strict_tdd: true`, `test_command: "vitest run"` (flipped in Phase 1, task 1.13)
- `openspec/changes/evolucion-plataforma-arca/`
  - `exploration.md`, `research.md` (8 official Supabase/Vercel sources) — investigation phase
  - `proposal.md` — accepted scope, phases, rollback plan
  - `design.md` — concrete architecture: exact SQL, module boundaries, sequence diagrams
  - `specs/*/spec.md` (7 files) — testable requirements per capability, Given/When/Then
  - `tasks.md` — **the live roadmap/bitácora**. Checkbox state (`[x]`/`[ ]`) IS the authoritative applied/pending log. Read this file to know exactly what's done. Also carries the Phase 0 sign-off record and the Phase 2 SQL-applied-live record, plus one unnumbered "Follow-up" note under Phase 2.
  - `phase0-account-audit.md` — record of the `auth.users` audit performed during Phase 0
- `supabase/sql/phase0_down.sql` — rollback for Phase 0 (re-enable signup, re-grant anon, recreate prior policies)
- `supabase/sql/phase2_{roles,seed_superadmin,rls,aal2,guard}.sql` — Phase 2's SQL, each headed `-- STATUS: APPLIED live 2026-09-13` with its own read-back confirmation
- `supabase/sql/phase2_down.sql` — rollback for Phase 2 (drops the guard trigger first, then the new policies, then recreates Phase 0's exact 8 policies verbatim, then drops `app_admins`/the two helper functions)
- `supabase/sql/phase2_manual_tests.sql` — already drafted, ready-to-run SQL for task 2.6 (aal1 refused / aal2 succeeds / anon denied / last-superadmin-guard cases), explicitly headed as not executed by any batch — a human runs this manually through a real session. Read/reuse this before writing new test SQL for 2.6.

## Current status — Phases 0, 1, and 2 are DONE, live, and pushed. Phase 3–4 not started.

**Phase 0 (security fix) — DONE, live-verified, sign-off obtained.** Public self-signup closed (`disable_signup: true`), `anon` has zero grants on the 4 original tables, the 8 pre-Phase-2 `authenticated` policies were left untouched at the time (later replaced in Phase 2). `auth.users` audited: 9 accounts, none unrecognized. `fors@gmail.com` (project owner) is the sole superadmin as of Phase 2. `alexis@gmail.com` (former capturista, 105 linked financial records) was kept, not deleted, and lost elevated access naturally in Phase 2 by not being added to `app_admins`. Live-DB sign-off for this phase is recorded in Engram (project `control_admon_poncitlan`) and at the top of `tasks.md`'s Phase 0 section.

**Phase 1 (Vite + TypeScript migration) — DONE, tasks 1.1–1.13.** Vite + TypeScript + Vitest scaffold, `src/lib/money.ts`/`escape.ts` (built RED-GREEN, fixes the pre-existing float-rounding and epsilon bugs), and the full extraction of the original single-file monolith into `src/app.ts` + `src/main.ts` + 5 feature modules (`auth`, `dashboard`, `miembros`, `apoyos`, `pagos`). `openspec/config.yaml` flipped to `strict_tdd: true` here (task 1.13) — governs every `sdd-apply`/`sdd-verify` run from this point forward. Behavior preserved except the two named money/escaping fixes and an intentional new pagos overpayment block/warning (task 1.11).

**Phase 2 (Roles + MFA) — DONE, including the UI, live, pushed.** All 8 tasks complete except 2.6 (see Known gaps below):
- `app_admins` table + `is_admin()`/`is_superadmin()` helpers (`security definer`, `search_path=''`) — applied live.
- RLS overhaul: the original 8 blanket policies (4 `ALL` + 4 `SELECT`, on `miembros`/`cargos`/`registro_apoyos`/`registro_pagos`) were **all** dropped — not just the 4 `ALL` ones the task text literally named; leaving the `SELECT` ones would have left non-admin reads open (Postgres OR-combines permissive policies). Replaced with `is_admin()`/`is_superadmin()`-scoped policies on those 4 tables plus `app_admins` itself (5 tables total — `configuracion_bancaria` doesn't exist until Phase 3).
- AAL2 restrictive layer on `app_admins` writes only (insert/update/delete — never a bare FOR-less restrictive policy, which would default to `FOR ALL` and block every session's own-role read).
- Last-superadmin guard trigger (statement-level, not RLS `USING`).
- `fors@gmail.com` seeded as the sole superadmin.
- **Effect**: `fors@gmail.com` is now the only account with any access to `miembros`/`cargos`/`registro_apoyos`/`registro_pagos`. `alexis@gmail.com` and every other account lost access the moment the RLS script ran. Re-granting needs an `insert into app_admins` row for that user — there's a UI for this now (see next point), but it requires the raw `auth.users` UUID (see Known gaps).
- The admin panel and forced-MFA-enrollment screen (`src/features/admin/*`, `src/features/auth/mfa.ts`) are written, unit-tested, **and mounted into `main.ts`/`index.html`** — reachable via a nav link (hidden for non-admins) and a login-time gate that blocks a superadmin without verified TOTP from reaching the dashboard until they enroll.
- Live execution used the Supabase Management API `database/query` endpoint (same as Phase 0), with a read-back verification after every one of the 5 SQL files before the next ran. Full trail in Engram topic `sdd/evolucion-plataforma-arca/apply-progress`.

**Day-to-day impact for `fors@gmail.com`**: none — `is_admin()` (used by miembros/cargos/apoyos/pagos policies) has no AAL requirement, so normal dues/payment tracking works exactly as before at aal1 login. Only writes to `app_admins` itself (managing other admins) require AAL2.

## Known gaps — not done, not blockers, pick up whenever

- **Task 2.6** (manual RLS test as real anon/aal1/aal2 sessions) is undone by design: the Management API used to apply Phase 2 runs as an elevated role that bypasses RLS entirely, so it structurally cannot exercise this test. The exact test SQL is already drafted in `supabase/sql/phase2_manual_tests.sql` — needs a human (or a future live-session test) logging into the actual app as `fors@gmail.com`, enrolling MFA, and running it for real.
- **No email→UUID lookup for adding admins**: `addAdmin` (in the now-wired admin panel) takes a raw `auth.users` UUID the operator must already have — self-signup is closed (Phase 0), so there's no browser-safe way to look up a user by email. Flagged since task 2.8, still open; needs a decision in a future phase (e.g. a small service-role lookup endpoint).
- **No per-session AAL2 re-challenge UI**: if a superadmin's client-side session is only aal1 (e.g. a fresh login before Supabase re-confirms AAL2), an attempted write to `app_admins` fails with a raw RLS error rather than a friendly re-auth prompt. The actual security boundary (the DB policy) holds regardless — this is a UX gap only. Not fixed; flagged in `tasks.md`'s Phase 2 follow-up note.
- Tailwind is still served via the old CDN `<script>` tag in `index.html`; `@tailwindcss/vite` is installed (Phase 1) but not wired to a real CSS entry point yet. Cosmetic/tooling debt, not a blocker.

## Vercel — env vars set, live site confirmed working

`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set (as **Config** type — Vercel rejects `VITE_`-prefixed vars set as **Secret** type, since Secret is write-only and can't be inlined into the client bundle at build time; this bit the first Phase-1 deploy and was fixed in-session). See Engram discovery `discovery/vercel-vite-env-vars-must-use-config-type-not-secret` — any future `VITE_*` var on this Vercel project must use Config, never Secret.

## Native SDD attempt ledger (`gentle-ai sdd-attempt`)

Tripped `changed_line_budget_exceeded` on several batches (Phase 0, Phase 1's two PRs) because it counts the raw git diff — including generated files like `package-lock.json` — against a cap the orchestrator sets per work unit. Each time required a `sdd-attempt reset` with the project owner's explicit in-session authorization (the tool's own guard requires this — "maintainer_decision", never automatic). Phase 2's batches did NOT trip this (no lockfile changes, diffs stayed under budget). Before assuming a real scope problem, check `gentle-ai sdd-attempt status --cwd <repo> --change evolucion-plataforma-arca` for the authored-vs-raw accounting, and always ask the project owner before resetting — never self-authorize.

## Git

Everything through Phase 2 (SQL + TypeScript + the admin/MFA UI wiring) is committed AND pushed to `origin/main` as of commit `a7df9a6`. This HANDOFF.md rewrite is committed on top of that (check `git log -1 -- HANDOFF.md` if you need the exact hash) and pushed — if `git status --short` ever shows this file as modified in a fresh session, someone edited it locally after cloning; don't assume it's still in flight. The default `gh`/git identity on this machine is `consultores-orion`, which does NOT have write access to this repo — all pushes used a one-off classic PAT for `skyclick1939` (stored in Engram, topic `config/github-pat-skyclick1939-control-admon-poncitlan`), passed via an inline authenticated URL rather than `gh auth login`, specifically to avoid disrupting `consultores-orion`'s default auth for other projects on this machine. Use the same pattern for future pushes.

## Facts a new session must NOT re-derive (already investigated, would waste time re-checking)

- Money columns (`monto_*`) are already Postgres `numeric`, not `float8` — no schema migration was needed for the rounding fix, only `money.ts`.
- AAL2 (TOTP-verified sessions) **can** be enforced at the Postgres RLS layer via `restrictive` policies reading `(select auth.jwt()->>'aal') = 'aal2'` — confirmed against official Supabase docs, and now live (Phase 2). Real DB-level boundary, not just a client-side UI gate.
- The app is hash-routed (`#dashboard` etc.), not path-routed — no `vercel.json` is needed, even for the future public dashboard entry (Phase 3).
- The Supabase Management API token is stored in **Engram only**, never in any repo file — search Engram for the `config/supabase-management-token-control-admon-poncitlan` topic. Account-wide-scope credential; treat it accordingly. The exact execution pattern used for both Phase 0 and Phase 2 live changes: a small one-off Node.js script (not committed) reads a `.sql` file and POSTs it to `https://api.supabase.com/v1/projects/{ref}/database/query` with the token as a Bearer header — avoids shell-escaping SQL containing quotes/`$$` into `curl -d` strings. Delete the helper script after use; never commit it.
- The other, unrelated project(s) sharing this Supabase instance own tables named `arca_audit_logs`, `arca_chapters`, `arca_debts`, `arca_system_config`, `arca_user_profiles`, `telegram_whitelist` (all confirmed live via a `pg_policies` query during Phase 2's pre-check — but that query only surfaces tables that have at least one RLS policy, so it is not a complete table inventory) and `n8n_chat_histories` (named in `openspec/config.yaml`'s protected-table guardrail but not confirmed live by that same query, likely because it has no RLS policy defined — do not treat its absence from the live-confirmed list as evidence it doesn't exist). Treat the union of both lists as off-limits; if a future live-DB task needs a full table inventory, query `information_schema.tables`, not `pg_policies`.
- Claude Code sessions on this account can hit a weekly API rate limit during a long, tool-call-heavy session (happened once during Phase 2's UI-wiring batch). If a delegated sub-agent is cut off mid-task by this, check `gentle-ai sdd-attempt status` before assuming work was lost — its own `settle` call may have already landed before the interruption; only a trailing step (like an Engram save) might be missing.

## SDD session preflight (will be asked again in a new session — answer the same way for continuity)

The `gentle-ai` SDD workflow requires a one-time-per-session preflight (Pace / Artifacts / PR strategy). Every session so far answered: **Automatic** pace, **hybrid** artifacts (Engram + this repo's `openspec/` files), **auto-chain** PR strategy with **stacked-to-main** chaining. Re-select the same options unless something changed.

## Governance note

Receipt-driven development (native code review) is **off** for this repo (`gentle-ai review mode status` confirms). Delivery follows ordinary repository policy — no native review gate blocks anything here. This is the user's own choice; don't second-guess it.

## What's next: Phase 3 (Public View + Bank Config)

Not started. Per `tasks.md`, tasks 3.1–3.6: a `configuracion_bancaria` singleton table + `is_admin()` policies (live-DB change — will need the same explicit sign-off pattern as Phases 0 and 2), an admin-only bank-config UI, a `service_role`-backed `api/debt-view.ts` serverless function (explicit column list only, never `select('*')`, `405`/`502` handling, a `postbuild` script grepping `dist/` for `service_role` leakage), and a public no-login `vista/index.html` entry point that imports only `lib/escape`/`lib/types` — never `lib/supabase.ts` — to keep the anon key and any privileged access out of that bundle. Read `design.md`'s Phase 3 section and `specs/{public-debt-view,bank-config}/spec.md` before starting. Expect the same pattern used for Phase 2: draft the SQL/code fully, verify locally, get explicit sign-off, then execute live.
