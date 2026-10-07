# Tasks: Reparación de la rodada San Luis

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~260 (two SQL files; mostly comments and assertions) + ~90 docs |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | 1 work unit: the SQL pair; 1 small unit: docs + retirement |
| Delivery strategy | single PR |
| Chain strategy | n/a |

Decision needed before apply: Yes — live SQL requires the operator's explicit sign-off
Chained PRs recommended: No
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | The repair itself | PR 1 | SQL pair, proof run, apply, read-back |
| 2 | Documentation + retirement | PR 1 (same) | `HANDOFF.md`, `activo=false` |

## 1. Reparación de datos

- [x] 1.1 **Freeze the pre-state (read-only).** Run the replay assertion against production and record, as evidence, the derived arca, the receivable, the four target row ids, and the per-member allocation watermark. No writes.
  - Evidence: DONE 2026-10-04. The FIFO replay reproduced the database to the cent for both affected members, which is what makes the reversal deterministic. Figures kept out of the repository (design.md D7); the reviewed values are in private project memory (Engram obs #4498).
- [x] 1.2 **Write the migration pair.** `supabase/sql/phase9_reparar_rodada_san_luis.sql` (guard → delete 4 rows → restore 12 cargos → move 1 cargo → assert → commit) and `phase9_reparar_rodada_san_luis_down.sql`.
  - Evidence: the forward file contains no hard-coded monetary value; the down file contains only the four historical amounts, which a reversible re-insert cannot avoid.
- [x] 1.3 **Prove it with zero trace.** Execute the whole forward file wrapped in `begin; … rollback;` against production, then read back the four rows (present), the cargo values (unchanged), and the arca (unchanged).
  - Evidence: DONE 2026-10-04. Forward-only run: read-back identical (zero trace). Full forward+down round-trip: read-back identical to the pre-repair state. The target state captured mid-transaction matched the applied result exactly, to the cent.
- [x] 1.4 **Apply, with explicit sign-off from the operator.** Run the same file without the outer rollback, then read back: the four rows are gone, the twelve cargos carry the restored values, the moved cargo belongs to the contributing member, and the apoyo total is unchanged.
  - Evidence: DONE 2026-10-04 with the operator's authorization. Read-back matched the mid-transaction prediction exactly: the derived arca fell by exactly the four rows' total, the receivable rose by the same total, the reassigned cargo is whole and on the contributing member, the apoyo total is unchanged, and the payment count dropped by four.
- [x] 1.5 **Record the distribution rule** in the apoyo's `motivo`: the pot is divided among the attendees and two of them ceded their share to the other two.
  - Evidence: DONE. The previous text is preserved in the `_down.sql`, which restores it.
- [x] 1.6 **Confirm the repair is closed**: no `cargos` row derives from the deleted rows; the debtor ranking and "Por cobrar" agree with the same aggregation on every surface.
  - Evidence: DONE at the data level: every affected cargo carries the reconstructed value, the pending total moved by exactly the deleted sum, and no cargo references a deleted row. The browser-level agreement of the three surfaces is a live-session check (see Manual checks below).

## 2. Ciclo de vida del integrante

- [x] 2.1 **Retire the member who left the chapter** (`activo = false`).
  - Evidence: DONE 2026-10-04 in the same session as the repair. **Deviation, recorded honestly**: it was applied as a direct `miembros` UPDATE through the Management API rather than through the app's own retire action, because the repair session had no browser. The UI action sets exactly the same flag, so the resulting state is identical; the UI path itself was therefore NOT exercised and remains unverified. The member's whole history (every cargo and the entire pending balance) read back intact, and the flag is reversible.
- [ ] 2.2 **Record the receivable consequence** in this file: with the member retired, their pending balance is excluded from "Por cobrar" and the public ranking (design.md D8). Confirm with the operator which option they want, and link the follow-up task in `ajustes-y-clasificacion`.
  - Evidence: the consequence is recorded in `HANDOFF.md` and in `design.md` D8; **the operator's choice between the three options is still open** (`ajustes-y-clasificacion/tasks.md` 4.1).

- [ ] 2.3 **Warn at the point of retiring.** The `member-lifecycle` delta requires that an operator retiring a member with an unsettled balance be warned, there and then, that the balance will stop appearing in "Por cobrar". The app does NOT do this today: `src/features/miembros/index.ts` uses a plain confirmation that says nothing about the receivable. Until it lands, retiring a member with a balance silently hides it — which is exactly what happened on 2026-10-04. Do not archive this change while this requirement is unmet, and do not quietly delete the requirement to unblock archiving.
  - Evidence: pending — not implemented.

## 3. Cierre

- [x] 3.1 **Update `HANDOFF.md`**: the repair, the resulting state, the retirement, and the deferred non-cash audit as an open risk.
  - Evidence: DONE — a new section near the top of `HANDOFF.md` plus two entries under "Known gaps".
- [x] 3.2 **Record the deferred audit** with its measured class and the reason it was deferred, so a future session does not rediscover it and cannot mistake it for done.
  - Evidence: DONE — "Known gaps" calls it the most valuable piece of unfinished work on the money tables; `design.md` D10 carries the evidence.

## Manual / human-driven checks (cannot be automated here)

- The retirement's "history stays visible" behaviour is a live browser check (same nature as the still-open tasks 2.6 and 4.5 of `evolucion-plataforma-arca`).
- The apply step itself is a human-authorized live write; the Management API runs elevated and therefore does not exercise RLS.
