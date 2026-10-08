# Delta: caja — cash-only ledger

## ADDED Requirements

### Requirement: The Ledger Records Cash Only

Every `registro_pagos` row MUST represent money that actually entered the arca. Enforcement at capture time is the "nature of the collection" guard owned by the sibling change `ajustes-y-clasificacion`; this change states the rule and does NOT detect non-cash rows automatically, which is exactly why the audit of the existing ones stays an open risk. A debt reduction that moves no money — a waiver, a forgiveness, a contribution made directly to a third party, or a reassignment between members — MUST NOT be recorded as a `registro_pagos` row, because that ledger is an inflow term of the derived arca. Such a reduction MUST be recorded in the adjustments ledger instead, which the arca formula MUST NOT read.

#### Scenario: A debt reduction without cash is not a pago

- GIVEN a member's debt is reduced and no money entered the arca
- WHEN an operator records the reduction
- THEN no `registro_pagos` row is inserted
- AND the derived arca does not change

#### Scenario: A non-cash row never contributes to the arca

- GIVEN a `registro_pagos` row whose `observaciones` state that no money was received
- WHEN the arca is derived
- THEN that row MUST NOT be counted as cash-in
- AND the balance MUST be derived only from rows that represent real inflows

<!-- "Direct reassignment is not cash" is deliberately NOT stated here. It is owned
     by the `ajustes-adeudo` delta of the sibling change `ajustes-y-clasificacion`,
     which is where the ledger that implements it lands. A requirement this change's
     code cannot satisfy would block archiving this one. -->

## MODIFIED Requirements

### Requirement: Abono Increases Arca

`aplicarPago` MUST be the only cash-in event. It MUST insert exactly one `registro_pagos` row carrying the FULL `monto_pagado`, even when FIFO leaves `unappliedCents`. The full amount MUST increase Arca. `aplicarPago` MUST be invoked only for money that actually entered the arca; a debt reduction without cash MUST use the adjustments ledger.

#### Scenario: Partial application still credits full cash

- GIVEN a payment whose FIFO allocation leaves `unappliedCents > 0`
- WHEN `aplicarPago` processes it
- THEN exactly one `registro_pagos` row carries the full `monto_pagado`
- AND Arca increases by the full amount, not by the applied remainder

#### Scenario: A forgiveness is not a cash-in event

- GIVEN a member's debt is forgiven in whole or in part
- WHEN the operator records the forgiveness
- THEN `aplicarPago` is not invoked
- AND Arca is not increased

### Requirement: Derived Arca Balance

The system MUST compute the liquid balance on read as `Arca (disponible) = Apertura + Σ(registro_pagos.monto_pagado) − Σ(registro_apoyos.monto_total) − Σ(registro_egresos.monto)` via a pure function. It MUST NOT persist any mutable running balance. The formula MUST NOT read the adjustments ledger, because an adjustment moves no cash. A support disbursement (`registro_apoyos.monto_total`) SUBTRACTS because the cash leaves the club; the members' repayments come back through `registro_pagos`, which still ADDS. Over a fully repaid apoyo the net effect is zero; an unrepaid apoyo stays negative.

#### Scenario: Balance derived from ledger rows

- GIVEN an opening amount, N pago rows, P apoyo rows, and M egreso rows
- WHEN Arca is requested
- THEN the returned amount equals `apertura + Σ(monto_pagado) − Σ(monto_total) − Σ(monto)`
- AND no stored running-balance column was read or written

#### Scenario: Adjustments never move the arca

- GIVEN any number of adjustments recorded against members' cargos
- WHEN Arca is requested
- THEN the returned amount is identical to the amount derived without those adjustments

#### Scenario: Fully repaid apoyo nets to zero

- GIVEN one apoyo whose `monto_total` is fully repaid through `registro_pagos`
- WHEN Arca is derived
- THEN the apoyo subtracts its `monto_total` and the repayments add the same total
- AND the net contribution to Arca is zero
