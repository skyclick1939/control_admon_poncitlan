# HANDOFF — control_admon_poncitlan

Read this file first in any new session working on this project. It is a thin pointer to the canonical documentation, not a copy of it — the files it points to are the source of truth; this file is a map.

## What this project is

A club/organization expense-tracking app ("Control de Gastos Poncitlán"), currently a single `index.html` file (Tailwind/Chart.js/Supabase-JS via CDN, no build step), live on Vercel, backed by a Supabase Postgres project named "arca" (ref `qjswicjxwsbwnxrrowsi`) that is **shared** with an unrelated system (a different, separate "arca" national-chapters project, still in approval — never touch its tables).

## Active change: `evolucion-plataforma-arca`

A full SDD (Spec-Driven Development) cycle, planned and partially executed via the `gentle-ai` ecosystem (`/gentle-sdd-*` commands / native `sdd-*` subagents). Turns the single-file app into a robust, tested, role-based platform: closes a critical open security hole, migrates to Vite+TypeScript, adds a superadmin/admin role model with TOTP MFA, a public no-login debt dashboard, and a bank-account info panel.

**First command to run in a new session**: `gentle-ai sdd-status evolucion-plataforma-arca --cwd <repo> --json --instructions` — this is the authoritative, machine-readable status (dependency states, next recommended phase, blockers). Trust its JSON over any prose summary, including this file, if they ever disagree.

## Where the documentation lives (canonical, versioned in this repo)

- `openspec/config.yaml` — project-wide SDD rules/guardrails (scope constraints, testing capabilities)
- `openspec/changes/evolucion-plataforma-arca/`
  - `exploration.md`, `research.md` (8 official Supabase/Vercel sources) — investigation phase
  - `proposal.md` — accepted scope, phases, rollback plan (has a status banner noting Phase 0 is done)
  - `design.md` — concrete architecture: exact SQL, module boundaries, sequence diagrams (has a status banner on the Migration/Rollout section)
  - `specs/*/spec.md` (7 files) — testable requirements per capability, Given/When/Then
  - `tasks.md` — **the live roadmap/bitácora**. Checkbox state (`[x]`/`[ ]`) IS the authoritative applied/pending log. Read this file to know exactly what's done.
  - `phase0-account-audit.md` — record of the `auth.users` audit performed during Phase 0
- `supabase/sql/phase0_down.sql` — rollback script for Phase 0 (re-enable signup, re-grant anon, recreate prior policies)

This documentation set was independently reviewed twice this session (once by a fresh-context validator on `design.md` alone, once by a fresh-context reviewer across the entire set) and corrected for the issues found — cross-document contradictions, stale/present-tense claims about the now-fixed vulnerability, an unresolvable "earlier in this session" reference, and a missing test scenario. Should be internally consistent as of this handoff.

## Current status (as of this session)

**Phase 0 — DONE, live-verified, sign-off obtained.** The critical vulnerability (public self-signup + blanket "any authenticated user has full CRUD" RLS on all 4 tables) is closed:
- `disable_signup: true` on the live Supabase project (confirmed via Management API GET)
- `anon` role has zero grants on `miembros`/`cargos`/`registro_apoyos`/`registro_pagos` (confirmed via `information_schema.role_table_grants`)
- The 8 pre-existing `authenticated`-role policies are untouched (no lockout) — they get replaced properly in Phase 2, not removed early
- `auth.users` audited: 9 accounts total, none unrecognized/attacker-controlled. `fors@gmail.com` (project owner) will be the sole seeded superadmin in Phase 2. 7 `*.arca.local` accounts belong to the separate unrelated project sharing this Supabase instance — never touch them. `alexis@gmail.com` is a known former capturista with 105 linked financial records (21 apoyos + 84 pagos) — kept, not deleted (deleting would null that attribution for no security benefit); their elevated access will be revoked naturally in Phase 2 by simply not adding them to `app_admins`.
- This authorization for the live-DB change was given explicitly by the project owner in this session's conversation, not something re-derivable from files alone — see the "Sign-off record" note at the top of `tasks.md`'s Phase 0 section, and Engram (project `control_admon_poncitlan`) for the full trail.

**Phase 1 — DONE (tasks 1.1–1.13), NOT pushed.** Vite + TypeScript + Vitest scaffold, `src/lib/money.ts`/`escape.ts` (built RED-GREEN, 134/134 tests pass, fixes the pre-existing float-rounding and epsilon bugs), and the full extraction of the 858-line `index.html` monolith into `src/app.ts` + `src/main.ts` + 5 feature modules (`auth`, `dashboard`, `miembros`, `apoyos`, `pagos`) are all committed on `main` in two batches (PR2, PR3 — see Git below). `openspec/config.yaml` now has `strict_tdd: true` / `test_command: "vitest run"` — this governs `sdd-apply`/`sdd-verify` from here on. Behavior was preserved except the two named money/escaping fixes and the new pagos overpayment block/warning (task 1.11, intentional). Phase 2–4 — NOT started (Phase 2 is roles + MFA, the next live-DB-touching phase — will need the same kind of explicit sign-off Phase 0 got).

