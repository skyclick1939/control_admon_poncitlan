# Arca Specification

## Purpose

Defines the club's liquid-position ledger ("Arca"): a stored opening amount (`configuracion_caja`), member-payment inflows (`registro_pagos`), support disbursements (`registro_apoyos`), and non-recoverable disbursements (`registro_egresos`). The derived balance ("Arca (disponible)") is computed on read from ledger rows; the outstanding receivable ("Por cobrar") is shown alongside it as context. Negative balances are allowed. The public surface exposes only the net aggregate amount.

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

- GIVEN one apoyo whose `monto_total` is fully repaid through `registro_pagos`
- WHEN Arca is derived
- THEN the apoyo subtracts its `monto_total` and the repayments add the same total
- AND the net contribution to Arca is zero

#### Scenario: Unrepaid apoyo stays negative

- GIVEN one apoyo with no repayments yet
- WHEN Arca is derived
- THEN the apoyo subtracts its full `monto_total`
- AND Arca is reduced by that `monto_total` until the members repay it

### Requirement: Opening Amount Singleton

The system MUST store the opening amount once in a `configuracion_caja` singleton with `id = 1`, admin-writable, mirroring `configuracion_bancaria`.

#### Scenario: Admin stores the opening amount

- GIVEN an authenticated admin
- WHEN the admin writes the opening amount
- THEN it persists in `configuracion_caja` at `id = 1`
- AND a subsequent write updates that row rather than inserting a new one

### Requirement: Arca Page Is Query and Config Only

The Arca page MUST be a query/config surface: it displays the opening-amount control and the derived breakdown, and it captures NOTHING. The duplicate "Registrar Egreso" form MUST NOT exist. Every disbursement leaving the Arca MUST be captured through "Solicitud de Apoyos".

#### Scenario: Arca page captures nothing

- GIVEN the Arca page
- WHEN an admin needs to record a disbursement
- THEN the page offers no capture form
- AND the only capture surface is "Solicitud de Apoyos"

### Requirement: Non-Recoverable Disbursements Are Stored in `registro_egresos`

A non-recoverable disbursement MUST be stored as a `registro_egresos` row and MUST decrease the derived Arca. `registro_egresos` is the storage for the non-recoverable modality, and `saveEgreso` is its ONLY writer. `saveEgreso` has exactly one caller — the "Sin cargos" modality of the Apoyos flow — so every `registro_egresos` row is a non-recoverable disbursement by construction. Neither the table nor `saveEgreso` MAY be described as removable.

#### Scenario: Recording a non-recoverable disbursement

- GIVEN the Apoyos "Sin cargos" modality
- WHEN an admin records a non-recoverable disbursement with a `monto`
- THEN exactly one `registro_egresos` row is inserted
- AND the derived Arca decreases by that `monto`

#### Scenario: `registro_egresos` has a single writer

- GIVEN any `registro_egresos` row
- WHEN its origin is traced
- THEN it was written by `saveEgreso`
- AND `saveEgreso`'s only caller is the Apoyos "Sin cargos" modality

### Requirement: Support Disbursement Decreases Arca

Handing out a support (apoyo) is cash leaving the club, so each `registro_apoyos.monto_total` SUBTRACTS from Arca. The members' later repayments enter through `registro_pagos` (which ADDS); these are two separate movements and MUST NOT be conflated.

#### Scenario: Recording a support

- GIVEN a support recorded with `monto_total`
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

The module MUST display the outstanding receivable "Por cobrar" alongside "Arca (disponible)": the sum of pending cargos, equal to the existing `totalPendienteCents` computed by `src/lib/debt-view.ts` (`aggregateDebtByMember`). It is contextual only — it MUST NOT be added into the Arca formula.

#### Scenario: Receivable shown alongside liquid balance

- GIVEN a set of pending cargos
- WHEN the Arca module renders
- THEN "Por cobrar" equals the sum of pending cargos
- AND "Arca (disponible)" is computed independently, without the "Por cobrar" term

### Requirement: Internal Members Excluded from Debtor Surfaces

