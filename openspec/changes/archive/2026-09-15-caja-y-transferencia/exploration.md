# Exploration: caja-y-transferencia

Change name: `caja-y-transferencia`
Artifact store: `openspec`
Status: exploration complete — ready for proposal

---

## Current State

### Where money actually changes state

There is **no stored cash-on-hand ("caja") balance today**, and **no `egreso` (expense/disbursement) record type exists**. Money state changes in exactly two repositories, both at the `features/*/repo.ts` boundary:

1. **`src/features/apoyos/repo.ts` — `saveApoyo(input)`**
   Inserts one `registro_apoyos` row (`monto_total`) and N `cargos` rows (`monto_original`, `monto_pendiente`, `estado='pendiente'`) split via `splitEvenly`. This is a **support/loan** (money the club extends to members, to be collected later). It does **NOT** represent cash received — it is a receivable. **It must NOT move caja.**

2. **`src/features/pagos/repo.ts` — `aplicarPago(input)`**
   Runs FIFO allocation (`allocateFifo`) over the member's pending `cargos`, updates each `cargo.monto_pendiente`/`estado`, then inserts **exactly one** `registro_pagos` row with `monto_pagado = input.montoPagadoPesos` (the **full** amount received, never the FIFO-decremented remainder). This is the **member payment/abono** — the moment cash actually enters the club. **This is the single event that must INCREASE caja.**

All amounts are MXN pesos (decimal like `33.33`) in the DB; `src/lib/money.ts` (`toCents`/`toPesos`/`formatMXN`, plus `splitEvenly` and `allocateFifo`) does integer-cent math. Per design.md **D6**, peso↔cent conversion happens **only** at the repository boundary; `money.ts` never touches the DB and feature UI never does raw arithmetic.

### Established "derive, don't store" pattern (strong precedent)

The codebase already computes every money total by **aggregating ledger rows on read**, never by persisting a mutable running balance:

- **`src/lib/debt-view.ts` — `aggregateDebtByMember(rows)`**: pure function summing `cargos.monto_pendiente` into per-member + total cents. Unit-tested in `src/lib/debt-view.test.ts`.
- **`src/lib/member-view.ts` — `summarizeMemberHistory(cargos, pagos)`**: pure function computing `totalOriginalCents` / `totalPendienteCents` / `totalPagadoCents` from row arrays. Consumed by both the admin history panel and `api/member-view.ts`.
- **`src/features/dashboard/index.ts` — `initializeDashboard`**: reduces `registro_apoyos.monto_total`, `registro_pagos.monto_pagado`, and `cargos.monto_pendiente` in the browser into KPI cards. No stored totals.

This is the single most decisive evidence for the caja design: **the codebase trusts derived aggregation over stored balances**, and its pure-function extraction + exhaustive unit-test convention (`debt-view.test.ts`, `money.test.ts`, `member-view.test.ts`) is built around exactly that.

### Public no-login view

- **`vista/index.html`** is Vite entry #2 (design.md D1). It fetches `/api/debt-view` and renders into three slots: `#vista-total-pendiente`, `#vista-deudores-body`, `#vista-banco`.
- **`src/public-view.ts`** is the public entry. It imports **only** `lib/escape` + `lib/types` (a hard D1 constraint so supabase-js + anon key stay out of the public bundle). `renderBanco` (lines 37–47) renders Banco / CLABE / Titular into `#vista-banco`. `formatCentsMXN` is deliberately duplicated inline instead of importing `money.ts` (documented in the file header).
- **`api/debt-view.ts`** is the sole public server function: `service_role` client, explicit column lists only (never `select('*')`), `405` on non-GET, `502` on failure with server-only logging, `Cache-Control: public, max-age=60, s-maxage=60`. `DebtViewResponse` (`src/lib/types.ts`) already deliberately excludes member UUIDs, status, emails, operator identity, and `observaciones`.

---

## Affected Areas

