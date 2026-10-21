# Proposal: desglose público por miembro en la vista pública

## Why

El operador pidió, y luego ratificó con autorización explícita, un desglose por miembro en la página pública: además de lo que debe, cuánto ha pagado y cómo se ha ido cubriendo cada adeudo, entendiendo el abono como un reparto del más antiguo al más reciente. La vista actual solo publica `nickname → total pendiente`, así que un miembro no puede reconstruir su propio historial y el club no puede mostrar transparencia sobre lo efectivamente cobrado.

## What Changes

- **`api/debt-view`** devuelve, además de lo actual, un desglose por miembro con: saldo pendiente, pagos registrados, importe cubierto sin efectivo (condonaciones, cesiones, pagos de tercero), importe no aplicado cuando existe, historial de adeudos (concepto, fecha, original, cubierto, pendiente) e historial de abonos (fecha, monto); y el pendiente por concepto a nivel club.
- **`/vista/`** muestra ese desglose en una tabla por miembro con una fila expandible por persona, y una tarjeta de pendiente por concepto del club.
- **Se enmienda la spec `public-debt-view`**: el historial de pagos y el desglose por miembro pasan a formar parte del contrato público. La exclusión de datos sensibles se mantiene para todo lo demás.
- **Atribución por adeudo, nunca por abono.** La base no registra qué abono pagó qué cargo: el reparto FIFO ocurre en memoria y solo se guarda el total. La página publica magnitudes derivables (`original`, `pendiente`, `original − pendiente`) y el reparto efectivo/no efectivo a nivel miembro, donde la suma con signo del libro de ajustes es exacta. La regla FIFO se explica en la interfaz, no se fabrica como registro.

## Impact

- Sin cambios de base de datos, sin migraciones, sin dependencias nuevas.
- Superficie afectada: `api/debt-view.ts`, `src/lib/public-breakdown.ts` (nuevo), `src/public-view.ts`, `vista/index.html`, `src/lib/types.ts`, spec y documento ODD.
- La función `aggregateDebtByMember` no se modifica: la usan `caja/repo.ts` y `dashboard/index.ts`.
- **Rollback**: revertir los commits de la rama. No hay estado persistido que deshacer.
- **Riesgo declarado y aceptado por el operador**: la página se comparte con los miembros y lleva `noindex, nofollow, no-referrer`; un enlace filtrado expone el historial de pagos de terceros, y un scraper puede observar el avance de los pagos entre ventanas de caché. Se acepta por decisión del operador (2026-10-21), no por un control técnico.
