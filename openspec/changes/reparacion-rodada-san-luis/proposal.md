# Proposal: Reparación de la rodada San Luis

## Intent

On 2026-10-04 a legitimately motivated debt reduction was recorded in the wrong ledger. The application has no way to express "reduce this member's debt without cash entering the arca", so the operator used the only ledger that does reduce a debt — `registro_pagos`, which is simultaneously the arca's cash-in event. Four rows of one contribution each were inserted for two members, and one `cargos` row landed on a member who should not carry it.

Two damages, both measured against the live database before writing anything:

1. **Phantom cash.** The derived arca is overstated by exactly the sum of those four rows.
2. **Silent forgiveness.** `registro_pagos` reduces `cargos` FIFO, oldest-first, and the parent `registro_apoyos` row was created *after* the rows. So the amount landed on unrelated older debt: the receivable is understated by the same sum, spread across rows that had nothing to do with the trip.

The arca is not miscalculated — its formula faithfully derives from the ledger. **The ledger is wrong.** This change repairs the ledger and moves the cargo that belongs to another member. It does not introduce the missing primitive; that is `ajustes-y-clasificacion`.

> No real amounts are stated in this repository (it is public). The reviewed figures are in private project memory (Engram obs #4498) and are re-read from the database during apply. See `design.md` D7.

## Scope

### In Scope
- Delete the four `registro_pagos` rows that were not cash, targeted by fixed row id.
- Restore exactly the twelve `cargos` rows whose pending amount and state those four rows altered, to their exact pre-incident values.
- Move the rodada's third `cargos` row to the contributing member the operator identified, leaving the `registro_apoyos` row and its total untouched.
- Record the agreed distribution rule in the apoyo's free-text `motivo`, so the record explains itself.
- Retire the member who left the chapter (`activo = false`), preserving their full financial history and its reversibility.
- Correct the resulting documentation (`HANDOFF.md`).

### Out of Scope
- **The audit of the non-cash `registro_pagos` class** (rows whose own `observaciones` state that no money moved). Explicitly deferred by the operator; retained as an open risk in `design.md`.
- Any application code. This change is a SQL data migration plus one `activo` flag.
- Legacy structural outliers: sub-cent `cargos` residues, `registro_apoyos` rows whose total differs from their cargos, and `registro_pagos` rows with no author.
- The public "Por cobrar" visibility of a retired member's balance (decision pending; see `design.md` D7).
- Every table outside this app's own tables in the shared `arca` project.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `caja`: states the missing invariant that the ledger is a **cash** ledger — a debt reduction with no cash inflow MUST NOT be recorded as a `registro_pagos` row, and no non-cash row may contribute to the derived arca.
- `member-lifecycle`: requires that retiring a member preserves their pending balance and history, and states that a retired member is excluded from the debtor surfaces.

## Approach

The repair is only trustworthy if it is *derived*, not typed. Because FIFO allocation is never persisted, the correct pre-incident value of each affected `cargos` row cannot be read from the database — but it can be **reconstructed**: replaying each member's payments against their cargos oldest-first reproduces the current database to the cent (verified read-only against production for both affected members). The script therefore reverses the same algorithm from the newest allocated cargo backwards, and asserts the reconstruction before mutating.

Sequence, in one transaction: assert the exact pre-state → delete the rows → restore the cargos → move the cargo → assert the target state → commit. Correctness is established by the assertion, not by inspection; safety is established by a full run inside `begin; … rollback;` against production with a read-back showing zero trace, which this project has already established as its method.

**Rollback plan.** `phase9_..._down.sql` restores the exact pre-state: re-inserts the deleted rows with their original ids and timestamps, re-applies the FIFO allocation they had produced, and returns the moved cargo to its original member. Because the pre-state is asserted in the same file, the down migration fails loudly rather than silently if anything has drifted.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/sql/phase9_reparar_rodada_san_luis.sql` | New | Self-verifying, atomic, derived repair |
| `supabase/sql/phase9_reparar_rodada_san_luis_down.sql` | New | Exact reversal |
| `public.registro_pagos` | Modified | 4 rows deleted |
| `public.cargos` | Modified | 12 rows restored to their pre-incident values; 1 row reassigned |
| `public.registro_apoyos` | Modified | 1 `motivo` updated (distribution rule recorded); `monto_total` unchanged |
| `public.miembros` | Modified | 1 row `activo = true → false` (retirement) |
| `HANDOFF.md` | Modified | Records the repair and the deferred audit |
| `openspec/specs/caja/spec.md`, `openspec/specs/member-lifecycle/spec.md` | Modified | Merged on archive |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~260 (two SQL files, mostly comments and assertions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | single PR |

Decision needed before apply: Yes — the live SQL needs the operator's explicit sign-off
Chained PRs recommended: No
400-line budget risk: Low
