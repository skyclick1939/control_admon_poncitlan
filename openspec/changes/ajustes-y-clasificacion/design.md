# Design: Ajustes de adeudo y clasificación de conceptos

## Context

`computeCaja` (`src/lib/caja.ts`) is pure and reads three arrays. `allocateFifo` (`src/lib/money.ts`) is pure, takes `{id, pendingCents}` charges already ordered oldest-first, and returns per-charge allocations plus an unapplied remainder. `aplicarPago` (`src/features/pagos/repo.ts`) is the only caller that writes them back, and it is also the only cash-in event. The module boundary is enforced by convention: `features/*` may import `lib/*` but never each other; `saveApoyoSinCargos` delegates one-directionally to `saveEgreso`, and that remains `registro_egresos`'s only writer.

The capture surface is a single "Solicitud de Apoyos" flow with three modalities (group, individual, "sin cargos"), plus a separate pago flow. Every disbursement is captured through Apoyos; the Arca page captures nothing. This change adds a fourth capture context without breaking that rule.

## Decisions

### D1 — A fourth ledger, and the arca formula stays closed

`registro_ajustes` is a new table. `computeCaja` is **not** modified to read it. Rationale: the arca means "cash on hand"; a forgiveness does not move cash, and adding it as a term would break the spec's "each row contributes exactly once" invariant in a way readers would misread (a forgiveness *looks* like an outflow). Consequence: the adjustments must be surfaced somewhere or they become invisible — which is D6.

### D2 — The nature rule makes misclassification impossible

A concept carries `naturaleza ∈ {recuperable, no_recuperable}`. The Apoyos form filters the selector by the chosen modality: group/individual divisions offer only `recuperable` concepts; the "sin cargos" modality offers only `no_recuperable` ones. This is the cheapest possible fix for the confusion that produced this whole incident: the operator's own list mixes debts ("apoyo a accidentados", "apoyo hermano caído", "apoyo legal", "apoyo aniversario") with expenses ("adquisiciones del capítulo", "donaciones"), and a single unfiltered dropdown would invite the mistake again.

*Consequence accepted:* a concept can no longer be used in both modalities. If a real case needs that, the operator creates two concepts.

### D3 — Concept is required on new captures, optional on history

New apoyos and egresos MUST carry a concept; the catalog ships pre-seeded with the operator's six, so the selector is never empty and never blocks a capture. Existing rows keep `concepto_id = null` until the guided backfill runs — a null there means "recorded before the catalog existed", which is honest, rather than a guessed classification.

### D4 — Backfill is guided, never guessed

The backfill maps existing rows by keyword over `motivo` and produces a **review file** listing each row with its proposed concept; the operator approves or corrects before any UPDATE runs. Silently classifying one of the club's movements would repeat the class of error this project is trying to close.

### D5 — Reassignment is paired by construction

The ledger MUST record a FACT ABOUT ONE CARGO per row: `cargo_id` plus the signed amount that row moved on it, tied to the other rows of the same operator action by a `grupo_id`. A condonación is one row. A cesión is TWO rows sharing a `grupo_id`: the ceding member's cargo loses the amount, and a NEW cargo is created for the receiving member against the same `apoyo_id` (`monto_original` = `monto_pendiente` = the ceded amount), which the second row references.

*Rejected:* one row per action carrying `miembro_id`, `contraparte_miembro_id` and a single amount. It reads better, but it cannot answer "what exactly did this row change?", so an exact reversal would have to RE-RUN the planner from the same inputs and trust it to be deterministic — and any later rule or schema change silently breaks old reversals. One extra row per cession buys a reversal that is mechanical, auditable row by row, and immune to the planner changing.

The club's total receivable and the arca are unchanged by a cession by construction: one cargo loses exactly what another gains. Modelling a cession as "A paid and B owes more" would require inventing a cash row — the anti-pattern this whole change exists to eliminate.

### D6 — Visibility: the report card and the net position

Two additions, both deliberately outside the balance:

