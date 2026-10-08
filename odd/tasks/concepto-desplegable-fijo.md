# Feature: el concepto se elige de un desplegable fijo

**Status:** **desplegado en producción 2026-10-08** (PR #6 → `907e075`, Production a las 03:25:20Z). Pendientes: el pase visual del operador y la auditoría del colaborador.
**Owner:** club operator (project owner) · **Repo branch:** `feat/concepto-desplegable-fijo`, merged into `main` as `907e075`
**Related:** `openspec/changes/ajustes-y-clasificacion` (delta `catalogo-conceptos`, design D2/D9/D10)

> **Figures are deliberately absent.** This repository is public.

## Decision taken by the operator (2026-10-08)

Instrucción textual: *"necesito que puntualmente en 'Concepto (clasificación)' se desplieguen las opciones para poder seleccionar, son conceptos FIJOS, para que más adelante se puedan aprovechar correctamente por filtros, por consultas… por eso quiero una lista desplegable de esas opciones ya determinadas."*

Es una **decisión de producto del dueño del producto**, y sustituye al requisito de "selector buscable" que el delta `catalogo-conceptos` había congelado. El motivo que da él es el correcto: lo que importa es que la clasificación sea **un valor del catálogo**, elegido de una lista cerrada, para que filtros y consultas lo puedan aprovechar. Con seis conceptos y como máximo cuatro por naturaleza, teclear para filtrar no aporta y sí estorba.

## What changes

| Antes | Después |
|---|---|
| `<input list="concepto-options">` + `<datalist>`: había que teclear y coincidir | `<select id="concepto_apoyo">`: se elige de la lista |
| La creación en línea aparecía al teclear algo que no existía | La creación en línea es una opción más de la lista ("Crear concepto nuevo…") y pide el nombre en su propio campo |
| `searchConceptos` / `resolveConcepto` resolvían texto libre | Se eliminan junto con sus pruebas: sin tecleo no tienen llamador |

## What does NOT change

- El filtro por naturaleza: una modalidad que crea adeudo ofrece sólo `recuperable`; la que no crea ninguno, sólo `no_recuperable`.
- `motivo` sigue siendo texto libre y no se autorellena (design D10).
- El catálogo, sus políticas y sus datos.
- El selector del módulo de Ajustes (`index.html:514-515`) **no se toca**: es otro módulo con sus propias reglas y no fue lo pedido.

## Tasks

- [x] 1.1 Markup: `<select id="concepto_apoyo">` con sólo el marcador `-- Seleccione un concepto --`, y campo `#nuevo_concepto_nombre` dentro del panel de creación, antes del selector de naturaleza. Dos hunks, nada más.
- [x] 1.2 Puras nuevas `conceptosOfrecidos` y `conceptoPorId` con TDD: **RED** 12 fallas (4 + 5 de las nuevas y 3 de copy), **GREEN** 47/47.
- [x] 1.3 `conceptoAyudaText` con los cuatro estados nuevos; la prueba que deriva los seis nombres del catálogo desde la migración se conservó.
- [x] 1.4 Cableado: poblar por naturaleza en orden de catálogo, conservar la selección vigente con `conceptoPorId`, panel de creación sólo con la opción de crear, `concepto_id` resuelto por id en validación y guardado, y la ruta de desactivación comparando el valor del `<select>`.
- [x] 1.5 Eliminados `searchConceptos`, `ConceptoSearchResult` y `filterByNaturaleza` con sus 11 pruebas (no quedaba llamador). `resolveConcepto` **se conservó**: el módulo de Ajustes todavía lo llama (`src/features/ajustes/index.ts:357`), así que no era código muerto y borrarlo habría exigido tocar otro módulo. Comentario obsoleto corregido en `src/features/apoyos/repo.ts`.
- [x] 1.6 `npx tsc --noEmit` exit 0; `npx vitest run` 16/16 archivos y **268/268**; `npm run build` exit 0 con el guard `postbuild` verde.
- [x] 1.7 Delta enmendado: `specs/catalogo-conceptos/spec.md` (requisito "Fixed Dropdown with In-Line Creation", con la instrucción textual del operador como razón), `design.md` D9 y `proposal.md`. El rechazo anterior del `select` quedó registrado como **reversión**, no como refinamiento.
- [x] 1.8 PR **#6** mergeado a `main` como `907e075`. Verificación sobre el HTML y el bundle **servidos**: `<select id="concepto_apoyo">` = 1, `list="concepto-options"` = 0, `#nuevo_concepto_nombre` = 2 (etiqueta + campo), el datalist de Ajustes intacto = 2, y el bundle `main-BRmfivaB.js` con `__crear__`, `Seleccione un concepto` y `Crear concepto nuevo`, con **0** referencias a `searchConceptos`.

## Cobertura de clases tras el cambio

Re-ejecutada con el markup nuevo: **224** tokens distintos, **15** sin regla, y los 15 son los ya conocidos (12 ganchos de selección de JS y 3 clases propias de los `<style>` embebidos). **Faltantes reales de utilidades de Tailwind: 0** — el markup nuevo no introdujo ninguna clase sin regla.

## Evidence required to close each task

- 1.2/1.3: salida RED y GREEN.
- 1.4: el HTML servido en producción contiene el `<select id="concepto_apoyo">` y el bundle servido lleva las opciones nuevas.
- 1.7: el delta enmendado, citando la instrucción del operador.

## Open risks

1. **Sin navegador no puedo probar el clic.** La verificación estructural (markup + bundle + pruebas puras) es lo máximo alcanzable aquí; el pase visual es del operador.
2. **El módulo de Ajustes conserva el mismo patrón de datalist.** Queda declarado, no arreglado: cambiarlo mezclaría dos módulos con reglas propias en un mismo diff.
3. La auditoría del colaborador sigue pendiente porque el host del bridge no está corriendo.
