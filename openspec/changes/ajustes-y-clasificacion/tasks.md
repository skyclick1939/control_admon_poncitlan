# Tasks: Ajustes de adeudo y clasificación de conceptos

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~950–1100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 catálogo → PR2 ajustes → PR3 guardia + indicador |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes — live SQL requires the operator's explicit sign-off
Chained PRs recommended: Yes
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Catálogo + selector | PR1 | Migration + pure lib + form |
| 2 | Ajustes (leyenda, escritor, módulo) | PR2 | Migration + pure lib + module |
| 3 | Guardia de naturaleza + reporte y posición neta | PR3 | Depends on PR2 |

## 1. Catálogo de conceptos (E3)

- [x] 1.1 **`phase10_catalogo_conceptos.sql`** (+ `_down`): the catalog table, `revoke all … from anon`, an `is_admin()` policy, the seed of the operator's six concepts with their nature, and `concepto_id` on `registro_apoyos` and `registro_egresos`. Additive and reversible only within this app's tables.
  - Evidence: **APPLIED live 2026-10-04** with the operator's authorization, after two zero-trace proofs against production (the forward run alone inside a transaction, and a forward+down round-trip, both rolled back with an identical read-back). Read-back after applying confirms the six seeded concepts with their natures, both `concepto_id` columns, RLS with one `is_admin()` policy, zero `anon` grants and both indexes; 63 `registro_apoyos` and 3 `registro_egresos` rows await classification in task 1.6. Original pre-apply evidence, kept: authored without a database in that environment, so the operator applies it and reads back the seeded rows and both new columns (the file's top `do $$ … $$` guard aborts on drift before any DDL). What could be checked locally was: `npx vitest run src/lib/conceptos.test.ts` parses the migration file and asserts the `naturaleza` CHECK equals the TypeScript union and that the six `(slug, nombre, naturaleza)` seeds are exactly the operator's list with four `recuperable` + two `no_recuperable` (26 passed).
- [x] 1.2 **`src/lib/conceptos.ts`** — pure, tested first: accent-insensitive substring match, prefix-first ranking, and a "no match" signal the UI turns into the create affordance.
  - Evidence: RED — `npx vitest run` with only `conceptos.test.ts` added failed with 1 failed suite (`Cannot find module './conceptos'`), 13 files / 190 pre-existing tests still passing. GREEN — after implementing the module: `npx vitest run src/lib/conceptos.test.ts` → 1 file, 26 passed; full `npx vitest run` → 14 files, 216 passed. Cases cover accents, case, empty query, prefix-before-interior ranking, stable equal-rank order, the nature filter, the no-match signal, inactive concepts, `resolveConcepto`, `slugifyConcepto`, and the CHECK/union agreement.
- [ ] 1.3 **Selector in the Apoyos form** — UNCHECKED: its verification includes a browser check that was never run (see the evidence). Code and tests are in place; the selector behaviour itself is unverified., filtered by modality (design.md D2), with in-line concept creation requiring a nature.
  - Evidence: implemented as a native `input[list]` + `datalist` fed by `searchConceptos`/`resolveConcepto`; `TODOS`/`FULLPARCH`/`INDIVIDUAL` offer only `recuperable`, `SIN_CARGOS` only `no_recuperable`, and an unmatched term opens the in-line create panel whose nature is fixed to the modality's own (the other option is disabled). The browser check of this task was NOT run: this environment has no live session and no database, so the selector's browser behaviour is still the operator's verification.
- [ ] 1.4 **Concept on the "sin cargos" (egreso) capture** — UNCHECKED: its verification includes observing a `registro_egresos` row, which needs a live database that was unavailable. Code and type-level proof only., same selector, non-recoverable nature only.
  - Evidence: the `SIN_CARGOS` branch of the same form now requires a `no_recuperable` concept and passes `conceptoId` through `saveApoyoSinCargos` → `saveEgreso`, which writes `registro_egresos.concepto_id`. A `registro_egresos` row carrying the concept could NOT be observed: no database in this environment. The save is blocked without a concept at both gates (disabled button + `resolveConcepto` check in `handleSaveApoyo`), and `npx tsc --noEmit` proves `EgresoInput.conceptoId` is required.
- [ ] 1.5 **Surface the concept** — UNCHECKED: its verification includes rendering both surfaces in a browser, which was never done. where the motive appears today (pagos debt table, admin member history) without replacing `motivo`.
  - Evidence: `fetchCargosPendientes` and `fetchCargosMiembro` embed `registro_apoyos(…, catalogo_conceptos(nombre))` and both renderers print the concept name under the motive in the same cell; `motivo` is untouched (`escapeHtml(motivo)` still first) and `null` renders no concept rather than an invented one. The two surfaces were NOT rendered in a browser here (no live session/DB); `npx tsc --noEmit` is clean over the new embed types.