- `src/public-view.ts` — `renderBanco` (Part 1: CLABE copy button). Also renders the caja amount if Part 2 is public (Part 2).
- `vista/index.html` — `#vista-banco` container (Part 1); a new caja card/slot if Part 2 is public.
- `src/lib/types.ts` — add `caja` to `DebtViewResponse`; add `RegistroEgreso` type (Parts 2/3).
- `src/lib/caja.ts` (new) + `src/lib/caja.test.ts` (new) — pure ledger function `computeCaja(openingCents, pagos, egresos)` (Parts 2/3).
- `src/lib/clipboard.ts` (new) — shared `copyToClipboard` (Part 1), extracted from `src/features/miembros/token.ts`.
- `api/debt-view.ts` — fetch and return the caja amount (Part 2, if public).
- `src/features/dashboard/index.ts` — add a "Caja" KPI card (Part 2, admin).
- `index.html` — dashboard KPI grid (lines 115–131); sidebar nav (lines 87–92); new `#caja-content` page (Part 3).
- `src/main.ts` — wire the new caja feature (Part 3).
- `src/features/caja/{index.ts,repo.ts}` (new) — the caja module (Part 3).
- `src/features/pagos/repo.ts` — `aplicarPago` is the increase event; no change needed if caja is derived, but it is the invariant anchor.
- `supabase/sql/phaseN_egresos.sql` + `phaseN_egresos_down.sql` (new) — `registro_egresos` table + `configuracion_caja` singleton (Part 3).

---

## Approaches

### Approach 1 — DERIVED ledger with a stored opening amount (recommended)

`caja = opening + Σ(registro_pagos.monto_pagado) − Σ(registro_egresos.monto)`, computed by a pure `lib/caja.ts` function on read.

- Store the **opening amount** once in a `configuracion_caja` singleton (id=1), mirroring `configuracion_bancaria` exactly (admin-writable, readable via `service_role` in the API).
- Store each disbursement as a new `registro_egresos` ledger row.
- Never persist a mutable running balance.

**Pros**
- Matches the codebase's established derive-don't-store convention (`debt-view.ts`, `member-view.ts`, dashboard reduce) — lowest surprise, reusable pure-function test pattern.
- **Double-counting is impossible by construction**: each ledger row is summed exactly once; there is no balance field to drift out of sync.
- Robust to the existing multi-write (non-transactional) `aplicarPago`: if a cargo update fails after the `registro_pagos` insert, cash was still received, and the derived figure reflects reality.
- Historical corrections (edit/delete a pago or egreso) reflect automatically; no compensating journal entries.
- Negative caja ("números rojos") falls out naturally — no guard needed, just clear formatting.

**Cons**
- Read cost grows with ledger size (negligible at club scale — hundreds to low thousands of rows).
- The opening amount is not derivable from any ledger row and must be stored separately (a config value, not a ledger entry).

**Effort**: Medium

### Approach 2 — STORED balance (a persisted `caja_saldo` column/table updated on every movement)

Persist a `caja_saldo_cents` value and mutate it transactionally on every abono and every egreso.

**Pros**
- O(1) read.

**Cons**
- Adds a third write to `aplicarPago`'s already **non-transactional** sequence (update cargos → insert pago → update balance), materially increasing drift/partial-state surface. Requires a Postgres RPC/trigger or `rpc()` to be reliable.
- Every future write path (egreso insert, pago edit/delete, opening correction) must remember to adjust the balance — the exact drift/double-count risk the derived pattern exists to avoid.
- Contradicts the codebase's clear direction.

**Effort**: Medium–High (must introduce transactional RPC + balance-maintenance discipline)

---

## Recommendation

**Approach 1 — derived ledger with a stored opening amount.**

Evidence: three existing read-time aggregators (`debt-view.ts`, `member-view.ts`, dashboard) already establish the derive-don't-store pattern; `money.ts` D6 gives the cents discipline; the opening amount is the only non-derivable piece, and it fits the existing `configuracion_bancaria` singleton pattern cleanly.

Concretely:

- **New table `registro_egresos`** (app-owned): `id uuid pk`, `monto numeric not null`, `fecha date not null`, `motivo text not null`, `capturado_por uuid references auth.users(id) on delete set null`, `nombre_capturador text`, `created_at timestamptz default now()`. Mirrors `registro_pagos`/`registro_apoyos` column style.
- **New table `configuracion_caja`** (singleton, id=1): `monto_apertura numeric not null`, `updated_by uuid references auth.users(id) on delete set null`, `updated_at timestamptz default now()`. Mirrors `configuracion_bancaria`.
- **New pure function `src/lib/caja.ts`** — `computeCaja({ openingCents, pagosCents[], egresosCents[] }) → cajaCents` (also a per-entry breakdown for transparency), unit-tested in `src/lib/caja.test.ts` following `debt-view.test.ts`.
- **Double-counting invariant**: `aplicarPago` already inserts exactly one `registro_pagos` row per abono; `saveApoyo` never touches cash. Caja therefore increases by `monto_pagado` (the full amount, even when FIFO leaves `unappliedCents`), and decreases by each `registro_egresos.monto`. No row is summed twice. The design MUST state these two rules explicitly and test `computeCaja` against them.

