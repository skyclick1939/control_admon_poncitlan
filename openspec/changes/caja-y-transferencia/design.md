# Design: caja-y-transferencia

## Technical Approach

Derived liquid-position ledger with a stored opening amount (proposal Approach 1, amended). A single pure function `computeCaja` in `src/lib/caja.ts` computes `cajaCents = openingCents + Σ(registro_pagos.monto_pagado) − Σ(registro_apoyos.monto_total) − Σ(registro_egresos.monto)` over already-fetched rows, in integer cents only. No stored mutable balance. The opening amount is the one non-derivable piece and lives in a `configuracion_caja` singleton (id=1), mirroring `configuracion_bancaria`. Read-time aggregation matches the codebase's existing derive-don't-store pattern (`debt-view.ts`, `member-view.ts`, dashboard reduce). The derived balance is exposed as the aggregate `cajaCents` on the public contract (see the Naming decision) and is displayed as "**Arca (disponible)**".

**Field naming (supersedes proposal wording).** The public field is `cajaCents`, not `caja`. The repository convention is that every money value crossing a contract boundary is named `*Cents` — verified at `src/lib/types.ts:109-112` (`DebtViewResponse.totalPendienteCents`, `deudores[].pendienteCents`) and `:126-137` (`MemberViewResponse.totalPendienteCents`, `totalPagadoCents`, `pagos[].montoCents`). This deliberately supersedes the proposal/exploration wording "`caja` field on `DebtViewResponse`": the unit is integer cents (never fractional pesos), and for a money API the `*Cents` suffix makes the unit part of the name so a consumer cannot silently mix pesos and cents. Every occurrence below uses `cajaCents`.

## Architecture Decisions

| Decision | Choice | Tradeoff | Verdict |
|---|---|---|---|
| Balance model | Derived on read (pure `computeCaja`) | O(ledger) read cost, trivial at club scale; vs stored balance → third write in `aplicarPago`'s non-transactional sequence | Derived |
| Opening amount storage | Stored singleton row (`configuracion_caja`, id=1) | Not derivable from any ledger row; fits `configuracion_bancaria` pattern | Stored config |
| Opening amount write | `saveApertura` UPSERT on `configuracion_caja` id=1, **re-settable admin correction** | vs "initial-only set" (deny UPDATE after first write) → extra guard absent from the bank-config precedent and a mistaken value becomes uncorrectable | Re-settable UPSERT |
| CLABE copy reuse | Extract `copyToClipboard` → `src/lib/clipboard.ts` | Amends `public-view.ts` "escape/types only" restriction; must stay import-free to preserve tree-shaking | Extract to `lib/` |
| Public Arca exposure | Aggregate `cajaCents` only, never movements/operator identity | Accepted liquidity-visibility risk; mitigated by explicit columns + aggregate-only | Expose aggregate |
| Egreso capture | New `registro_egresos` ledger row per disbursement | Mirrors `registro_apoyos` column style; no balance mutation | Ledger insert |
| Support (apoyo) disbursement | Subtract `Σ(registro_apoyos.monto_total)` from `cajaCents` | Handing out a support is cash leaving the club; repayments return via `registro_pagos` (already adds). Net zero over a fully repaid apoyo, negative while unrepaid | Subtract apoyos term |
| Outstanding receivable ("Por cobrar") | Display `Σ(cargos.monto_pendiente)` (the existing `totalPendienteCents`) alongside "Arca (disponible)" | Contextual only; MUST NOT feed `cajaCents` | Separate figure |
| Balance naming | "Arca" (label "Arca (disponible)") | Operator unifies physical cash + bank transfers in one pot; "Caja" means physical cash only and is technically wrong; "Arca" is the operator's own term | Label: Arca (UI only) |
| `Pago_sin_cargo` disbursement | Record as `registro_egresos` with `motivo = "Apoyo sin cargo"` | Money leaves and does not return; MUST NOT be a `registro_pagos` row (inflow sign inversion) | Egreso, not pago |