A member whose status is `'interno'` is an internal bookkeeping construct (for example the pseudo-member used to book arca disbursements) and MUST NOT be counted as debt. The system MUST exclude internal members from every debtor surface — the admin ranking, the "Miembros con Deuda" KPI and its percentage denominator, the public ranking, and "Por cobrar" — and from group divisions, so an internal member's pending cargos never inflate what the operator sees as owed. An internal member MUST remain selectable for INDIVIDUAL disbursements, and is the usual beneficiary of a non-recoverable expense.

#### Scenario: Internal member does not inflate the receivable

- GIVEN an internal member holding cargos
- WHEN "Por cobrar", the admin ranking, or the public ranking is rendered
- THEN the internal member's cargos are excluded from the receivable total
- AND no debtor row is shown for the internal member

#### Scenario: Internal member is excluded from group divisions

- GIVEN a group disbursement (`TODOS` or `FULLPARCH`)
- WHEN the members to be charged are selected
- THEN an internal member is never included in the division

#### Scenario: Internal member stays selectable for individual disbursements

- GIVEN the operator records an INDIVIDUAL disbursement
- WHEN they choose the members to charge
- THEN an internal member remains selectable
- AND any cargo the disbursement creates is hidden from every debtor surface by the exclusion rule

#### Scenario: Internal member as beneficiary of a non-recoverable expense

- GIVEN the operator records a non-recoverable disbursement
- WHEN they select a beneficiary
- THEN an internal member is selectable as that beneficiary

### Requirement: Breakdown Cards

The Arca breakdown MUST present the terms: `Apertura` · `Pagos recibidos` · `Apoyos entregados (recuperables)` · `Egresos (no recuperables)` · `Arca (disponible)` · `Por cobrar`. The two outflow cards — `Apoyos entregados (recuperables)` and `Egresos (no recuperables)` — MUST be grouped under a single heading "Salidas del arca" and MUST NEVER be merged: an apoyo is money lent (it returns through `registro_pagos`), an egreso is money spent (it does not return), and merging them would hide that difference.

#### Scenario: Breakdown lists all six cards

- GIVEN a derived Arca breakdown
- WHEN the module renders
- THEN the six cards are shown
- AND `Arca (disponible)` equals `Apertura + Pagos recibidos − Apoyos entregados − Egresos`

#### Scenario: Outflow cards grouped and never merged

- GIVEN a derived Arca breakdown
- WHEN the module renders
- THEN `Apoyos entregados (recuperables)` and `Egresos (no recuperables)` are shown under one "Salidas del arca" heading
- AND each card's label states whether the money returns ("recuperables") or not ("no recuperables")
- AND no single card combines the two outflows

### Requirement: Egreso Beneficiary Traceability

An egreso MAY be traced to a beneficiary. The capture flow MUST offer a beneficiary selector that includes internal members and defaults to none; when a beneficiary is selected, the system MUST record both the member reference and a copy of the member's name so the name survives if the member is later deleted.

#### Scenario: Recording an egreso with a beneficiary

- GIVEN the beneficiary selector, populated with active members (internal members included)
- WHEN an admin selects a beneficiary and records the disbursement
- THEN the egreso stores the member reference and a copy of the beneficiary's name

#### Scenario: Beneficiary name survives member deletion

- GIVEN an egreso whose beneficiary member is later deleted
- WHEN the egreso is displayed
- THEN the beneficiary's name is still shown
- AND the member reference resolves to none without losing the name

#### Scenario: No beneficiary required

- GIVEN the capture flow
- WHEN an admin records a disbursement without selecting a beneficiary
- THEN the egreso is recorded with no beneficiary
- AND the selector defaults to none on a fresh form

### Requirement: Single Capture Flow with Three Modalities

The operator's capture act MUST be a single flow with three modalities: group, individual, and charged directly to the Arca without splitting or recovering. The Apoyos flow MUST offer a third selector option labelled "Sin cargos — absorbido por el Arca (no recuperable)". When that option is selected, the system MUST NOT create a `registro_apoyos` row and MUST NOT create any `cargos`; it MUST instead write exactly ONE `registro_egresos` row, with an OPTIONAL beneficiary. Because no cargos are created, nothing becomes debt and nothing can double-count, and the operator never has to choose a different screen to record an expense.

Because `registro_pagos` is an INFLOW, a non-recoverable disbursement MUST NOT be recorded as a `registro_pagos` row: doing so would ADD to the Arca instead of subtracting — a sign inversion.

#### Scenario: Third modality writes one egreso, no apoyo and no cargos

