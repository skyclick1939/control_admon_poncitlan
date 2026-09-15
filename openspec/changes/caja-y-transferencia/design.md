# Design: caja-y-transferencia

## Technical Approach

Derived cash-on-hand ledger with a stored opening amount (proposal Approach 1). A single pure function `computeCaja` in `src/lib/caja.ts` computes `cajaCents = openingCents + Σ(registro_pagos.monto_pagado) − Σ(registro_egresos.monto)` over already-fetched rows, in integer cents only. No stored mutable balance. The opening amount is the one non-derivable piece and lives in a `configuracion_caja` singleton (id=1), mirroring `configuracion_bancaria`. Read-time aggregation matches the codebase's existing derive-don't-store pattern (`debt-view.ts`, `member-view.ts`, dashboard reduce).

**Field naming (supersedes proposal wording).** The public field is `cajaCents`, not `caja`. The repository convention is that every money value crossing a contract boundary is named `*Cents` — verified at `src/lib/types.ts:109-112` (`DebtViewResponse.totalPendienteCents`, `deudores[].pendienteCents`) and `:126-137` (`MemberViewResponse.totalPendienteCents`, `totalPagadoCents`, `pagos[].montoCents`). This deliberately supersedes the proposal/exploration wording "`caja` field on `DebtViewResponse`": the unit is integer cents (never fractional pesos), and for a money API the `*Cents` suffix makes the unit part of the name so a consumer cannot silently mix pesos and cents. Every occurrence below uses `cajaCents`.

## Architecture Decisions

| Decision | Choice | Tradeoff | Verdict |
|---|---|---|---|
| Balance model | Derived on read (pure `computeCaja`) | O(ledger) read cost, trivial at club scale; vs stored balance → third write in `aplicarPago`'s non-transactional sequence | Derived |
| Opening amount storage | Stored singleton row (`configuracion_caja`, id=1) | Not derivable from any ledger row; fits `configuracion_bancaria` pattern | Stored config |
| Opening amount write | `saveApertura` UPSERT on `configuracion_caja` id=1, **re-settable admin correction** | vs "initial-only set" (deny UPDATE after first write) → extra guard absent from the bank-config precedent and a mistaken value becomes uncorrectable | Re-settable UPSERT |
| CLABE copy reuse | Extract `copyToClipboard` → `src/lib/clipboard.ts` | Amends `public-view.ts` "escape/types only" restriction; must stay import-free to preserve tree-shaking | Extract to `lib/` |
| Public caja exposure | Aggregate `cajaCents` only, never movements/operator identity | Accepted liquidity-visibility risk; mitigated by explicit columns + aggregate-only | Expose aggregate |
| Egreso capture | New `registro_egresos` ledger row per disbursement | Mirrors `registro_apoyos` column style; no balance mutation | Ledger insert |

**D1 amendment (clipboard tree-shaking).** `src/lib/clipboard.ts` MUST import nothing (uses only `navigator`/`document` browser globals). `src/public-view.ts` currently imports only `./lib/escape` + `./lib/types` (verified lines 17–18); adding `./lib/clipboard` stays within `lib/*` and, because `clipboard.ts` has zero imports, cannot pull supabase-js or the anon key into the public bundle. `renderBanco` is at lines 37–47.

**Money discipline (D6), narrowed.** Peso↔cent conversion stays at the repository boundary — `features/caja/repo.ts` (both the aggregate read and `saveEgreso`) and `api/debt-view.ts`. `lib/caja.ts` accepts/returns cents only, never touches the DB, and never calls `toCents`; the repo converts before calling it. **Scope correction:** `features/dashboard/index.ts` is NOT a cents-conversion boundary today — its three existing KPI cards sum raw floats (`:42-44`) and call `toFixed(2)` (`:57-60`). Those three are unchanged and out of scope. The NEW caja card must NOT do raw arithmetic: it calls `features/caja/repo.ts`'s `fetchCaja()` (returns a `CajaBreakdown` already in cents) and formats via `money.formatMXN`. The design asserts no cents guarantee over the pre-existing sums.

## Data Flow

