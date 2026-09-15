# Caja Specification

## Purpose

Defines the cash-on-hand ("caja") ledger: a stored opening amount (`configuracion_caja`), disbursement records (`registro_egresos`), and a derived balance computed on read from ledger rows. Negative balances are allowed. The public surface exposes only the aggregate amount.

## ADDED Requirements

### Requirement: Derived Balance

The system MUST compute caja on read as `caja = apertura + Σ(registro_pagos.monto_pagado) − Σ(registro_egresos.monto)` via a pure function. It MUST NOT persist any mutable running balance.

#### Scenario: Balance derived from ledger rows

- GIVEN an opening amount, N pago rows, and M egreso rows
- WHEN caja is requested
- THEN the returned amount equals `apertura + Σ(monto_pagado) − Σ(monto)`
- AND no stored running-balance column was read or written

### Requirement: Opening Amount Singleton

The system MUST store the opening amount once in a `configuracion_caja` singleton with `id = 1`, admin-writable, mirroring `configuracion_bancaria`.

#### Scenario: Admin stores the opening amount

- GIVEN an authenticated admin
- WHEN the admin writes the opening amount
- THEN it persists in `configuracion_caja` at `id = 1`
- AND a subsequent write updates that row rather than inserting a new one

### Requirement: Egreso Recording Decreases Caja

A club disbursement MUST be recorded as a new `registro_egresos` row and MUST decrease the derived caja.

#### Scenario: Recording a disbursement

- GIVEN a derived caja balance
- WHEN an admin records an egreso with a `monto`
- THEN one `registro_egresos` row is inserted
- AND the derived caja decreases by that `monto`

### Requirement: Abono Increases Caja

`aplicarPago` MUST be the only cash-in event. It MUST insert exactly one `registro_pagos` row carrying the FULL `monto_pagado`, even when FIFO leaves `unappliedCents`. The full amount MUST increase caja.

#### Scenario: Partial application still credits full cash

- GIVEN a payment whose FIFO allocation leaves `unappliedCents > 0`
- WHEN `aplicarPago` processes it
- THEN exactly one `registro_pagos` row carries the full `monto_pagado`
- AND caja increases by the full amount, not by the applied remainder

### Requirement: Support Records Do Not Move Caja

`saveApoyo` creates a receivable and MUST NOT increase or decrease caja.

#### Scenario: Recording a support

- GIVEN a support recorded via `saveApoyo`
- WHEN caja is derived
- THEN `registro_apoyos` rows contribute nothing to the balance
- AND caja is unchanged by the support

### Requirement: No Double-Counting

No ledger row MAY be summed more than once. The derivation MUST sum each `registro_pagos` and `registro_egresos` row exactly once.

#### Scenario: Each row contributes exactly once

- GIVEN a set of pago and egreso rows
- WHEN caja is derived
- THEN each row's amount is included exactly once
- AND no row is summed twice

### Requirement: Negative Caja Is Allowed

Negative caja MUST be allowed and MUST be displayed clearly and unblocked; it MUST NOT be hidden, clamped, or blocked at the UI or DB level.

#### Scenario: Egresos exceed cash-in

- GIVEN egresos and pagos such that the derived balance is negative
- WHEN caja is displayed
- THEN the negative amount is shown as such
- AND no error or clamp prevents its display

### Requirement: Public Surface Exposes Only Aggregate Caja

The public surface MUST expose only the aggregate caja amount — never per-movement egreso detail or operator identity. `api/debt-view.ts` MUST keep explicit column lists and MUST NOT use `select('*')`.

#### Scenario: Public response contains aggregate only

- GIVEN a public no-login request to the debt view
- WHEN the response is built
- THEN it includes the aggregate `cajaCents` field (integer cents)
- AND it includes no egreso rows and no operator identity
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
