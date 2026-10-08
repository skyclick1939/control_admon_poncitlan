# Feature: que nunca vuelva a parecer que faltan conceptos

**Status:** **desplegado en producción 2026-10-08** (PR #7 → `34f8864`, Production a las 03:36:09Z).
**Owner:** club operator (product owner) · **Repo branch:** `fix/selector-naturaleza-visibilidad`, merged into `main` as `34f8864`
**Related:** `odd/tasks/concepto-desplegable-fijo.md`, `openspec/changes/ajustes-y-clasificacion` (delta `catalogo-conceptos`, design D9)

> **Figures are deliberately absent.** This repository is public.

## El reporte (tercera vez el mismo síntoma)

El operador mandó captura del desplegable abierto con exactamente: `-- Seleccione un concepto --`, `Adquisiciones del capítulo`, `Donaciones`, `➕ Crear concepto nuevo…` y preguntó *"solamente me aparecen dos opciones, se supone que me deben de parecer más ¿qué pasó?"*.

**Diagnóstico medido, no supuesto:** esas dos son exactamente los conceptos `no_recuperable` del catálogo, y el campo está **habilitado** (borde azul, no gris). La única manera de llegar a ese estado es que `Dividir entre` valga `SIN_CARGOS`. **No hay defecto de código.** El catálogo tiene 4 conceptos `recuperable` (los apoyos) y 2 `no_recuperable`; la modalidad "Sin cargos" no crea adeudo, así que por regla sólo puede ofrecer los 2 no recuperables.

**El defecto real es que ya van tres veces que el operador choca con esto.** Explicarlo otra vez no es un arreglo; el formulario tiene que decirlo solo y dar la salida en un clic.

## What changes

- La nota bajo el selector nombra **cuántos** conceptos ofrece la modalidad y de qué naturaleza: así "dos opciones" deja de leerse como una falla.
- Con `SIN_CARGOS`, la nota va en ámbar y dice explícitamente que los conceptos de apoyo son recuperables y que se ofrecen con Individual, Fullparch o Todos.
- Aparece un **atajo de un clic** que cambia `Dividir entre` a Individual y repuebla el desplegable, en lugar de dejar al operador en un callejón sin salida.

## What does NOT change

- El filtro por naturaleza: sigue siendo requisito de la spec. **No se relaja la regla del libro contable.**
- El catálogo y sus datos. `motivo` sigue libre (D10).
- El módulo de Ajustes.

## Decisión de producto pendiente (no la tomo yo)

Si el operador captura apoyos que **el Arca absorbe**, el catálogo no tiene ningún concepto de apoyo no recuperable: hoy tendría que usar "Donaciones" (que significa otra cosa) o cambiar a una modalidad que crea adeudo (que diría otra economía). Eso es un hueco de modelo de dominio, no un defecto de interfaz, y se le presenta como decisión suya con su costo.

## Tasks

- [x] 1.1 Puras con TDD: `notaConceptosDisponibles(naturaleza, disponibles)` (singular/plural y `null` sin modalidad) y `ofreceAtajoApoyos(naturaleza)`. **RED** 6 fallas (`notaConceptosDisponibles is not a function`, `ofreceAtajoApoyos is not a function`) → **GREEN** 41/41. La prueba que impide que el copy incruste nombres del catálogo se extendió a las dos funciones nuevas.
- [x] 1.2 Markup: `#concepto-nota` y `#concepto-atajo-individual`, dos líneas, justo después de `#concepto-help`. Nada más del archivo cambió.
- [x] 1.3 Cableado: la nota se calcula en `refreshConceptoUi`, se pinta ámbar con `no_recuperable` y gris con `recuperable`; el atajo se muestra sólo cuando `ofreceAtajoApoyos` lo pide y, al hacer clic, cambia la modalidad a Individual y ejecuta **el mismo camino** del manejador de cambio, extraído a `applyTipoDivisionChange` para no duplicar la lógica.
- [x] 1.4 `npx tsc --noEmit` exit 0; `npx vitest run` 16/16 archivos y **273/273**; `npm run build` exit 0 con el guard verde. Cobertura de clases: 224 tokens, 15 sin regla, todos los ya conocidos (12 ganchos de JS + 3 clases de los `<style>` embebidos). **0 faltantes reales.**
- [x] 1.5 PR **#7** mergeado a `main` como `34f8864`. Verificación sobre lo servido: `#concepto-nota` y `#concepto-atajo-individual` presentes en el HTML, el `<select id="concepto_apoyo">` sigue ahí, y el bundle `main-LIAmWtge.js` contiene el copy nuevo («no crea adeudo», «conceptos no recuperables»).

## Transitorio cerrado por el padre

El ejecutor reportó que, mientras la carga del catálogo está en vuelo, la nota diría «0 conceptos … disponibles», y eso se puede leer como «esta modalidad no tiene conceptos». Se suprimió la nota mientras `conceptos.length === 0`: un conteo en cero nunca debe verse como una respuesta.

## Open risks

1. Sigo sin navegador: la prueba del clic vuelve a ser del operador.
2. La auditoría del colaborador continúa bloqueada porque no hay host del bridge.
3. **Hueco de modelo de dominio, no resuelto aquí**: `Beneficiario (opcional)` sólo se muestra con `SIN_CARGOS` (`src/features/apoyos/index.ts`, la línea que hace `toggle` sobre `beneficiarioListDiv`), lo que sugiere que la captura «apoyo absorbido por el Arca para una persona» es un flujo real — y el catálogo **no tiene ningún concepto de apoyo no recuperable**. Con la regla actual, ese flujo sólo puede clasificarse como «Donaciones» o «Adquisiciones del capítulo», que significan otra cosa. El formulario ya permite crear el concepto que falta en el momento (`➕ Crear concepto nuevo…`, que fija la naturaleza correcta solo); la alternativa —que el concepto decida la naturaleza en vez de la modalidad— es un cambio de spec y queda como decisión del operador.
