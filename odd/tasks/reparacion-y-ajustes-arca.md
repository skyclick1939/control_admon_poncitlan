# Feature: reparación del arca y ajustes de adeudo

**Status:** planning (documented only — no code, no SQL applied)
**Owner:** club operator (project owner) · **Repo branch:** `docs/reparacion-y-ajustes-arca`
**OpenSpec changes:** `reparacion-rodada-san-luis` (E1) · `ajustes-y-clasificacion` (E2 + E3)
**Authoritative task list:** `openspec/changes/*/tasks.md`. This document is the harness-level tracker, not a duplicate spec.

> **Figures are deliberately absent.** This repository is public, so no real amounts and no per-member balances are written here; the reviewed figures live in private project memory (Engram obs #4498) and are read back from the database during apply. See `design.md` D7.

## Goal

Repair a wrong ledger movement recorded on 2026-10-04 (a legitimate "discount" encoded as four `registro_pagos` rows) without hiding the loss it caused, and close the structural gap behind it: the application has no way to express a debt reduction that is not cash.

## Context in one paragraph

A chapter trip was funded by the members who did not attend (one fixed contribution each); the accumulated pot is divided among those who did attend, and a member may cede their share to another. One member left the chapter before contributing, so the pot shrank and the per-attendee share shrank with it. The operator reduced two members' debts by registering four contribution-sized rows in `registro_pagos` — the only ledger that reduces a debt — and one `cargos` row landed on a member who should not carry it. Because FIFO applies oldest-first and the parent `registro_apoyos` row did not exist yet, those rows landed on unrelated older debt. Net effect: non-existent cash in the arca **and** real debt silently forgiven, both by the same recorded total.

## Decisions taken by the operator

| # | Decision | Consequence |
|---|---|---|
| D1 | The third contributor is the member the operator named, not the one the cargo landed on | Move one `cargos` row |
| D2 | The cessions were a **waiver of the support**, not a transfer of debt | The four `registro_pagos` rows are deleted with no substitute; no `registro_ajustes` row is needed for them |
| D3 | The pot is divided among all attendees, so there is **no missing amount** | No extra `registro_egresos` row; the recorded apoyo total is correct |
| D4 | The member who left the chapter is retired | `activo=false`: history intact, reversible |
| D5 | "Donaciones" are money the chapter **gives** | Non-recoverable concept captured through "Sin cargos" — justifies a catalog shared by apoyos and egresos |
| D6 | Scope authorized: E1 + E2 + E3 | The audit of the non-cash `registro_pagos` class (E4) is **out of scope** and must stay recorded as an open risk |

## Tasks

### E1 — Reparación de datos (`reparacion-rodada-san-luis`)

- [x] 1.1 Congelar el estado previo: correr la aserción de replay (solo lectura) y registrar arca y por cobrar
- [x] 1.2 Redactar `supabase/sql/phase9_reparar_rodada_san_luis.sql` (reversa FIFO derivada) + `_down`
- [x] 1.3 Probar dentro de `begin; … rollback;` contra la base viva y leer la verificación de cero rastro
- [x] 1.4 Aplicar con firma explícita del operador y verificar el estado objetivo
- [x] 1.5 Documentar la regla del reparto en el `motivo` del apoyo
- [x] 1.6 Dar de baja al miembro que salió (`activo=false`) y confirmar que su historial sigue visible — **aplicado por SQL, no por la UI**: el camino de la interfaz quedó sin ejercitar
- [x] 1.7 Actualizar `HANDOFF.md`

### E3 — Catálogo y clasificación (dentro de `ajustes-y-clasificacion`)

- [ ] 2.1 Tabla `catalogo_conceptos` + RLS + semilla (los 6 conceptos con su `naturaleza`)
- [ ] 2.2 Columnas de concepto en `registro_apoyos` y `registro_egresos` + backfill guiado
- [ ] 2.3 Combobox con búsqueda dinámica (función pura testeada) + alta de concepto en línea
- [ ] 2.4 Mostrar el concepto en pagos, historial del miembro y portal

### E2 — Módulo de ajustes (dentro de `ajustes-y-clasificacion`)

- [ ] 3.1 Tabla `registro_ajustes` + RLS + escritor único
- [ ] 3.2 `applyAjuste` pura (cargo objetivo o FIFO) testeada antes de usarse
- [ ] 3.3 Módulo de UI: condonación, cesión y reversa auditada
- [ ] 3.4 Guardia "naturaleza del cobro" en el formulario de Pagos
- [ ] 3.5 Reporte "Ajustes otorgados" + indicador "Posición neta"
- [ ] 3.6 Refinamiento (a decidir): cobrar a un ex miembro con saldo pendiente

## Evidence required to close each task

- E1: the replay assertion passes **before** and **after**; the arca and por cobrar values are read back; the `_down` reverses to the exact pre-state.
- E3/E2: `vitest run` green and `tsc --noEmit` clean before each commit; the combobox and the adjustments module verified in a real browser session.
- Every task: one work-unit commit on a feature branch, Conventional Commit message, commit id recorded in the OpenSpec `tasks.md`.

## Open risks (do not lose)

1. **A measurable class of `registro_pagos` is not cash** — rows whose own `observaciones` say so in words. Out of scope by decision (D6). Full evidence in `openspec/changes/reparacion-rodada-san-luis/design.md`.
2. **A retired member with a pending balance disappears from "Por cobrar" and the public ranking** (the `activo=false` exclusion in `src/lib/debt-view.ts`). Decision pending (task 3.6).
3. **Legacy outliers stay untouched**: `cargos` rows carrying sub-cent residues, `registro_apoyos` rows whose total does not equal the sum of their cargos (one materially, a legacy double charge), and `registro_pagos` rows with no author.
4. **The public-repository rule**: no real financial figures in committed artifacts. Restoration values live in private project memory; the script derives them from the database instead of hardcoding them.
