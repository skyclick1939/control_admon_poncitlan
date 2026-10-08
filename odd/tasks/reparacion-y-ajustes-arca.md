# Feature: reparación del arca y ajustes de adeudo

**Status:** E1, E2 and E3 implemented, applied live, **merged and deployed to production 2026-10-08** (PR #4 → `1cad01a`). Open: the operator's browser checks and the 66-row concept backfill.
**Owner:** club operator (project owner) · **Repo branch:** `docs/reparacion-y-ajustes-arca`, merged into `main` as `1cad01a`
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

- [x] 2.1 Catálogo + RLS + semilla — **aplicado y verificado en vivo**: 6 conceptos con su naturaleza, `concepto_id` en ambos libros, RLS con política `is_admin()`, cero permisos a `anon`, 2 índices. Con dos pruebas de cero rastro antes de aplicar (forward solo, y round-trip forward+down)
- [x] 2.2 Columnas de concepto + **propuestas** de backfill — la clasificación de las 66 filas históricas sigue **PENDIENTE de tu revisión** (los 10 "alta" incluyen al menos 2 falsos positivos demostrables)
- [x] 2.3 Selector con búsqueda dinámica + alta en línea — 26 pruebas nuevas, suite 216/216, `tsc` limpio; **el comportamiento en navegador NO se verificó**
- [x] 2.4 Mostrar el concepto en pagos e historial del miembro — implementado (el portal de miembros quedó fuera de alcance por decisión propia); **el render NO se verificó en navegador**
- [x] 2.5 Filtrar movimientos por concepto — implementado como el filtro del cuadro de deudas del formulario de pagos (`matchesConceptoFiltro` / `conceptosPresentes`, control `select#deuda-concepto-filter`); **sin verificar en navegador** (tarea 1.7)
- [x] 2.6 Desactivar conceptos desde la UI — implementado: `setConceptoActivo(id, activo)` y el panel "Administrar conceptos del catálogo", sin control de borrado a propósito (tarea 1.8)

### E2 — Módulo de ajustes (dentro de `ajustes-y-clasificacion`)

**Estado a 2026-10-06 (sesión de implementación):** E2 implementado; `phase11` aplicado en vivo con prueba de cero rastro. Verificación independiente: sin hallazgos de bloqueo. Falta sólo lo que exige navegador/base viva (el operador).

- [x] 3.1 Tabla `registro_ajustes` + RLS + escritor único
  - Evidencia: `phase11_registro_ajustes.sql` + `_down`; dos pruebas de cero rastro contra producción (forward en transacción y round-trip forward+down, ambas abortadas con excepción deliberada y revertidas). Read-back: tabla de 14 columnas, una política `is_admin()` (`admins_all_registro_ajustes`, ALL), cero permisos a `anon`, 6 índices (pkey + 4 de consulta + el índice único parcial que impide revertir dos veces), 4 CHECK y 5 FK. El CHECK de `tipo` se amplió en la misma sesión a `condonacion | cesion | pago_tercero | reversa` con la tabla aún vacía, y se releyó. Commit `b29aafd`.
- [x] 3.2 `src/lib/ajustes.ts` pura (cargo objetivo o FIFO) testeada antes de usarse
  - Evidencia: RED→GREEN, 30 pruebas; `planAjuste` delega en `allocateFifo` y `planReversa` deriva la restauración del propio delta de cada fila. Commits `ab68886`, `9ef9f4c`.
- [x] 3.3 Escritor único (`src/features/ajustes/repo.ts`) con cesión pareada y reversa auditada
  - Evidencia: 12 pruebas (9 puras + 2 guardas de fuente + la cesión a sí mismo); el libro se escribe antes de mutar cargos y cada escritura multi-fila es una sola sentencia; nunca toca `registro_pagos`. Commits `d7b1321`, `9ef9f4c`.
- [x] 3.4 Módulo de UI: condonación, cesión, pago a tercero y reversa auditada
  - Evidencia: `src/features/ajustes/index.ts` + nav + `index.html`; **la comprobación en navegador NO se ejecutó** (no hay sesión viva aquí). Commits `9aaca87`, `9ef9f4c`.
- [x] 3.5 Guardia "naturaleza del cobro" en el formulario de Pagos — evidencia: el camino de `'ajuste'`/vacío retorna antes de toda lectura o escritura; sólo existe un sitio que inserta en `registro_pagos` (`aplicarPago`). Commit `47f2528`.
- [x] 3.6 Reporte "Ajustes otorgados" + indicador "Posición neta" fuera del balance — evidencia: `sumAjustesOtorgados`/`netPositionCents`; `computeCaja` intacto. Commit `47f2528`.
- [ ] 3.7 Refinamiento (a decidir): cobrar a un ex miembro con saldo pendiente (tarea 4.1 de `tasks.md`).

**Pendiente real de E2 (no bloquea, exige navegador o base viva):** preview y guardado del formulario, prompt/confirm de la reversa, render de las tarjetas del Arca y de la tabla de ajustes del historial, la igualdad de totales tras una cesión real, la restauración al centavo tras una reversa real y la fila "ya revertido" en la lista de recientes (ésta última sólo mira las últimas 50 filas; el escritor y el índice único rechazan la doble reversa aunque la UI no la marque). La evidencia de `tasks.md` 2.3 es **parcial**: la "prueba de que el escritor no inserta en `registro_pagos`" es una aserción sobre el TEXTO de la fuente, no una ejecución del escritor.

**Forma del libro (D5/D7), congelada para la implementación:** una fila por cargo afectado; `monto` es el delta CON SIGNO aplicado a `cargos.monto_pendiente`; `pendiente_resultante` es el valor que la fila dejó y es lo que hace la reversa demostrable; `grupo_id` une las filas de una acción; `grupo_revertido` nombra el grupo que una fila `reversa` corrige. Una cesión son dos filas más un cargo nuevo para el receptor. `pago_tercero` tiene la misma forma que la condonación (reduce el cargo, no entra efectivo al arca, contraparte nula): un tercero pagó por el miembro.

**Desviación consciente y declarada:** `supabase-js` no ofrece una transacción multi-sentencia, así que el escritor replica el patrón ya aceptado de `aplicarPago` (escrituras secuenciales) pero **escribe primero las filas del libro** (con el id del cargo nuevo generado en el cliente) y después aplica los cargos. Una falla parcial queda documentada en el libro y es corregible con la propia reversa, que es la tesis del diseño.

## Evidence required to close each task

- E1: the replay assertion passes **before** and **after**; the arca and por cobrar values are read back; the `_down` reverses to the exact pre-state.
- E3/E2: `vitest run` green and `tsc --noEmit` clean before each commit; the combobox and the adjustments module verified in a real browser session.
- Every task: one work-unit commit on a feature branch, Conventional Commit message, commit id recorded in the OpenSpec `tasks.md`.

## Open risks (do not lose)

1. **A measurable class of `registro_pagos` is not cash** — rows whose own `observaciones` say so in words. Out of scope by decision (D6). Full evidence in `openspec/changes/reparacion-rodada-san-luis/design.md`.
2. **A retired member with a pending balance disappears from "Por cobrar" and the public ranking** (the `activo=false` exclusion in `src/lib/debt-view.ts`). Decision pending (task 3.6).
3. **Legacy outliers stay untouched**: `cargos` rows carrying sub-cent residues, `registro_apoyos` rows whose total does not equal the sum of their cargos (one materially, a legacy double charge), and `registro_pagos` rows with no author.
4. **The retirement warning is a spec requirement that is NOT implemented** (`reparacion-rodada-san-luis`, `member-lifecycle` delta; task 2.3): retiring a member with a balance must warn the operator that the balance stops appearing in "Por cobrar". The retire flow says nothing today. Nothing can be archived until it lands or the requirement is withdrawn.
5. **E2 is implemented, applied and deployed** (2026-10-08). Its ledger shape is fixed by `ajustes-y-clasificacion/design.md` D5 and D7 — one row per affected cargo, tied by a `grupo_id`, with a cession creating a second cargo for the receiver and a reversal that restores each row's own delta. Read those two decisions before changing `phase11`. **`registro_ajustes` still holds 0 rows**: the writer has never run against real data.
6. **The public-repository rule**: no real financial figures in committed artifacts. Restoration values live in private project memory; the script derives them from the database instead of hardcoding them.

## Despliegue a producción (2026-10-08)

Lo que faltaba no era un ajuste de Vercel: la rama **no tenía upstream y no existía en el remoto**, así que el insumo del build nunca llegó a GitHub y Vercel no tenía nada que construir (el último deployment de Production registrado era `a456172` = `origin/main`, del 2026-09-15). Se publicó en tres pasos y ninguno de ellos es una palanca del panel de Vercel:

1. Push de la rama con el PAT clásico de `skyclick1939` (el identity por defecto de la máquina, `consultores-orion`, no tiene escritura en este repo).
2. PR **#4**, con el cuerpo estructurado como las 17 unidades de trabajo.
3. **Merge a `main`** como `1cad01a` (merge commit real, no squash: la convención del repo, igual que los PR #1–#3). `main` no tiene branch protection ni rulesets, así que el único gate era la decisión humana de publicar. **Nunca promover un preview a Production.**

Vercel construyó `main` y registró un deployment **Production** de `1cad01a` a las 2026-10-08T02:40:01Z. Lectura de verificación sobre la superficie viva, no sobre un build local:

- `/` responde 200 con 58,697 bytes, 12 ocurrencias de `ajustes` y 23 de `concepto` (antes del deploy: 41,972 bytes, 0 y 0).
- El bundle servido `/assets/main-DDMBCs89.js` contiene `registro_ajustes`, `catalogo_conceptos`, `condonacion`, `pago_tercero` y `deuda-concepto-filter`; el shell expone la entrada de navegación `#ajustes`.
- `/vista/` 200 y `/api/debt-view` 200.
- Base de datos: `catalogo_conceptos` y `registro_ajustes` existen, cada una con una sola política `ALL` (`admins_all_*`); `anon` no tiene privilegio sobre ninguna (una sonda REST devuelve `42501 permission denied`, lo que además prueba que PostgREST las tiene en su caché de esquema); las dos columnas `concepto_id` son nullable; y la FK `registro_ajustes_contraparte_miembro_id_fkey` — el nombre exacto que el código embebe — existe.
- `catalogo_conceptos` conserva sus 6 conceptos sembrados, todos activos. **El concepto `rodada` no existe todavía**, así que el backfill de 66 filas sigue sin poder arrancar.
- `registro_ajustes` con 0 filas.

**Sin verificar, y sólo el operador puede cerrarlo:** las cinco comprobaciones de navegador (tareas 1.3–1.8). Este entorno no tiene sesión viva, así que nada de este despliegue se validó haciendo clic en la interfaz.
