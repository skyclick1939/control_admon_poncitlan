## Exploration: portal-miembros

Change name used: `portal-miembros` (accepted as proposed — no clearly better kebab-case alternative found; names the domain, not the mechanism, matching this project's naming convention).

### Current State

**Admin side — per-member financial visibility today (verified by direct code read, not assumed):**
- `pagos/index.ts`'s `handleMemberSelectionForPayment` (via `pagos/repo.ts`'s `fetchCargosPendientes`) shows a member's PENDING `cargos` only (joined with `registro_apoyos.motivo/fecha`), and only as a side-effect of the "register a new payment" workflow — not a standalone history view.
- `dashboard/index.ts` shows an aggregate "top deudores" ranking (nickname + total pendiente %), not a per-member drill-down.
- There is NO existing query anywhere in the codebase that fetches `registro_pagos` (payment history) filtered by `miembro_id`. `aplicarPago` only INSERTs into `registro_pagos`, never reads it back per member.
- There is NO existing query that shows a member's already-PAID `cargos` (only pending, via the payment-form path).
- RLS: `is_admin()` already permissively covers SELECT on `cargos`/`registro_pagos`/`registro_apoyos` (Phase 2, live). A new admin-only per-member history view needs **zero new RLS/DB work** — pure UI + query addition.
- `miembros.activo=false` (retired) rows are deliberately still included in the admin dashboard debt KPI per an explicit Phase 4 scope decision ("history stays intact and queryable") — the same reasoning implies a per-member history view should also work for retired members, not just active ones.

