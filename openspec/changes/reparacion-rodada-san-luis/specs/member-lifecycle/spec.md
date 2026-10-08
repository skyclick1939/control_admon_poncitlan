# Delta: member-lifecycle — retirement and an unsettled balance

## ADDED Requirements

### Requirement: Retirement Preserves the Balance and the History

Retiring a member (`activo = false`) MUST preserve every financial row the member owns — `cargos`, `registro_pagos`, and any adjustment — and MUST remain reversible. A retired member MUST NOT lose their history, and reactivating them MUST restore them to every surface they left.

#### Scenario: Retiring a member keeps their ledger

- GIVEN a member with cargos and payments
- WHEN they are retired
- THEN every cargo and payment row is still present and unchanged
- AND reactivating them restores them to the apoyo candidate list and the pago selector

### Requirement: A Retired Member with a Balance Is Excluded from Debtor Surfaces

A retired member MUST be excluded from the debtor surfaces: the public ranking, the admin ranking, the "Miembros con Deuda" KPI and its denominator, and "Por cobrar". This exclusion MUST be stated wherever the retirement is presented to an operator, so that retiring a member with an unsettled balance is never mistaken for cancelling it.

#### Scenario: Retiring a member with a balance hides that balance from the receivable

- GIVEN a member with a pending balance
- WHEN they are retired
- THEN their pending balance is excluded from "Por cobrar" and from the public ranking
- AND the balance is still visible on the member's own history
- AND the operator is warned, at the point of retiring, that the receivable will no longer show it

#### Scenario: Reactivation restores the receivable

- GIVEN a retired member with a pending balance
- WHEN they are reactivated
- THEN their balance is included in "Por cobrar" and the rankings again
- AND the figure equals the figure shown on their own history