```
admin browser                                    public browser
   │                                                  │  fetch /api/debt-view
   ├─ egreso form ──► saveEgreso ──► registro_egresos  │
   ├─ apertura form ► saveApertura ► configuracion_caja(id=1) UPSERT
   └─ fetchCaja (repo: toCents at boundary) ──► computeCaja (pure) ◄── api/debt-view.ts (service_role)
                                                    │
       Supabase: configuracion_caja(id=1) + registro_pagos.monto_pagado − registro_egresos.monto
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/caja.ts` | Create | Pure `computeCaja` + `CajaInput`/`CajaBreakdown` types |
| `src/lib/caja.test.ts` | Create | Vitest suite beside source (strict TDD) |
| `src/lib/clipboard.ts` | Create | Dependency-free `copyToClipboard(text): Promise<boolean>` with `execCommand` fallback |
| `src/features/miembros/token.ts` | Modify | Import `copyToClipboard` from `../../lib/clipboard` (was lines 20–27) |
| `src/public-view.ts` | Modify | CLABE copy button in `renderBanco`; render `cajaCents` (negative → red, unblocked) |
| `vista/index.html` | Modify | CLABE button slot + caja card |
| `api/debt-view.ts` | Modify | Fetch opening+pagos+egresos, return aggregate `cajaCents` |
| `src/lib/types.ts` | Modify | `RegistroEgreso`, `ConfiguracionCaja`, `cajaCents` on `DebtViewResponse` |
| `src/features/caja/repo.ts` | Create | `fetchCaja` (fetch rows → cents → `computeCaja`); `saveEgreso` insert; `fetchApertura`/`saveApertura` singleton UPSERT |
| `src/features/caja/index.ts` | Create | Egreso form + **opening-amount control** + caja display + movement breakdown |
| `src/features/dashboard/index.ts` | Modify | 5th "Caja" KPI card via `fetchCaja()` → `formatMXN` (no raw caja arithmetic) |
| `index.html` | Modify | KPI grid card, sidebar nav link, `#caja-content` page |
| `src/main.ts` | Modify | Wire `initCaja` + navigation refresh |
| `supabase/sql/phaseN_egresos.sql` | Create | `registro_egresos` + `configuracion_caja` + RLS + seed |
| `supabase/sql/phaseN_egresos_down.sql` | Create | Drop both tables only |

## Interfaces / Contracts

```ts
// src/lib/caja.ts — PURE, cents only, no DB
export interface CajaInput {
  openingCents: number;
  pagosCents: readonly number[];   // one entry per registro_pagos row (full monto)
  egresosCents: readonly number[]; // one entry per registro_egresos row
}
export interface CajaBreakdown {
  openingCents: number;
  pagosTotalCents: number;   // Σ pagosCents (no dedup — each row counted once)
  egresosTotalCents: number; // Σ egresosCents
  cajaCents: number;         // opening + pagosTotal − egresosTotal (may be negative, unclamped)
}
export function computeCaja(input: CajaInput): CajaBreakdown;
```

```ts
// src/lib/types.ts additions
export interface RegistroEgreso {
  id: string; monto: number; fecha: string; motivo: string;
  capturado_por: string | null; nombre_capturador: string; created_at: string;
}
export interface ConfiguracionCaja {
  id: number; monto_apertura: number; updated_by: string | null; updated_at: string;
}
// DebtViewResponse gains: cajaCents: number;  (aggregate only)
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
  const [aperturaRes, pagosRes, egresosRes] = await Promise.all([
    dbClient.from('configuracion_caja').select('monto_apertura').eq('id', 1).maybeSingle(),
    dbClient.from('registro_pagos').select('monto_pagado'),
    dbClient.from('registro_egresos').select('monto'),
  ]);
  const err = aperturaRes.error ?? pagosRes.error ?? egresosRes.error;
  if (err) throw err;
  return computeCaja({
    openingCents: toCents(aperturaRes.data?.monto_apertura ?? 0),
    pagosCents: (pagosRes.data ?? []).map(r => toCents(r.monto_pagado)),
    egresosCents: (egresosRes.data ?? []).map(r => toCents(r.monto)),
  });
}
```

`features/caja/index.ts` exposes an admin form field (decimal pesos) + "guardar apertura" submit, mirroring `features/admin/bank-config.ts` (`getCurrentUser`, `showError`/`showSuccess`, submit handler calling `saveApertura`). Admin-only is enforced at the DB by the `is_admin()` RLS policy — the same gate as `configuracion_bancaria` writes.

**Opening correction semantics.** `monto_apertura` is a **re-settable admin correction**, not an initial-only set: `caja = apertura + Σpagos − Σegresos` is recomputed on every read, so changing `monto_apertura` by Δ shifts `cajaCents` by exactly Δ and leaves every existing egreso/pago row untouched. **Effect on already-recorded egresos: none** — their `monto` terms are unchanged. **Audit implication:** because `configuracion_caja` is an in-place UPSERT (no append-only history), a corrected opening amount overwrites the prior value and only `updated_by`/`updated_at` record the last edit — there is no journal of opening-amount changes. This is the same tradeoff as `configuracion_bancaria` edits and is accepted; an auditable `registro_aperturas` append-only ledger is explicitly out of scope.

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
| Unit `caja.test.ts` | array-sum semantics; `saveApoyo` neutrality; negative balance; no-double-sum | `computeCaja` over fixture arrays |
| Boundary | `aplicarPago` full-`monto_pagado` invariant; repo conversion | verify-phase/manual (no `features/pagos/repo.ts` test file exists) |

