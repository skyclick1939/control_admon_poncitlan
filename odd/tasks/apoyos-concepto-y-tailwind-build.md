# Feature: selector de concepto en Apoyos y build real de Tailwind

**Status:** deployed to production 2026-10-08 (PR #5 → `8cc6ad8`, Production a las 03:03:35Z). Pendientes: el pase visual del operador y la auditoría del colaborador.
**Owner:** club operator (project owner) · **Repo branch:** `fix/apoyos-concepto-y-tailwind-build`, merged into `main` as `8cc6ad8`
**Related:** `openspec/changes/ajustes-y-clasificacion` (spec `catalogo-conceptos`, design D2/D9/D10)

> **Figures are deliberately absent.** This repository is public.

## Goal

Cerrar el reporte del operador del 2026-10-08 sobre "Solicitud de Apoyos" y los dos errores de consola que lo acompañan, sin romper ninguna regla de la spec ya congelada.

## Reported defects and their real diagnosis

| # | Reporte | Diagnóstico medido | Veredicto |
|---|---|---|---|
| R1 | "No veo la lista desplegable para poner el motivo (apoyo aniversario, apoyo a accidentados…)" | El selector ofrecía exactamente los 2 conceptos `no_recuperable` del catálogo, que es lo que `currentNaturaleza()` devuelve **sólo** con `SIN_CARGOS` seleccionado. No hay defecto de filtro: el filtro por naturaleza es un REQUISITO de la spec. El defecto es de **descubribilidad**: el campo no dice de qué modalidad depende ni dónde viven los apoyos. | Defecto de UX, no de datos |
| R2 | `key "initial-scale-1.0" is not recognized and ignored` | `index.html:5` escribe `initial-scale-1.0` sin el `=`. Los otros dos HTML están correctos. | Defecto real y trivial |
| R3 | `cdn.tailwindcss.com should not be used in production` | **No hay ningún `.css` emitido**: la página en vivo no enlaza hoja de estilos y el único `<style>` de `index.html` sólo trae reglas propias. `@tailwindcss/vite` está configurado pero no tiene nada que compilar, así que **el CDN es la única fuente de Tailwind en producción**. | Defecto real y estructural |

## What is explicitly NOT changing

- El filtro por naturaleza de la modalidad (spec `catalogo-conceptos` línea 25): una modalidad que crea adeudo ofrece sólo `recuperable`; la que no crea ninguno ofrece sólo `no_recuperable`.
- `motivo` sigue siendo texto libre: la spec línea 108 y el design D10 prohíben que el concepto lo sustituya. **No se autorellena `motivo` con el nombre del concepto.**

## Tasks

- [x] 1.1 `src/style.css` con `@import "tailwindcss";` importada como **primer** import de las tres entradas. Commit `fcc6337`.
- [x] 1.2 Los tres `<script src="https://cdn.tailwindcss.com">` eliminados; bloques `<style>` y Google Fonts intactos. Commit `fcc6337`.
- [x] 1.3 `initial-scale-1.0` → `initial-scale=1.0` en `index.html:5`; verificado en el HTML servido. Commit `fcc6337`.
- [x] 1.4 Reparados: `bg-opacity-50` → `bg-black/50` (`index.html:80`), `flex-shrink-0` → `shrink-0` (`index.html:83`) y **tres** bordes sin color (`#members-checkbox-list`, el divisor de la cabecera y el del pie de la barra lateral) con `border-gray-200`. Commit `fcc6337`.
- [x] 1.5 `conceptoAyudaText(naturaleza, estado)` pura en `src/lib/conceptos.ts`, cableada en `refreshConceptoUi`; el filtro por naturaleza, `currentNaturaleza()`, el datalist y `motivo` quedaron intactos. TDD: **RED** 8 fallas con `conceptoAyudaText is not a function` (32 passing) → **GREEN** 40 passing. Commit `723d291`.
- [x] 1.6 Cobertura por script: **224** tokens distintos en los tres HTML y todo `src/`, contra el CSS emitido con el escapado de selectores de Tailwind. **Faltantes reales de utilidades: 0**. Los 17 sin regla: 3 clases propias de los `<style>` embebidos, 2 artefactos de extracción de un ternario dentro de un `class`, y 12 ganchos de selección de JS.
- [x] 1.7 `npx tsc --noEmit` exit 0 sin diagnósticos; `npx vitest run` 16/16 archivos y **272/272** pruebas (264 antes); `npm run build` exit 0 con `postbuild: no "service_role" leakage found in dist/ (9 files checked)`.
- [x] 1.8 PR **#5** mergeado a `main` como `8cc6ad8`.

## Verificación sobre producción (2026-10-08T03:03:35Z)

- `/` 200 con `/assets/escape-7Usq1rdO.css` **enlazado**; antes no enlazaba ninguna hoja. **0** referencias a `cdn.tailwindcss`.
- `initial-scale=1.0` correcto en el HTML servido.
- El bundle servido `main-CM_oiqXC.js` (474,209 bytes) contiene el texto nuevo `Individual, Fullparch o Todos` y `no recuperables`.
- En el CSS servido: `.bg-black\/50`, `.shrink-0` y `.border-gray-200` presentes; `bg-opacity-50` ausente, como debe ser en v4.
- `/vista/` 200 y `/api/debt-view` 200.
- Los sub‑páginas ganaron hoja: `dist/` no tenía **ningún** `.css` antes de este cambio.

## Evidence required to close each task

- 1.1/1.2/1.3/1.4: el `index.html` servido enlaza una hoja `/assets/*.css` y el CSS emitido contiene las utilidades usadas; cero peticiones a `cdn.tailwindcss.com`.
- 1.5: RED observado antes de implementar la función pura, GREEN después, con la suite completa verde.
- 1.6: salida del script de cobertura, con el número de tokens revisados y la lista de faltantes (idealmente vacía).

## Open risks

1. **La verificación visual es del operador.** Este entorno no tiene navegador ni sesión: la cobertura de tokens prueba que cada clase existe en el CSS, no que el resultado se vea igual que con el CDN. Los deltas conocidos entre v3 y v4 (escala de `shadow-sm`, radio `rounded`) son cosméticos y están declarados.
2. El CDN compilaba Tailwind en el navegador en cada carga; quitarlo también elimina un script de terceros que se ejecutaba en una app con datos financieros.
3. **La auditoría del colaborador sigue pendiente**: el host del bridge no estaba corriendo al abrir la ronda, y el protocolo prohíbe usar `agy -p` como sustituto. El brief está redactado y listo para enviarse en cuanto el host esté vivo.
