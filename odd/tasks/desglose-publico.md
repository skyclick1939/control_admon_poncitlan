# Feature: desglose público por miembro y trazabilidad de adeudos en /vista/

**Status:** en implementación · **Branch:** `feat/desglose-publico-vista`
**Related:** `api/debt-view.ts`, `src/lib/public-breakdown.ts`, `vista/index.html`, `openspec/changes/desglose-publico-miembro/`, `odd/tasks/coherencia-sin-cargos.md`

> **Figuras ausentes por diseño.** Este repositorio es público.

## Specs

**S1.** El operador pide, en la página pública, «un apartado o un desglose detallado de los movimientos realizados por usuario, algo como: nickname, monto abonado/pagado, saldo, conceptos y montos de apoyos pendientes por cubir a detalle».

**S2.** El operador pide «una tabla donde pueda mostrar estos detalles y así haya aún más transparencia, quiero algo intuitivo».

**S3.** El operador pide que cada usuario vea «a detalle sus respectivos adeudos», entendiendo el flujo de abono como «cierto abono se le abona alpha o al adeudo más antiguo y así hasta llegar al adeudo más actual para poderlo culminar ya con el pago total», y exige «toda esa trazabilidad».

**S4.** El operador pide «algo fácil, rápido e intuitivo, Pero sobre todo que no nos cueste tanto código», y autoriza explícitamente la exposición: «no hay ningún riesgo de absolutamente nada, ya que estamos trabajando sobre nickname» y el enlace «se comparte solamente con los miembros del motoclub».

**S5.** El operador pide encontrar y modificar las reglas escritas que bloquean la exposición, y advierte que más adelante evaluará listas blancas por IP o logins por usuario.

**S6.** Toda cifra publicada MUST ser derivable de columnas almacenadas; el sistema MUST NOT publicar un vínculo «este abono pagó este adeudo» que la base no registra. El reparto FIFO MUST presentarse como regla de aplicación, no como registro por abono.

## Tasks

| ID | Tarea | Spec | Commit |
|----|-------|------|--------|
| T1 | Módulo puro `src/lib/public-breakdown.ts` + `public-breakdown.test.ts` (RED primero) | S3, S6 | `feat(public):` |
| T2 | Extender `api/debt-view.ts` y `DebtViewResponse` (cargos ampliados, pagos, ajustes) | S1, S6 | `feat(api):` |
| T3 | Enmendar `public-debt-view` spec y la nota de exclusión de `design.md` | S5 | `docs(openspec):` |
| T4 | UI de `/vista/`: tabla expandible, pendiente por concepto, `noindex`, print | S2, S4 | `feat(vista):` |
| T5 | Verificación: `vitest run`, `tsc --noEmit`, `npm run build`, smoke del endpoint | S1-S6 | — |
| T6 | Commits por unidad de trabajo | S5 | — |

## Slices de revisión (`delivery_strategy: auto-chain`)

Límite de ~400 líneas por unidad de revisión; la cadena se apila sobre `main` y cada rama es la base de la siguiente.

| Slice | Contenido | Commits |
|-------|-----------|---------|
| 1 | Enmienda de spec, documento ODD, módulo puro y sus tests | `5def816`, `340151e` |
| 2 | `api/debt-view.ts` + `src/lib/types.ts` | pendiente |
| 3 | `vista/index.html` + `src/public-view.ts` | pendiente |

Ramas apiladas: `feat/desglose-publico-vista-1` → `-2` → `-3`. Push, PR y merge quedan a decisión del operador; nada se publica desde esta sesión.

## Decisiones de diseño

- **D1 — Una sola fuente de cálculo.** El desglose no recalcula por su cuenta lo que `aggregateDebtByMember` ya resuelve: el endpoint deriva `deudores`/`totalPendienteCents` del desglose y un test fija la equivalencia con la función existente. `aggregateDebtByMember` se conserva intacta porque `caja/repo.ts` y `dashboard/index.ts` la usan.
- **D2 — Atribución por adeudo, nunca por abono.** Por cargo: `abonado = original − pendiente + ΣajustesNetos` y `ajustes = −ΣajustesNetos`, excluyendo las filas de creación de una cesión (`tipo='cesion'` con `monto>0` y `cargo_id` no nulo). Se verificó contra `construirFilasLibro` y contra la reversa (filas con `cargo_id` nulo, que no tocan la atribución por cargo).
- **D3 — Sin fila de conciliación.** La identidad global requiere sumar las filas de creación; publicarla ata la página a la semántica del writer. Se muestra `no aplicado` solo cuando difiere de cero.
- **D4 — Agrupar por `miembro.id`.** El ranking actual agrupa por nickname y fusiona homónimos.
- **D5 — Sin dependencias nuevas, sin cambios de base de datos.** Rollback = revertir dos archivos.

## Log

**L1 (2026-10-20, solicitud original, verbatim):**
«Quiero que a este aplicativo le agregues en la parte "pública" https://control-admon-poncitlan.vercel.app/vista/ Un apartado o un desglose detallado de los movimientos realizados por usuario, algo como: nickname, monto abonado/pagado, saldo, conceptos y montos de apoyos pendientes por cubir a detalle... quiero una tabla donde pueda mostrar estos detalles y así haya aún más transparencia, quiero algo intuitivo. Antes de que lo implementes, quiero que lo analices, quiero que lo estudies y que recabes todo lo que necesitas para posteriormente planificarlo adecuadamente y después mostrarme tu propuesta. Me gustaría que me dijeras si tienes alguna otra propuesta, algo que mejore la idea o algún complemento, todo ello obviamente apalancándote siempre con tu colaborador antigravity que en este momento ya lo tienes habilitado y te podrás comunicar con gentle-bridge Hasta llegar a un consenso.»

**L2 (2026-10-21, autorización y cambio de decisión, verbatim):**
«Me interesa el que los usuarios puedan ver a detalle sus respectivos adeudos, Ya que entendiendo lo que viene siendo el flujo de un abono es en donde cierto abono se le abona alpha o al adeudo más antiguo y así hasta llegar al adeudo más actual para poderlo culminar ya con el pago total, Entonces, necesito tener toda esa trazabilidad para que el usuario toda esa transparencia. Me doy cuenta de que hay ciertas reglas ya escritas, el cual te empiezan a bloquear, necesito Que encuentres todas esas reglas y las modifiques para que no te esté bloqueando una vez teniendo eso, aplica lo que te estoy mencionando y te comento que no hay ningún riesgo de absolutamente nada, ya que estamos trabajando sobre nickname, Saldos de que la gente o el público no va a entender, Y pues, simplemente este link se comparte solamente con los miembros del motoclub, Que más adelante me daré el lujo de poder validar ciertas IPs y bloquear otras más en caso de que haya desertores. Prácticamente crear como un tipo lista blanca O en su defecto, crear loggings para cada uno de los usuarios para que puedan acceder a un módulo "mi cuenta" Pero por lo pronto necesito algo fácil, rápido e intuitivo, Pero sobre todo que no nos cueste tanto código.»

**L3 (2026-10-21, evidencia de la auditoría del par):** antigravity, ronda 1 `counter` con 6 hallazgos; ronda 2 `agree` con voto de cierre `concede`. Hallazgos verificados contra el código: signo de `registro_ajustes.monto` (negativo en reducciones), ruptura de la identidad para el receptor de una cesión, conceptos delicados del catálogo, ausencia de `noindex`, `details` inválido dentro de `tbody`, scraping. Los cinco primeros se corrigieron en el diseño; el sexto se re-calificó a `low` y el operador asume el residuo en L2.