Cases: (1) **array-sum semantics** — `pagosCents: [10000]` yields `pagosTotalCents === 10000` and `cajaCents === opening + 10000 − Σegresos`. This proves each `pagosCents` element is summed once; it does NOT and cannot prove the caller passed the FULL `monto_pagado`, because `CajaInput` carries only `pagosCents[]` (no debt or `unappliedCents` notion). That invariant lives in the CALLER `aplicarPago` (`features/pagos/repo.ts:59-65`), which inserts `monto_pagado: input.montoPagadoPesos` (the full amount, never the FIFO-decremented remainder) and returns `unappliedCents` separately. **There is currently no test file for `features/pagos/repo.ts`** (it depends on the live `dbClient`), and mocking it requires a DI seam not present today (out of the ~400-line budget). The full-monto invariant is therefore a **verify-phase check**: inspect `features/pagos/repo.ts:61` and confirm `monto_pagado === input.montoPagadoPesos` regardless of `unappliedCents`; (2) **`saveApoyo` neutrality** — `computeCaja` has no apoyos/receivable input; a test asserts `cajaCents === opening + Σpagos − Σegresos` with zero apoyo terms, so any future apoyo term breaks it; (3) **negative balance** — `egresos > opening + pagos` yields negative `cajaCents`, returned unclamped; (4) **no-double-sum** — two identical pago rows each counted once (no dedup), and each input array element counted exactly once.

RED-GREEN-REFACTOR order: write failing test → minimal `computeCaja` → refactor naming/shape. `lib/caja.ts` lands with its tests before any consumer, so the pure core is independently provable.

## Negative-caja rendering requirement

`computeCaja` returns `cajaCents` unclamped (negative allowed); rendering is the UI's contract. **Admin UI** (`features/caja/index.ts` display + `features/dashboard/index.ts` "Caja" KPI card): when `cajaCents < 0`, render the value in red (`text-red-600`), never hide it, never clamp to zero, never block on a "balance insufficient" guard. **Public view** (`public-view.ts` + `vista/index.html` caja card): same rule — a negative `cajaCents` renders as a red figure, unblocked, alongside the other public totals. Both surfaces satisfy the proposal's success criterion "Negative caja renders unblocked (red) on both surfaces".

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No data migration (new tables only). Rollback = run `_down.sql` (drops both tables); code rollback = revert commits (all new modules additive). **Migration safety (mandatory):** read live `information_schema.columns` (`data_type`, `numeric_precision`, `numeric_scale`) for `registro_pagos.monto_pagado`/`id`/`fecha_pago` and `registro_apoyos.fecha`/`motivo`/`capturado_por`/`nombre_capturador` before writing `phaseN_egresos.sql`, so `monto`/`fecha`/`id`/`nombre_capturador` types match. Precedent for reading live schema before DDL: `phase4_fk_restrict.sql:17-24` (which queried `information_schema.referential_constraints` for FK delete rules) — the column-type read is the analogous `information_schema.columns` query, not that exact query. Shared project "arca" (`qjswicjxwsbwnxrrowsi`) — strictly additive, app-owned tables; never touch `arca_*`, `n8n_chat_histories`, `telegram_whitelist`, `auth.users`.

**Staleness analysis (public caja):** `api/debt-view.ts` retains `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300` (line 88). A newly captured egreso or pago will NOT reflect in the public `cajaCents` for up to 60s at the edge, and a cached response may be served stale for up to 300s during revalidation. This is a stated correctness concern for a fast-moving liquidity figure — acceptable for an informational aggregate, but it MUST be documented and is not tightened in this change (keeping the existing caching contract intact).

## Slicing (review boundaries)

The design keeps four independently-buildable module boundaries so `sdd-tasks` can slice chained PRs under the ~400-line budget: (1) `lib/caja.ts` + tests + types — pure, no schema/UI dependency; (2) `lib/clipboard.ts` extraction + `token.ts` + public CLABE button — pure/UI only; (3) schema migration + `caja/repo.ts` (egreso + apertura write paths) + `caja/index.ts` — additive schema + thin UI; (4) dashboard KPI + public `cajaCents` + `api/debt-view.ts`. Each boundary is import-isolated (lib → no feature/supabase imports; public-view → lib only).

## Open Questions

None — every product decision is confirmed in the proposal (derived balance, public aggregate exposure accepted, CLABE extraction, additive shared-project schema, re-settable opening correction).