---

## Insertion points (per part)

**Part 1 — CLABE copy button (public view)**
- `src/public-view.ts` `renderBanco`: add a button alongside the CLABE `<dd>`, wired via event delegation on `#vista-banco` with a `data-copy` / `data-clabe` attribute.
- The existing `copyToClipboard` helper lives in `src/features/miembros/token.ts`, but `public-view.ts` may only import `lib/*` (D1). **Recommend extracting `copyToClipboard` into a new `src/lib/clipboard.ts`** shared by `miembros/token.ts` and `public-view.ts` (DRY + consistent with D1's "shared lib, not reimplemented" rationale). This amends the documented "escape/types only" restriction — a decision to record in the proposal.

**Part 2 — caja amount field**
- Admin: add a 5th KPI card in `index.html` (lines 115–131) and compute it in `src/features/dashboard/index.ts` from `computeCaja`.
- Public: extend `api/debt-view.ts` + `DebtViewResponse.caja` + render in `vista/index.html` / `public-view.ts` — **only if** public exposure is a deliberate, user-confirmed choice (see Risks).

**Part 3 — caja module (egresos)**
- `supabase/sql/phaseN_egresos.sql` (+ `_down.sql`): `registro_egresos` + `configuracion_caja` with RLS (`enable row level security` + `revoke all … from anon` + `admins_all_*` policies via `public.is_admin()`), per `phase2_rls.sql`/`phase3_bank_config.sql`.
- `src/features/caja/{index.ts,repo.ts}`: egreso form + caja display, following `features/pagos`/`features/apoyos` (repo at DB boundary, UI in index.ts, `onRefresh` for member-independent state).
- `index.html`: sidebar nav link + `#caja-content` page; `src/main.ts` wiring.
- `src/lib/types.ts`: `RegistroEgreso`, `ConfiguracionCaja`, and the `caja` field on `DebtViewResponse`.

---

## Risks

- **Public exposure of cash-on-hand (no-login) is a real sensitivity change.** The public debt view today exposes only *aggregate receivables* and bank info. Exposing caja reveals the club's **liquidity**, and — because negative balances are explicitly allowed — would publicly surface financial distress ("números rojos"). Combined with the debtor ranking, it enables targeted social engineering. **Recommendation**: make the caja amount an **admin KPI by default**; only expose it publicly via `api/debt-view` if the user explicitly confirms, and keep it to the aggregate (no per-movement ledger on the public surface).
- **Shared Supabase project.** "arca" (ref `qjswicjxwsbwnxrrowsi`) is shared with unrelated systems. Both new tables must be additive and app-owned; the migration must never touch `arca_*`, `n8n_chat_histories`, `telegram_whitelist`, or `auth.users`.
- **Live DDL for `registro_pagos`/`registro_apoyos` is not in the repo.** The original 4 tables' CREATE statements predate this codebase (only `phaseN_*` migrations exist). The `registro_egresos` DDL must mirror `registro_pagos`'s *live* column types — read `information_schema` live before writing the migration (same precedent as `phase4_fk_restrict.sql`).
- **Negative balance formatting** must be explicit (red, unblocked) across admin and (if exposed) public surfaces.
- **`aplicarPago` is non-transactional** (separate cargo updates + pago insert). Derived caja is robust to this, but any future attempt to add a stored balance would inherit this hazard — further evidence for the derived approach.
- **`public-view.ts` import discipline (D1)** must be amended carefully: extracting `clipboard.ts` into `lib/` is safe, but importing any feature module (or `money.ts`) into the public entry would regress the tree-shaking guarantee that keeps supabase-js + anon key out of the public bundle.

---

## Ready for Proposal

**Yes.** The design direction is settled (derived ledger + stored opening amount + new `registro_egresos`). The one open question to surface to the user is **whether the caja amount is admin-only or also public** — everything else (copy button, egreso record type, negative-balance display) is confirmed and non-blocking.

## Key Learnings

1. The codebase derives all money totals on read via pure functions and never stores a mutable running balance.
2. Only `aplicarPago` inserts `registro_pagos` rows, which is the sole event that increases cash on hand.
3. The `egreso` record type does not exist yet and must be created as a new ledger table.
4. `public-view.ts` may only import `lib/*`, so the CLABE copy helper must be extracted into a shared `lib` module.
5. The original four tables' DDL is absent from the repo, so new-table column types must be read from the live Supabase schema.
