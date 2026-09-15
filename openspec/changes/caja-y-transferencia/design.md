# Design: caja-y-transferencia

## Technical Approach

Derived liquid-position ledger with a stored opening amount (proposal Approach 1, amended). A single pure function `computeCaja` in `src/lib/caja.ts` computes `cajaCents = openingCents + Σ(registro_pagos.monto_pagado) − Σ(registro_apoyos.monto_total) − Σ(registro_egresos.monto)` over already-fetched rows, in integer cents only. No stored mutable balance. The opening amount is the one non-derivable piece and lives in a `configuracion_caja` singleton (id=1), mirroring `configuracion_bancaria`. Read-time aggregation matches the codebase's existing derive-don't-store pattern (`debt-view.ts`, `member-view.ts`). The derived balance is exposed as the aggregate `cajaCents` on the public contract and is displayed as "**Arca (disponible)**".

**Field naming (supersedes proposal wording).** The public field is `cajaCents`, not `caja`. The repository convention is that every money value crossing a contract boundary is named `*Cents` — verified at `src/lib/types.ts:109-112` (`DebtViewResponse.totalPendienteCents`, `deudores[].pendienteCents`) and `:126-137` (`MemberViewResponse.totalPendienteCents`, `totalPagadoCents`, `pagos[].montoCents`). This deliberately supersedes the proposal/exploration wording "`caja` field on `DebtViewResponse`": the unit is integer cents (never fractional pesos), and for a money API the `*Cents` suffix makes the unit part of the name so a consumer cannot silently mix pesos and cents. Every occurrence below uses `cajaCents`.

## Capture Surface (settled)

Leaving the Arca has exactly ONE capture surface: the **"Solicitud de Apoyos"** flow, with three modalities — group (`TODOS`/`FULLPARCH`), individual (`INDIVIDUAL`), and **"Sin cargos — absorbido por el Arca (no recuperable)"**.

- The group and individual modalities write `registro_apoyos` + `cargos` (a loan).
- The "Sin cargos" modality writes exactly ONE `registro_egresos` row with NO apoyo and NO cargos; its beneficiary is optional.
- `registro_egresos` is the storage for that non-recoverable modality, and **its only writer is `saveEgreso`**. `saveEgreso` has exactly one caller: `saveApoyoSinCargos` in `src/features/apoyos/repo.ts`. Therefore every `registro_egresos` row is, by construction, a non-recoverable disbursement.

The **Arca page is a query/config surface only**: the opening-amount field plus the derived breakdown. It captures NOTHING. Its duplicate "Registrar Egreso" form is **removed** (commit `f94757a`).

Neither `registro_egresos` nor `saveEgreso` is removable.

## Architecture Decisions

| Decision | Choice | Tradeoff | Verdict |
|---|---|---|---|
| Balance model | Derived on read (pure `computeCaja`) | O(ledger) read cost, trivial at club scale; vs stored balance → third write in `aplicarPago`'s non-transactional sequence | Derived |
| Opening amount storage | Stored singleton row (`configuracion_caja`, id=1) | Not derivable from any ledger row; fits `configuracion_bancaria` pattern | Stored config |
| Opening amount write | `saveApertura` UPSERT on `configuracion_caja` id=1, **re-settable admin correction** | vs "initial-only set" (deny UPDATE after first write) → extra guard absent from the bank-config precedent and a mistaken value becomes uncorrectable | Re-settable UPSERT |
| CLABE copy reuse | Extract `copyToClipboard` → `src/lib/clipboard.ts` | Amends `public-view.ts` "escape/types only" restriction; must stay import-free to preserve tree-shaking | Extract to `lib/` |
| Public Arca exposure | Aggregate `cajaCents` only, never movements/operator identity | Accepted liquidity-visibility risk; mitigated by explicit columns + aggregate-only | Expose aggregate |
| Non-recoverable capture | The Apoyos "Sin cargos" modality writes one `registro_egresos` row through `saveEgreso` (sole caller) | The Arca page keeps no capture form; the modality is the single entry point | Single writer |
| Support (apoyo) disbursement | Subtract `Σ(registro_apoyos.monto_total)` from `cajaCents` | Handing out a support is cash leaving the club; repayments return via `registro_pagos` (already adds). Net zero over a fully repaid apoyo, negative while unrepaid | Subtract apoyos term |
| Outstanding receivable ("Por cobrar") | Display the existing `totalPendienteCents` (Σ `cargos` pending, per `aggregateDebtByMember`) alongside "Arca (disponible)" | Contextual only; MUST NOT feed `cajaCents` | Separate figure |
| Balance naming | "Arca" (label "Arca (disponible)") | Operator unifies physical cash + bank transfers in one pot; "Caja" means physical cash only and is technically wrong; "Arca" is the operator's own term | Label: Arca (UI only) |

