# Money Math Specification

## Purpose

Defines exact-cent correctness for splitting an apoyo total across members and for allocating a payment across a member's pending cargos, replacing the current unrounded-float behavior.

## ADDED Requirements

### Requirement: Exact-Cent Apoyo Split

The system MUST split an apoyo total across N members using largest-remainder rounding, such that the per-member split amounts are whole cents and their sum equals the original total exactly, with no cent lost or gained.

#### Scenario: $100.00 split three ways sums to the exact total

- GIVEN an apoyo total of $100.00 and 3 members
- WHEN the total is split evenly across the 3 members
- THEN the resulting amounts are $33.34, $33.33, $33.33 (in any assignment order)
- AND the sum of the three amounts equals exactly $100.00

#### Scenario: Evenly divisible total splits with no remainder

- GIVEN an apoyo total of $90.00 and 3 members
- WHEN the total is split evenly across the 3 members
- THEN each member receives exactly $30.00
- AND the sum equals exactly $90.00

### Requirement: FIFO Payment Allocation

The system MUST allocate an incoming payment across a member's pending `cargos` in FIFO order (oldest pending cargo first), applying the payment amount cargo by cargo until either the payment is exhausted or no pending cargos remain.

#### Scenario: Payment settles the oldest cargo and carries the remainder forward

- GIVEN a member has two pending cargos of $50.00 (oldest) and $80.00 (newer)
- WHEN a payment of $60.00 is allocated
- THEN the $50.00 cargo is fully settled
- AND $10.00 is applied to the $80.00 cargo, leaving $70.00 pending on it

#### Scenario: Payment smaller than the oldest cargo only partially settles it

- GIVEN a member has two pending cargos of $50.00 (oldest) and $80.00 (newer)
- WHEN a payment of $20.00 is allocated
- THEN $20.00 is applied to the $50.00 cargo, leaving $30.00 pending on it
- AND the $80.00 cargo receives no allocation

#### Scenario: Payment exceeding total pending debt leaves an explicit surplus

- GIVEN a member has one pending cargo of $50.00 and no other pending cargos
- WHEN a payment of $75.00 is allocated
- THEN the $50.00 cargo is fully settled
- AND the allocation result reports `unappliedCents` equal to $25.00 (2500 cents)
- AND the surplus is NEVER silently dropped — the UI MUST surface `unappliedCents > 0` as a warning or block the submission, replacing the current app's behavior of writing the full input amount to `registro_pagos` while only partially applying it to `cargos`
