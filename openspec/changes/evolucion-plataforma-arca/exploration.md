# Exploration: evolucion-plataforma-arca

Change name used: `evolucion-plataforma-arca` (accepted as proposed — no better kebab-case alternative found; ties naturally to the shared Supabase project "arca" this app's backend lives in).

## Current State

`index.html` (858 lines) is the entire app: no build step, no package.json, CDN-loaded Tailwind/Chart.js/`@supabase/supabase-js@2`, DOM manipulation via direct `getElementById` + `innerHTML` string concatenation. Four views gated behind `dashboardView`/`loginView` toggle: Dashboard (KPIs + Chart.js bar chart), Miembros (list/add), Solicitud de Apoyos (split an amount across members into `cargos`), Registro de Pagos (FIFO-allocate a payment across a member's pending `cargos`). Auth is Supabase email/password (`signInWithPassword`), session-checked on load — no role distinction of any kind; any authenticated session has identical full CRUD.

Backend: Supabase project "arca" (Postgres 15), shared with unrelated systems. This app owns exactly 4 tables: `miembros`, `cargos`, `registro_apoyos`, `registro_pagos`.

Verified this session, confirmed by direct code read:

- **RLS/signup gap (critical, round 1)**: `disable_signup: false` + `ALL`-for-`authenticated` policies on all 4 tables ⇒ anyone can self-register against the exposed anon key and get full read/write/delete. Top-priority fix, requires explicit user sign-off before `sdd-apply` (policy-only, no data touched, but still a live-system security change).
- **Money-math bug candidate (new finding this session)**: `handleSaveApoyo` (index.html:658) computes `individualAmount = monto / membersToCharge.length` and inserts that raw float into `cargos.monto_original`/`monto_pendiente` — never rounded to cents. E.g. splitting $100.00 across 3 members stores `33.333333...` per row; the sum of stored `monto_pendiente` will not exactly equal `monto_total`. This is a real defect (not just an untested-but-correct path) that Vitest coverage should catch and the money-math module should fix (e.g. largest-remainder rounding so cents reconcile exactly to the total).
- **Payment allocation** (`handleSavePago`, index.html:788-803): FIFO greedy allocation across pending `cargos` ordered by `created_at`, `Math.min(montoPagado, cargo.monto_pendiente)` per row, threshold `<= 0.001` to mark `pagado`. Logic is sound in shape but uses raw JS floats for currency — same class of drift risk as above over many partial payments. Both money-math paths belong in one pure, DOM/network-free module for unit testing.
- **Stored-XSS risk**: `renderDeudoresTable`, `fetchAndRenderMembers`, `handleMemberSelectionForPayment` all build HTML via unescaped template-literal interpolation of user-entered text (`nickname`, `motivo`, `observaciones`) into `.innerHTML`. Combined with open signup, any self-registered "authenticated" user can inject stored payloads that execute for every other logged-in user (and, once the public dashboard ships, potentially for anonymous visitors too if the same unescaped rendering pattern is reused there).
- **`ON DELETE CASCADE`** from `miembros` → `cargos`/`registro_pagos`: deleting a member silently wipes their financial history. Risky for an accounting tool; not one of the 5 new requirements but still open from round 1 and should not be dropped from scope.
- Deployment: Vercel, GitHub-connected (`skyclick1939/control_admon_poncitlan`, `main`), zero-config static today.

## Affected Areas

- `index.html` — becomes the Vite entry shell; current inline `<script type="module">` (index.html:287-855) splits into `src/` modules (auth, dashboard, miembros, apoyos, pagos, supabase client, a pure `money.js` for split/allocation math).
- New: `package.json`, `vite.config.*`, `src/lib/money.js` (+ Vitest specs) — the money-math extraction is the highest-value refactor for testability and directly fixes the rounding bug above.
- New: a second, unauthenticated entry point/route for the public quick-view dashboard (Vite supports multi-page builds) or a client-side route that never calls anything requiring a session.
- New: `api/` (Vercel Functions) if the public-read mechanism goes the serverless route (recommended below) — one function using `service_role` server-side only, never shipped to the client bundle.
- Supabase: new tables for admin/role management and bank-account config (see below), rewritten RLS policies on all 4 existing tables + new ones, `disable_signup` flip. These are SQL/dashboard changes, not files in this repo, but must be documented in `sdd-design` and tracked (e.g. `supabase/migrations/` or equivalent) since there is currently zero schema-as-code for this project.
- `openspec/config.yaml` — testing block needs to flip once Vite+Vitest lands (`strict_tdd: true`, real `test_command`), per the note already recorded at `sdd-init` time.

## Round 1 scope — already accepted, formalizing only

Confirmed, no changes proposed here: Vite-based modular vanilla JS (TypeScript left as a decision point — see below), Tailwind + `@supabase/supabase-js` as real npm deps, Vitest for money-math, fix unescaped-HTML XSS, keep deploying to Vercel (native Vite zero-config), fix RLS/signup gap (gated on explicit user sign-off before apply — not pre-authorized).

**TypeScript note**: given this codebase's core risk is money arithmetic (a rounding bug already found above) and Supabase's generated types would give compile-time protection against a whole class of "wrong field name"/"wrong shape" mistakes when the schema changes (new tables incoming for roles + bank config), TypeScript is the leaning recommendation over plain JS — but this is a genuine judgment call with a real cost (build complexity, learning curve) rather than a slam-dunk, flagged as an explicit decision point for `sdd-propose`/`sdd-design`.

## Round 2 — new requirements explored

### 1. Admin management panel / role model

Today: zero role distinction, "any authenticated user = full access." Two ways to store roles:

| Approach | Pros | Cons | Effort |
|---|---|---|---|
| A. Custom claims in `auth.users.app_metadata`, read via `auth.jwt()` in RLS | No extra table/join in policies | Editing `app_metadata` requires the Supabase Admin API (service-role only) — i.e., a serverless function would be needed just to let a superadmin add/remove admins, duplicating the effort the public-read function already needs | Medium |
| B. Dedicated `app_admins` table (`user_id → auth.users`, `role` check `superadmin`\|`admin`), RLS policies join against it | Superadmin managing admins = a plain insert/delete through the app's own UI + RLS, no extra serverless function needed; stays scoped to this app's own schema (consistent with round-1 "never couple to shared `arca_*` tables" rule) | One extra join in every policy that needs role checks | Low-Medium |

**Recommendation: Option B.** It directly satisfies requirement #1 (admin-management UI) without inventing a second serverless function purely to edit JWT claims, and matches the existing constraint to keep this app's schema self-contained.

Follow-on question the user's own requirements already answer: **do regular members need authenticated accounts at all?** Given requirement #2 (public no-login view covers "see what I owe") and nothing in the current app has members self-service anything (apoyos/pagos are always entered by a capturista), the answer appears to be **no** — "member" should not be an auth role at all, just rows in `miembros` identified by nickname, with zero login capability. That collapses the taxonomy from an implied 3-tier (superadmin/admin/member) to 2 authenticated roles (superadmin, admin/capturista) + 1 unauthenticated public-read surface. Presented as a recommendation, not decided.

One more open point: should a superadmin be able to delete/demote itself, risking total lockout? Recommend disallowing self-removal of the last superadmin at the RLS/application layer.

### 2. Public no-login quick-view dashboard

This is the one requirement in direct tension with the RLS/signup fix (closing an accidental public-write hole while intentionally opening a narrow public-read one).

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| A. Narrow public RLS SELECT on a restricted view/columns, `anon` role | Pure SQL, no serverless cold starts, simplest to ship | Confirmed via Supabase's own Postgres-15-era `security_invoker` view feature and documented `grant select ... to anon` pattern — technically workable | Puts the safety boundary back inside RLS policy configuration — the exact mechanism that already caused this project's live incident. Any anon key holder hits the view/table directly; no request-shaping/rate-limiting layer between the public internet and the DB. |
| B. Vercel serverless/edge function using `service_role` server-side only, returning a minimal sanitized payload (nickname + total pendiente only) | Consistent with the already-decided Vercel deployment; one small, easily-reviewed function file *is* the entire public-read surface, independent of RLS correctness on the base tables | Adds one more moving part (a function + its own tests) | Slightly more to build than a view |

**Recommendation: Option B, as the primary and sole public-read path**, additionally paired with RLS on the base tables that denies `anon` SELECT entirely (belt-and-suspenders: even if the `service_role` key were ever mistakenly exposed client-side in the future, or a future policy edit slips, the base tables still fail closed to `anon`). This project has a demonstrated, concrete history of RLS misconfiguration (the very incident driving round 1) — collapsing "what's safe to expose publicly" into one reviewable server-side function, rather than re-trusting the same policy layer that already failed, is the more defensible choice. Supabase's own "Securing your API" docs additionally recommend a dedicated non-exposed schema for internal tables as a complementary hardening pattern regardless of which option is chosen — worth carrying into design.

### 3. Bank account display

Recommend a small single-purpose table in this app's own schema (e.g. `configuracion_bancaria`: bank name, CLABE, account holder, `updated_by`, `updated_at`) — explicitly NOT coupled to the sibling `arca_debts`/`arca_system_config` tables in the shared project, consistent with round-1's isolation rule. Editable only by admin/superadmin (RLS write policy joins `app_admins`). For the public-read half, recommend bundling it into the same public function from item #2 rather than a second anon grant/view — keeps "one function is the entire public surface" architecturally coherent.

### 4. Superadmin TOTP MFA

Verified directly (WebFetch of Supabase's own TOTP guide) rather than assumed from training data — current `@supabase/supabase-js` v2 surface: `auth.mfa.enroll({ factorType: 'totp' })` → `{ id, totp: { qr_code } }`; `auth.mfa.challenge({ factorId })` → `{ id }`; `auth.mfa.verify({ factorId, challengeId, code })`; `auth.mfa.getAuthenticatorAssuranceLevel()` → `{ currentLevel, nextLevel }`; `auth.mfa.listFactors()`. TOTP is free and enabled by default on Supabase projects.

**Important gap found, not resolved**: Supabase's own TOTP guide page demonstrates only client-side AAL gating (checking `nextLevel === 'aal2'` to show a UI prompt) and does not document how to enforce AAL2 at the RLS/database layer. Gating superadmin-only writes (e.g., to `app_admins`) only in client-side UI would repeat the exact mistake behind this project's original incident. This must be verified before design: does Postgres/Supabase RLS have direct access to the JWT's `aal` claim, so that `app_admins` write policies can require `aal2` at the database level. Flagged as the top `sdd-research` item.

## Approaches — overall migration path (round 1, for completeness)

1. **Vite + modular vanilla JS, Vercel-deployed** (accepted) — minimal new surface area, matches app's actual complexity (~4 tables), Vercel zero-config Vite support, Vitest slots in naturally. Effort: Medium.
2. **Next.js/SvelteKit rewrite** (rejected in round 1) — batteries-included routing/SSR, but explicitly rejected as over-engineering for this scope; re-confirmed as correct given the app's actual size (858 lines, 4 tables, ~4 views). Effort: High.

## Recommendation

Proceed to `sdd-research` next (see specific questions below) before `sdd-propose`, given three concrete, unresolved factual questions block a safe design: the AAL2-in-RLS enforcement mechanism (security-critical, directly tied to this project's incident history), exact Vercel Functions + Vite project layout, and the exact `disable_signup` toggle path in the current Supabase dashboard/Management API. Everything else in this exploration (role model = Option B, public-read = Option B, bank-account table shape, TypeScript-or-not) is ready for `sdd-propose` to formalize once the user confirms the flagged product decisions below — none of it is blocked on research, only on user sign-off.

## Risks

- RLS/signup fix touches a live, shared Supabase project with unrelated systems on it — any policy change must be scoped and reviewed before apply; explicit user sign-off required.
- The money-math rounding bug is a pre-existing correctness defect discovered during this exploration, not something introduced by the migration.
- Client-side-only AAL2 gating for superadmin actions would be a security theater risk if `sdd-design` doesn't confirm DB-level enforcement is possible/implemented.
- Reusing the current unescaped-`innerHTML` rendering pattern in the new public (unauthenticated) dashboard would extend the stored-XSS risk to an anonymous audience — must be fixed in the same pass the public view is built, not deferred.
- `ON DELETE CASCADE` on `miembros` remains an open, unaddressed data-loss risk from round 1; not part of the 5 new requirements but should stay in scope for `sdd-propose`/`sdd-design` so it isn't silently dropped.

## sdd-research recommendation — specific, unresolved factual questions

1. **AAL2 enforcement in RLS** (highest priority): can a Postgres RLS policy on this Supabase project read the JWT's `aal` claim directly (exact expression/helper), so writes to a new `app_admins`/roles table can require `aal2` (TOTP-verified) at the database layer, not just gate a button client-side?
2. **Exact `@supabase/supabase-js` MFA method signatures and edge cases** — enrollment/unenrollment UX for a single superadmin account, factor-already-enrolled handling (partially verified this session; worth a final pass at `sdd-design` time since API surfaces move).
3. **Vite + Vercel Functions project layout** — exact conventions for colocating a Vite static frontend with one or more `api/*.js` serverless functions in the same repo/deploy (build settings, whether `vercel.json` is needed at all, and how the `service_role` key gets supplied as a server-only environment variable without ever reaching the client bundle).
4. **Exact current `disable_signup` toggle** — confirm the current dashboard path/Management API field name for disabling self-registration on this specific Supabase project.
5. (Lower priority) **`security_invoker` view + anon GRANT semantics on Postgres 15** for aggregating across `miembros`+`cargos` — only relevant if the user overrides the Option B recommendation above and prefers an RLS-view-based public read instead of the serverless-function path.

## Explicit decisions still needed from the user (not mine to assume)

- Confirm or override: 2-tier auth role model (superadmin, admin/capturista) with members having no authenticated account at all (Option B taxonomy above).
- Confirm or override: public-read mechanism = Vercel serverless function with `service_role`, base-table `anon` SELECT denied (Option B above), rather than an RLS-view-based public read (Option A).
- Confirm: TypeScript vs plain JS for the Vite migration.
- Explicit sign-off (separate from this exploration) authorizing `sdd-apply` to execute the RLS-policy/`disable_signup` fix on the live shared Supabase project.
- Confirm: whether superadmin self-demotion/self-deletion should be blocked to prevent lockout.
- Confirm: `ON DELETE CASCADE` → `RESTRICT`/soft-delete for `miembros`-owned financial rows (carried over from round 1).

## Already settled (no further input needed)

- Vite + modular vanilla/TS JS, Tailwind + supabase-js as real deps, Vitest for money-math, Vercel deployment unchanged.
- `app_admins`-style dedicated table over JWT custom claims for role storage.
- Bank-account config as this app's own new table, not coupled to sibling `arca_*` tables.
- Bank-account public read bundled into the same public function as debt data (not a second anon grant).

## Ready for Proposal

Partially. The overall scope and both major architecture forks (role model, public-read mechanism) have a clear, reasoned recommendation and are ready for `sdd-propose` to formalize. However, `sdd-propose` should not finalize the TOTP/RLS design details or the exact public-function/Vercel layout until `sdd-research` closes items 1, 3, and 4 above. Recommend running `sdd-research` next, scoped to the 5 questions above, before `sdd-propose`.

## Key Learnings

1. `handleSaveApoyo` in index.html stores an unrounded float division result into `cargos`, causing cent-level drift across split apoyos — a real, pre-existing correctness bug, not just an untested path.
2. Supabase's own TOTP MFA guide documents client-side AAL2 gating but does not document RLS-level AAL2 enforcement, making this the top `sdd-research` item before designing superadmin MFA.
3. Storing admin/superadmin roles in a dedicated `app_admins` table (vs. JWT `app_metadata` custom claims) avoids needing a second serverless function just to manage roles.
4. Given this project's own history of RLS misconfiguration, a Vercel serverless function using `service_role` server-side is the safer default for the public-read dashboard than a narrow RLS view.
5. Postgres 15 supports `security_invoker` views that respect underlying-table RLS when queried by `anon`/`authenticated`, the concrete mechanism behind Option A of the public-read fork, should the user override the recommendation.