**D1 amendment (clipboard tree-shaking).** `src/lib/clipboard.ts` MUST import nothing (uses only `navigator`/`document` browser globals). `src/public-view.ts` imports only `./lib/clipboard`, `./lib/escape`, `./lib/types`; because `clipboard.ts` has zero imports, it cannot pull supabase-js or the anon key into the public bundle.

**Money discipline (D6), narrowed and corrected.** Peso↔cent conversion stays at the repository boundary — `features/caja/repo.ts` and `api/debt-view.ts`. `lib/caja.ts` accepts/returns cents only, never touches the DB, and never calls `toCents`; the repo converts before calling it. Debt is not exempt from this rule: per-member debt figures derive exclusively from `aggregateDebtByMember` over integer cents from `estado='pendiente'` rows (see "Debt Consistency"). The dashboard's two pre-existing money totals (`kpi-apoyos-total`, `kpi-pagos-total`) still sum raw floats over `registro_apoyos`/`registro_pagos` and render via `toFixed(2)`; those are not debt figures, they are unchanged, and they are out of scope for this change. They MUST NOT be described as a debt aggregation: no dashboard reduce touches debt anymore. The NEW "Arca (disponible)" card does no raw arithmetic — it calls `fetchCaja()` (a `CajaBreakdown` already in cents) and formats via `money.formatMXN`. The "Por cobrar" figure is read from the existing debt aggregate, not recomputed.

## Naming Decision

The rename is **presentational only**. What the operator sees is "Arca"; what the code is named does not change.

**Renamed (user-facing labels only):**
- Module / navigation label → "Arca"
- Balance card → "Arca (disponible)"
- Dashboard KPI label → "Arca (disponible)"
- Public Arca card label → "Arca (disponible)"

**NOT renamed (identifiers stay exactly as they are in the code today):**
- `computeCaja`, `CajaInput`, `CajaBreakdown` — including `CajaBreakdown.openingCents` / `pagosTotalCents` / `apoyosTotalCents` / `egresosTotalCents` / `cajaCents`
- `src/lib/caja.ts`, `src/lib/caja.test.ts`
- `src/features/caja/repo.ts`, `src/features/caja/index.ts` — including `fetchCaja`, `saveEgreso`, `saveApertura`, `fetchApertura`
- `cajaCents` on `DebtViewResponse`
- `initCaja` and the DOM ids `#caja-content` / `data-view="caja-content"`
- The table `configuracion_caja` and the type `ConfiguracionCaja`

**Why.** The module is already implemented and verified. Renaming identifiers is pure churn on verified code, adds regression risk (imports, DOM ids referenced by `index.html` and `src/main.ts`), and delivers nothing the operator asked for. It would also collide confusingly with the SHARED Supabase project whose name is already "arca".

**Deliberate consequence.** The UI says "Arca" while the code says `caja` / `Caja`. This asymmetry is **accepted and intentional**: the diff stays reviewable and the already-verified module is not churned.

## Data Flow

