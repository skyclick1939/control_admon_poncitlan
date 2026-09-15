# Arca Specification

## Purpose

Defines the club's liquid-position ledger ("Arca"): a stored opening amount (`configuracion_caja`), member-payment inflows (`registro_pagos`), support disbursements (`registro_apoyos`), and expense disbursements (`registro_egresos`). The derived balance ("Arca (disponible)") is computed on read from ledger rows; the outstanding receivable ("Por cobrar") is shown alongside it as context. Negative balances are allowed. The public surface exposes only the net aggregate amount.

The operator unifies physical cash and bank transfers in ONE pot (no split — this was explicitly decided), so the accounting term "Caja" (which means physical cash only) would be technically wrong. "Arca" is the operator's own name for this pot, and "(disponible)" supplies the precise meaning of the derived balance.

## ADDED Requirements

### Requirement: Derived Arca Balance

The system MUST compute the liquid balance on read as `Arca (disponible) = Apertura + Σ(registro_pagos.monto_pagado) − Σ(registro_apoyos.monto_total) − Σ(registro_egresos.monto)` via a pure function. It MUST NOT persist any mutable running balance. A support disbursement (`registro_apoyos.monto_total`) SUBTRACTS because the cash leaves the club; the members' repayments come back through `registro_pagos`, which still ADDS. Over a fully repaid apoyo the net effect is zero; an unrepaid apoyo stays negative.

#### Scenario: Balance derived from ledger rows

- GIVEN an opening amount, N pago rows, P apoyo rows, and M egreso rows
- WHEN Arca is requested
- THEN the returned amount equals `apertura + Σ(monto_pagado) − Σ(monto_total) − Σ(monto)`
- AND no stored running-balance column was read or written

#### Scenario: Fully repaid apoyo nets to zero

- GIVEN one apoyo of `monto_total` 1000 whose cargos are fully repaid via `registro_pagos`
- WHEN Arca is derived
- THEN the apoyo subtracts 1000 and the repayments add 1000
- AND the net contribution to Arca is zero

#### Scenario: Unrepaid apoyo stays negative

- GIVEN one apoyo of `monto_total` 1000 with no repayments yet
- WHEN Arca is derived
- THEN the apoyo subtracts 1000
- AND Arca is reduced by 1000 until the members repay it

### Requirement: Opening Amount Singleton

The system MUST store the opening amount once in a `configuracion_caja` singleton with `id = 1`, admin-writable, mirroring `configuracion_bancaria`.

#### Scenario: Admin stores the opening amount

- GIVEN an authenticated admin
- WHEN the admin writes the opening amount
- THEN it persists in `configuracion_caja` at `id = 1`
- AND a subsequent write updates that row rather than inserting a new one

### Requirement: Egreso Recording Decreases Arca

A club expense disbursement MUST be recorded as a new `registro_egresos` row and MUST decrease the derived Arca.

#### Scenario: Recording a disbursement

- GIVEN a derived Arca balance
- WHEN an admin records an egreso with a `monto`
- THEN one `registro_egresos` row is inserted
- AND the derived Arca decreases by that `monto`

### Requirement: Support Disbursement Decreases Arca

`saveApoyo` MUST decrease Arca. Handing out a support (apoyo) is cash leaving the club, so each `registro_apoyos.monto_total` SUBTRACTS from Arca. The members' later repayments enter through `registro_pagos` (which ADDS); these are two separate movements and MUST NOT be conflated.

(Previously: `saveApoyo` creates a receivable and MUST NOT increase or decrease caja.)

#### Scenario: Recording a support

- GIVEN a support recorded via `saveApoyo` with `monto_total`
- WHEN Arca is derived
- THEN `registro_apoyos.monto_total` SUBTRACTS from the balance
- AND Arca decreases by the support's `monto_total`

### Requirement: Abono Increases Arca

`aplicarPago` MUST be the only cash-in event. It MUST insert exactly one `registro_pagos` row carrying the FULL `monto_pagado`, even when FIFO leaves `unappliedCents`. The full amount MUST increase Arca.

#### Scenario: Partial application still credits full cash

- GIVEN a payment whose FIFO allocation leaves `unappliedCents > 0`
- WHEN `aplicarPago` processes it
- THEN exactly one `registro_pagos` row carries the full `monto_pagado`
- AND Arca increases by the full amount, not by the applied remainder

### Requirement: Por Cobrar (Receivable) Display

The module MUST display the outstanding receivable "Por cobrar" alongside "Arca (disponible)": the sum `Σ(cargos.monto_pendiente)`, equal to the existing `totalPendienteCents` computed by `src/lib/debt-view.ts` (`aggregateDebtByMember`). It is contextual only — it MUST NOT be added into the Arca formula.

#### Scenario: Receivable shown alongside liquid balance

- GIVEN a set of pending cargos
- WHEN the Arca module renders
- THEN "Por cobrar" equals `Σ(cargos.monto_pendiente)`
- AND "Arca (disponible)" is computed independently, without the "Por cobrar" term

### Requirement: Internal Members Excluded from Receivables

