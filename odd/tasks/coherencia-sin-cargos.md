# Feature: coherencia de "sin cargar" — un solo mecanismo para el gasto que absorbe el Arca

**Status:** **desplegado en producción 2026-10-08** (PR #8 → `56b43e3`, Production a las 03:59:01Z).
**Owner:** club operator (product owner) · **Repo branch:** `fix/coherencia-sin-cargos`, merged into `main` as `56b43e3`
**Related:** `supabase/sql/phase8_reclasificar_gasto_sin_cargar.sql` (el precedente), `openspec/specs/caja/spec.md`, `odd/tasks/selector-naturaleza-visibilidad.md`

> **Figures are deliberately absent.** This repository is public.

## El hallazgo del operador (2026-10-08)

Reportó redundancia entre dos caminos que él lee como el mismo movimiento: `Dividir entre = Individual` marcando al miembro **`Gastos_sin_cargar`**, y `Dividir entre = Sin cargos — absorbido por el Arca`. Pidió coherencia y advirtió que no se rompa nada.

## Diagnóstico medido

`Gastos_sin_cargar` (`c1a84519-d8a4-4ce5-a32c-513a8a96576a`) es un miembro con `status='interno'`, `activo=true`, creado el 2026-09-15, y **el único interno del sistema**. Referencias vivas: `cargos` **0**, `registro_pagos` **0**, `registro_ajustes` **0**, `registro_egresos` como beneficiario **3** (con `nombre_beneficiario` denormalizado, que sobrevive a cualquier baja).

**Los dos caminos NO son el mismo movimiento en el libro**: el camino del pseudo-miembro crea un `cargos` real — un por cobrar que nadie va a pagar. Es exactamente lo que `phase8_reclasificar_gasto_sin_cargar.sql` tuvo que reparar a mano una vez (*"A loan implies a receivable that returns; this money does not… its phantom pending cargo … must disappear"*).

**Causa raíz de la ambigüedad:** `Sin cargos` vive dentro de un control cuya pregunta es "¿entre quiénes lo reparto?". No responde esa pregunta; responde otra. Por eso se lee como un cuarto par de Individual/Fullparch/Todos.

**Confirmación en el código de que el interno no es pagador:** `getMembersToCharge` **ya** lo excluye para `TODOS` y `FULLPARCH`; `aggregateDebtByMember` **ya** lo excluye de los saldos. Lo único que faltaba era excluirlo de **las listas donde se elige a quién cobrar**: `activeMiembros()` filtra sólo por `activo`.

## Plan aprobado por el operador

### P1 — El miembro interno deja de ser parte cobrable (código)
Pura nueva `miembrosSeleccionables()` = `activo && status !== 'interno'`, aplicada donde se elige a quién cobrar o pagar: lista de miembros del apoyo, su beneficiario, el selector de Pagos y los dos de Ajustes. `activeMiembros` se conserva.

### P2 — Cada control hace una sola pregunta (copys)
`Dividir entre` pasa a **`¿Quién lo paga?`** y sus opciones contestan esa pregunta: `Un solo miembro`, `Sólo los Fullparch`, `Todos los miembros`, **`Nadie: gasto sin cargar (lo absorbe el Arca)`**. El valor de base `SIN_CARGOS` no se toca.

### P4 — El catálogo cierra el hueco (aditivo)
Los cuatro propósitos de apoyo existen también como no recuperables: `Apoyo aniversario (absorbido por el Arca)`, `Apoyo a accidentados (absorbido por el Arca)`, `Apoyo hermano caído (absorbido por el Arca)`, `Apoyo legal (absorbido por el Arca)`. Hoy el camino absorbido sólo podía clasificarse como Donaciones o Adquisiciones del capítulo, que significan otra cosa.

### P3 — El pseudo-miembro se retira (dato, reversible)
`activo=false` sobre el único registro interno. No se borra: la FK de `registro_egresos.beneficiario_id` apunta ahí y el nombre está denormalizado.

## Fuera de alcance (declarado)

- **P2 estructural** (separar `Cubre` de `Dividir entre`): mejor diseño, pero toca la regla de dinero. Queda para después, con la auditoría encima.
- **El backfill de los 3 egresos sin concepto**: la spec exige que el operador revise y apruebe cada propuesta antes de escribir una sola fila (D4). Se produce la lista de revisión, **no se aplica**.
- Renombrar el valor `SIN_CARGOS` en la base.

## Tasks

- [x] 1.1 `miembrosSeleccionables` con TDD en `src/lib/miembros.ts` + `miembros.test.ts`: **RED** 7 fallas (`miembrosSeleccionables is not a function`) → **GREEN** 10/10. Cubre: excluye `interno` aunque esté activo, excluye retirados, conserva fullparch y prospecto, preserva el orden, no muta, y concuerda con `activeMiembros` en todo menos el interno.
- [x] 1.2 Aplicada en las cinco superficies: lista de miembros del apoyo, su beneficiario (el comentario que decía "internal members included" se corrigió), `getMembersToCharge` para INDIVIDUAL, el selector de Pagos y los dos de Ajustes. `activeMiembros` sigue exportada e intacta.
- [x] 1.3 `Dividir entre` → **`¿Quién lo paga?`**; opciones: `Un solo miembro`, `Sólo los Fullparch`, `Todos los miembros`, **`Nadie: gasto sin cargar (lo absorbe el Arca)`**. Los valores de base `INDIVIDUAL`/`FULLPARCH`/`TODOS`/`SIN_CARGOS` **no se tocaron**. Copy de `conceptos.ts` alineado (incluida `NATURALEZA_HELP` y el texto estático de `#concepto-help`). Cero referencias residuales a "Dividir entre".
- [x] 1.4 `npx tsc --noEmit` exit 0; `npx vitest run` 16/16 archivos y **280/280**; `npm run build` exit 0 con el guard verde; cobertura de clases 224 tokens con **0 faltantes reales**.
- [x] 1.5 **P4 aplicado.** `supabase/sql/phase12_coherencia_sin_cargos.sql` (+ `_down`) creó los cuatro conceptos absorbidos. **Prueba de cero rastro**: forward + down en una sola llamada atómica dejó el estado previo exacto (6 conceptos, 2 no recuperables, miembro activo) y el read-back posterior lo confirmó. Read-back final: **10 conceptos activos** (4 recuperables + 6 no recuperables).
- [x] 1.6 **P3 aplicado.** `Gastos_sin_cargar`: `status='interno'`, `activo=false`. No se borró nada: los 3 `registro_egresos` que lo referencian conservan su `nombre_beneficiario` denormalizado (verificado: 3 egresos intactos).
- [x] 1.7 PR **#8** mergeado a `main` como `56b43e3`. Verificación sobre el HTML y el bundle **servidos**: `¿Quién lo paga?` presente, `Nadie: gasto sin cargar` presente, `Un solo miembro` presente, `Dividir entre` **0**, y el bundle `main-Dz4V9E2z.js` con el copy nuevo y **sin** el viejo. `/vista/` 200.
- [x] 1.8 **Lista de revisión del backfill producida, ninguna fila escrita** (spec `catalogo-conceptos`, D4: el operador aprueba o corrige cada propuesta antes de que se escriba una sola fila). Los 3 egresos siguen con `concepto_id` nulo.

## Evidence required to close each task

- 1.1: salida RED y GREEN.
- 1.2: el HTML servido ya no ofrece el pseudo-miembro en ninguna de las cinco superficies.
- 1.3: los rótulos nuevos en el HTML servido y el copy de `conceptos.ts` alineado.
- 1.5/1.6: read-back de la base (conceptos creados con su naturaleza; `activo=false` en el miembro) y la sentencia de reversa de cada uno.
- 1.8: la lista propuesta, sin ninguna escritura.

## Backfill propuesto para los 3 egresos sin concepto (NO aplicado)

La spec exige revisión del operador antes de escribir una sola fila, así que esto es una **propuesta**:

| id | fecha | motivo | concepto propuesto |
|---|---|---|---|
| `8a7c3e10…0008` | 2026-09-15 | "Acumulativo Gastos sin cargar absorbido por la ARCA … Aporte Aniv. San Luis y … Aporte accidente Diego DF …" | **Requiere decisión**: son dos propósitos en una sola fila (`Apoyo aniversario (absorbido por el Arca)` + `Apoyo a accidentados (absorbido por el Arca)`). Clasificar con uno solo sería inventar. |
| `64da62d2…` | 2026-09-19 | "Apoyo a Marlboro Regional Bajío para su cirugía (cáncer)" | `Apoyo a accidentados (absorbido por el Arca)` — a confirmar por el operador |
| `a474dbb5…` | 2026-09-21 | "Aniversario Morelos" | `Apoyo aniversario (absorbido por el Arca)` |

## Open risks

1. Sin navegador: el clic vuelve a ser del operador.
2. La auditoría del colaborador sigue bloqueada porque no hay host del bridge.
3. `miembros` tiene 11 registros (6 fullparch, 4 prospecto, 1 interno) y la lista del apoyo mostraba 8; conviene que el operador confirme que ningún miembro legítimo lleva `status='interno'` (hoy sólo el pseudo-miembro lo lleva).