```
admin browser                                         public browser
   │                                                       │  fetch /api/debt-view
   ├─ "Solicitud de Apoyos" ──► saveApoyo ──► registro_apoyos + cargos
   │        └─ Sin cargos ────► saveApoyoSinCargos ──► saveEgreso ──► registro_egresos
   ├─ Arca page (query/config only) ─► saveApertura ► configuracion_caja(id=1) UPSERT
   └─ fetchCaja (repo: toCents at boundary) ──► computeCaja (pure) ◄── api/debt-view.ts (service_role)
   └─ "Por cobrar" = Σ(cargos.monto_pendiente) via aggregateDebtByMember (debt-view.ts) — contextual, not in computeCaja
                                                         │
         Supabase: configuracion_caja(id=1) + registro_pagos.monto_pagado − registro_apoyos.monto_total − registro_egresos.monto
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/caja.ts` | Create | Pure `computeCaja` + `CajaInput`/`CajaBreakdown` types |
| `src/lib/caja.test.ts` | Create | Vitest suite beside source (strict TDD) |
| `src/lib/clipboard.ts` | Create | Dependency-free `copyToClipboard(text): Promise<boolean>` with `execCommand` fallback |
| `src/features/miembros/token.ts` | Modify | Import `copyToClipboard` from `../../lib/clipboard` |
| `src/public-view.ts` | Modify | CLABE copy button in `renderBanco`; render `cajaCents` (negative → red, unblocked) |
| `vista/index.html` | Modify | CLABE button slot + Arca (disponible) card |
| `api/debt-view.ts` | Modify | Fetch opening+pagos+apoyos+egresos, return aggregate `cajaCents` (apoyos SUBTRACT, never exposed individually); explicit column lists only |
| `src/lib/types.ts` | Modify | `RegistroEgreso`, `ConfiguracionCaja`, `cajaCents` on `DebtViewResponse`; `Miembro.status` widened with `'interno'` |
| `src/features/caja/repo.ts` | Create | `fetchCaja` (fetch rows → cents → `computeCaja`); `saveEgreso` insert; `fetchApertura`/`saveApertura` singleton UPSERT; `fetchPorCobrar` |
| `src/features/caja/index.ts` | Create | Opening-amount control + "Arca (disponible)" balance card + movement breakdown + "Por cobrar" card. **No capture form.** |
| `src/features/apoyos/index.ts` / `repo.ts` | Modify | Third modality "Sin cargos"; `saveApoyoSinCargos` → `saveEgreso`; beneficiary selector (internal members included, default none); group-division exclusion of internal members |
| `src/features/dashboard/index.ts` | Modify | 5th "Arca (disponible)" KPI card via `fetchCaja()` → `formatMXN`; debt ranking derives from `aggregateDebtByMember` |
| `index.html` | Modify | KPI grid card, sidebar nav link, `#caja-content` page; duplicate "Registrar Egreso" form **removed** |
| `src/main.ts` | Modify | Wire `initCaja` + navigation refresh |
| `supabase/sql/phase5_egresos.sql` | Create | `registro_egresos` + `configuracion_caja` + RLS + seed (guard before DDL) |
| `supabase/sql/phase5_egresos_down.sql` | Create | Drop both tables only |
| `supabase/sql/phase6_miembros_status_interno.sql` | Create | Widen `miembros_status_check` to admit `'interno'` (drop + add, guard before DDL) |
| `supabase/sql/phase6_miembros_status_interno_down.sql` | Create | Fail-safe revert: assert no row uses `'interno'` before narrowing |
| `supabase/sql/phase7_egresos_beneficiario.sql` | Create | Add `beneficiario_id` + `nombre_beneficiario` to `public.registro_egresos` |
| `supabase/sql/phase7_egresos_beneficiario_down.sql` | Create | Drop only those two columns |
| `supabase/sql/phase8_reclasificar_gasto_sin_cargar.sql` | Create | Move ONE misrecorded disbursement from the loan ledger to the expense ledger; delete its apoyo and phantom cargo. Guarded, atomic, reversible |
| `supabase/sql/phase8_reclasificar_gasto_sin_cargar_down.sql` | Create | Reverse script for the same row |

## Interfaces / Contracts

```ts
// src/lib/caja.ts — PURE, cents only, no DB
export interface CajaInput {
  openingCents: number;
  pagosCents: readonly number[];   // one entry per registro_pagos row (full monto_pagado)
  apoyosCents: readonly number[];  // one entry per registro_apoyos row (monto_total) — SUBTRACTS
  egresosCents: readonly number[]; // one entry per registro_egresos row
}
export interface CajaBreakdown {
  openingCents: number;
  pagosTotalCents: number;   // Σ pagosCents ("Pagos recibidos"; no dedup — each row counted once)
  apoyosTotalCents: number;  // Σ apoyosCents ("Apoyos entregados (recuperables)" — SUBTRACTS)
  egresosTotalCents: number; // Σ egresosCents ("Egresos (no recuperables)")
  cajaCents: number;         // opening + pagosTotal − apoyosTotal − egresosTotal (may be negative, unclamped)
}
export function computeCaja(input: CajaInput): CajaBreakdown;
```