**D1 amendment (clipboard tree-shaking).** `src/lib/clipboard.ts` MUST import nothing (uses only `navigator`/`document` browser globals). `src/public-view.ts` currently imports only `./lib/escape` + `./lib/types` (verified lines 17–18); adding `./lib/clipboard` stays within `lib/*` and, because `clipboard.ts` has zero imports, cannot pull supabase-js or the anon key into the public bundle. `renderBanco` is at lines 37–47.

**Money discipline (D6), narrowed.** Peso↔cent conversion stays at the repository boundary — `features/caja/repo.ts` (both the aggregate read and `saveEgreso`) and `api/debt-view.ts`. `lib/caja.ts` accepts/returns cents only, never touches the DB, and never calls `toCents`; the repo converts before calling it. **Scope correction:** `features/dashboard/index.ts` is NOT a cents-conversion boundary today — its three existing KPI cards sum raw floats (`:42-44`) and call `toFixed(2)` (`:57-60`). Those three are unchanged and out of scope. The NEW "Arca (disponible)" card must NOT do raw arithmetic: it calls `features/caja/repo.ts`'s `fetchCaja()` (returns a `CajaBreakdown` already in cents) and formats via `money.formatMXN`. The "Por cobrar" figure is read from the existing debt-view aggregate (`totalPendienteCents`), not recomputed. The design asserts no cents guarantee over the pre-existing sums.

## Naming Decision

The rename is **presentational only**. What the operator sees is "Arca"; what the code is named does not change.

**Renamed (user-facing labels only):**
- Module / navigation label → "Arca"
- Balance card → "Arca (disponible)"
- Dashboard KPI label → "Arca (disponible)"
- Public caja card label → "Arca (disponible)"

**NOT renamed (identifiers stay exactly as they are in the code today):**
- `computeCaja`, `CajaInput`, `CajaBreakdown` — including `CajaBreakdown.openingCents` / `pagosTotalCents` / `apoyosTotalCents` / `egresosTotalCents` / `cajaCents`
- `src/lib/caja.ts`, `src/lib/caja.test.ts`
- `src/features/caja/repo.ts`, `src/features/caja/index.ts` — including `fetchCaja`, `saveEgreso`, `saveApertura`, `fetchApertura`
- `cajaCents` on `DebtViewResponse`
- `initCaja` and the DOM ids `#caja-content` / `data-view="caja-content"`
- The table `configuracion_caja` and the type `ConfiguracionCaja`

**Why.** The module is already implemented and verified in the open PR. Renaming identifiers is pure churn on verified code, adds regression risk (imports, DOM ids referenced by `index.html` and `src/main.ts`), and delivers nothing the operator asked for. It would also collide confusingly with the SHARED Supabase project whose name is already "arca".

**Deliberate consequence.** The UI says "Arca" while the code says `caja` / `Caja`. This asymmetry is **accepted and intentional**: the diff stays reviewable and the already-verified module is not churned.

## Data Flow

