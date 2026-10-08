# Delta: caja — surfaced adjustments and net position

## ADDED Requirements

### Requirement: Adjustments Are Reported Outside the Balance

The Arca page MUST show an "Ajustes otorgados" figure: the total of adjustments recorded in the period, grouped by concept. This figure MUST be presented separately from the balance cards and MUST be labelled as not part of the balance. Because an adjustment moves no cash, the derived arca does not change; therefore hiding the figure would make a real loss to the club untraceable.

#### Scenario: The forgiveness total is shown and the balance is not affected

- GIVEN an adjustment has been recorded
- WHEN the Arca page renders
- THEN the adjustments figure includes it, grouped under its concept
- AND the balance cards are unchanged
- AND the figure is labelled as outside the balance

#### Scenario: The figure separates forgiveness from cash

- GIVEN both payments and adjustments in the same period
- WHEN the Arca page renders
- THEN "Pagos recibidos" reflects only cash received
- AND the adjustments figure reflects only non-cash debt reductions

### Requirement: Net Position Indicator

The Arca page MUST show a net position indicator equal to the derived arca plus the outstanding receivable. It MUST be labelled as a figure that combines cash and receivable, and it MUST NOT replace or alter either of its terms.

#### Scenario: A forgiveness lowers the net position

- GIVEN a net position before a forgiveness
- WHEN a forgiveness is recorded
- THEN the derived arca is unchanged
- AND the net position is lower by exactly the forgiven amount

#### Scenario: Neither term is altered

- GIVEN a derived arca and a receivable
- WHEN the net position is displayed
- THEN it equals their sum
- AND the two terms are still displayed separately

## MODIFIED Requirements

### Requirement: Breakdown Cards

The Arca breakdown MUST present the terms: `Apertura` · `Pagos recibidos` · `Apoyos entregados (recuperables)` · `Egresos (no recuperables)` · `Arca (disponible)` · `Por cobrar`. The two outflow cards — `Apoyos entregados (recuperables)` and `Egresos (no recuperables)` — MUST be grouped under a single heading "Salidas del arca" and MUST NEVER be merged: an apoyo is money lent (it returns through `registro_pagos`), an egreso is money spent (it does not return), and merging them would hide that difference. The page MUST also present, OUTSIDE that balance, an `Ajustes otorgados` figure and a `Posición neta` indicator. Neither of those MAY be added into `Arca (disponible)`.

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

#### Scenario: The extra figures stay outside the balance

- GIVEN an adjustments figure and a net position are displayed
- WHEN `Arca (disponible)` is computed
- THEN neither figure is a term of the computation
- AND the balance equals the six-card derivation exactly
