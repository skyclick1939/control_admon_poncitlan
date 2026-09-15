# Tasks: caja-y-transferencia

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Slice 1 ~130, Slice 2 ~80, Slice 3 ~190, Slice 4 ~85, Slice 5 ~140; total ~625 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 (stacked-to-main) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium
Estimated changed lines: Slice 1 ~130, Slice 2 ~80, Slice 3 ~190, Slice 4 ~85, Slice 5 ~140; total ~625
```

Decision needed before apply: No

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Pure `computeCaja` + types | PR 1 | `vitest run src/lib/caja.test.ts` | `tsc --noEmit` | delete `src/lib/caja.ts` + `src/lib/caja.test.ts`, revert `src/lib/types.ts` additions |
| 2 | CLABE copy extraction + public button | PR 2 | `vitest run` (no regression) | manual public-view copy (success + fallback) | revert `src/lib/clipboard.ts`, `src/features/miembros/token.ts`, `src/public-view.ts`, `vista/index.html` |
| 3 | Schema + caja repo + admin UI | PR 3 | `vitest run` + `tsc --noEmit` | manual egreso + apertura writes | run `phaseN_egresos_down.sql`; delete `src/features/caja/{index,repo}.ts` |
| 4 | Dashboard KPI + public `cajaCents` + debt-view | PR 4 | `vitest run` + `tsc --noEmit` | manual negative public caja red unblocked | revert `api/debt-view.ts`, `src/lib/types.ts` `cajaCents`, `src/features/dashboard/index.ts`, `src/public-view.ts`, `vista/index.html`, `index.html`, `src/main.ts` |
| 5 | Apoyos term + Por cobrar + Arca labels | PR 5 | `vitest run src/lib/caja.test.ts` + `tsc --noEmit` | manual Arca breakdown + Por cobrar display | revert apoyos/por-cobrar additions + Arca labels |

## PR 1 — Pure caja core + types (foundation)

**Start**: no caja module exists. **Finish**: `computeCaja` green; no consumer yet.

- [x] 1.1 (RED) Write `src/lib/caja.test.ts` covering: array-sum (`pagosCents:[10000]` → `pagosTotalCents===10000`), saveApoyo neutrality, negative balance unclamped, no-double-sum. Imports `computeCaja`/`CajaInput`/`CajaBreakdown` from `src/lib/caja.ts` (absent) — `vitest run` FAILS.
- [x] 1.2 (GREEN) Create `src/lib/caja.ts` with `CajaInput`/`CajaBreakdown` and pure `computeCaja` (cents-only, no DB, no `toCents`). `vitest run` passes.
- [x] 1.3 (REFACTOR) Confirm unclamped negative `cajaCents`; tidy names/shape.
- [x] 1.4 Add `RegistroEgreso` + `ConfiguracionCaja` to `src/lib/types.ts` (`nombre_capturador: string` non-null; `capturado_por: string | null`). Defer `cajaCents` on `DebtViewResponse` to PR 4 so `tsc --noEmit` stays green.
- [x] 1.5 **Verify PR 1**: `vitest run` + `tsc --noEmit` green.

## PR 2 — CLABE copy extraction + public button

**Start**: inline copy in `token.ts`. **Finish**: public CLABE copy button works; public bundle supabase-free.

- [x] 2.1 Create `src/lib/clipboard.ts`: `copyToClipboard(text): Promise<boolean>`, zero imports (browser globals only), `execCommand` fallback, never throws.
- [x] 2.2 Modify `src/features/miembros/token.ts` to import `copyToClipboard` from `../../lib/clipboard` (replace inline impl, lines 20–27).
- [x] 2.3 Modify `src/public-view.ts` `renderBanco` (lines 37–47) to add CLABE copy button with success/failure feedback.
- [x] 2.4 Modify `vista/index.html` to add the CLABE button slot.
- [x] 2.5 **Verify PR 2**: `vitest run` + `tsc --noEmit` green; manual copy (success + fallback). No clipboard unit test — browser-global dependent; design scopes it to verify-phase.

## PR 3 — Schema migration + caja repo + admin UI

**Start**: no tables/repo/UI. **Finish**: egreso + opening-amount capture work.

- [x] 3.1 **DONE — the live `information_schema` read has NOW been performed (post-apply, read-only, via Supabase Management API).** The read that could not run in the apply environment has since been executed against production: `registro_pagos` (`id uuid`, `monto_pagado numeric` **unconstrained**, `fecha_pago date`) and `registro_apoyos` (`id uuid`, `monto_total numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`). The migration's columns mirror EXACTLY (`id uuid`, `monto numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`). The in-migration guard (`phase5_egresos.sql:21-47`, at the TOP, before any DDL) checks `data_type = 'numeric'` — an unconstrained-superset check, not a precision/scale equality. Per verify-report evidence B: the ORIGINAL precision/scale equality assertion was **latent, not active** — because the live sibling is unconstrained `numeric`, that assertion would have PASSED (`NULL IS NOT DISTINCT FROM NULL`) and only fired against a `numeric(p,s)` sibling, and it fired AFTER the DDL (a misleading error on a successful apply). The fix moved the guard before DDL and to the data_type-only check.
- [x] 3.2 Create `supabase/sql/phase5_egresos.sql`: `registro_egresos` (`monto numeric` plain, `nombre_capturador text not null`, `capturado_por uuid … on delete set null`) + `configuracion_caja` (id=1 check) + RLS enable/revoke + `is_admin()` policy + seed `(1,0,null)` + self-verifying assertion block.
- [x] 3.3 Create `supabase/sql/phase5_egresos_down.sql`: drop both new tables only.
- [x] 3.4 Create `src/features/caja/repo.ts`: `fetchCaja` (toCents at boundary → `computeCaja`), `saveEgreso` (insert `registro_egresos`), `fetchApertura`/`saveApertura` (UPSERT `configuracion_caja` id=1).
- [x] 3.5 Create `src/features/caja/index.ts`: egreso form + **opening-amount capture control** (required deliverable, admin-only `saveApertura`) + display + movement breakdown; negative → red, unblocked.
- [x] 3.6 **Verify PR 3**: `vitest run` + `tsc --noEmit` green; `npm run build` + postbuild guard green. Manual egreso-decreases-caja + apertura-UPSERT are verify-phase checks (no DB in apply env).

## PR 4 — Dashboard KPI + public `cajaCents` + debt-view

**Start**: `api/debt-view.ts` returns no caja; 3 KPIs. **Finish**: aggregate `cajaCents` on both surfaces.

- [x] 4.1 Modify `src/lib/types.ts`: add `cajaCents: number` to `DebtViewResponse` (lands with its producer).
- [x] 4.2 Modify `api/debt-view.ts`: fetch opening+pagos+egresos → aggregate `cajaCents`; explicit column lists only (never `select('*')`); keep existing Cache-Control.
- [x] 4.3 Modify `src/public-view.ts` + `vista/index.html`: render public `cajaCents` card (negative → red, unblocked).
- [x] 4.4 Modify `src/features/dashboard/index.ts`: add 5th "Caja" KPI via `fetchCaja()` → `money.formatMXN` (NO raw arithmetic; leave existing 3 cards' float sums unchanged, out of scope).
- [x] 4.5 Modify `index.html` (KPI grid card, sidebar nav link, `#caja-content`) + `src/main.ts` (wire `initCaja` + navigation refresh).
- [x] 4.6 **Verify PR 4**: `vitest run` + `tsc --noEmit` green; manual negative public caja red unblocked.

