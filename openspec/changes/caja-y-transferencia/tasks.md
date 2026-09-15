# Tasks: caja-y-transferencia

**Status:** code, the four live migrations (phases 5–8), and the artifact passes are DONE. The duplicate "Registrar Egreso" form is REMOVED. The change is merged to `main` and LIVE in production; it is NOT archived. Verification items confirmed against the live site are checked with a note stating what was confirmed and what was not. The only unchecked task is V.3 (negative-balance rendering), which was never independently exercised in a browser.

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
| 3 | Schema + caja repo + admin UI | PR 3 | `vitest run` + `tsc --noEmit` | manual apertura write | run `phase5_egresos_down.sql`; delete `src/features/caja/{index,repo}.ts` |
| 4 | Dashboard KPI + public `cajaCents` + debt-view | PR 4 | `vitest run` + `tsc --noEmit` | manual negative public caja red unblocked | revert `api/debt-view.ts`, `src/lib/types.ts` `cajaCents`, `src/features/dashboard/index.ts`, `src/public-view.ts`, `vista/index.html`, `index.html`, `src/main.ts` |
| 5 | Apoyos term + Por cobrar + Arca labels | PR 5 | `vitest run src/lib/caja.test.ts` + `tsc --noEmit` | manual Arca breakdown + Por cobrar display | revert apoyos/por-cobrar additions + Arca labels |

## PR 1 — Pure caja core + types (foundation)

**Start**: no caja module exists. **Finish**: `computeCaja` green; no consumer yet.

- [x] 1.1 (RED) Write `src/lib/caja.test.ts` covering: array-sum semantics (a single-element `pagosCents` array yields a `pagosTotalCents` equal to that element), apoyo subtraction, negative balance unclamped, no-double-sum. Imports `computeCaja`/`CajaInput`/`CajaBreakdown` from `src/lib/caja.ts` (absent) — `vitest run` FAILS.
- [x] 1.2 (GREEN) Create `src/lib/caja.ts` with `CajaInput`/`CajaBreakdown` and pure `computeCaja` (cents-only, no DB, no `toCents`). `vitest run` passes.
- [x] 1.3 (REFACTOR) Confirm unclamped negative `cajaCents`; tidy names/shape.
- [x] 1.4 Add `RegistroEgreso` + `ConfiguracionCaja` to `src/lib/types.ts` (`nombre_capturador: string` non-null; `capturado_por: string | null`). Defer `cajaCents` on `DebtViewResponse` to PR 4 so `tsc --noEmit` stays green.
- [x] 1.5 **Verify PR 1**: `vitest run` + `tsc --noEmit` green.

## PR 2 — CLABE copy extraction + public button

**Start**: inline copy in `token.ts`. **Finish**: public CLABE copy button works; public bundle supabase-free.

- [x] 2.1 Create `src/lib/clipboard.ts`: `copyToClipboard(text): Promise<boolean>`, zero imports (browser globals only), `execCommand` fallback, never throws.
- [x] 2.2 Modify `src/features/miembros/token.ts` to import `copyToClipboard` from `../../lib/clipboard` (replace the inline implementation).
- [x] 2.3 Modify `src/public-view.ts` `renderBanco` to add the CLABE copy button with success/failure feedback.
- [x] 2.4 Modify `vista/index.html` to add the CLABE button slot.
- [x] 2.5 **Verify PR 2**: `vitest run` + `tsc --noEmit` green; public bundle stays supabase-free (build evidence). Note: the manual CLABE copy click (success + `execCommand` fallback) was NOT independently exercised — no browser run was performed.
  - No clipboard unit test — browser-global dependent; the design scopes it to the verify phase.

## PR 3 — Schema migration + caja repo + admin UI

**Start**: no tables/repo/UI. **Finish**: the opening-amount control works; `registro_egresos` exists.

