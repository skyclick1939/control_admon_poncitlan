# Proposal: caja-y-transferencia

## Intent

Add cash-on-hand ("caja") transparency to control_admon_poncitlan: (1) a copy-to-clipboard button for the CLABE in the public no-login view so a visitor can make a bank transfer; (2) a caja amount field shown in both admin and public views; (3) a full caja module that captures an opening amount and then moves automatically as money flows, so every movement is transparent.

## Scope

### In Scope

- Part 1: copy-to-clipboard CLABE button in the public no-login view.
- Part 2: caja amount field — admin KPI card + public aggregate field.
- Part 3: caja module — `registro_egresos` table, `configuracion_caja` singleton, egreso capture UI.
- `src/lib/caja.ts` + tests; `src/lib/clipboard.ts` extraction; `RegistroEgreso` / `ConfiguracionCaja` types; `caja` field on `DebtViewResponse`; `supabase/sql/phaseN_egresos.sql` + `phaseN_egresos_down.sql` with RLS.

### Out of Scope

- Any change to `miembros`, `cargos`, `registro_apoyos`, `registro_pagos` semantics.
- Any stored mutable running balance; per-movement egreso detail on the public surface.
- Touching unrelated `arca_*`, `n8n_chat_histories`, `telegram_whitelist`, `auth.users`.

## Capabilities

### New Capabilities

- `caja`: cash-on-hand ledger — opening amount, egreso records, derived balance (negative allowed), admin + public aggregate display.
- `public-clabe-copy`: CLABE copy-to-clipboard affordance in the public no-login view.

### Modified Capabilities

- None — no existing spec covers the public debt view or money movement.

## Approach

Derived ledger with a stored opening amount (exploration Approach 1): `caja = apertura + Σ(registro_pagos.monto_pagado) − Σ(registro_egresos.monto)`, computed by pure `src/lib/caja.ts` `computeCaja` on read. Chosen over a stored balance (Approach 2) because double-counting is impossible by construction and it survives `aplicarPago`'s non-transactional sequence.

Invariants (MUST be stated and tested):

- `aplicarPago` (`src/features/pagos/repo.ts`) is the ONLY cash-in event; it inserts exactly ONE `registro_pagos` row with the FULL `monto_pagado`, even when FIFO leaves `unappliedCents`.
- `saveApoyo` (`src/features/apoyos/repo.ts`) creates a receivable and MUST never move caja.
- No ledger row may be summed twice.

Decisions recorded:

- **D1 amendment**: extract `copyToClipboard` from `src/features/miembros/token.ts` (line 20) into dependency-free `src/lib/clipboard.ts`, shared by both callers. This AMENDS the documented "escape/types only" import restriction of `src/public-view.ts` (verified lines 17–18).
- **Public exposure mitigation (accepted risk)**: public surface exposes ONLY the aggregate caja amount — never per-movement egresos detail, never operator identity; `api/debt-view.ts` keeps explicit column lists (never `select('*')`); negative caja renders clearly and unblocked; existing `Cache-Control` retained.
- **Migration safety**: `registro_egresos` column types MUST mirror the live `registro_pagos` schema read via `information_schema` (precedent `phase4_fk_restrict.sql`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/caja.ts` + `.test.ts` | New | Pure `computeCaja` ledger function |
| `src/lib/clipboard.ts` | New | Shared `copyToClipboard` (extracted) |
| `src/public-view.ts` | Modified | CLABE copy button; render caja amount |
| `src/features/miembros/token.ts` | Modified | Import from `lib/clipboard` |
| `api/debt-view.ts` | Modified | Return aggregate `caja` |
| `src/lib/types.ts` | Modified | `RegistroEgreso`, `ConfiguracionCaja`, `caja` |
| `src/features/caja/{index,repo}.ts` | New | Egreso capture + display module |
| `index.html` / `vista/index.html` / `src/main.ts` | Modified | KPI card, nav, public slot, wiring |
| `supabase/sql/phaseN_egresos{,_down}.sql` | New | `registro_egresos` + `configuracion_caja` + RLS |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Public caja reveals liquidity; negative balances surface distress near debtor ranking → social engineering | Med | Accepted by user after informed warning. Aggregate-only, no operator identity, explicit columns, negative caja rendered as such (unblocked). |
| Shared Supabase project — schema change collides with unrelated systems | Med | Additive app-owned tables only; never touch `arca_*`/`n8n_chat_histories`/`telegram_whitelist`/`auth.users`. |
| Live DDL absent → column-type mismatch | Med | Mirror live `registro_pagos` via `information_schema` before writing migration. |
| `aplicarPago` non-transactional | Low | Derive-only (no stored balance) is robust; a future stored balance would inherit this hazard. |

## Rollback Plan

- Code: revert commits; `caja.ts`/`clipboard.ts` are additive pure functions — removing them restores prior behavior.
- Schema: run `phaseN_egresos_down.sql` to drop `registro_egresos` + `configuracion_caja`; no migration touches existing tables.
- Public surface: remove `caja` from `DebtViewResponse` and revert `api/debt-view.ts` column list.

## Dependencies

- Live Supabase `information_schema` access before writing the migration.
- Existing `is_admin()` RLS helper and `configuracion_bancaria` singleton pattern.

## Success Criteria

- [ ] `computeCaja` unit tests pass (`vitest run`): full pago with `unappliedCents`, `saveApoyo` neutrality, negative balance, no double-sum.
- [ ] Copy button copies the CLABE in the public view with graceful fallback.
- [ ] Egreso capture updates derived caja immediately in admin and public.
- [ ] Negative caja renders unblocked (red) on both surfaces.
- [ ] No mutation of existing tables; migration reversible via `_down.sql`.