- [ ] 1.6 **Guided backfill** (design.md D4): keyword mapping over existing `motivo` values, producing a review list; apply only after the operator approves or corrects each proposal.
  - Evidence: the approved list, and the count of rows left null on purpose.

- [ ] 1.7 **Filter movements by concept** — the spec requirement "Movements are filterable by concept" is only HALF delivered: the concept is stored and displayed, but there is no operator-facing control that filters a list by it, and the app has no movement-listing surface at all. Decide and implement one of: a concept filter on the pago form's debt table (cheap, one member's cargos), or the filter inside E2's reporting surface, which groups by concept anyway. Do not mark that requirement satisfied before one of them exists.
  - Evidence: pending — no filter control exists anywhere.
- [ ] 1.8 **Concept deactivation from the UI** — "deactivated, never deleted" is already enforced at the database (the `concepto_id` FKs are `ON DELETE NO ACTION`, so Postgres refuses to delete a concept in use) and the selector excludes inactive concepts, but `activo` can only be toggled by SQL today. Add the control to the same panel that creates a concept.
  - Evidence: pending — `activo` is SQL-only.

## 2. Módulo de ajustes (E2)

- [ ] 2.1 **`phase11_registro_ajustes.sql`** (+ `_down`): the ledger (member, optional cargo, type, amount, concept, counterpart, observations, author and name snapshot), `revoke all … from anon`, an `is_admin()` policy.
  - Evidence: read-back of the table, its policy, and the anon grants.
- [ ] 2.2 **`src/lib/ajustes.ts`** — pure, tested first: apply an amount against a targeted cargo or FIFO, never exceeding `pendingCents`, returning per-cargo results plus the remainder.
  - Evidence: RED then GREEN; cases for exact, partial, over-amount, empty cargo list, and a targeted cargo.
- [ ] 2.3 **`src/features/ajustes/repo.ts`** — the single writer: one transaction, cargo updates plus one `registro_ajustes` row; never touches `registro_pagos`.
  - Evidence: a test asserting the writer inserts no `registro_pagos` row and leaves `computeCaja`'s inputs unchanged.
- [ ] 2.4 **Reassignment (cesión)** as paired effects in one transaction, with the counterpart recorded (design.md D5).
  - Evidence: after a reassignment, the club's total pending equals the previous total and the arca is unchanged.
- [ ] 2.5 **Capture module** wired into the nav: forgiveness, reassignment, direct payment to a third party, and reversal of a prior adjustment.
  - Evidence: browser check of each operation; the member's history reflects each one.
- [ ] 2.6 **Reversal** (`reversa`) restores the exact prior cargo values from the original adjustment and records the reason (design.md D7).
  - Evidence: the reversal restores the pre-adjustment figures to the cent; no row is deleted.

## 3. Guardia, visibilidad y cierre

- [ ] 3.1 **"Naturaleza del cobro"** on the pago form: required; "Ajuste sin efectivo" routes to the adjustments module and inserts no pago (design.md D8).
  - Evidence: browser check; no `registro_pagos` row is created by the third option.
- [ ] 3.2 **"Ajustes otorgados" card** on the Arca page, visually separate from the balance and labelled as not part of it, totalled by concept.
  - Evidence: the card's total changes when an adjustment is recorded and the arca does not.
- [ ] 3.3 **"Net position" indicator** = Arca (disponible) + Por cobrar, documented as the figure that makes a forgiveness visible (design.md D6).
  - Evidence: a forgiveness lowers the net position by exactly the forgiven amount while the arca is unchanged.
- [ ] 3.4 **Update `HANDOFF.md`** and the spec deltas; confirm the generated-`.sql` and `.js` extension conventions still hold for any new `api/*.ts` import if one is added.
  - Evidence: `vitest run` green, `tsc --noEmit` clean, `npm run build` + postbuild guard clean.

## 4. Decisiones pendientes del operador (no bloquean 1 y 2)

- [ ] 4.1 **Ex-member collection**: today a retired member with a balance is excluded from "Por cobrar", the public ranking, and the pago selector. Decide between: reactivating temporarily to collect, an admin-only "Por cobrar — ex miembros" line, or keeping the member active until settled. See `reparacion-rodada-san-luis/design.md` D8.
  - Evidence: the operator's chosen option recorded verbatim.
- [ ] 4.2 **Member portal**: whether the member-facing view should show the *concept* while still excluding the operator's prose.
  - Evidence: a decision, or an explicit "leave as is".

## Manual / human-driven checks

- The selector and the module are browser behaviours: they need a real session, not a unit test (the project's established pattern for UI verification).
- The live SQL of 1.1 and 2.1 needs the operator's explicit sign-off and a read-back after applying, per the project's own gate.