## PR 5 — Apoyos term + Por cobrar + Arca labels

**Start**: `computeCaja` shows apertura + pagos − egresos (no apoyos term); no "Por cobrar" figure; module labeled "Caja". **Finish**: apoyos SUBTRACT, "Por cobrar" displayed, module/breakdown/KPI relabeled "Arca" / "Arca (disponible)" (identifiers unchanged).

**Review Workload Forecast (Slice 5)**: ~140 changed lines (mostly rename + a few additions), under the 400-line budget; PR 5 stacks onto PR 4.

- [x] 5.1 (RED) Extend `src/lib/caja.test.ts`: assert `apoyosCents: [10000]` → `apoyosTotalCents === 10000` and `cajaCents === opening + Σpagos − 10000 − Σegresos` (apoyo term SUBTRACTS); fully-repaid apoyo nets to zero; unrepaid apoyo stays negative. `vitest run` FAILS.
- [x] 5.2 (GREEN) Modify `src/lib/caja.ts`: add `apoyosCents` to `CajaInput` and `apoyosTotalCents` to `CajaBreakdown`; compute `cajaCents = opening + pagosTotal − apoyosTotal − egresosTotal`. Identifiers NOT renamed (`computeCaja`, `CajaInput`, `CajaBreakdown` stay). `vitest run` passes.
- [x] 5.3 Modify `src/features/caja/repo.ts` `fetchCaja`: also fetch `registro_apoyos.monto_total` and pass `apoyosCents` to `computeCaja`.
- [x] 5.4 Add the "Por cobrar" figure to `src/features/caja/index.ts`: read `totalPendienteCents` from `aggregateDebtByMember` (`src/lib/debt-view.ts`); render alongside "Arca (disponible)" as contextual, NOT added into the balance.
- [x] 5.5 Change user-facing labels ONLY: nav/module label → "Arca"; balance card → "Arca (disponible)"; dashboard KPI → "Arca (disponible)"; public caja card → "Arca (disponible)". Do NOT rename identifiers or DOM ids — `computeCaja`, `CajaInput`, `CajaBreakdown`, `cajaCents`, `src/lib/caja.ts`, `src/lib/caja.test.ts`, `src/features/caja/repo.ts`, `src/features/caja/index.ts`, `fetchCaja`, `initCaja`, `#caja-content`, `data-view="caja-content"`, `configuracion_caja`, `ConfiguracionCaja` all stay as-is.
- [x] 5.6 Update `api/debt-view.ts` to fetch `registro_apoyos.monto_total` as a `−` term for the public aggregate `cajaCents`; the PUBLIC surface still exposes ONLY the net aggregate (no apoyos/egresos/por-cobrar breakdown, no operator identity).
- [x] 5.7 Render the six breakdown cards: `Apertura` · `Pagos recibidos` · `Apoyos entregados` · `Egresos` · `Arca (disponible)` · `Por cobrar`.
- [x] 5.8 **Verify PR 5**: `vitest run` + `tsc --noEmit` green; manual: recording a sin-cargo apoyo as egreso decreases Arca; an unrepaid apoyo leaves Arca negative; "Por cobrar" unchanged by a sin-cargo disbursement.

