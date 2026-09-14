# Member Private View Specification

## Purpose

Defines the token-scoped, unauthenticated read contract that serves one member's own data (`cargos`, `registro_pagos`) in exchange for a valid access token (see `member-access-token`). Because a token replaces a login, this contract carries the enumeration- and cache-leak risks that a parameterized, per-visitor endpoint introduces (proposal risk: reverses `public-debt-view` design decision D7's "no parameters = no oracle" reasoning); the requirements below compensate at the contract level. This capability links out to `/vista/` for club-wide totals and MUST NOT duplicate that aggregation.

## ADDED Requirements

### Requirement: Token-Scoped Own-Data Response

Given a valid token, the system MUST return only the data belonging to the member that token was issued for — that member's own `cargos` and `registro_pagos` — and MUST NOT include any other member's data.

#### Scenario: Valid token returns only its own member's data

- GIVEN a valid, live token issued for member A
- WHEN a client calls the private view endpoint with that token
- THEN the response includes only member A's `cargos` and `registro_pagos`

#### Scenario: Response never leaks another member's records

- GIVEN a valid token for member A, and member B has cargos/pagos of their own
- WHEN the endpoint responds to member A's token
- THEN no entry belonging to member B or any other member is present in the response

### Requirement: Indistinguishable Failure Response

The system MUST return the exact same response — identical status code and identical body shape — for an invalid token, a missing token, and a revoked or rotated (no-longer-live) token. The response MUST NOT reveal, through content or observable timing, which of these three cases occurred or whether the token ever existed.

#### Scenario: Invalid token

- GIVEN a token value that was never issued
- WHEN a client calls the endpoint with it
- THEN the response has the endpoint's single defined failure status code and body shape

#### Scenario: Missing token

- GIVEN no token is supplied at all
- WHEN a client calls the endpoint
- THEN the response is byte-for-byte identical in status and body shape to the invalid-token case

#### Scenario: Revoked or rotated token

- GIVEN a token that was previously live but has since been rotated or revoked
- WHEN a client calls the endpoint with that stale token
- THEN the response is byte-for-byte identical in status and body shape to the invalid-token and missing-token cases

#### Scenario: No timing side channel between failure causes

- GIVEN the invalid-token, missing-token, and revoked-token cases
- WHEN each is measured independently
- THEN none of the three cases is distinguishable from the others by response latency in a way an external caller could exploit to infer token validity or existence

### Requirement: Sensitive Field Exclusion

The response MUST NOT include the member's internal database UUID/primary key, any other member's data, the identity of the capturador (the admin who recorded a cargo/pago), or any field that `api/debt-view.ts` already deliberately excludes (email, internal `observaciones`, capturador identity).

#### Scenario: Response excludes the member's internal identifier

- GIVEN a valid token for a member
- WHEN the endpoint returns that member's data
- THEN the response contains no internal UUID or primary-key value for that member

#### Scenario: Response excludes capturador identity and internal fields

- GIVEN cargos/pagos recorded by an identified admin and carrying internal `observaciones`
- WHEN the endpoint returns that member's data
- THEN the response contains no capturador identity and no `observaciones` content, consistent with the existing `public-debt-view` exclusion list

### Requirement: Private, Non-Cacheable Response

Because each response is scoped to one visitor's token, the system MUST set response caching to `private, no-store`. It MUST NOT use the public/shared caching directives that `api/debt-view.ts` uses for its club-wide aggregate response.

#### Scenario: Successful response is marked private and non-cacheable

- GIVEN a valid token
- WHEN the endpoint returns that member's data
- THEN the response's `Cache-Control` header is `private, no-store`

#### Scenario: Failure response is also non-cacheable

- GIVEN any of the invalid, missing, or revoked-token cases
- WHEN the endpoint returns its failure response
- THEN that response's `Cache-Control` header is also `private, no-store`, so no shared cache can serve one visitor's failure (or data) to another

### Requirement: No Duplication of Club-Wide Aggregation

The private view MUST link to the existing `/vista/` public page for club-wide totals. It MUST NOT reimplement, recompute, or duplicate that club-wide aggregation logic.

#### Scenario: Private view links out for club-wide totals

- GIVEN a member viewing their private page
- WHEN they want club-wide totals
- THEN the page provides a link/reference to `/vista/`

#### Scenario: Private view response carries no club-wide figures

- GIVEN the private view endpoint's response for a given member
- WHEN that response is inspected
- THEN it contains no aggregate total computed across other members