- [x] 3.1 **DONE — the live `information_schema` read has been performed (post-apply, read-only, via Supabase Management API).** The read that could not run in the apply environment has since been executed against production: `registro_pagos` (`id uuid`, `monto_pagado numeric` **unconstrained**, `fecha_pago date`) and `registro_apoyos` (`id uuid`, `monto_total numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`). The migration's columns mirror EXACTLY (`id uuid`, `monto numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`). The in-migration guard (`phase5_egresos.sql:21-47`, at the TOP, before any DDL) checks `data_type = 'numeric'` — an unconstrained-superset check, not a precision/scale equality. Per verify-report evidence B: the ORIGINAL precision/scale equality assertion was **latent, not active** — because the live sibling is unconstrained `numeric`, that assertion would have PASSED (`NULL IS NOT DISTINCT FROM NULL`) and only fired against a `numeric(p,s)` sibling, and it fired AFTER the DDL (a misleading error on a successful apply). The fix moved the guard before DDL and to the data_type-only check.
- [x] 3.2 Create `supabase/sql/phase5_egresos.sql`: `registro_egresos` (`monto numeric` plain, `nombre_capturador text not null`, `capturado_por uuid … on delete set null`) + `configuracion_caja` (id=1 check) + RLS enable/revoke + `is_admin()` policy + seed `(1,0,null)` + self-verifying assertion block.
- [x] 3.3 Create `supabase/sql/phase5_egresos_down.sql`: drop both new tables only.
- [x] 3.4 Create `src/features/caja/repo.ts`: `fetchCaja` (toCents at boundary → `computeCaja`), `saveEgreso` (insert `registro_egresos`), `fetchApertura`/`saveApertura` (UPSERT `configuracion_caja` id=1).
- [x] 3.5 Create `src/features/caja/index.ts`: **opening-amount capture control** (required deliverable, admin-only `saveApertura`) + display + movement breakdown. The page carries no disbursement capture form (see 8.6).
- [x] 3.6 **Verify PR 3**: `vitest run` + `tsc --noEmit` green; `npm run build` + postbuild guard green. Note: the form-level egreso and apertura writes were NOT independently exercised through the UI; the egreso path now has real data via the phase 8 reclassification.

## PR 4 — Dashboard KPI + public `cajaCents` + debt-view

**Start**: `api/debt-view.ts` returns no caja. **Finish**: aggregate `cajaCents` on both surfaces.

- [x] 4.1 Modify `src/lib/types.ts`: add `cajaCents: number` to `DebtViewResponse` (lands with its producer).
- [x] 4.2 Modify `api/debt-view.ts`: fetch opening+pagos+apoyos+egresos → aggregate `cajaCents`; explicit column lists only (never `select('*')`); keep existing Cache-Control.
- [x] 4.3 Modify `src/public-view.ts` + `vista/index.html`: render public `cajaCents` card (negative → red, unblocked).
- [x] 4.4 Modify `src/features/dashboard/index.ts`: add the "Arca (disponible)" KPI card via `fetchCaja()` → `money.formatMXN` (NO raw arithmetic).
- [x] 4.5 Modify `index.html` (KPI grid card, sidebar nav link, `#caja-content`) + `src/main.ts` (wire `initCaja` + navigation refresh).
- [x] 4.6 **Verify PR 4**: `vitest run` + `tsc --noEmit` green. Note: the manual negative public caja red check was NOT independently exercised in a browser — tracked as V.3 (still unchecked).

## PR 5 — Apoyos term + Por cobrar + Arca labels

**Start**: `computeCaja` shows apertura + pagos − egresos (no apoyos term); no "Por cobrar" figure; module labeled "Caja". **Finish**: apoyos SUBTRACT, "Por cobrar" displayed, module/breakdown/KPI relabeled "Arca" / "Arca (disponible)" (identifiers unchanged).

**Review Workload Forecast (Slice 5)**: ~140 changed lines (mostly rename + a few additions), under the 400-line budget; PR 5 stacks onto PR 4.

- [x] 5.1 (RED) Extend `src/lib/caja.test.ts`: assert that a single-element `apoyosCents` array yields `apoyosTotalCents` equal to that element and that `cajaCents` equals `opening + Σpagos − that element − Σegresos` (the apoyo term SUBTRACTS); a fully-repaid apoyo nets to zero; an unrepaid apoyo stays negative. `vitest run` FAILS.
- [x] 5.2 (GREEN) Modify `src/lib/caja.ts`: add `apoyosCents` to `CajaInput` and `apoyosTotalCents` to `CajaBreakdown`; compute `cajaCents = opening + pagosTotal − apoyosTotal − egresosTotal`. Identifiers NOT renamed (`computeCaja`, `CajaInput`, `CajaBreakdown` stay). `vitest run` passes.
- [x] 5.3 Modify `src/features/caja/repo.ts` `fetchCaja`: also fetch `registro_apoyos.monto_total` and pass `apoyosCents` to `computeCaja`.
- [x] 5.4 Add the "Por cobrar" figure to `src/features/caja/index.ts`: read `totalPendienteCents` from `aggregateDebtByMember` (`src/lib/debt-view.ts`); render alongside "Arca (disponible)" as contextual, NOT added into the balance.
- [x] 5.5 Change user-facing labels ONLY: nav/module label → "Arca"; balance card → "Arca (disponible)"; dashboard KPI → "Arca (disponible)"; public Arca card → "Arca (disponible)". Do NOT rename identifiers or DOM ids — `computeCaja`, `CajaInput`, `CajaBreakdown`, `cajaCents`, `src/lib/caja.ts`, `src/lib/caja.test.ts`, `src/features/caja/repo.ts`, `src/features/caja/index.ts`, `fetchCaja`, `initCaja`, `#caja-content`, `data-view="caja-content"`, `configuracion_caja`, `ConfiguracionCaja` all stay as-is.
- [x] 5.6 Update `api/debt-view.ts` to fetch `registro_apoyos.monto_total` as a `−` term for the public aggregate `cajaCents`; the PUBLIC surface still exposes ONLY the net aggregate (no apoyos/egresos/por-cobrar breakdown, no operator identity).
- [x] 5.7 Render the six breakdown cards: `Apertura` · `Pagos recibidos` · `Apoyos entregados (recuperables)` · `Egresos (no recuperables)` · `Arca (disponible)` · `Por cobrar`.
- [x] 5.8 **Verify PR 5**: `vitest run` + `tsc --noEmit` green. Code- and test-verified: a sin-cargo apoyo writes an egreso and decreases Arca; an unrepaid apoyo leaves Arca negative; "Por cobrar" is unchanged by a sin-cargo disbursement because no cargos are created. Not independently exercised in a browser.

