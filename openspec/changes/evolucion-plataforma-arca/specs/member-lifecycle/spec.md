# Member Lifecycle Specification

## Purpose

Defines how a `miembro` may be removed from active duty without destroying financial history: deletion is restricted when history exists, and an `activo` flag provides a non-destructive retirement path.

## ADDED Requirements

### Requirement: Restricted Deletion

The system MUST refuse to delete a `miembro` row that has any associated `cargos` or `registro_pagos` rows, via an `ON DELETE RESTRICT` foreign-key policy. This replaces the previous `ON DELETE CASCADE` behavior, which silently destroyed financial history.

#### Scenario: Deleting a member with financial history is refused

- GIVEN a `miembro` with at least one `cargos` or `registro_pagos` row referencing it
- WHEN a delete is issued against that `miembro` row
- THEN the database refuses the delete due to the foreign-key restriction
- AND the `miembro`, `cargos`, and `registro_pagos` rows remain intact

#### Scenario: Deleting a member with no financial history succeeds

- GIVEN a `miembro` with no `cargos` or `registro_pagos` rows referencing it
- WHEN a delete is issued against that `miembro` row
- THEN the delete succeeds

### Requirement: Retirement via activo Flag

`miembros` MUST have a boolean `activo` column, defaulting to `true`. Setting `activo` to `false` on a member MUST retire that member without deleting the row, and MUST leave all associated `cargos` and `registro_pagos` history intact and queryable.

#### Scenario: Retiring a member preserves history

- GIVEN an active `miembro` with existing `cargos` and `registro_pagos` history
- WHEN an admin sets that member's `activo` to `false`
- THEN the `miembro` row still exists with `activo = false`
- AND all associated `cargos` and `registro_pagos` rows remain unchanged and retrievable