A member whose status is `'interno'` is an internal bookkeeping construct (for example the pseudo-member used to book arca disbursements that generate no cargos) and MUST NOT be counted as debt. The system MUST exclude internal members from the receivable total and from the debtor list shown on both the caja module ("Por cobrar") and the public debt view, so an internal member's cargos never inflate what the operator sees as owed. The operator MUST still be able to select an internal member when recording an individual disbursement.

#### Scenario: Internal member does not inflate the receivable

- GIVEN an internal member holding cargos
- WHEN "Por cobrar" or the public debt view is rendered
- THEN the internal member's cargos are excluded from the receivable total
- AND no debtor row is shown for the internal member

#### Scenario: Internal member stays selectable for individual disbursements

- GIVEN the operator books an arca disbursement that generates no cargos
- WHEN they select the counterpart for that individual disbursement
- THEN the internal member remains selectable
- AND the cargo it creates is hidden from the debtor surfaces by the exclusion rule

### Requirement: Breakdown Cards

The Arca breakdown MUST present the terms: `Apertura` · `Pagos recibidos` · `Apoyos entregados` · `Egresos` · `Arca (disponible)` · `Por cobrar`.

#### Scenario: Breakdown lists all six cards

- GIVEN a derived Arca breakdown
- WHEN the module renders
- THEN the six cards are shown
- AND `Arca (disponible)` equals `Apertura + Pagos recibidos − Apoyos entregados − Egresos`

### Requirement: Pago_sin_cargo Disbursement Convention

When the operator disburses a support funded from the Arca WITHOUT creating cargos (because the Arca has enough funds and no debt should accumulate), the disbursement MUST be recorded as a `registro_egresos` row (money that leaves and does not return), with the `motivo` naming the beneficiary (e.g. `motivo = "Apoyo sin cargo"`). It MUST NOT be recorded as a `registro_pagos` row, because `registro_pagos` is INFLOW and would ADD to the Arca instead of subtracting — a sign inversion. Because no cargos are created, "Por cobrar" is correctly unaffected and never becomes a phantom debt.

#### Scenario: Sin-cargo support recorded as egreso

- GIVEN the operator disburses a support without creating cargos
- WHEN the disbursement is recorded
- THEN one `registro_egresos` row is inserted with `motivo = "Apoyo sin cargo"`
- AND Arca decreases by the disbursed amount
- AND "Por cobrar" is unchanged

#### Scenario: Sin-cargo support must not be recorded as a pago

- GIVEN the operator's vocabulary calls this disbursement a "pago"
- WHEN they record it
- THEN it MUST NOT be written as a `registro_pagos` row
- AND Arca is not increased (no sign inversion)

### Requirement: No Double-Counting

No ledger row MAY be summed more than once. The derivation MUST sum each `registro_pagos`, `registro_apoyos`, and `registro_egresos` row exactly once.

#### Scenario: Each row contributes exactly once

- GIVEN a set of pago, apoyo, and egreso rows
- WHEN Arca is derived
- THEN each row's amount is included exactly once
- AND no row is summed twice

### Requirement: Negative Arca Is Allowed

Negative Arca MUST be allowed and MUST be displayed clearly and unblocked; it MUST NOT be hidden, clamped, or blocked at the UI or DB level.

#### Scenario: Disbursements exceed cash-in

- GIVEN egresos and apoyos such that the derived balance is negative
- WHEN Arca is displayed
- THEN the negative amount is shown as such
- AND no error or clamp prevents its display

### Requirement: Public Surface Exposes Only Aggregate Arca

The public surface MUST expose only the net aggregate Arca amount — never per-movement egreso/apoyo/pago detail, never the breakdown cards, never the "Por cobrar" figure, and never operator identity. `api/debt-view.ts` MUST keep explicit column lists and MUST NOT use `select('*')`.

#### Scenario: Public response contains aggregate only

- GIVEN a public no-login request to the debt view
- WHEN the response is built
- THEN it includes the aggregate `cajaCents` field (integer cents)
- AND it includes no egreso/apoyo/pago rows, no breakdown, no "Por cobrar", and no operator identity
- AND the query uses explicit column lists only

### Requirement: Migration Safety and Reversibility

`registro_egresos` column types MUST mirror the live `registro_pagos` schema read via `information_schema`. A `_down.sql` MUST drop `registro_egresos` and `configuracion_caja` and MUST NOT touch any existing table.

#### Scenario: Reversible additive migration

- GIVEN the live `registro_pagos` schema
- WHEN the migration is authored
- THEN `registro_egresos` column types match `registro_pagos`
- AND the down migration drops only the two new tables

### Requirement: Row-Level Security

Both new tables MUST enable RLS, MUST `revoke all … from anon`, and MUST use the existing `public.is_admin()` policy pattern.

#### Scenario: Anonymous access denied

- GIVEN the `anon` role
- WHEN it queries either new table
- THEN it receives no rows and has no direct grants

#### Scenario: Admin access granted via is_admin

- GIVEN an authenticated admin satisfying `public.is_admin()`
- WHEN they query either new table
- THEN access is granted through the existing policy pattern
