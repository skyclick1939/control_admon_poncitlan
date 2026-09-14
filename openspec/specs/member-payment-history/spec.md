# Member Payment History Specification

## Purpose

Defines the admin-only capability to view one member's complete financial history — every `cargo` (paid and pending) and every `registro_pagos` entry, with totals — including members who have been retired (`activo=false`). This capability is a query/UI surface layered on authorization the system already grants; it does not introduce any new authorization path.

## ADDED Requirements

### Requirement: Full Per-Member History Retrieval

The system MUST allow an authenticated admin to retrieve, in a single admin action, one member's complete history: all `cargos` regardless of `estado` (including both paid and pending) and all `registro_pagos` ever recorded for that member.

#### Scenario: Admin views mixed-state history for an active member

- GIVEN a member with both paid and pending `cargos` and multiple `registro_pagos`
- WHEN the admin opens that member's history panel
- THEN the response includes every `cargo` regardless of `estado`
- AND the response includes every `registro_pagos` entry for that member

#### Scenario: History is available for retired members

- GIVEN a member with `activo=false`
- WHEN the admin opens that member's history panel
- THEN the same full history (paid + pending `cargos`, all `registro_pagos`) is returned
- AND the retired status does not hide or truncate any historical record

### Requirement: History Totals

The system MUST compute and present totals over the full history returned: at minimum, total paid and total pending amounts.

#### Scenario: Totals reflect the itemized entries

- GIVEN a member's full history with a known set of paid and pending amounts
- WHEN the admin views the history panel
- THEN the displayed total paid equals the sum of that member's paid `cargos`/`registro_pagos`
- AND the displayed total pending equals the sum of that member's pending `cargos`

#### Scenario: Totals for a member with no history

- GIVEN a member with zero `cargos` and zero `registro_pagos`
- WHEN the admin opens that member's history panel
- THEN the panel loads without error
- AND all totals display as zero

### Requirement: No New Authorization Surface

This capability MUST rely exclusively on the existing `is_admin()` RLS policy already granted on `miembros`, `cargos`, and `registro_pagos`. It MUST NOT introduce new RLS policies, new grants, or any additional authorization path.

#### Scenario: Existing admin session reads full history without new grants

- GIVEN an admin session already authorized by `is_admin()`
- WHEN that session requests a member's full history
- THEN the request succeeds using only the pre-existing RLS grants
- AND no new policy or role was required to serve it

#### Scenario: Non-admin access remains denied

- GIVEN a member or unauthenticated (`anon`) request
- WHEN that request attempts to read another member's `cargos` or `registro_pagos` directly
- THEN the request is denied by the same RLS that protects these tables today
- AND this capability introduces no regression in that protection