> **"Por cobrar" is NOT part of `CajaBreakdown`.** It is the existing `totalPendienteCents` from `src/lib/debt-view.ts` (`aggregateDebtByMember`), rendered by the UI alongside the breakdown. It is contextual and MUST NOT be added into `cajaCents`.

```ts
// src/lib/types.ts additions
export interface RegistroEgreso {
  id: string; monto: number; fecha: string; motivo: string;
  capturado_por: string | null; nombre_capturador: string; created_at: string;
  beneficiario_id: string | null; nombre_beneficiario: string | null;
}
export interface ConfiguracionCaja {
  id: number; monto_apertura: number; updated_by: string | null; updated_at: string;
}
// DebtViewResponse gains: cajaCents: number;  (aggregate only — no breakdown)
```

**`nombre_capturador` nullability (C2).** `nombre_capturador` is **non-null** in BOTH the SQL DDL (`text not null`) and the TS type (`string`). Rationale: `capturado_por` is `references auth.users(id) on delete set null`, so when the capturing user's account is deleted the UUID becomes NULL and `nombre_capturador` is the **only surviving attribution** of who recorded the egreso — it must therefore never be NULL. This matches the sibling `RegistroApoyo.nombre_capturador: string`, while `capturado_por` is correctly `string | null`.

**Opening-amount write path (C3).** The opening amount is a stored config value with a full admin write path, not a read-only seed:

```ts
// src/features/caja/repo.ts — admin-only via RLS is_admin()
export interface AperturaInput {
  montoAperturaPesos: number; // decimal MXN pesos; toCents() at read boundary
  updatedBy: string;          // auth.users.id of the editing admin
}
/** UPSERT the configuracion_caja singleton (id=1). Mirrors features/admin/repo.ts updateBankConfig (:73-83). */
export async function saveApertura(input: AperturaInput): Promise<void> { /* upsert id=1 */ }
export async function fetchApertura(): Promise<ConfiguracionCaja | null> { /* select ... eq('id', 1).maybeSingle() */ }
export async function fetchCaja(): Promise<CajaBreakdown> {
  // Promise.all: configuracion_caja.monto_apertura, registro_pagos.monto_pagado,
  // registro_apoyos.monto_total, registro_egresos.monto → toCents → computeCaja
}
export async function fetchPorCobrar(): Promise<number> {
  // cargos.monto_pendiente over estado='pendiente' → aggregateDebtByMember().totalPendienteCents
}
```

`features/caja/index.ts` exposes an admin field (decimal pesos) + "guardar apertura" submit, mirroring `features/admin/bank-config.ts` (`getCurrentUser`, `showError`/`showSuccess`, submit handler calling `saveApertura`). Admin-only is enforced at the DB by the `is_admin()` RLS policy — the same gate as `configuracion_bancaria` writes.

**Opening correction semantics.** `monto_apertura` is a **re-settable admin correction**, not an initial-only set: `cajaCents` is recomputed on every read, so changing `monto_apertura` by Δ shifts `cajaCents` by exactly Δ and leaves every existing egreso/pago/apoyo row untouched. **Effect on already-recorded egresos/apoyos: none** — their terms are unchanged. **Audit implication:** because `configuracion_caja` is an in-place UPSERT (no append-only history), a corrected opening amount overwrites the prior value and only `updated_by`/`updated_at` record the last edit — there is no journal of opening-amount changes. This is the same tradeoff as `configuracion_bancaria` edits and is accepted; an auditable append-only opening ledger is explicitly out of scope.

**Schema contract** (`phase5_egresos.sql`) — mirrors the live `registro_pagos`/`registro_apoyos` column types read from `information_schema` before writing:

