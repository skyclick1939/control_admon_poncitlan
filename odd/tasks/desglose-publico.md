# Feature: desglose público por miembro y trazabilidad de adeudos en /vista/

**Status:** **desplegado en producción 2026-10-21** (PR #9 → `b67d4c2`; Vercel construyó `main`).
**Branch:** `feat/desglose-publico-vista` (+ `-1`, `-2`, `-3` como cadena apilada)
**Related:** `api/debt-view.ts`, `src/lib/public-breakdown.ts`, `vista/index.html`, `openspec/changes/desglose-publico-miembro/`, `odd/tasks/coherencia-sin-cargos.md`

> **Figuras ausentes por diseño.** Este repositorio es público.

## Specs

**S1.** El operador pide, en la página pública, «un apartado o un desglose detallado de los movimientos realizados por usuario, algo como: nickname, monto abonado/pagado, saldo, conceptos y montos de apoyos pendientes por cubir a detalle».

**S2.** El operador pide «una tabla donde pueda mostrar estos detalles y así haya aún más transparencia, quiero algo intuitivo».

**S3.** El operador pide que cada usuario vea «a detalle sus respectivos adeudos», entendiendo el flujo de abono como «cierto abono se le abona alpha o al adeudo más antiguo y así hasta llegar al adeudo más actual para poderlo culminar ya con el pago total», y exige «toda esa trazabilidad».

**S4.** El operador pide «algo fácil, rápido e intuitivo, Pero sobre todo que no nos cueste tanto código», y autoriza explícitamente la exposición: «no hay ningún riesgo de absolutamente nada, ya que estamos trabajando sobre nickname» y el enlace «se comparte solamente con los miembros del motoclub».

**S5.** El operador pide encontrar y modificar las reglas escritas que bloquean la exposición, y advierte que más adelante evaluará listas blancas por IP o logins por usuario.

**S6.** Toda cifra publicada MUST ser derivable de columnas almacenadas; el sistema MUST NOT publicar un vínculo «este abono pagó este adeudo» que la base no registra. El reparto FIFO MUST presentarse como regla de aplicación, no como registro por abono.

**S7.** El operador pide, el 2026-10-21: «suple "concepto" por el "motivo" esto para que sea más intuitivo ya que en los motivos siempre se detallaron los apoyos.» La etiqueta de cada adeudo y la agrupación del club pasan a ser `registro_apoyos.motivo`, publicada tal cual, con «Sin motivo» cuando el apoyo no trae texto.

## Tasks

| ID | Tarea | Spec | Commit |
|----|-------|------|--------|
| T1 | Módulo puro `src/lib/public-breakdown.ts` + `public-breakdown.test.ts` (RED primero) | S3, S6 | `340151e` |
| T2 | Extender `api/debt-view.ts` y `DebtViewResponse` (cargos ampliados, pagos, ajustes) | S1, S6 | `fe7a656` |
| T3 | Enmendar `public-debt-view` spec y la nota de exclusión de `design.md` | S5 | `5def816` |
| T4 | UI de `/vista/`: tabla expandible, pendiente por concepto, `noindex`, print | S2, S4 | `1bb3b2b` |
| T5 | Verificación: `vitest run`, `tsc --noEmit`, `npm run build`, navegador | S1-S6 | ver «Verificación» |
| T6 | Commits por unidad de trabajo | S5 | `78a96b6` |

## Slices de revisión (`delivery_strategy: auto-chain`)

Límite de ~400 líneas por unidad de revisión; la cadena se apila sobre `main` y cada rama es la base de la siguiente.

| Slice | Contenido | Commits | Rama |
|-------|-----------|---------|------|
| 1 | Enmienda de spec, documento ODD, módulo puro y sus tests | `5def816`, `340151e`, `78a96b6` | `feat/desglose-publico-vista-1` |
| 2 | `api/debt-view.ts` + `src/lib/types.ts` | `fe7a656` | `feat/desglose-publico-vista-2` |
| 3 | `vista/index.html` + `src/public-view.ts` | `1bb3b2b` | `feat/desglose-publico-vista-3` |

Push, PR y merge quedan a decisión del operador; nada se publicó desde esta sesión.

## Despliegue (2026-10-21)

- **PR #9** `feat/desglose-publico-vista` → `main`, merge commit **`b67d4c2`**. Vercel construyó `main`; producción sirve el desglose.
- **Verificado contra producción, no contra un preview**: `/api/debt-view` 200 con `desglose`, la suma por miembro iguala `totalPendienteCents` al centavo, sin UUID ni `motivo`/`observaciones`/`token_hash`/`email`, y `/vista/` sirve `noindex`.
- **Follow-up** (`fix/sin-clasificar-empty-state`): los 265 cargos del historial están sin concepto, así que el pendiente por concepto salía como una única barra «Sin clasificar» al 100%, que se lee como un defecto. Ahora ese estado se explica en prosa.
- **Hueco de datos, no de código**: el desbloqueo de la dimensión «concepto» es el backfill guiado de `phase10_backfill_propuestas.sql`, que por D4 requiere revisión y aprobación del operador. No se aplicó.

## Verificación observada

- `vitest run` → 17 archivos, **295 tests verdes** (15 del módulo nuevo).
- `tsc --noEmit` → sin diagnósticos.
- `npm run build` + `postbuild` → sin filtración de `service_role` en `dist/`.
- Navegador (ego-browser): escritorio 2420 px y móvil 390×844, sin desbordamiento horizontal (`scrollWidth === clientWidth`). Impresión emulada: 5 de 5 detalles visibles y el botón de imprimir oculto; en pantalla, 0 visibles y `aria-expanded` alternando.
- Sin cambios de base de datos, sin migraciones, sin dependencias nuevas.

## Decisiones de diseño

- **D1 — Una sola fuente de cálculo.** El desglose no recalcula por su cuenta lo que `aggregateDebtByMember` ya resuelve: el endpoint deriva `deudores`/`totalPendienteCents` del desglose y un test fija la equivalencia con la función existente. `aggregateDebtByMember` se conserva intacta porque `caja/repo.ts` y `dashboard/index.ts` la usan.
- **D2 — Atribución por adeudo, nunca por abono.** Por cargo: `abonado = original − pendiente + ΣajustesNetos` y `ajustes = −ΣajustesNetos`, excluyendo las filas de creación de una cesión (`tipo='cesion'` con `monto>0` y `cargo_id` no nulo). Se verificó contra `construirFilasLibro` y contra la reversa (filas con `cargo_id` nulo, que no tocan la atribución por cargo).
- **D3 — Sin fila de conciliación.** La identidad global requiere sumar las filas de creación; publicarla ata la página a la semántica del writer. Se muestra `no aplicado` solo cuando difiere de cero.
- **D4 — Agrupar por `miembro.id`.** El ranking actual agrupa por nickname y fusiona homónimos.
- **D5 — Sin dependencias nuevas, sin cambios de base de datos.** Rollback = revertir dos archivos.
- **D6 — La etiqueta es el motivo, no el concepto.** Medido en producción: los 265 cargos tienen `concepto_id = null` (el backfill nunca corrió), mientras hay 51 motivos distintos, 49 caracteres de largo promedio. Publicar el concepto dejaba una columna entera de «Sin clasificar»; el motivo es lo que el club escribió. El operador vio antes las cadenas concretas — un motivo en 7 filas dice «Apoyo a Guanajuato Cx. Próstata y carnal involucrado con armas» — y eligió publicarlas igual. La tarjeta del club agrupa por motivo y suma la cola en «Otros (N motivos)» para no convertirse en una lista de 51 renglones.

## Log

**L1 (2026-10-20, solicitud original, verbatim):**
«Quiero que a este aplicativo le agregues en la parte "pública" https://control-admon-poncitlan.vercel.app/vista/ Un apartado o un desglose detallado de los movimientos realizados por usuario, algo como: nickname, monto abonado/pagado, saldo, conceptos y montos de apoyos pendientes por cubir a detalle... quiero una tabla donde pueda mostrar estos detalles y así haya aún más transparencia, quiero algo intuitivo. Antes de que lo implementes, quiero que lo analices, quiero que lo estudies y que recabes todo lo que necesitas para posteriormente planificarlo adecuadamente y después mostrarme tu propuesta. Me gustaría que me dijeras si tienes alguna otra propuesta, algo que mejore la idea o algún complemento, todo ello obviamente apalancándote siempre con tu colaborador antigravity que en este momento ya lo tienes habilitado y te podrás comunicar con gentle-bridge Hasta llegar a un consenso.»

**L2 (2026-10-21, autorización y cambio de decisión, verbatim):**
«Me interesa el que los usuarios puedan ver a detalle sus respectivos adeudos, Ya que entendiendo lo que viene siendo el flujo de un abono es en donde cierto abono se le abona alpha o al adeudo más antiguo y así hasta llegar al adeudo más actual para poderlo culminar ya con el pago total, Entonces, necesito tener toda esa trazabilidad para que el usuario toda esa transparencia. Me doy cuenta de que hay ciertas reglas ya escritas, el cual te empiezan a bloquear, necesito Que encuentres todas esas reglas y las modifiques para que no te esté bloqueando una vez teniendo eso, aplica lo que te estoy mencionando y te comento que no hay ningún riesgo de absolutamente nada, ya que estamos trabajando sobre nickname, Saldos de que la gente o el público no va a entender, Y pues, simplemente este link se comparte solamente con los miembros del motoclub, Que más adelante me daré el lujo de poder validar ciertas IPs y bloquear otras más en caso de que haya desertores. Prácticamente crear como un tipo lista blanca O en su defecto, crear loggings para cada uno de los usuarios para que puedan acceder a un módulo "mi cuenta" Pero por lo pronto necesito algo fácil, rápido e intuitivo, Pero sobre todo que no nos cueste tanto código.»

**L3 (2026-10-21, evidencia de la auditoría del par):** antigravity, ronda 1 `counter` con 6 hallazgos; ronda 2 `agree` con voto de cierre `concede`. Hallazgos verificados contra el código: signo de `registro_ajustes.monto` (negativo en reducciones), ruptura de la identidad para el receptor de una cesión, conceptos delicados del catálogo, ausencia de `noindex`, `details` inválido dentro de `tbody`, scraping. Los cinco primeros se corrigieron en el diseño; el sexto se re-calificó a `low` y el operador asume el residuo en L2.

**L4 (2026-10-21, revisión del par sobre la implementación):** ronda 1 `dissent` con **un defecto real**: una cesión revertida dejaba `sinEfectivoCents` fantasma en el receptor. La exclusión cubría la fila de creación (`cesion`, `monto>0`, `cargo_id` no nulo) pero no su espejo, que `revertirAjuste` escribe con `monto` negativo (`ajustes/repo.ts:482`). Reproducido con un test en rojo (`public-breakdown.test.ts:151`), corregido en `describeCreacionDelCargo` (`public-breakdown.ts:132-135`). Severidad re-calificada de `high` a `medium`, aceptada por el par: el efecto es una nota falsa de presentación, sin mutar datos ni filtrar nada. Ronda 2 `agree`, voto `concede`.

**L5 (2026-10-21, verificación visual):** tres defectos que solo aparecieron al mirar la página, no al leer el código. (1) La columna `Saldo` se recortaba en el detalle a dos columnas dentro de una celda. (2) En móvil quedaban fuera de pantalla `Cubierto` y `Saldo`, justo las que importan. (3) La regla de impresión no aplicaba: Tailwind v4 declara `[hidden]{display:none!important}` dentro de `@layer base`, y para declaraciones `!important` el orden de capas se invierte, así que ninguna regla sin capa puede reabrir la fila. Se cambió el mecanismo a una clase propia, igual que el `.view-hidden` que el proyecto ya usaba.

**L6 (2026-10-21, cambio de etiqueta, verbatim):** «suple "concepto" por el "motivo" esto para que sea más intuitivo ya que en los motivos siempre se detallaron los apoyos.» Antes de ejecutarlo se midió la forma real de los motivos y se citó al operador la cadena sensible concreta; eligió publicarla. Ver D6.