- **"Ajustes otorgados"** — a card on the Arca page showing the total forgiven/moved in the period, grouped by concept, visually separated from the balance cards and labelled as not part of it.
- **"Net position" = Arca (disponible) + Por cobrar** — one indicator that makes a forgiveness visible: forgiving a debt leaves the arca identical but lowers the net position by the forgiven amount. Without it, the club's loss is untraceable, which is the same defect as a phantom inflow with the sign flipped.

### D7 — Reversal, not deletion

An adjustment is never deleted. A mistake is corrected by a `reversa` row that references the original GROUP, and the reversal is EXACT because every original row already states its own cargo and its own delta: restoring `+monto` on each referenced cargo returns it to the value it had, `estado` included. A reversed cession additionally removes the cargo the cession created — that cargo exists only because of the cession and has no history of its own. The reversal records who did it and why, and it MUST refuse to run when a referenced cargo's current value no longer matches what the original row changed: the counterfactual is meant to be provable, not plausible. This is the operational answer to "the next correction should not need SQL": the 2026-10-04 repair used a migration because the application had no such path.

### D8 — Guard on the pago form

The pago form gains a required "naturaleza del cobro": *Efectivo*, *Transferencia*, or *Ajuste sin efectivo*. Choosing the third routes the operator to the adjustments module and **does not** insert a `registro_pagos` row. A keyword trigger was rejected (fragile, and it would reject legitimate entries); a required choice is explicit and testable.

### D9 — Fixed dropdown with in-line creation

Implementation: a native `<select>` whose options are the active concepts of the chosen modality's nature, in catalog order, plus a final option that opens an in-line panel asking for a new concept's name and its nature. Two pure helpers in `src/lib/conceptos.ts` (`conceptosOfrecidos`, `conceptoPorId`) are what the tests cover, since the dropdown itself is browser behaviour. The operator never leaves the form and never needs a migration.

**Amended 2026-10-08 by the product owner.** This decision originally chose a searchable `input[list]` bound to a `datalist`, and explicitly rejected a plain `select` — “no search, and the operator asked for search”. The operator has since reversed that, in his own words: *“necesito que puntualmente en ‘Concepto (clasificación)’ se desplieguen las opciones para poder seleccionar, son conceptos FIJOS, para que más adelante se puedan aprovechar correctamente por filtros, por consultas… por eso quiero una lista desplegable de esas opciones ya determinadas.”* It is recorded as a reversal rather than a refinement, because that is what it is: with six concepts and at most four per nature, typing to filter added nothing, and hiding the options behind an empty text field is precisely how the operator came to report the field as missing. The classification still comes from the catalog — the requirement that actually mattered — so filters and queries are unaffected. The adjustments surface still uses its searchable field; only the Apoyos surface was changed, at his request.

*Rejected:* a React-style combobox library (new dependency, new build surface). *Superseded:* the searchable datalist; `searchConceptos` and its tests were deleted with it.

### D10 — Concept never replaces `motivo`

`motivo` stays free text and keeps the specific detail ("Apoyo rodada San Luis"); the concept adds the classification. The member portal's exclusion of `motivo` (spec `member-private-view`, D13 of the archived change) therefore stays intact, and whether the portal should show the *concept* is left out of scope deliberately.

### D11 — Why the catalog is shared with `registro_egresos`

Because two of the operator's six concepts are expenses, not debts. A catalog that only classified apoyos would leave the egresos unclassifiable and would push the operator back toward recording an expense as a debt — which is precisely the mistake the archived phase 8 migrated one row to undo.

## Risks

| Risk | Mitigation |
|---|---|
| The selector slows down a routine capture | Catalog ships pre-seeded; the concept is a one-keystroke choice; the filter is local and synchronous |
| The backfill misclassifies history | D4 — operator review before any UPDATE |
| A forgiveness becomes invisible again | D6 — the report card and the net-position indicator are in scope, not optional extras |
| An adjustment exceeds the pending debt, creating a negative cargo | The pure application function refuses to allocate beyond `pendingCents`; the remainder is reported, never stored |
| Two writers touch `cargos` (`aplicarPago` and the adjustment writer) | Both delegate to the same pure allocation; `cargos` remains the single aggregate and both writers are pinned by tests |
| The two changes' `caja` deltas collide on archive | Explicit sequencing: `reparacion-rodada-san-luis` archives first |