```sql
create table public.registro_egresos (
  id uuid primary key default gen_random_uuid(),
  monto numeric not null,
  fecha date not null,
  motivo text not null,
  capturado_por uuid references auth.users(id) on delete set null,
  nombre_capturador text not null,
  created_at timestamptz not null default now()
);
create table public.configuracion_caja (
  id smallint primary key default 1 check (id = 1),
  monto_apertura numeric not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
-- both: enable row level security; revoke all ... from anon;
-- policy "admins_all_*" as permissive for all to authenticated
--   using (public.is_admin()) with check (public.is_admin());
insert into public.configuracion_caja (id, monto_apertura, updated_by)
values (1, 0, null) on conflict (id) do nothing;
```

`_down.sql` drops only the two new tables and touches NO existing table. `is_admin()` exists at `phase2_roles.sql:33`. The singleton guard + RLS pattern mirrors `phase3_bank_config.sql`.

## Testing Strategy

`openspec/config.yaml` has `strict_tdd: true`; runner `vitest run`; tests beside sources (follow `debt-view.test.ts`, `money.test.ts`).

| Layer | What to test | Approach |
|-------|-------------|----------|
| Unit `caja.test.ts` | array-sum semantics; apoyo subtraction; negative balance; no-double-sum | `computeCaja` over fixture arrays |
| Boundary | `aplicarPago` full-`monto_pagado` invariant; repo conversion | verify-phase/manual (no `features/pagos/repo.ts` test file exists) |

Cases: (1) **array-sum semantics** — a single-element `pagosCents` array yields `pagosTotalCents` equal to that element and `cajaCents === opening + that element − Σapoyos − Σegresos`. This proves each `pagosCents` element is summed once; it does NOT and cannot prove the caller passed the FULL `monto_pagado`, because `CajaInput` carries only `pagosCents[]` (no debt or `unappliedCents` notion). That invariant lives in the CALLER `aplicarPago` (`features/pagos/repo.ts:59-65`), which inserts `monto_pagado: input.montoPagadoPesos` (the full amount, never the FIFO-decremented remainder) and returns `unappliedCents` separately. **There is currently no test file for `features/pagos/repo.ts`** (it depends on the live `dbClient`), and mocking it requires a DI seam not present today. The full-monto invariant is therefore a **verify-phase check**; (2) **apoyo subtraction** — a single-element `apoyosCents` array yields `apoyosTotalCents` equal to that element, a fully-repaid apoyo (repayment equal to its `monto_total`) nets to zero, and an unrepaid apoyo leaves `cajaCents` negative by its `monto_total`. This proves the apoyo term SUBTRACTS; (3) **negative balance** — when `egresos + apoyos` exceeds `opening + pagos`, `cajaCents` is negative and returned unclamped; (4) **no-double-sum** — two identical pago/apoyo/egreso rows each counted once (no dedup), and each input array element counted exactly once.

RED-GREEN-REFACTOR order: write failing test → minimal `computeCaja` → refactor naming/shape. `lib/caja.ts` lands with its tests before any consumer, so the pure core is independently provable.

## Debt Consistency (one aggregation)

The receivable figure MUST be identical for the same member everywhere: the admin "Ranking de Deudores", the public ranking, and "Por cobrar". All three derive from the SAME pure aggregator, `aggregateDebtByMember` (`src/lib/debt-view.ts`), over `estado='pendiente'` rows in integer cents; `renderDeudoresTable` renders the aggregator's output directly. No consumer re-filters, and no surface performs its own debt reduce. The acceptance criterion is exact numeric equality; two screens showing two numbers for the same debt is unacceptable for an auditable ledger.

## Negative-caja rendering requirement

`computeCaja` returns `cajaCents` unclamped (negative allowed); rendering is the UI's contract. **Admin UI** (`features/caja/index.ts` display + `features/dashboard/index.ts` "Arca (disponible)" KPI card): when `cajaCents < 0`, render the value in red (`text-red-600`), never hide it, never clamp to zero, never block on a "balance insufficient" guard. **Public view** (`public-view.ts` + `vista/index.html` Arca card): same rule — a negative `cajaCents` renders as a red figure, unblocked. (The UI label reads "Arca"; the code identifier is `cajaCents`.)

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

