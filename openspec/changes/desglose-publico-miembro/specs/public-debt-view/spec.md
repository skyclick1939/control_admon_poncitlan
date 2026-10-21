# Delta: public-debt-view

## MODIFIED Requirements

### Requirement: Sensitive Field Exclusion

The public debt-view function's response MUST NOT include member emails, the identity of the capturador (the admin who recorded a cargo/pago), internal `observaciones`, per-charge `motivo`, member UUIDs, member `status`, member `created_at`, or any field not explicitly part of the public contract (nickname, total pendiente, bank account info, and the member breakdown added by this change). The breakdown MUST NOT include any per-payment-to-charge link, because the database does not store one.

#### Scenario: Response omits sensitive fields

- GIVEN a member with an email, cargos recorded by an identified admin, cargos carrying internal `observaciones`, and cargos whose `motivo` names a personal circumstance
- WHEN the public debt-view endpoint returns that member's entry
- THEN the response contains no email field, no capturador identity, no `observaciones` content, no `motivo` content, and no member UUID

## ADDED Requirements

### Requirement: Member Breakdown in the Public Contract

The public debt-view function MUST return, for every eligible member, a breakdown whose figures are derivable from stored columns only: the sum of recorded payments, the pending balance, the amount covered without cash, and the per-adeudo entries carrying concept name, date, original amount, covered amount, and pending amount. A member is eligible exactly when the existing ranking includes them: not retired (`activo = false`) and not `status = 'interno'`. Members MUST be grouped by member identity, never by nickname.

#### Scenario: A member reconstructs how their debt was covered

- GIVEN a member with two cargos, one fully covered and one still pending, and recorded payments
- WHEN the endpoint returns their breakdown
- THEN each cargo appears with its concept, its original amount, its covered amount, and its pending amount, oldest first
- AND the member's recorded payments appear oldest first
- AND the member's pending balance equals the sum of the per-adeudo pending amounts

#### Scenario: A forgiveness is not reported as a payment

- GIVEN a member whose debt was reduced by a condonación and who recorded no payment
- WHEN the endpoint returns their breakdown
- THEN the covered amount is attributed to the non-cash figure
- AND the recorded payments total stays zero

#### Scenario: A cession receiver is not credited with coverage

- GIVEN a member who received a ceded obligation and whose receiving cargo was born at its full amount
- WHEN the endpoint returns their breakdown
- THEN that cargo reports zero covered amount
- AND the member's non-cash figure does not include the cession's creation row

#### Scenario: Two members sharing a nickname stay separate

- GIVEN two eligible members with the same nickname and different balances
- WHEN the endpoint returns the breakdown
- THEN the response contains two entries with that nickname and their own figures

### Requirement: Club Pending by Concept

The public debt-view function MUST return the club's pending balance grouped by concept name, without any member identity attached, labelling rows recorded before the concept catalog existed with the single string `Sin clasificar`.

#### Scenario: The club can see where its receivable sits

- GIVEN pending cargos across two concepts and one legacy cargo with no concept
- WHEN the endpoint returns the club breakdown
- THEN the pending totals appear per concept, largest first, with no nickname attached
- AND the legacy cargo is grouped under `Sin clasificar`

### Requirement: Public Page Is Not Indexable

The public view page MUST declare `noindex, nofollow` and MUST NOT send a referrer, so a shared link is not discoverable by search engines.

#### Scenario: A crawler is told not to index the page

- GIVEN the public view page is served
- WHEN its head is read
- THEN it declares `robots: noindex, nofollow`
- AND it declares a `no-referrer` policy
