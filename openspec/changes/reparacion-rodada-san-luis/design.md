# Design: Reparación de la rodada San Luis

## Context

`src/lib/caja.ts` derives the arca on read: `apertura + Σ registro_pagos − Σ registro_apoyos − Σ registro_egresos`. Nothing persists a running balance, and nothing persists a FIFO allocation: `aplicarPago` (`src/features/pagos/repo.ts`) reads the member's `pendiente` cargos `order('created_at')`, walks them oldest-first, and writes each resulting `monto_pendiente` and `estado`. The allocation is therefore **lossy by design** — which is exactly why the repair below has to reconstruct rather than read.

The precedent for a data migration in this repository is `phase8_reclasificar_gasto_sin_cargar.sql`: a self-verifying `do $$ … $$` guard, then an atomic `begin; … commit;`, with an id-targeted `_down.sql`. This change follows that shape and adds one thing phase 8 did not have: a correctness assertion that survives independent re-computation.

## Decisions

### D1 — The repair is derived, never typed

The twelve affected `cargos` rows must return to values that exist nowhere in the database. Hard-coding them would make the review a matter of trusting a list; deriving them makes it a matter of checking an algorithm. The script reads the four rows it is about to delete, groups them per member, and reverses each member's allocation by replaying `monto_original` against the current `monto_pendiente`, newest allocated cargo first, until the deleted amount is exhausted.

*Rejected:* a `cargos_historial` audit table (fixes this incident and none of the future ones, and cannot recover the already-lost values); restoring `monto_original` on every touched cargo (over-restores the one cargo that was only partially allocated).

### D2 — Direction of the reversal

FIFO allocates oldest-first, so undoing a payment must walk the *newest* cargo that received allocation back toward the oldest, restoring `min(remaining, allocated)` on each. This is provably the inverse of the forward pass, and the assertion proves it: after the reversal, replaying the member's remaining payments must reproduce the restored state exactly.

### D3 — Correctness by assertion, safety by rollback

The file asserts, before any DML: the four rows exist with the expected amounts, member, and date; the parent apoyo exists; the moved cargo is `pendiente` and belongs to the member it should not; the twelve cargos exist with the expected `monto_original`. After DML it asserts the target state: the receiving member's receivable increased by exactly the deleted sum, the moved cargo points at the contributing member, the apoyo's total is unchanged, and the total of all pending cargos moved by exactly the deleted sum.

Safety is established by running the whole file inside `begin; … rollback;` against production and reading back the unchanged state — the method this project already verified for the Management API endpoint. The apply step then runs the identical file without the outer rollback.

### D4 — The waiver creates no substitute row

The cessions were a waiver of the support, not a transfer of a debt (operator decision D2): no member took on another's obligation, and the club's total receivable must not change because of them. The four rows are therefore deleted with **no** replacement in `registro_ajustes`. If they had been a transfer, this change would have needed paired adjustment rows instead — the distinction is worth keeping explicit, because it is the difference between a repair that is arithmetically closed and one that needs a new primitive.

### D5 — No compensating outflow

The operator's rule: the pot accumulated from the non-attendees is divided among the attendees, so the collected amount and the disbursed amount are the same number, and the apoyo as recorded is complete. There is no missing outflow to book and no extra `registro_egresos` row. This resolves the one open question from the analysis round in the direction that keeps the arca meaning "cash on hand" without an invented entry.

### D6 — Reassigning the cargo

The cargo that landed on the wrong member is moved by updating `cargos.miembro_id`, and the before/after member pair is recorded in the migration header. *Rejected:* delete-plus-insert, which produces a new row id and loses the thread between the apoyo and its cargo. `cargos` carries no history column, so **the migration file is the audit trail** — which is the argument for documenting it here rather than in a commit message.

### D7 — Redaction of real figures

This repository is public. No real amounts, per-member balances, or resulting arca figures appear in any committed artifact of this change. The reviewed values live in private project memory (Engram obs #4498); the SQL derives its numbers from the database; the verification during apply reads them back and reports them to the operator in session. The rule is restated here deliberately — a later amendment to these documents can silently reintroduce figures otherwise.

### D8 — Retiring a member who still owes

`activo = false` is the correct, reversible action for the member who left the chapter: history is untouched, the row stays, the flag can be reverted. **But it has a consequence the operator must see before deciding**, because `src/lib/debt-view.ts`'s `aggregateDebtByMember` excludes inactive members: retiring a member with a pending balance removes that balance from "Por cobrar", from the public ranking, and from `api/debt-view.ts`'s total — while the internal dashboard KPI keeps listing them (a documented, deliberate asymmetry from `member-lifecycle` Phase 4).

Three options, left as an explicit decision rather than assumed:

| Option | Consequence |
|---|---|
| Retire now; collect later by temporarily reactivating (`activo` is reversible) | Zero new code; the receivable is hidden from every surface until reactivated |
| Retire now **and** add an admin-only "Por cobrar — ex miembros" line | The balance stops disappearing; touches the `caja` breakdown card, not the public payload |
| Keep the member active until the balance settles | Nothing is hidden; the ex-member stays visible in the public ranking, which contradicts their departure |

The blocking question for this change is only whether the retirement lands in the same PR as the repair. The recommended default is the first option, with the second tracked in `ajustes-y-clasificacion`.

### D9 — The `motivo` update is documentation, not accounting

`registro_apoyos.motivo` is free text by design and already the operator's record of intent. Appending the distribution rule (the pot is divided among the attendees, and two of them ceded their share to the other two) makes the row self-explanatory for whoever reads it in six months. It changes no amount, no estado, and no derivation. *Alternative considered:* leaving the explanation in this repository only — rejected, because the person who needs it will be reading the app, not the spec.

### D10 — The deferred audit (open risk, out of scope by decision)

Read-only measurement against production, kept here because it must not be lost:

- A measurable class of `registro_pagos` rows is **not cash**, and the rows say so themselves: `"no se fue a caja"`, `"se le descuent[a]"`, `"Cargos cubiertos por fondos del club"`, `"Se toma de la caja para pagar…"`, `"Se pagó de la caja, se agrego solo para que quede registrado"`, `"ajuste de movimiento por centavos"`.
- Two of those classes invert the sign of a real movement: a disbursement *from* the arca recorded as an inflow *to* the arca inflates the balance by twice its amount.
- The operator deferred the audit (E4). Until it runs, the derived arca and the receivable are **not** trustworthy as complete figures, and this change does not make them so — it removes one known distortion and leaves the class intact.

### D11 — Why no `CHECK` or trigger blocks non-cash pagos here

A trigger sniffing `observaciones` for keywords would be fragile (the operator's wording varies) and would silently reject real payments. The durable fix is a required **nature-of-collection selector** in the capture form, which routes "adjustment without cash" to the adjustments module — that is `ajustes-y-clasificacion`'s job, and it is the reason E2 is worth building rather than just repairing E1.

## Risks

| Risk | Mitigation |
|---|---|
| A fifth, undiscovered effect of the four rows | The pre-state assertion enumerates every affected cargo and fails if the count or the sums differ |
| Drift between the rollback proof and the apply | The identical file runs both times; the apply is guarded by the same assertions |
| A later payment lands before the repair is applied | The assertion requires the four rows to still be each member's last recorded payment; drift aborts cleanly |
| The repair is applied twice | Every assertion is written so a second run fails (the rows are gone, the state already restored) |
| The retirement hides a receivable the club intends to collect | D8 — explicit decision, not an assumption |
