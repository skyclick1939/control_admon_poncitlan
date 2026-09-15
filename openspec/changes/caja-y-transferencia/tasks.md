# Tasks: caja-y-transferencia

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Slice 1 ~130, Slice 2 ~80, Slice 3 ~190, Slice 4 ~85; total ~485 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 (stacked-to-main) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium
Estimated changed lines: Slice 1 ~130, Slice 2 ~80, Slice 3 ~190, Slice 4 ~85; total ~485
```

Decision needed before apply: No

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Pure `computeCaja` + types | PR 1 | `vitest run src/lib/caja.test.ts` | `tsc --noEmit` | delete `src/lib/caja.ts` + `src/lib/caja.test.ts`, revert `src/lib/types.ts` additions |
| 2 | CLABE copy extraction + public button | PR 2 | `vitest run` (no regression) | manual public-view copy (success + fallback) | revert `src/lib/clipboard.ts`, `src/features/miembros/token.ts`, `src/public-view.ts`, `vista/index.html` |
| 3 | Schema + caja repo + admin UI | PR 3 | `vitest run` + `tsc --noEmit` | manual egreso + apertura writes | run `phaseN_egresos_down.sql`; delete `src/features/caja/{index,repo}.ts` |
| 4 | Dashboard KPI + public `cajaCents` + debt-view | PR 4 | `vitest run` + `tsc --noEmit` | manual negative public caja red unblocked | revert `api/debt-view.ts`, `src/lib/types.ts` `cajaCents`, `src/features/dashboard/index.ts`, `src/public-view.ts`, `vista/index.html`, `index.html`, `src/main.ts` |

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

## Final Verification (cross-slice, no new code)

- [x] V.1 Confirm full-`monto_pagado` invariant at `src/features/pagos/repo.ts:59-65` (read-only): `monto_pagado === input.montoPagadoPesos` regardless of `unappliedCents`. **CONFIRMED by inspection; corroborated by 106 real pago rows (derived sum redacted).** NO unit test — no DI seam, out of 400-line budget.
- [x] V.2 Confirm `saveApoyo` (`src/features/apoyos/repo.ts`, read-only) contributes no caja term. **CONFIRMED.**
- [ ] V.3 Confirm negative `cajaCents` renders red + unblocked on admin AND public surfaces. **UNCHECKED — browser-only: code-inspected (red + unblocked on admin, dashboard, and public surfaces) but never exercised in a real browser.**