**Member-facing side — current public surface (Phase 3, `evolucion-plataforma-arca`, live):**
- `vista/index.html` + `src/public-view.ts` + `api/debt-view.ts`: a second Vite entry, zero session, fetches `/api/debt-view` (a `service_role`-backed Vercel Function). Returns club-wide aggregate only: `totalPendienteCents`, a `deudores[]` ranking (nickname + pendienteCents), and bank config. Deliberately excludes UUIDs, `status`, `created_at`, per-charge `motivo`, payment history, operator identity (design.md's "Deliberately excluded" list, D7: **no query parameters**, to avoid turning the endpoint into an enumeration oracle).
- `public-view.ts` imports ONLY `lib/escape` + `lib/types` — never `lib/supabase.ts` — so the anon key/`supabase-js` never reach this bundle (D1). Every user-controlled field goes through `escapeHtml`.
- `Miembro` (src/lib/types.ts) has **zero contact info**: `{ id, nickname, status, created_at, activo }`. The only `email` field in the whole schema is on `app_admins` (a completely separate concern — admin accounts, not members).
- **Critical, already-settled precedent**: `evolucion-plataforma-arca`'s own `sdd-research` phase (Engram `sdd/evolucion-plataforma-arca/research`, round-1 `AskUserQuestion`) explicitly confirmed with the user: *2-role model (superadmin/admin), no member login*. This new request directly **supersedes** that confirmed decision — that should be stated explicitly in `sdd-propose`, not silently overwritten.
- Phase 0's incident (open self-signup + blanket `authenticated` RLS) is the reason any new authenticated-surface option here needs real scrutiny, not a rubber stamp — this is why Option C below is flagged so heavily.

### Affected Areas

- `src/features/miembros/repo.ts`, `src/features/miembros/index.ts` — admin per-member history view (new repo function, new UI panel/button per row).
- `src/lib/types.ts` — new response/row shapes for history + (if Option A is chosen) a token column on `Miembro` or a separate table.
- `src/lib/debt-view.ts` (pattern to extend, not modify) — `aggregateDebtByMember` is reusable as-is for the "club aggregate" portion of any member-facing view.
- `api/debt-view.ts` (pattern to clone, not modify) — the exact architecture a new `api/member-view.ts` (or similar) should follow: `service_role`-backed, explicit column lists, top-level try/catch → 502, `.js`-suffixed relative imports (Vercel per-file `tsc` + plain Node ESM gotcha, HANDOFF-documented).
- `src/public-view.ts`, `vista/index.html` — precedent for a new, separate, unauthenticated-bundle entry (no `lib/supabase.ts`, no anon key).
- `vite.config.ts` — would need a third `rollupOptions.input` entry for a member-facing page (`mi-cuenta/index.html` or similar), same mechanism as Phase 3's `vista` entry — no `vercel.json` needed by the same reasoning as D2 (hash-routed admin app, and a query-string-driven personal page needs no path-based dynamic routing either — see Option A below).
- Supabase: only Option A needs a schema change (one new column on `miembros`, or one new table); Options B/C need a real schema change (`email`, `auth_user_id`) plus new RLS policies plus (B/C) Supabase Auth configuration.

### Approaches

**Part 1 — Admin payment-history view.** Single approach, low ambiguity:
1. **New repo query + UI panel** — add `fetchHistorialMiembro(miembroId)` (or split into `fetchCargosMiembro` without the `estado='pendiente'` filter, and a new `fetchPagosMiembro`), and a "Ver historial" action per row in `miembros/index.ts` rendering both lists plus totals.
   - Pros: no new access-control model (existing `is_admin()` RLS already covers it); reuses established repo/UI patterns exactly; low, well-bounded diff.
   - Cons: none of substance — this is close to pure UI work.
   - Effort: **Low**.

**Part 2 — Member-facing access model.** Three approaches compared on security, effort, scalability, UX:

| Approach | Security | Effort | Scalability (~10 members today) | UX |
|---|---|---|---|---|
| **A. Private per-member token link** (`/mi-cuenta/?token=...` static entry + `api/member-view.ts`, cloning the `debt-view.ts` pattern) | Bearer-token-in-URL model. Mitigations: high-entropy token (32+ random bytes), **store only a hash** (not plaintext) so a future RLS/read-access misconfiguration on `miembros` — this project's own incident class — can't leak usable tokens; generic error for "not found" (no enumeration oracle, echoing D7's own concern); `Cache-Control: private, no-store` (NOT the `public` caching debt-view uses, since this response is per-visitor). No email/SMTP surface reopened. Zero change to existing RLS (endpoint stays `service_role`-backed, RLS on `miembros`/`cargos`/`registro_pagos` untouched — `anon` still denied everywhere). | **Low** — near-direct clone of the already-built, already-tested Phase 3 pattern; one new column/table + one admin action (generate/rotate) + one new endpoint + one new static entry. | Fine now; token issuance/rotation is a manual admin action, trivial at this size — would need a batch-issue UI only if the club grows to hundreds. | Member UX: one bookmarkable link, no password. **Real gap, not solved by code**: since `miembros` has no contact info, the admin has no in-app channel to deliver the link — it must go out via WhatsApp/printed card/verbal, and there's no self-service "resend my link" (nothing to resend it *to*). If the hash-only-storage design above is used, "I lost my link" means the admin must **regenerate** (issuing a new link kills the old one) — there is no "look up Bob's existing link" recovery path. |
| **B. Magic-link/OTP via email** | Familiar pattern, but a magic-link sign-in creates a real `auth.users` row — this is not actually separable from Option C's architecture, just a different login mechanism into the same auth surface. | **Medium-High** — real prerequisite cost: collect and validate ~10 members' actual emails (a one-time data-entry task, not just code), confirm Supabase's built-in email sending is viable at this project's tier or add a transactional provider (Resend/Postmark) — **not currently configured anywhere in this project**, would need to be verified/set up. Plus a new `auth_user_id` mapping column and `auth.uid()`-scoped RLS policies. | Scales fine long-term; the deliverability setup is a fixed one-time cost regardless of club size. | Conventional "check your email" flow; adds a real-world friction Option A doesn't have (must have reliable, checked email). |
| **C. Full Supabase Auth accounts, admin-invited only** | Strongest long-term model, but the **largest surface reopened** after a project whose Phase 0 explicitly closed public self-signup following a real incident. Must be admin-invite-only (never self-signup) to avoid repeating that mistake; needs its own RLS scoping (`auth.uid()` → `miembros.id`), and raises follow-on questions (password reset flow, whether MFA/AAL policy applies to members too). | **High** — same email prerequisite as B, plus account lifecycle (invite, reset, possibly deactivation tied to `activo`), and a materially larger reviewable surface for a 10-member, read-only use case. | Best long-term if the club's needs grow beyond "view my own data" into member-initiated actions — but that is not part of the current request. | Most conventional login UX; heaviest to build/maintain relative to the actual current ask (read-only "ver mis adeudos y aportaciones"). |

### Recommendation

**Part 1 (admin history view): proceed straight to `sdd-propose`/`sdd-design` — no open questions, no access-control redesign, low risk.**

**Part 2 (member-facing access): recommend Option A (private per-member token link), with hashed-at-rest token storage and `private, no-store` caching, as a direct architectural extension of the already-proven, already-reviewed Phase 3 `debt-view` pattern.** It is the only option with zero new prerequisite infrastructure (no email/SMTP), the smallest new surface area, and it does not reopen the auth/signup-adjacent risk class Phase 0 closed. Options B and C both converge on needing real email infrastructure this project does not currently have configured, and C specifically reopens a security surface this project has a documented incident history with — proceeding straight there without a real driving need (members currently perform zero actions in this app; this is read-only) would not be proportional.

This recommendation should still go back to the project owner as an explicit decision — see below — not be silently locked in at `sdd-propose` time, both because it reverses a previously-confirmed decision ("no member login") and because of the real UX gap (link distribution has no in-app channel).

### Risks

- **Token-in-URL is a permanent bearer credential** until rotated — anyone holding the link has access indefinitely; this is an accepted property of the pattern (same class as a shared magic-link/Google-Doc-style link), not a defect, but the project owner should knowingly accept it.
- **No in-app distribution channel**: `miembros` has zero contact info, so Option A's link must be distributed manually (WhatsApp/printed/verbal) by the admin — this is a real operational gap the code cannot close, only make manageable (e.g., a "copy link"/QR admin action).
- **Enumeration-oracle risk reintroduced by a parameterized endpoint**: `api/debt-view.ts`'s D7 rationale (no params = no oracle) does not apply once a token param exists — mitigated only by token entropy + hashed storage + generic error responses; must be designed deliberately, not bolted on.
- **Reverses a previously confirmed product decision** ("no member login," `sdd/evolucion-plataforma-arca/research`) — `sdd-propose` must record this as an explicit supersession with the user's confirmation, not silently overwrite prior research.
- **Scope ambiguity on "detailed dashboard of the whole operation"**: unresolved whether the member-facing view should (a) link out to the existing `/vista/` aggregate (near-zero new work, MVP) or (b) build genuinely new time-series/breakdown views reusing the admin dashboard's Chart.js infra through a new public-safe aggregation module — real effort difference, needs an explicit decision, not an assumption.
- **Vercel dynamic path routing (`api/mi-cuenta/[token].ts`) is unconfirmed** for this project's zero-config setup — sidestepped in the recommendation by using a query-string token on a static entry (mirrors `/vista/`'s exact existing shape) instead of a path segment, avoiding the need to verify or introduce new routing behavior at all.

### Explicit decisions needed from the project owner (not assumed here)

1. Confirm overriding the prior "no member login" decision with Option A (token link) specifically — not defaulting into B/C later without a fresh look at the email prerequisite.
2. How will the admin distribute each member's link in practice (WhatsApp, printed card, in-person)? Should the admin UI grow a "copiar enlace" / QR-code action to make this practical for ~10 members?
3. Should losing a link mean "admin regenerates" (kills the old one, no recovery of the original) as the only path — this is a natural consequence of storing only a token hash, recommended for security, but the owner should know there is no "look up the existing link" option.
4. Scope of "detailed dashboard of the whole operation": link out to the existing `/vista/` aggregate (MVP) vs. build new time-series/breakdown views now — pick one for `sdd-propose`, defer the other explicitly rather than leaving it implicit.

### Ready for Proposal

**Yes, for Part 1 (admin history view) — no open questions.**
**Conditionally yes for Part 2 (member-facing access) — the architecture fork itself is resolved (Option A recommended with concrete mitigations), but `sdd-propose` should not finalize until the project owner answers the four decision points above**, particularly #1 (explicit override of the prior confirmed decision) and #4 (scope boundary on the "whole operation" dashboard) — both are product decisions, not technical unknowns, so `sdd-research` is not needed first; this can go straight to a decision-gated `sdd-propose`.
