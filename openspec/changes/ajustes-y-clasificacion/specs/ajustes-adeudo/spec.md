# Delta: ajustes-adeudo

## ADDED Requirements

### Requirement: Adjustments Ledger

The system MUST store every debt reduction that is not a cash inflow in a dedicated `registro_ajustes` ledger. Each row MUST record the member, an optional target cargo, the adjustment type, the amount, an optional concept, an optional counterpart member, observations, the recording administrator, and a name snapshot that survives account deletion. The ledger MUST have exactly one writer, and that writer MUST NOT insert a `registro_pagos` row.

#### Scenario: A forgiveness is recorded in the adjustments ledger

- GIVEN a member with a pending debt
- WHEN an administrator records a forgiveness
- THEN exactly one `registro_ajustes` row is inserted
- AND no `registro_pagos` row is inserted

#### Scenario: The ledger has a single writer

- GIVEN any `registro_ajustes` row
- WHEN its origin is traced
- THEN it was written by the adjustments writer
- AND no other code path inserts into that table

### Requirement: An Adjustment Is Arca-Neutral

Recording or reversing an adjustment MUST NOT change the derived arca, because no cash moves. The arca derivation MUST NOT read the adjustments ledger.

#### Scenario: The balance is unchanged by a forgiveness

- GIVEN a derived arca before an adjustment
- WHEN any adjustment is recorded
- THEN the derived arca is identical afterwards
- AND the member's pending debt has decreased by the adjustment amount

### Requirement: Reassignment Leaves the Totals Intact

Ceding an obligation from one member to another MUST be recorded as paired effects: the ceding member's pending debt decreases and the receiving member's increases by the same amount. The club's total receivable and the derived arca MUST both be unchanged.

#### Scenario: A reassignment moves a debt without changing totals

- GIVEN a club with a total receivable
- WHEN member A's obligation is ceded to member B
- THEN A's pending debt is lower and B's is higher by the same amount
- AND the total receivable is unchanged
- AND the derived arca is unchanged

#### Scenario: A reassignment is never recorded as a payment

- GIVEN a cession between two members
- WHEN it is recorded
- THEN no `registro_pagos` row is created for either member

### Requirement: An Adjustment Never Exceeds the Pending Debt

An adjustment MUST NOT allocate more than the member's pending balance. When the requested amount exceeds what is pending, the system MUST apply only up to the pending amount and MUST report the remainder rather than storing a negative balance.

#### Scenario: An over-amount adjustment is capped and reported

- GIVEN a member with a pending balance smaller than the requested adjustment
- WHEN the adjustment is recorded
- THEN the applied amount equals the pending balance
- AND the remainder is reported to the operator
- AND no cargo carries a negative pending amount

### Requirement: Allocation Matches Payment Allocation

An adjustment MUST reduce cargos using the same allocation semantics as a payment: a targeted cargo when one is chosen, otherwise oldest-first, in integer cents, reconciling exactly. A forgiven cent MUST behave like a paid cent, so that per-member debt figures remain identical across every surface.

#### Scenario: Forgiveness follows the same order as payment

- GIVEN a member with several pending cargos
- WHEN a forgiveness is recorded without a target cargo
- THEN the oldest cargos are reduced first
- AND the per-member figure matches the same aggregation used by every other surface

#### Scenario: A targeted adjustment touches only its cargo

- GIVEN a member with several pending cargos
- WHEN a forgiveness targets one cargo
- THEN only that cargo is reduced
- AND the others are unchanged

### Requirement: Reversal Instead of Deletion

A recorded adjustment MUST NOT be deleted. A mistake MUST be corrected by a reversal that references the original, restores the cargo values it changed, and records the reason and the administrator. The reversal MUST be visible in the member's history alongside the original.

#### Scenario: A mistaken adjustment is reversed, not deleted

- GIVEN a recorded adjustment that was a mistake
- WHEN the administrator reverses it
- THEN the affected cargos return to their exact previous values
- AND the original row still exists
- AND the reversal is visible in the member's history

#### Scenario: A reversal restores the figures exactly

- GIVEN the member's pending figures before an adjustment
- WHEN the adjustment is reversed
- THEN the pending figures equal the pre-adjustment values exactly, to the cent

### Requirement: Adjustments Are Visible in the Member's History

Every adjustment MUST appear in the member's own payment history, distinguished from payments and carrying its type, amount, date, and concept, so that a member's record never shows a debt that changed without explanation.

#### Scenario: The history explains a reduced debt

- GIVEN a member whose debt was partly forgiven
- WHEN their history is displayed
- THEN the forgiveness is shown as an adjustment, distinct from a payment
- AND the amount and concept are shown