## PR 6 — Internal-member exclusion from receivables

**Start**: `miembros.status` allows only `'fullparch' | 'prospecto'`; the pseudo-member `Gastos_sin_cargar` (a `fullparch`) counts as debt and, being `fullparch`, also receives group-division cargos. **Finish**: a third `status` value `'interno'` excludes internal bookkeeping members from every debtor/receivable surface; the exclusion rides the pre-existing `fullparch` group-division filter; `status` still never leaves the public payloads.

**Review Workload Forecast (Slice 6)**: ~130 changed lines (one type widening + one pure aggregator filter + one test + two consumer filters + two migration files), under the 400-line budget; PR 6 stacks onto PR 5.

- [x] 6.1 Widen `Miembro.status` to `'fullparch' | 'prospecto' | 'interno'` in `src/lib/types.ts` (line 4) — mirrors the DB CHECK constraint.
- [x] 6.2 Exclude `'interno'` in `aggregateDebtByMember` (`src/lib/debt-view.ts`) — the single pure place covering BOTH the public debt view (`api/debt-view.ts`) and the caja "Por cobrar" (`src/features/caja/repo.ts`).
- [x] 6.3 Extend `src/lib/debt-view.test.ts` to cover the `'interno'` exclusion (the rule is proven in one pure, tested place).
- [x] 6.4 Add `status !== 'interno'` to `src/features/dashboard/index.ts`'s own aggregation (the "Miembros con Deuda" KPI count, its percentage denominator, and the debtors table) — a deliberate, documented deviation from `aggregateDebtByMember` (raw float reduce across all `estado` vs whole cents over `estado='pendiente'`).
- [x] 6.5 Add `status !== 'interno'` to the `TODOS` group-division filter in `src/features/apoyos/index.ts`; `FULLPARCH` already excludes it via the pre-existing `status === 'fullparch'` filter.
- [x] 6.6 Create `supabase/sql/phase6_miembros_status_interno.sql`: widen `miembros_status_check` to admit `'interno'` in a single atomic `ALTER TABLE` (drop + add), preceded by a pre-DDL compatibility guard (mirroring `phase5_egresos.sql`) that aborts cleanly on a drifted schema.
- [x] 6.7 Create `supabase/sql/phase6_miembros_status_interno_down.sql`: assert no row uses `'interno'` BEFORE narrowing, else raise a clear message telling the operator to reassign those rows first (fail-safe — never leaves the table unprotected).
- [ ] 6.8 **SDD artifact pass** (this task): document the internal-member exclusion in `specs/caja/spec.md`, `design.md`, and `tasks.md`. No code, no SQL.
- [ ] 6.9 **Verify PR 6 (browser-only)**: confirm the pseudo-member no longer appears as a debtor, in "Miembros con Deuda" / the debtors table, or in group divisions, and remains selectable for individual disbursements. **UNCHECKED — browser-only.**

## Final Verification (cross-slice, no new code)

- [x] V.1 Confirm full-`monto_pagado` invariant at `src/features/pagos/repo.ts:59-65` (read-only): `monto_pagado === input.montoPagadoPesos` regardless of `unappliedCents`. **CONFIRMED by inspection; corroborated by 106 real pago rows (derived sum redacted).** NO unit test — no DI seam, out of 400-line budget.
- [x] V.2 Confirm a disbursed apoyo REDUCES the arca — `apoyosTotalCents` is a deduction term in `computeCaja` (`cajaCents = opening + pagos − apoyos − egresos`) — and its repayment returns through `registro_pagos` (already an inflow term), so a fully repaid apoyo nets to zero and an unrepaid one leaves the arca negative. **CONFIRMED — code-verified and test-covered (`nets a fully repaid apoyo to zero`, `leaves an unrepaid apoyo as a negative balance`).**
- [ ] V.3 Confirm negative `cajaCents` renders red + unblocked on admin AND public surfaces. **UNCHECKED — browser-only: code-inspected (red + unblocked on admin, dashboard, and public surfaces) but never exercised in a real browser.**
