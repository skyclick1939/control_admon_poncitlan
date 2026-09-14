import { toCents } from './money.js';

export interface CargoTotalsRow {
  monto_original: number;
  monto_pendiente: number;
  estado: 'pendiente' | 'pagado';
}

export interface PagoTotalsRow {
  monto_pagado: number;
}

export interface MemberTotals {
  readonly totalOriginalCents: number;
  readonly totalPendienteCents: number;
  readonly totalPagadoCents: number;
}

/**
 * Exact integer-cent totals over one member's full history (design.md D14).
 * `totalOriginalCents` sums every cargo regardless of `estado`;
 * `totalPendienteCents` sums only cargos still pending; `totalPagadoCents`
 * sums every `registro_pagos` entry. PURE, mirrors `debt-view.ts`'s shape:
 * no DB access here, shared by the admin history panel (Part 1) and, in
 * Phase 4, `api/member-view.ts`.
 */
export function summarizeMemberHistory(
  cargos: readonly CargoTotalsRow[],
  pagos: readonly PagoTotalsRow[],
): MemberTotals {
  let totalOriginalCents = 0;
  let totalPendienteCents = 0;

  for (const cargo of cargos) {
    totalOriginalCents += toCents(cargo.monto_original);
    if (cargo.estado === 'pendiente') {
      totalPendienteCents += toCents(cargo.monto_pendiente);
    }
  }

  const totalPagadoCents = pagos.reduce((sum, pago) => sum + toCents(pago.monto_pagado), 0);

  return { totalOriginalCents, totalPendienteCents, totalPagadoCents };
}
