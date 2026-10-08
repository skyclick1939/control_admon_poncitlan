# Proposal: Ajustes de adeudo y clasificación de conceptos

> **Depends on `reparacion-rodada-san-luis` being archived first.** Both changes touch the `caja` capability; archiving them in order keeps the deltas non-overlapping.

## Intent

The application can reduce a member's debt through exactly one action: `aplicarPago`, which is also the arca's cash-in event. Every reduction that is *not* cash therefore has to lie about cash. The operator has been doing exactly that for over a year — with rows whose own text says so ("no se fue a caja", "se le descuent[a]", "Cargos cubiertos por fondos del club", "Se pagó de la caja, se agrego solo para que quede registrado"). Two measured shapes result: a forgiveness that silently cancels old debt, and a disbursement recorded as an inflow, which inflates the balance by twice its amount.

Separately, every movement is classified only by free prose in `motivo`, so nothing can be found, filtered, or totalled by purpose.

This change adds the two missing pieces: **an adjustments ledger** (a way to reduce or move a debt without pretending it was cash) and **a concept catalog with a searchable selector** (a way to say what a movement was for). It is deliberately two capabilities in one change because the adjustment form needs the catalog to say *what kind* of adjustment it is — the catalog must land first.

## Scope

### In Scope
- `catalogo_conceptos` (name, nature, active flag) + `concepto_id` on `registro_apoyos` and `registro_egresos`.
- A required, searchable concept selector on both capture surfaces, with in-line creation of a new concept, so adding one never needs a migration.
- A nature rule that makes a misclassification impossible: non-recoverable concepts are not selectable on the modality that creates debts, and recoverable concepts are not selectable on the modality that creates none.
- A guided backfill of the existing rows, reviewed by the operator.
- `registro_ajustes`: forgiveness, reassignment between members, and direct payment to a third party; a single writer; the arca formula untouched.
- An audited reversal path, so no future correction needs raw SQL.
- A required "nature of the collection" selector on the pago form that routes a cashless reduction to the adjustments module.
- An "Ajustes otorgados" report and a "Net position" indicator, both explicitly outside the arca formula.

### Out of Scope
- **The audit of the existing non-cash `registro_pagos` rows.** Deferred by the operator; the repair of the 2026-10-04 rows is `reparacion-rodada-san-luis`.
- The member portal. It deliberately excludes `motivo`; whether it should show the *concept* instead is a separate decision, and this change does not touch that surface.
- Year filtering and any period reporting model.
- Framework, routing, or authentication changes.
- Every table outside this app's own tables in the shared `arca` project.

## Capabilities

### New Capabilities
- `catalogo-conceptos`: the catalog, its nature rule, the searchable selector, in-line creation, and the backfill.
- `ajustes-adeudo`: the adjustments ledger, its single writer, the FIFO-or-targeted application, the paired reassignment, and the reversal.

### Modified Capabilities
- `caja`: the breakdown gains a card that is explicitly excluded from the balance, and the page gains a net-position indicator.

## Approach

The adjustment must reuse the exact allocation semantics that already exist (`allocateFifo` in `src/lib/money.ts`, oldest-first, cents only) so that a forgiven cent behaves like a paid cent, and the existing surface-level debt consistency holds. Two deliberate choices follow from that:

- **The arca formula does not change.** `computeCaja` reads three ledgers; the adjustments ledger is a fourth and it is not read by it. This keeps the existing invariant — each row contributes exactly once, nothing is persisted — and gives the operator exactly what was asked for: a discount that adds nothing to the arca. The cost is that a forgiveness is invisible in the balance, which is why the report card and the net-position indicator are part of the change rather than extras.
- **A reassignment is not a payment.** Ceding an obligation moves it between members and leaves both the total receivable and the arca untouched. The alternative — recording it as two payments — is the bug this change exists to eliminate, so the schema must make the paired form the easy one.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/sql/phase10_catalogo_conceptos.sql` (+ `_down`) | New | Catalog table, RLS, seed, `concepto_id` columns, backfill |
| `supabase/sql/phase11_registro_ajustes.sql` (+ `_down`) | New | Adjustments ledger, RLS, single-writer rules |
| `src/lib/conceptos.ts` | New | Pure filtering/matching for the selector (TDD) |
| `src/lib/ajustes.ts` | New | Pure allocation for an adjustment (TDD), mirroring `allocateFifo` |
| `src/features/ajustes/*` | New | Capture module: forgiveness, reassignment, reversal |
| `src/features/apoyos/*`, `src/features/caja/*`, `src/features/pagos/*` | Modified | Selector, report card, nature guard |
| `src/lib/types.ts`, `index.html` | Modified | Types and the new nav surface |
| `openspec/specs/caja/spec.md` etc. | Modified | Merged on archive |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~950–1100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 catalog (SQL + lib + selector) → PR2 adjustments (SQL + lib + module + report) → PR3 the pago-form guard and the net-position indicator |
| Delivery strategy | auto-chain |

Decision needed before apply: Yes — the live SQL needs the operator's explicit sign-off
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