**Follow-ups a new session must handle before/around Phase 2–3, not yet done**:
- Tailwind is still served via the old CDN `<script>` tag in `index.html`; `@tailwindcss/vite` is installed (PR2) but not wired to a real CSS entry point yet. Deliberately deferred out of PR3's scope (extraction only) — pick this up whenever, it's cosmetic/tooling debt, not a blocker.

**Vercel env vars — DONE, live site confirmed working (this session)**: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set in the Vercel project and the post-migration site loads correctly. Pushing PR2+PR3 briefly broke the live site (`Uncaught Error: Missing VITE_SUPABASE_URL...`) because the user initially added `VITE_SUPABASE_ANON_KEY` as Vercel's **Secret** type — Vercel rejects that for any public-framework-prefixed (`VITE_`) variable; it must be **Config** type instead (readable at build time, needed to inline into the client bundle). Fixed by switching the type and redeploying. See Engram discovery `discovery/vercel-vite-env-vars-must-use-config-type-not-secret` — any future `VITE_*` var added to this Vercel project must use Config, never Secret.

**Native SDD attempt ledger (`gentle-ai sdd-attempt`)**: tripped `changed_line_budget_exceeded` on every batch so far (Phase 0, PR2, PR3) because it counts the raw git diff — including generated files like `package-lock.json` — against a cap the orchestrator itself sets per work unit. Each time, a `sdd-attempt reset` needed the project owner's explicit in-session authorization (the tool's own guard requires this — "maintainer_decision", never automatic). Expect this to keep happening on large batches; check `gentle-ai sdd-attempt status --cwd <repo> --change evolucion-plataforma-arca` for the authored-vs-raw accounting before assuming a real scope problem, and ask before resetting.

**Git**: Phase 0 (`426f59d..445ab99`, PR1) AND Phase 1 (`e76a857` PR2, `b10fbc2` PR3) are all **committed AND pushed** to `origin/main` (`363c16b..b10fbc2`). This triggers a Vercel redeploy with REAL app-code changes for the first time (index.html now loads `/src/main.ts` as a module) — **Vercel env vars (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) must be set for that build to work**; if they aren't set yet, the live site will break on this deploy until they are (see Follow-ups above). The default `gh`/git identity on this machine is `consultores-orion`, which does NOT have write access to this repo — all pushes so far used a one-off classic PAT for `skyclick1939` (stored in Engram, topic `config/github-pat-skyclick1939-control-admon-poncitlan`), passed via an inline authenticated URL rather than `gh auth login`, specifically to avoid disrupting `consultores-orion`'s default auth for other projects on this machine. Use the same pattern for future pushes.

## Facts a new session must NOT re-derive (already investigated, would waste time re-checking)

- Money columns (`monto_*`) are already Postgres `numeric`, not `float8` — no schema migration needed for the rounding fix, only `money.ts`.
- AAL2 (TOTP-verified sessions) **can** be enforced at the Postgres RLS layer via `restrictive` policies reading `(select auth.jwt()->>'aal') = 'aal2'` — confirmed against official Supabase docs. This is a real DB-level boundary, not just a client-side UI gate. Exact SQL is in `design.md`.
- The app is hash-routed (`#dashboard` etc.), not path-routed — no `vercel.json` is needed, even for the new public dashboard entry.
- The Supabase Management API token used for Phase 0 (and available for future phases) is stored in **Engram only**, never in any repo file — search Engram for the `config/supabase-management-token-control-admon-poncitlan` topic. It is an account-wide-scope credential; treat it accordingly.

## SDD session preflight (will be asked again in a new session — answer the same way for continuity)

The `gentle-ai` SDD workflow requires a one-time-per-session preflight (Pace / Artifacts / PR strategy). This session answered: **Automatic** pace, **hybrid** artifacts (Engram + this repo's `openspec/` files — already in place), **auto-chain** PR strategy with **stacked-to-main** chaining. Re-select the same options unless something changed.

## Governance note

Receipt-driven development (native code review) is **off** for this repo (`gentle-ai review mode status` confirms). Delivery follows ordinary repository policy — no native review gate blocks anything here. This is the user's own choice; don't second-guess it.