## PR 6 — Internal-member exclusion from receivables

**Start**: `miembros.status` allows only `'fullparch' | 'prospecto'`; the pseudo-member `Gastos_sin_cargar` (a `fullparch`) counts as debt and, being `fullparch`, also receives group-division cargos. **Finish**: a third `status` value `'interno'` excludes internal bookkeeping members from every debtor surface; the exclusion rides the pre-existing `fullparch` group-division filter; `status` still never leaves the public payloads.

**Review Workload Forecast (Slice 6)**: ~130 changed lines (one type widening + one pure aggregator filter + one test + two consumer filters + two migration files), under the 400-line budget; PR 6 stacks onto PR 5.

- [x] 6.1 Widen `Miembro.status` to `'fullparch' | 'prospecto' | 'interno'` in `src/lib/types.ts` — mirrors the DB CHECK constraint.
- [x] 6.2 Exclude `'interno'` in `aggregateDebtByMember` (`src/lib/debt-view.ts`) — the single pure place covering BOTH the public debt view (`api/debt-view.ts`) and the caja "Por cobrar" (`src/features/caja/repo.ts`).
- [x] 6.3 Extend `src/lib/debt-view.test.ts` to cover the `'interno'` exclusion (the rule is proven in one pure, tested place).
- [x] 6.4 Add the `TODOS` group-division filter `status !== 'interno'` in `src/features/apoyos/index.ts`; `FULLPARCH` already excludes it via the pre-existing `status === 'fullparch'` filter.
- [x] 6.5 Create `supabase/sql/phase6_miembros_status_interno.sql`: widen `miembros_status_check` to admit `'interno'` in a single atomic `ALTER TABLE` (drop + add), preceded by a pre-DDL compatibility guard (mirroring `phase5_egresos.sql`) that aborts cleanly on a drifted schema.
- [x] 6.6 Create `supabase/sql/phase6_miembros_status_interno_down.sql`: assert no row uses `'interno'` BEFORE narrowing, else raise a clear message telling the operator to reassign those rows first (fail-safe — never leaves the table unprotected).
- [x] 6.7 **SDD artifact pass**: document the internal-member exclusion in `specs/caja/spec.md`, `design.md`, and `tasks.md`. No code, no SQL.
- [x] 6.8 **Verify PR 6**: code-verified that the internal member is excluded inside `aggregateDebtByMember` (which feeds the admin ranking, the "Miembros con Deuda" KPI, the public ranking, and "Por cobrar") and from group divisions, and that it stays selectable for INDIVIDUAL disbursements. Data-level confirmation supplied from production: the receivable total drops by exactly the pseudo-member's phantom cargo once the exclusion applies. NOT independently exercised in a browser (the rendered admin table, the KPI, and the group-division preview).

## PR 7 — Egreso beneficiary + loan-vs-expense outflow labels

**Start**: `registro_egresos` carries no beneficiary; outflow cards read "Apoyos Entregados" / "Egresos" with no grouping. **Finish**: egresos are traceable to a beneficiary (internal members selectable, default none); the two outflow cards state their nature under "Salidas del arca".

**Review Workload Forecast (Slice 7)**: ~120 changed lines (two migration files + one type extension + repo persist + selector/labels), under the 400-line budget; PR 7 stacks onto PR 6.

