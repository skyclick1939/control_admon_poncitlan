# Feature: selector de concepto en Apoyos y build real de Tailwind

**Status:** in progress
**Owner:** club operator (project owner) · **Repo branch:** `fix/apoyos-concepto-y-tailwind-build`
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

- [ ] 1.1 Emitir una hoja de estilos real: `src/style.css` con `@import "tailwindcss";` importada por las tres entradas (`src/main.ts`, `src/public-view.ts`, `src/member-view.ts`).
- [ ] 1.2 Quitar los tres `<script src="https://cdn.tailwindcss.com">` (`index.html:7`, `vista/index.html:7`, `mi-cuenta/index.html:9`) y conservar los bloques `<style>` propios.
- [ ] 1.3 Corregir `initial-scale-1.0` → `initial-scale=1.0` en `index.html:5`.
- [ ] 1.4 Reparar los tokens que cambian de significado o desaparecen entre v3 (el CDN) y v4 (el build): `bg-opacity-50` (`index.html:80`, eliminado en v4 → el velo quedaría negro opaco), `flex-shrink-0` (`index.html:83`, renombrado `shrink-0`) y el `border` sin color, que en v4 toma `currentColor` en vez de gray-200.
- [ ] 1.5 Hacer explícita la dependencia modalidad → concepto en el formulario: cuando la modalidad no crea adeudo, el texto de ayuda debe decir qué se está ofreciendo y con qué modalidades aparecen los apoyos que sí generan adeudo. Función pura y probada (TDD) en `src/lib/conceptos.ts`.
- [ ] 1.6 Cobertura de clases: tras `npm run build`, **cada** token de clase usado en los tres HTML y en `src/` debe tener regla en el CSS emitido. Comprobación por script, no a ojo.
- [ ] 1.7 `npx tsc --noEmit` limpio, `npx vitest run` verde y `npm run build` verde con el guard `postbuild`.
- [ ] 1.8 Commit por unidad de trabajo, PR, merge a `main` y verificación sobre producción.

## Evidence required to close each task

- 1.1/1.2/1.3/1.4: el `index.html` servido enlaza una hoja `/assets/*.css` y el CSS emitido contiene las utilidades usadas; cero peticiones a `cdn.tailwindcss.com`.
- 1.5: RED observado antes de implementar la función pura, GREEN después, con la suite completa verde.
- 1.6: salida del script de cobertura, con el número de tokens revisados y la lista de faltantes (idealmente vacía).

## Open risks

1. **La verificación visual es del operador.** Este entorno no tiene navegador ni sesión: la cobertura de tokens prueba que cada clase existe en el CSS, no que el resultado se vea igual que con el CDN. Los deltas conocidos entre v3 y v4 (escala de `shadow-sm`, radio `rounded`) son cosméticos y están declarados.
2. El CDN compilaba Tailwind en el navegador en cada carga; quitarlo también elimina un script de terceros que se ejecutaba en una app con datos financieros.
3. **La auditoría del colaborador está pendiente**: el host del bridge no estaba corriendo al abrir la ronda.