```
admin browser                                    public browser
   │                                                  │  fetch /api/debt-view
   ├─ egreso form ──► saveEgreso ──► registro_egresos  │
   ├─ apertura form ► saveApertura ► configuracion_caja(id=1) UPSERT
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
| `src/features/miembros/token.ts` | Modify | Import `copyToClipboard` from `../../lib/clipboard` (was lines 20–27) |
| `src/public-view.ts` | Modify | CLABE copy button in `renderBanco`; render `cajaCents` (negative → red, unblocked) |
| `vista/index.html` | Modify | CLABE button slot + Arca (disponible) card |
| `api/debt-view.ts` | Modify | Fetch opening+pagos+apoyos+egresos, return aggregate `cajaCents` (apoyos SUBTRACT, never exposed individually) |
| `src/lib/types.ts` | Modify | `RegistroEgreso`, `ConfiguracionCaja`, `cajaCents` on `DebtViewResponse` |
| `src/features/caja/repo.ts` | Create | `fetchCaja` (fetch rows → cents → `computeCaja`); `saveEgreso` insert; `fetchApertura`/`saveApertura` singleton UPSERT |
| `src/features/caja/index.ts` | Create | Egreso form + opening-amount control + "Arca (disponible)" balance card + movement breakdown ("Pagos recibidos" / "Apoyos entregados" / "Egresos" cards) + "Por cobrar" card |
| `src/features/dashboard/index.ts` | Modify | 5th "Arca (disponible)" KPI card via `fetchCaja()` → `formatMXN` (no raw caja arithmetic) |
| `index.html` | Modify | KPI grid card, sidebar nav link, `#caja-content` page |
| `src/main.ts` | Modify | Wire `initCaja` + navigation refresh |
| `supabase/sql/phaseN_egresos.sql` | Create | `registro_egresos` + `configuracion_caja` + RLS + seed |
| `supabase/sql/phaseN_egresos_down.sql` | Create | Drop both tables only |

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
  apoyosTotalCents: number;  // Σ apoyosCents ("Apoyos entregados" — SUBTRACTS)
  egresosTotalCents: number; // Σ egresosCents ("Egresos")
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
}
export interface ConfiguracionCaja {
  id: number; monto_apertura: number; updated_by: string | null; updated_at: string;
}
// DebtViewResponse gains: cajaCents: number;  (aggregate only — no breakdown, no por cobrar)
```

**`nombre_capturador` nullability (C2).** `nombre_capturador` is **non-null** in BOTH the SQL DDL (`text not null`) and the TS type (`string`). Rationale: `capturado_por` is `references auth.users(id) on delete set null`, so when the capturing user's account is deleted the UUID becomes NULL and `nombre_capturador` is the **only surviving attribution** of who recorded the egreso — it must therefore never be NULL. This matches the sibling `RegistroApoyo.nombre_capturador: string` (`types.ts:30`), while `capturado_por` is correctly `string | null` to reflect the `set null` FK (a deliberate tightening over the sibling's non-null `capturado_por`, which predates that FK's set-null behavior). `_down.sql` drops the table wholesale, so there is no column-level nullability to reconcile there — the non-null choice is recorded in the up-migration DDL and the TS type only.

**Opening-amount write path (C3).** The opening amount is a stored config value with a full admin write path, not a read-only seed:

```ts
// src/features/caja/repo.ts — admin-only via RLS is_admin()
export interface AperturaInput {
  montoAperturaPesos: number; // decimal MXN pesos; toCents() at read boundary
  updatedBy: string;          // auth.users.id of the editing admin
}
/** UPSERT the configuracion_caja singleton (id=1). Mirrors features/admin/repo.ts updateBankConfig (:73-83). */
export async function saveApertura(input: AperturaInput): Promise<void> {
  const { error } = await dbClient.from('configuracion_caja').upsert({
    id: 1,
    monto_apertura: input.montoAperturaPesos,
    updated_by: input.updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
export async function fetchApertura(): Promise<ConfiguracionCaja | null> {
  const { data, error } = await dbClient.from('configuracion_caja')
    .select('id, monto_apertura, updated_by, updated_at').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as ConfiguracionCaja | null;
}
export async function fetchCaja(): Promise<CajaBreakdown> {
  const [aperturaRes, pagosRes, apoyosRes, egresosRes] = await Promise.all([
    dbClient.from('configuracion_caja').select('monto_apertura').eq('id', 1).maybeSingle(),
    dbClient.from('registro_pagos').select('monto_pagado'),
    dbClient.from('registro_apoyos').select('monto_total'),
    dbClient.from('registro_egresos').select('monto'),
  ]);
  const err = aperturaRes.error ?? pagosRes.error ?? apoyosRes.error ?? egresosRes.error;
  if (err) throw err;
  return computeCaja({
    openingCents: toCents(aperturaRes.data?.monto_apertura ?? 0),
    pagosCents: (pagosRes.data ?? []).map(r => toCents(r.monto_pagado)),
    apoyosCents: (apoyosRes.data ?? []).map(r => toCents(r.monto_total)),
    egresosCents: (egresosRes.data ?? []).map(r => toCents(r.monto)),
  });
}
```

`features/caja/index.ts` exposes an admin form field (decimal pesos) + "guardar apertura" submit, mirroring `features/admin/bank-config.ts` (`getCurrentUser`, `showError`/`showSuccess`, submit handler calling `saveApertura`). Admin-only is enforced at the DB by the `is_admin()` RLS policy — the same gate as `configuracion_bancaria` writes.

**Opening correction semantics.** `monto_apertura` is a **re-settable admin correction**, not an initial-only set: `cajaCents = apertura + Σpagos − Σapoyos − Σegresos` is recomputed on every read, so changing `monto_apertura` by Δ shifts `cajaCents` by exactly Δ and leaves every existing egreso/pago/apoyo row untouched. **Effect on already-recorded egresos/apoyos: none** — their `monto`/`monto_total` terms are unchanged. **Audit implication:** because `configuracion_caja` is an in-place UPSERT (no append-only history), a corrected opening amount overwrites the prior value and only `updated_by`/`updated_at` record the last edit — there is no journal of opening-amount changes. This is the same tradeoff as `configuracion_bancaria` edits and is accepted; an auditable `registro_aperturas` append-only ledger is explicitly out of scope.

**Schema contract** (`phaseN_egresos.sql`) — MUST mirror the live `registro_pagos`/`registro_apoyos` column types read from `information_schema` before writing, especially `monto` (`numeric` precision/scale from `registro_pagos.monto_pagado`), `id` default (`gen_random_uuid()`), and `fecha`/`motivo`/`capturado_por`/`nombre_capturador` (from `registro_apoyos`):

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
alter table public.registro_egresos enable row level security;
revoke all on public.registro_egresos from anon;
create policy "admins_all_registro_egresos" on public.registro_egresos
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- identical enable/revoke + "admins_all_configuracion_caja" policy for configuracion_caja
insert into public.configuracion_caja (id, monto_apertura, updated_by)
values (1, 0, null) on conflict (id) do nothing;
```

`_down.sql`: `drop table public.registro_egresos;` and `drop table public.configuracion_caja;` — touches NO existing table. `is_admin()` exists at `phase2_roles.sql:33`. The singleton guard + RLS pattern mirrors `phase3_bank_config.sql` table DDL `:26-33` (`check (id = 1)`), RLS enable/revoke/policy `:48-53`, and the seed insert `:61-63` — transcribed, not improvised.

## Testing Strategy

`openspec/config.yaml` has `strict_tdd: true`; runner `vitest run`; tests beside sources (follow `debt-view.test.ts`, `money.test.ts`).

| Layer | What to test | Approach |
|-------|-------------|----------|
| Unit `caja.test.ts` | array-sum semantics; apoyo subtraction; negative balance; no-double-sum | `computeCaja` over fixture arrays |
| Boundary | `aplicarPago` full-`monto_pagado` invariant; repo conversion | verify-phase/manual (no `features/pagos/repo.ts` test file exists) |

Cases: (1) **array-sum semantics** — `pagosCents: [10000]` yields `pagosTotalCents === 10000` and `cajaCents === opening + 10000 − Σapoyos − Σegresos`. This proves each `pagosCents` element is summed once; it does NOT and cannot prove the caller passed the FULL `monto_pagado`, because `CajaInput` carries only `pagosCents[]` (no debt or `unappliedCents` notion). That invariant lives in the CALLER `aplicarPago` (`features/pagos/repo.ts:59-65`), which inserts `monto_pagado: input.montoPagadoPesos` (the full amount, never the FIFO-decremented remainder) and returns `unappliedCents` separately. **There is currently no test file for `features/pagos/repo.ts`** (it depends on the live `dbClient`), and mocking it requires a DI seam not present today (out of the ~400-line budget). The full-monto invariant is therefore a **verify-phase check**: inspect `features/pagos/repo.ts:61` and confirm `monto_pagado === input.montoPagadoPesos` regardless of `unappliedCents`; (2) **apoyo subtraction** — `apoyosCents: [10000]` yields `apoyosTotalCents === 10000` and `cajaCents === opening + Σpagos − 10000 − Σegresos`; a fully-repaid apoyo (pago `monto_pagado === monto_total`) nets to zero, and an unrepaid apoyo leaves `cajaCents` negative by `monto_total`. This proves the apoyo term SUBTRACTS (the corrected contract — the old "saveApoyo neutrality" requirement is superseded); (3) **negative balance** — `egresos + apoyos > opening + pagos` yields negative `cajaCents`, returned unclamped; (4) **no-double-sum** — two identical pago/apoyo/egreso rows each counted once (no dedup), and each input array element counted exactly once.

RED-GREEN-REFACTOR order: write failing test → minimal `computeCaja` → refactor naming/shape. `lib/caja.ts` lands with its tests before any consumer, so the pure core is independently provable.

## Negative-caja rendering requirement

`computeCaja` returns `cajaCents` unclamped (negative allowed); rendering is the UI's contract. **Admin UI** (`features/caja/index.ts` display + `features/dashboard/index.ts` "Arca (disponible)" KPI card): when `cajaCents < 0`, render the value in red (`text-red-600`), never hide it, never clamp to zero, never block on a "balance insufficient" guard. **Public view** (`public-view.ts` + `vista/index.html` Arca card): same rule — a negative `cajaCents` renders as a red figure, unblocked, alongside the other public totals. Both surfaces satisfy the proposal's success criterion "Negative caja renders unblocked (red) on both surfaces" (the UI label reads "Arca"; the code identifier is `cajaCents`).

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No data migration (new tables only). Rollback = run `_down.sql` (drops both tables); code rollback = revert commits (all new modules additive). **Migration safety (mandatory):** read live `information_schema.columns` (`data_type`, `numeric_precision`, `numeric_scale`) for `registro_pagos.monto_pagado`/`id`/`fecha_pago` and `registro_apoyos.fecha`/`motivo`/`capturado_por`/`nombre_capturador` before writing `phaseN_egresos.sql`, so `monto`/`fecha`/`id`/`nombre_capturador` types match. Precedent for reading live schema before DDL: `phase4_fk_restrict.sql:17-24` (which queried `information_schema.referential_constraints` for FK delete rules) — the column-type read is the analogous `information_schema.columns` query, not that exact query. Shared project "arca" (`qjswicjxwsbwnxrrowsi`) — strictly additive, app-owned tables; never touch `arca_*`, `n8n_chat_histories`, `telegram_whitelist`, `auth.users`.

**Staleness analysis (public Arca):** `api/debt-view.ts` retains `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300` (line 88). A newly captured egreso, apoyo, or pago will NOT reflect in the public `cajaCents` for up to 60s at the edge, and a cached response may be served stale for up to 300s during revalidation. This is a stated correctness concern for a fast-moving liquidity figure — acceptable for an informational aggregate, but it MUST be documented and is not tightened in this change (keeping the existing caching contract intact).

## Slicing (review boundaries)

The design keeps five independently-buildable module boundaries so `sdd-tasks` can slice chained PRs under the ~400-line budget: (1) `lib/caja.ts` + tests + types — pure, no schema/UI dependency; (2) `lib/clipboard.ts` extraction + `token.ts` + public CLABE button — pure/UI only; (3) schema migration + `caja/repo.ts` (egreso + apertura write paths) + `caja/index.ts` — additive schema + thin UI; (4) dashboard KPI + public `cajaCents` + `api/debt-view.ts`; (5) apoyos term + "Por cobrar" + the "Arca" labels — a follow-up slice (PR 5) that adds the `registro_apoyos` subtraction, the "Por cobrar" figure, and applies the "Arca" user-facing labels (module/navigation, balance card, KPI, public card). Each boundary is import-isolated (lib → no feature/supabase imports; public-view → lib only).

## Por Cobrar (amendment)

The outstanding receivable "Por cobrar" is the sum `Σ(cargos.monto_pendiente)`, which already exists as `totalPendienteCents` computed by `src/lib/debt-view.ts` (`aggregateDebtByMember`). It is displayed alongside "Arca (disponible)" so the operator sees both the liquid position and what is owed to them. It is **contextual, not additive**: it MUST NOT be added into the `cajaCents` formula, and it is never exposed on the public surface. Because a `Pago_sin_cargo` disbursement creates no cargos, "Por cobrar" is correctly unaffected by it (never a phantom debt).

## Pago_sin_cargo Convention (amendment)

The operator sometimes disburses a support funded from the Arca balance WITHOUT creating cargos, because the Arca balance has enough funds and they do not want to accumulate debt. **Operational rule:** such a disbursement MUST be recorded as a `registro_egresos` row (money that leaves and does not return), with the reason naming the beneficiary (e.g. `motivo = "Apoyo sin cargo"`). **Trap (record prominently):** it MUST **NOT** be recorded as a `registro_pagos` row. `registro_pagos` is INFLOW and would ADD to `cajaCents` instead of subtracting — a sign inversion. The operator's natural vocabulary ("pago") collides with the app's column semantics here, so the trap is called out explicitly. Because no cargos are created, "Por cobrar" is correctly unaffected.

## Internal Member Exclusion (amendment)

The operator books arca disbursements that generate no cargos against a pseudo-member `Gastos_sin_cargar`. That member was counting as debt (wrong) and, being `status='fullparch'`, was also eligible to receive group-division cargos. The fix is a third `miembros.status` value, `'interno'`.

**Decision — a third `status` value, not a new column.** `Miembro.status` is now `'fullparch' | 'prospecto' | 'interno'` (`src/lib/types.ts:4`). A third enum value is chosen over a boolean/flag column because the pre-existing `FULLPARCH` group-division filter (`status === 'fullparch'` in `src/features/apoyos/index.ts`) supplies group-division exclusion for free: an `'interno'` member is neither `fullparch` nor `prospecto`, so it falls outside `FULLPARCH` automatically and outside `TODOS` via the new `status !== 'interno'` filter. A dedicated column would have added a second source of truth for "is this a real member" and forced every query to change; the enum value rides the existing filters.

**One pure, tested rule for the shared path.** `aggregateDebtByMember` (`src/lib/debt-view.ts`) is the single shared aggregator for the receivable total and debtor list; the `'interno'` exclusion there covers BOTH the public debt view (`api/debt-view.ts`) and the caja "Por cobrar" figure (`src/features/caja/repo.ts`). The member remains selectable for INDIVIDUAL disbursements — deliberately the operator's bookkeeping path — and the cargo it creates is exactly what the exclusion hides from every debtor surface.

**Justified dashboard deviation.** `src/features/dashboard/index.ts` filters `status !== 'interno'` separately and deliberately, rather than reusing `aggregateDebtByMember`: its reduce sums raw float pesos across all `estado` values and renders `toFixed(2)`, whereas the aggregator returns whole cents over `estado='pendiente'` rows only. The dashboard's own filter drives the "Miembros con Deuda" KPI count, its percentage denominator, and the debtors table. This deviation was a mistake, not a justified divergence: the cost only became visible once both screens were compared. See "Decision 2 — One aggregation for debt" below, which corrects it and makes the dashboard derive from the same aggregation as the public view and "Por cobrar".

**Status stays off the public payloads.** `status` remains deliberately excluded from `DebtViewResponse` / `MemberViewResponse` (`src/lib/types.ts:129,145`); the new `'interno'` value MUST NOT leak publicly. The exclusion operates inside the aggregation, not by exposing a new field.

**Migration — `supabase/sql/phase6_miembros_status_interno.sql` (+ `_down.sql`).** The TypeScript union mirrored a LIVE DB CHECK constraint, so widening the type alone left the feature inert: writes with `status='interno'` failed with `23514` (`miembros_status_check`). Phase 6 widens `miembros_status_check` to admit `'interno'` in a single atomic `ALTER TABLE` (drop + add) so there is no window where the column is unprotected, preceded by a compatibility guard that runs BEFORE any DDL (mirroring `phase5_egresos.sql`) and aborts cleanly on a drifted schema. The `_down.sql` fails safe: it asserts no row uses `'interno'` BEFORE narrowing, raising a clear message telling the operator to reassign those rows first — because dropping the constraint first and then failing would leave the table unprotected. The migration is STRICTLY scoped to this app's own `public.miembros` (the shared "arca" project); it changes no data.

**Applied and verified in production.** The constraint now reads `CHECK (status = ANY (ARRAY['fullparch','prospecto','interno']))`; `Gastos_sin_cargar` is `status='interno'`; and the receivable measures **11,674.47 unfiltered versus 10,674.47 filtered — a difference of exactly 1,000**, the pseudo-member's phantom cargo. No row was deleted.

## Loan vs Expense and Egreso Beneficiary (amendment)

**The domain rule — loans and expenses must not merge.** `registro_apoyos` and `registro_egresos` are NOT interchangeable ledger terms; they are distinguished by one decisive test: **does the money come back?**

- **An `apoyo entregado` is a LOAN.** Cash leaves, a receivable is created (`cargos`), and members repay through `registro_pagos` — an inflow term. A fully repaid apoyo nets to zero: the club's position is preserved because cash became a claim. Hence the card reads "Apoyos entregados (recuperables)".
- **An `egreso` is an EXPENSE.** Cash leaves and never returns; the position genuinely shrinks. Hence the card reads "Egresos (no recuperables)".

**Why a non-recoverable disbursement MUST be an egreso — never an apoyo through `Gastos_sin_cargar`.** If a non-recoverable disbursement were recorded as an APOYO against the internal member, the same money would appear in BOTH "Apoyos entregados" and "Egresos": it would count once as an outgoing apoyo and once as an expense, the breakdown cards would stop summing to the Arca balance, and the ledger would label an expense as a loan — the same semantic lie the hidden internal cargo represented (see Internal Member Exclusion). Recording it as an EGRESO keeps each card counting exactly one thing and keeps the reconciliation exact.

**Production evidence.** Of **66,579.46** disbursed as apoyos, **10,674.47** remains receivable — proof that apoyos return (as repayments) and egresos do not. This 10,674.47 is the same filtered "Por cobrar" figure recorded under Internal Member Exclusion.

**Beneficiary schema addition.** `registro_egresos` gains `beneficiario_id` (`uuid references miembros(id) on delete set null`) and `nombre_beneficiario` (`text null`). Unlike `nombre_capturador` (C2, non-null), `nombre_beneficiario` is NULLABLE because the beneficiary itself is optional — the selector defaults to none. The FK/denormalized-name split serves the same traceability purpose as `capturado_por`/`nombre_capturador`: when the member row is deleted, `beneficiario_id` becomes NULL and the copied `nombre_beneficiario` is the only surviving attribution of who received the disbursement. The egreso form gains a beneficiary selector that INCLUDES internal members (deliberately — see Internal Member Exclusion: internal members stay selectable for individual disbursements) and defaults to none; `saveEgreso` persists both fields.

**Phase 7 migration.** `supabase/sql/phase7_egresos_beneficiario.sql` (+ `_down.sql`) adds the two columns with a pre-DDL compatibility guard (the same pattern as `phase5_egresos.sql` and `phase6_miembros_status_interno.sql`), STRICTLY scoped to `public.registro_egresos` — an additive `ALTER TABLE … ADD COLUMN` touching no other table and no existing rows. The `_down.sql` drops only those two columns.

**Card labelling and grouping.** The two outflow cards now state their nature and are grouped under a new heading: `Apoyos Entregados` → **"Apoyos entregados (recuperables)"**, `Egresos` → **"Egresos (no recuperables)"**, both under **"Salidas del arca"**. Labels only — no identifier or DOM id changes, consistent with the Naming Decision.

## Data-Integrity Notes (verification findings)

Found during verification; may matter at archive time:

- **One apoyo does not reconcile.** Exactly ONE apoyo has `monto_total = 4,229.00` while its 6 cargos sum to `8,228.52` (a +3,999.52 excess over `monto_total`). Every other apoyo reconciles to the cent. This single row shifts the reconciling aperture by exactly 3,999.52; the operator will resolve it.
- **The 79.01 pago-vs-cargo gap is NOT corruption.** `Σ(monto_original) − Σ(monto_pendiente) = 58,904.51` versus `Σ(registro_pagos) = 58,983.52` — a 79.01 gap — is the deliberate overpayment semantics of `aplicarPago`, which records the FULL `monto_pagado` even when FIFO leaves `unappliedCents`. Do not treat this as a reconciliation error.
- **65 of 318 cargos carry sub-cent amounts.** Values like `monto_pendiente = 3154.491309523809485` violate the integer-cents discipline (money MUST NOT carry more than two decimals), so every displayed total carries hidden fractions. OUTSTANDING — needs its own investigation (likely in the peso/cents conversion path); not fixed here.

## Capture Flow, Debt Aggregation, and Data Classification (post-implementation amendments)

### Decision 1 — One capture flow, three modalities

The operator's capture act is ONE act with THREE modalities — group, individual, and charged directly to the Arca without splitting or recovering. The earlier design kept a separate "Registrar Egreso" form and reasoned that routing a non-recoverable disbursement through the Apoyos flow would double-count. That reasoning holds only while that flow CREATES cargos — which is precisely the defect being fixed, not an argument against the idea.

The resolved design: the Apoyos flow gains a third selector option, "Sin cargos — absorbido por el Arca (no recuperable)", which creates no `registro_apoyos` row and no `cargos`, and instead writes exactly ONE `registro_egresos` row, with an OPTIONAL beneficiary (a general expense has no member). Nothing becomes debt, so nothing can double-count, and the operator never has to choose the right screen.

The standalone "Registrar Egreso" form on the Arca page is now a candidate for removal — but only after the new mode is deployed and confirmed in use, so the operator is never left without a way to record an expense.

### Decision 2 — One aggregation for debt (a bug this exposed)

The admin "Ranking de Deudores" and the public ranking showed DIFFERENT per-member figures for the same members. Production evidence: Zuomi 3154.47 vs 3154.49; Pumba 2741.66 vs 2741.69; Mario 2275.71 vs 2275.73; Warrior 1000.00 vs 1000.02; Ivan 687.50 vs 687.52. Cause: the dashboard aggregated with its own float-peso reduce, while the public view and "Por cobrar" used the pure `aggregateDebtByMember` over integer cents from `estado='pendiente'` rows.

Two screens showing two numbers for the same debt is unacceptable for an auditable ledger. The dashboard now derives from the same aggregation/semantics, and the acceptance criterion is exact numeric equality.

**Correction of the earlier "justified deviation".** The "Justified dashboard deviation" recorded under Internal Member Exclusion was a mistake. It was justified on the grounds that the dashboard's float reduce and the aggregator were different-but-acceptable money computations; the deviation's cost only became visible once both screens were compared and produced different numbers for the same debt. The deviation is now removed: the dashboard uses the same aggregation as the public view and "Por cobrar".

### Decision 3 — A data-classification correction

One row was recorded through the apoyos flow by mistake: apoyo `91d07a16-…`, monto 1000, INDIVIDUAL, whose single cargo sat on the internal member. A phase 8 script moves it to `registro_egresos` (carrying the beneficiary) and deletes the apoyo and its phantom cargo, atomically, guarded, with a reverse script. **The Arca is unchanged** — both an apoyo and an egreso are deductions; only the classification changes and the phantom debt disappears.

### Placeholder finding (a valuable data finding, now ended)

Investigating the above revealed that several apoyos carry `monto_total = 0.10` split across all members in cents (0.01–0.02 each). Those are NOT real disbursements: they are placeholder records the operator created solely to preserve a description, because the app previously offered no other way to log an event — the same practice behind the 65 sub-cent `cargos` already recorded as an outstanding defect. The operator has stopped the practice.

Consequence recorded honestly: those placeholders create cents-level phantom debt on real members (they are what makes a member show a few cents owed). The investigation ALSO confirmed there is NO double-counting of the real amounts — the consolidated 1000 record is the real one, and the 0.10 records are placeholders, not 500s. A future cleanup is recommended; it is not performed here.

## Open Questions

None — every product decision is confirmed in the proposal (derived balance, public aggregate exposure accepted, CLABE extraction, additive shared-project schema, re-settable opening correction), as amended by this change (apoyos subtraction, "Arca" UI labels, "Por cobrar" figure, `Pago_sin_cargo` convention). The one outstanding item is operational, not a product decision: the operator resolving the single non-reconciling apoyo (see Data-Integrity Notes).