- [x] 7.1 Create `supabase/sql/phase7_egresos_beneficiario.sql`: add `beneficiario_id uuid references miembros(id) on delete set null` + `nombre_beneficiario text` to `public.registro_egresos`; pre-DDL guard; strictly scoped to `public.registro_egresos`.
- [x] 7.2 Create `supabase/sql/phase7_egresos_beneficiario_down.sql`: drop the two columns only.
- [x] 7.3 Extend `RegistroEgreso` in `src/lib/types.ts` with `beneficiario_id: string | null` + `nombre_beneficiario: string | null`.
- [x] 7.4 Modify `src/features/caja/repo.ts` `saveEgreso` to persist both fields.
- [x] 7.5 Add the beneficiary selector to the capture form (internal members included, default none) and relabel `Apoyos Entregados` → "Apoyos entregados (recuperables)" and `Egresos` → "Egresos (no recuperables)", both under a "Salidas del arca" heading. The selector lives in the Apoyos flow's "Sin cargos" modality — the duplicate form that briefly carried it was later removed (see 8.6).
- [x] 7.6 **SDD artifact pass**: document the beneficiary traceability + loan-vs-expense rule in `specs/caja/spec.md`, `design.md`, and `tasks.md`. No code, no SQL.
- [x] 7.7 **Verify PR 7**: code-verified that the selector is populated with active members (internal members included) and defaults to none, and that the two outflow cards read the new labels under "Salidas del arca". NOT independently exercised in a browser.

## PR 8 — Single capture flow (three modalities) + unified debt aggregation + data-classification fix

**Start**: the Apoyos flow has two modalities (group, individual) and a separate "Registrar Egreso" form on the Arca page; the dashboard "Ranking de Deudores" computes per-member debt differently from the public ranking and "Por cobrar"; one INDIVIDUAL disbursement is misclassified with its single phantom cargo on the internal member. **Finish**: a third selector modality "Sin cargos — absorbido por el Arca (no recuperable)" records a non-recoverable disbursement as a single egreso (no apoyo, no cargos); every surface shows the same per-member receivable; the misclassified row is moved to `registro_egresos` and its phantom cargo deleted; the duplicate "Registrar Egreso" form is removed.

**Review Workload Forecast (Slice 8)**: ~150 changed lines (one selector modality + dashboard aggregation switch + phase 8 migration/reverse scripts + three artifact files), under the 400-line budget; PR 8 stacks onto PR 7.

- [x] 8.1 Add the third selector modality "Sin cargos — absorbido por el Arca (no recuperable)" to the Apoyos flow; on selection write exactly one `registro_egresos` row (optional beneficiary), create no `registro_apoyos` row and no `cargos`.
- [x] 8.2 Make the dashboard "Ranking de Deudores" derive per-member debt from `aggregateDebtByMember` — the same aggregation as the public ranking and "Por cobrar" — over integer cents from `estado='pendiente'` rows, so no two screens show different figures for the same member.
- [x] 8.3 Create the phase 8 migration script (+ reverse `_down.sql`): move ONE misclassified INDIVIDUAL disbursement to `registro_egresos` carrying the beneficiary, delete the apoyo and its phantom cargo — atomically, guarded, with a reverse script. Arca unchanged (an apoyo and an egreso are both deductions; only the classification changes and the phantom debt disappears).
- [x] 8.4 **SDD artifact pass**: document the single-capture-flow-with-three-modalities decision, the debt-consistency decision, the data-classification correction, and the placeholder finding in `specs/caja/spec.md`, `design.md`, and `tasks.md`. No code, no SQL.
- [x] 8.5 **Verify PR 8**: code- and data-verified that the third modality writes one egreso with no cargos and no apoyo (phase 8 moved a real row through this path), that the admin ranking, public ranking, and "Por cobrar" now share one aggregator (production cents-level disagreements were the before-state this fixes), and that the Arca balance is unchanged by the reclassification. NOT independently exercised in a browser.
- [x] 8.6 Remove the duplicate "Registrar Egreso" form from the Arca page now that capture has one path (commit `f94757a`); the Arca page is a query/config surface only. Note: this commit sits on `feat/caja-y-transferencia` one commit after the merge to `main`, so it reaches production through a new PR.

## Final Verification (cross-slice, no new code)

- [x] V.1 Confirm full-`monto_pagado` invariant at `src/features/pagos/repo.ts:59-65` (read-only): `monto_pagado === input.montoPagadoPesos` regardless of `unappliedCents`. **CONFIRMED by inspection; corroborated by 106 real pago rows (derived sum redacted).** NO unit test — no DI seam, out of 400-line budget.
- [x] V.2 Confirm a disbursed apoyo REDUCES the arca — `apoyosTotalCents` is a deduction term in `computeCaja` — and its repayment returns through `registro_pagos` (already an inflow term), so a fully repaid apoyo nets to zero and an unrepaid one leaves the arca negative. **CONFIRMED — code-verified and test-covered (`nets a fully repaid apoyo to zero`, `leaves an unrepaid apoyo as a negative balance`).**
- [ ] V.3 Confirm negative `cajaCents` renders red + unblocked on admin AND public surfaces. **UNCHECKED — browser-only: code-inspected (red + unblocked on admin, dashboard, and public surfaces) but never exercised in a real browser.**
