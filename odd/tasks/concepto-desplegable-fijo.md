# Feature: el concepto se elige de un desplegable fijo

**Status:** in progress
**Owner:** club operator (project owner) · **Repo branch:** `feat/concepto-desplegable-fijo`
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

- [ ] 1.1 Markup: sustituir el input+datalist por un `<select>` y añadir el campo de nombre dentro del panel de creación.
- [ ] 1.2 Puras nuevas en `src/lib/conceptos.ts`: `conceptosOfrecidos` y `conceptoPorId`, con TDD (RED antes, GREEN después).
- [ ] 1.3 `conceptoAyudaText`: estados nuevos (`sin_modalidad`, `sin_seleccion`, `resuelto`, `creando`) y conservar la prueba que impide que el copy incruste nombres del catálogo.
- [ ] 1.4 Cablear el `<select>` en `src/features/apoyos/index.ts`: poblar por naturaleza, conservar la selección vigente, mostrar el panel de creación al elegir esa opción, resolver el `concepto_id` por id en la validación y en el guardado.
- [ ] 1.5 Eliminar lo que quede sin llamador (`searchConceptos`, `resolveConcepto` y su tipo) junto con sus pruebas.
- [ ] 1.6 `npx tsc --noEmit` limpio, `npx vitest run` verde, `npm run build` verde con el guard.
- [ ] 1.7 Enmendar el delta `catalogo-conceptos` de OpenSpec: el requisito "Searchable Selector" pasa a "Fixed Dropdown with In-Line Creation", con la decisión del operador como razón.
- [ ] 1.8 Commit por unidad, PR, merge a `main`, verificación sobre producción.

## Evidence required to close each task

- 1.2/1.3: salida RED y GREEN.
- 1.4: el HTML servido en producción contiene el `<select id="concepto_apoyo">` y el bundle servido lleva las opciones nuevas.
- 1.7: el delta enmendado, citando la instrucción del operador.

## Open risks

1. **Sin navegador no puedo probar el clic.** La verificación estructural (markup + bundle + pruebas puras) es lo máximo alcanzable aquí; el pase visual es del operador.
2. **El módulo de Ajustes conserva el mismo patrón de datalist.** Queda declarado, no arreglado: cambiarlo mezclaría dos módulos con reglas propias en un mismo diff.
3. La auditoría del colaborador sigue pendiente porque el host del bridge no está corriendo.