- GIVEN the Apoyos capture flow
- WHEN the operator selects "Sin cargos — absorbido por el Arca (no recuperable)"
- THEN no `registro_apoyos` row is created
- AND no `cargos` are created
- AND exactly one `registro_egresos` row is written

#### Scenario: General expense has no beneficiary

- GIVEN the operator records a general expense through the sin-cargos modality
- WHEN no member is the counterpart
- THEN the egreso is recorded with no beneficiary

#### Scenario: Sin-cargos disbursement to a member carries the beneficiary

- GIVEN the operator records a sin-cargos disbursement to a named member
- WHEN they select the member as beneficiary
- THEN the egreso records that beneficiary

#### Scenario: Operator records every disbursement from one flow

- GIVEN the operator needs to record a disbursement, whether recoverable or not
- WHEN they open the capture flow
- THEN all three modalities are available from that same flow
- AND the operator does not need a different screen to record an expense

#### Scenario: A non-recoverable disbursement is never an inflow

- GIVEN the operator's vocabulary may call this disbursement a "pago"
- WHEN they record it
- THEN it is NOT written as a `registro_pagos` row
- AND Arca is not increased

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

The public surface MUST expose only the net aggregate Arca amount — never per-movement egreso/apoyo/pago detail, never the breakdown cards, and never operator identity. `api/debt-view.ts` MUST keep explicit column lists and MUST NOT use `select('*')`. The pre-existing `totalPendienteCents` debt metric of the debt view is not an Arca term and is unaffected by this rule.

#### Scenario: Public response contains aggregate only

- GIVEN a public no-login request to the debt view
- WHEN the response is built
- THEN it includes the aggregate `cajaCents` field (integer cents)
- AND it includes no egreso/apoyo/pago rows, no breakdown, and no operator identity
- AND the query uses explicit column lists only

### Requirement: Debt Consistency Across Surfaces

The receivable figure shown anywhere MUST be identical for the same member. Every surface that displays a member's debt — the admin "Ranking de Deudores", the public ranking, and "Por cobrar" — MUST derive from the SAME aggregation (`aggregateDebtByMember`, over integer cents from `estado='pendiente'` rows), so that no two screens show different per-member figures. The acceptance criterion MUST be exact numeric equality.

#### Scenario: Identical per-member receivable everywhere

- GIVEN the same member appears on the admin ranking, the public ranking, and "Por cobrar"
- WHEN each surface renders
- THEN the member's receivable figure is numerically identical on every surface

#### Scenario: No cents-level divergence from a separate reduce

- GIVEN a member whose pending balance spans cargos
- WHEN the admin ranking, the public ranking, and "Por cobrar" all render that member
- THEN each surface shows the exact same figure
- AND no surface uses its own float reduction

### Requirement: Migration Safety and Reversibility

The change's migrations MUST be additive and reversible: `phase5_egresos` (new tables), `phase6_miembros_status_interno` (widened CHECK constraint), `phase7_egresos_beneficiario` (two new columns), and `phase8_reclasificar_gasto_sin_cargar` (the only data migration). `registro_egresos` column types MUST mirror the live sibling schema read via `information_schema`. Every migration MUST carry a `_down.sql`; a `_down.sql` MUST NOT touch any table other than the one its migration changed.

#### Scenario: Reversible additive migrations

- GIVEN the live sibling schema
- WHEN the migrations are authored
- THEN `registro_egresos` column types match the siblings
- AND each migration has a `_down.sql` that reverses only its own change

#### Scenario: The data migration reverses cleanly

- GIVEN the phase 8 reclassification
- WHEN its `_down.sql` runs
- THEN the reclassified row returns to its prior ledger and the phantom cargo is restored
- AND no other row is modified

### Requirement: Row-Level Security

Both new tables (`registro_egresos`, `configuracion_caja`) MUST enable RLS, MUST `revoke all … from anon`, and MUST use the existing `public.is_admin()` policy pattern.

#### Scenario: Anonymous access denied

- GIVEN the `anon` role
- WHEN it queries either new table
- THEN it receives no rows and has no direct grants

#### Scenario: Admin access granted via is_admin

- GIVEN an authenticated admin satisfying `public.is_admin()`
- WHEN they query either new table
- THEN access is granted through the existing policy pattern