**Four migrations, all applied and verified live**: `phase5_egresos`, `phase6_miembros_status_interno`, `phase7_egresos_beneficiario`, `phase8_reclasificar_gasto_sin_cargar`, each with its `_down`. Phases 5–7 are additive schema changes (new tables, a widened CHECK constraint, two new columns). **Phase 8 is the only data migration**: it moves ONE misrecorded disbursement from `registro_apoyos` to `registro_egresos`, deletes its apoyo and phantom cargo, and is guarded, atomic (`begin;…commit;`) and reversible. The Arca balance is unchanged by phase 8 because both ledgers are deductions — only the classification moved and a phantom debt disappeared.

Rollback: run each `_down.sql` in reverse order (phase 8 first). Code rollback = revert commits (new modules are additive); removing the duplicate capture form is the one subtractive UI change.

**Migration safety (mandatory):** read live `information_schema.columns` (`data_type`, `numeric_precision`, `numeric_scale`) for the sibling tables before writing DDL, so `monto`/`fecha`/`id`/`nombre_capturador` types match. Each migration runs its compatibility guard BEFORE any DDL (mirroring `phase4_fk_restrict.sql`'s pre-DDL read) so a drifted schema aborts cleanly rather than failing after a partial apply. Shared project "arca" — strictly additive, app-owned tables; never touch `arca_*`, `n8n_chat_histories`, `telegram_whitelist`, `auth.users`.

**Staleness analysis (public Arca):** `api/debt-view.ts` retains `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300`. A newly captured egreso, apoyo, or pago will NOT reflect in the public `cajaCents` for up to 60s at the edge, and a cached response may be served stale for up to 300s during revalidation. This is a stated correctness concern for a fast-moving liquidity figure — acceptable for an informational aggregate, documented, and not tightened in this change.

## Slicing (review boundaries)

The change was sliced into eight review units (PR 1 … PR 8, stacked to `main`; see `tasks.md`). Slices 1–5 are the original module boundaries, each import-isolated (lib → no feature/supabase imports; public-view → lib only): (1) `lib/caja.ts` + tests + types; (2) `lib/clipboard.ts` extraction + public CLABE button; (3) schema migration + `caja/repo.ts` + `caja/index.ts`; (4) dashboard KPI + public `cajaCents` + `api/debt-view.ts`; (5) apoyos term + "Por cobrar" + the "Arca" labels. Slices 6–8 are the post-implementation amendments: (6) the internal-member exclusion + phase 6; (7) egreso beneficiary + loan-vs-expense outflow labels + phase 7; (8) the single capture flow with three modalities, the unified debt aggregation, the phase 8 data-classification fix, and the removal of the duplicate "Registrar Egreso" form.

## Por Cobrar (amendment)

The outstanding receivable "Por cobrar" is `totalPendienteCents`, computed by `src/lib/debt-view.ts` (`aggregateDebtByMember`) — the sum of pending cargos, excluding retired and internal members. It is displayed alongside "Arca (disponible)" so the operator sees both the liquid position and what is owed. It is **contextual, not additive**: it MUST NOT be added into the `cajaCents` formula. The public Arca payload exposes no breakdown; the pre-existing `totalPendienteCents` field of the debt view is the debt-view's own primary metric and is not an Arca term. Because a "Sin cargos" disbursement creates no cargos, "Por cobrar" is correctly unaffected by it (never a phantom debt).

## Loan vs Expense and Egreso Beneficiary (amendment)

**The domain rule — loans and expenses must not merge.** `registro_apoyos` and `registro_egresos` are NOT interchangeable ledger terms; they are distinguished by one decisive test: **does the money come back?**

- **An `apoyo entregado` is a LOAN.** Cash leaves, a receivable is created (`cargos`), and members repay through `registro_pagos` — an inflow term. A fully repaid apoyo nets to zero: the club's position is preserved because cash became a claim. Hence the card reads "Apoyos entregados (recuperables)".
- **An `egreso` is an EXPENSE.** Cash leaves and never returns; the position genuinely shrinks. Hence the card reads "Egresos (no recuperables)".

This is why the two breakdown cards exist and **must never be merged**: merging them would hide the difference between money lent and money spent — the breakdown cards would stop summing to the Arca balance, and the ledger would label an expense as a loan. The same rule explains why a non-recoverable disbursement MUST be an egreso and never an apoyo against an internal member: recorded as an apoyo, the same money would count once as an outgoing loan and once as an expense.

**Beneficiary schema addition.** `registro_egresos` carries `beneficiario_id` (`uuid references miembros(id) on delete set null`) and `nombre_beneficiario` (`text null`). Unlike `nombre_capturador` (C2, non-null), `nombre_beneficiario` is NULLABLE because the beneficiary itself is optional — the selector defaults to none, and a general expense has no counterpart. The FK/denormalized-name split serves traceability: when the member row is deleted, `beneficiario_id` becomes NULL and the copied `nombre_beneficiario` is the only surviving attribution of who received the disbursement.

**Where the selector lives.** The beneficiary selector belongs to the capture flow: it appears with the "Sin cargos" modality in "Solicitud de Apoyos", INCLUDES internal members (deliberately), and defaults to none. `saveEgreso` persists both fields. It does NOT live on the Arca page — that page has no capture form.

**Phase 7 migration.** `phase7_egresos_beneficiario.sql` (+ `_down.sql`) adds the two columns with a pre-DDL compatibility guard, STRICTLY scoped to `public.registro_egresos` — an additive `ALTER TABLE … ADD COLUMN` touching no other table and no existing rows.

**Card labelling and grouping.** The two outflow cards state their nature and are grouped under a new heading: `Apoyos Entregados` → **"Apoyos entregados (recuperables)"**, `Egresos` → **"Egresos (no recuperables)"**, both under **"Salidas del arca"**. Labels only — no identifier or DOM id changes, consistent with the Naming Decision.

## Internal Member Exclusion (amendment)

The operator books arca disbursements against a pseudo-member (for example `Gastos_sin_cargar`). That member was counting as debt (wrong) and, being `status='fullparch'`, was also eligible to receive group-division cargos. The fix is a third `miembros.status` value, `'interno'`.

**Decision — a third `status` value, not a new column.** `Miembro.status` is now `'fullparch' | 'prospecto' | 'interno'` (`src/lib/types.ts:4`). A third enum value is chosen over a boolean/flag column because the pre-existing `FULLPARCH` group-division filter (`status === 'fullparch'` in `src/features/apoyos/index.ts`) supplies group-division exclusion for free: an `'interno'` member is neither `fullparch` nor `prospecto`, so it falls outside `FULLPARCH` automatically and outside `TODOS` via the explicit `status !== 'interno'` filter. A dedicated column would have added a second source of truth for "is this a real member" and forced every query to change.

**The rule.** An internal member is excluded from EVERY debtor surface — the admin ranking, the "Miembros con Deuda" KPI count and its percentage denominator, the public ranking, and "Por cobrar" — and from group divisions. It remains selectable for individual (`INDIVIDUAL`) disbursements, and it is the usual beneficiary of a non-recoverable expense. Its pending cargos never count as debt.

**One pure, tested rule for the shared path.** `aggregateDebtByMember` (`src/lib/debt-view.ts`) is the single shared aggregator for the receivable total and debtor list; the `'interno'` exclusion there covers BOTH the public debt view (`api/debt-view.ts`) and the caja "Por cobrar" figure (`src/features/caja/repo.ts`), and the dashboard's ranking (see Debt Consistency). The member remains selectable for INDIVIDUAL disbursements — deliberately the operator's bookkeeping path — and any cargo it creates is exactly what the exclusion hides from every debtor surface.

**Status stays off the public payloads.** `status` remains deliberately excluded from `DebtViewResponse` / `MemberViewResponse`; the new `'interno'` value MUST NOT leak publicly. The exclusion operates inside the aggregation, not by exposing a new field.

**Migration — `phase6_miembros_status_interno.sql` (+ `_down.sql`).** The TypeScript union mirrored a LIVE DB CHECK constraint, so widening the type alone left the feature inert: writes with `status='interno'` failed with `23514` (`miembros_status_check`). Phase 6 widens `miembros_status_check` to admit `'interno'` in a single atomic `ALTER TABLE` (drop + add), preceded by a compatibility guard that runs BEFORE any DDL and aborts cleanly on drift. The `_down.sql` fails safe: it asserts no row uses `'interno'` BEFORE narrowing, raising a clear message telling the operator to reassign those rows first. The migration is STRICTLY scoped to this app's own `public.miembros` and changes no data.

**Applied and verified in production.** The constraint now admits `'interno'`; the pseudo-member carries that status; and the receivable total drops by exactly that member's single phantom cargo once the exclusion applies. No row was deleted.

## Capture Flow and Data Classification (post-implementation amendments)

### Decision 1 — One capture flow, three modalities

The operator's capture act is ONE act with THREE modalities — group, individual, and charged directly to the Arca without splitting or recovering. The Apoyos flow gains a third selector option, "Sin cargos — absorbido por el Arca (no recuperable)", which creates no `registro_apoyos` row and no `cargos`, and instead writes exactly ONE `registro_egresos` row, with an OPTIONAL beneficiary. Nothing becomes debt, so nothing can double-count, and the operator never has to choose the right screen.

The standalone "Registrar Egreso" form on the Arca page is **removed** (commit `f94757a`). The Arca page is a query/config surface only.

### Decision 2 — One aggregation for debt

The admin "Ranking de Deudores", the public ranking, and "Por cobrar" derive per-member debt from the SAME pure `aggregateDebtByMember` over integer cents from `estado='pendiente'` rows. The acceptance criterion is exact numeric equality across all three; two screens showing two numbers for the same debt is unacceptable for an auditable ledger. See "Debt Consistency".

### Decision 3 — A data-classification correction

One INDIVIDUAL disbursement was recorded through the apoyos flow by mistake, leaving a phantom cargo on the internal member. `phase8_reclasificar_gasto_sin_cargar.sql` moves it to `registro_egresos` (carrying its beneficiary) and deletes the apoyo and its phantom cargo, atomically, guarded, with a reverse script. **The Arca is unchanged** — both an apoyo and an egreso are deductions; only the classification changes and the phantom debt disappears.

### Placeholder finding (a data finding, now ended)

Several apoyos carried sub-peso placeholder amounts split across all members in cents. Those are NOT real disbursements: they are placeholder records the operator created solely to preserve a description, because the app previously offered no other way to log an event — the same practice behind the legacy sub-cent `cargos` recorded as an outstanding defect. The operator has stopped the practice.

Consequence recorded honestly: those placeholders create cents-level phantom debt on real members (they are what makes a member show a few cents owed). The investigation ALSO confirmed there is NO double-counting of the real amounts: the consolidated real record is the correct one, and the placeholder records are placeholders, not real disbursements. Cleanup is recommended and NOT performed here.

## Data-Integrity Notes (verification findings)

Known data findings; not code defects:

- **One apoyo does not reconcile.** Exactly ONE apoyo has cargos whose sum exceeds its `monto_total`; every other apoyo reconciles to the cent. This single row shifts the reconciling aperture by that excess. It is a data-integrity note for the operator, not an open implementation task.
- **The pago-vs-cargo gap is NOT corruption.** The difference between the sum of cargo reductions and the sum of `registro_pagos` is the deliberate overpayment semantics of `aplicarPago`, which records the FULL `monto_pagado` even when FIFO leaves `unappliedCents`. Do not treat this as a reconciliation error.

## Outstanding (NOT done)

1. **Legacy sub-cent `cargos`.** The operator's discontinued "cents placeholder" practice left 65 of 318 cargos with sub-cent `monto_pendiente` values, creating cents-level phantom debt on real members. Cleanup is RECOMMENDED and NOT performed.
2. **Year filter — deferred, not implemented.** This is a reporting model rather than a filter, and it is blocked on three decisions: (i) flows vs balance — the Arca is cumulative, so a period figure means "at year-end"; (ii) the aperture has no effective date — it must be defined as "balance before the first recorded movement"; (iii) "Por cobrar" is NOT historically reconstructible because payments are recorded per MEMBER, not per CARGO, so the FIFO allocation is never persisted.

## Open Questions

None — every product decision is closed and settled above: the derived balance, the single capture flow with three modalities, the loan-vs-expense rule, the internal-member exclusion, the one debt aggregation, the removal of the duplicate capture form, the "Arca" UI labels, and the contextual "Por cobrar" figure. The only open items are the two recorded under **Outstanding (NOT done)**.
