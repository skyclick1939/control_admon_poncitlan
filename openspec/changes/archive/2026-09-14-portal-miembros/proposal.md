# Proposal: Member Portal (`portal-miembros`)

## Intent

- **Admin**: no view shows a member's full financial history. Only *pending* `cargos` are fetched, and only inside the payment form. Paid `cargos` and `registro_pagos` are never read back per member.
- **Member**: members cannot see their own debts and contributions; `/vista/` is club-wide aggregate only.

## Decision Override (deliberate)

`evolucion-plataforma-arca` confirmed **"2-role model, no member login"** (Engram `sdd/evolucion-plataforma-arca/research`; its proposal lists "Member logins" Out of Scope). The owner **explicitly supersedes** it with a per-member bearer-token link — not an auth account. No Supabase Auth, no self-signup, no email; the Phase 0 incident class stays closed.

## Scope

### In Scope
- Admin per-member history panel: all `cargos` (paid + pending) + `registro_pagos` with totals; retired (`activo=false`) members included, per Phase 4 precedent. Zero new RLS — `is_admin()` already covers SELECT.
- Per-member token: 32+ random bytes, **hashed at rest only**; admin "generar/regenerar enlace" and "copiar enlace" actions. Distribution is manual/out-of-band.
- `mi-cuenta/index.html` (third Vite entry, reads `?token=`) + `api/member-view.ts` cloning `api/debt-view.ts`: service_role, explicit columns, top-level try/catch → 502, `.js`-suffixed imports, generic not-found error, `Cache-Control: private, no-store`.
- One additive app-owned Supabase change (column on `miembros` or new table — design's call) with `_down.sql`.

### Out of Scope
- New time-series/breakdown views — `mi-cuenta` links out to `/vista/`. Future follow-up.
- Member accounts, magic links, email/SMTP (exploration Options B/C).
- Link recovery: losing one means regenerating; the old dies. Accepted consequence of hash-only storage.
- Changes to `/vista/`, `api/debt-view.ts`, existing RLS, or any non-app table.

## Capabilities

### New Capabilities
- `member-payment-history`: admin-only full per-member history, retired included.
- `member-access-token`: hashed-at-rest issuance/rotation, one live token per member.
- `member-private-view`: token-scoped read contract and page, including exclusions.

### Modified Capabilities
- None. `public-debt-view` is linked to, not changed.

## Approach

Extend the proven Phase 3 pattern instead of inventing one. Query-string token (not a path segment) so no `vercel.json` or new routing behavior is introduced (design D2). Part 1 is pure repo + UI work.

## Affected Areas

| Area | Impact |
|---|---|
| `src/features/miembros/{repo,index}.ts` | Modified — history queries, token actions |
| `api/member-view.ts` | New — token-scoped payload |
| `mi-cuenta/index.html`, `src/member-view.ts` | New — entry without anon key |
| `vite.config.ts`, `src/lib/types.ts` | Modified — third input, new shapes |
| `supabase/sql/portal_miembros_token{,_down}.sql` | New — additive token storage |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| URL token is a permanent bearer credential | High (inherent) | Owner-accepted; rotation invalidates instantly |
| Parameterized endpoint becomes an enumeration oracle (design D7's reason for no params) | Med | Entropy + hashing + one indistinguishable error |
| Per-visitor response voids D7's CDN-caching abuse assumption — design.md's own "revisit if parameterized or per-visitor" trigger fires | Med | `private, no-store`; design revisits rate limiting |
| `ERR_MODULE_NOT_FOUND` on the new `api/*.ts` | Med | `.js`-suffixed imports (HANDOFF gotcha) |
| Schema change on a live shared DB | Low | Additive, app-owned, sign-off + read-back |

## Rollback Plan

- **DB**: additive and nullable; `_down.sql` drops it verbatim, nothing depends on it. Apply live only after explicit owner sign-off immediately before execution, with read-back verification — the Phase 0/2/3/4 gate.
- **Code**: promote the previous Vercel deployment. Deleting the `mi-cuenta` entry and `api/member-view.ts` restores today's surface; Part 1 reverts independently.
- **Tokens**: revoking is deleting the hash.

## Dependencies

Owner sign-off immediately before the live SQL; Supabase Management API token (Engram only); an out-of-band channel for link delivery (`miembros` has no contact info).

## Success Criteria

- [ ] Admin sees paid + pending `cargos` and all `registro_pagos` with totals, for active and retired members.
- [ ] Generating a link invalidates the previous one; copy action works.
- [ ] `/mi-cuenta/?token=<valid>` returns only that member's data with no session, and links to `/vista/`.
- [ ] Invalid, missing, and revoked tokens are indistinguishable.
- [ ] No plaintext token exists at rest.
- [ ] `anon` still denied on every base table; `postbuild` service_role guard passes.
