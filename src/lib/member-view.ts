import { toCents } from './money.js';
import type { MemberViewResponse } from './types.js';

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

/**
 * A cargo as the MEMBER path fetches it (design.md D14). `registro_apoyos`
 * is nullable because the join may not resolve; `fecha` falls back to
 * `created_at` then.
 */
export interface CargoRowForMember extends CargoTotalsRow {
  created_at: string;
  registro_apoyos: { fecha: string } | null;
}

export interface PagoRowForMember extends PagoTotalsRow {
  fecha_pago: string;
}

/**
 * Maps DB rows to MemberViewResponse['cargos'] — the field-exclusion
 * boundary (design.md D13). `fecha` is `registro_apoyos.fecha` when the
 * join resolves, else the cargo's own `created_at`.
 */
export function toMemberCargoEntries(
  rows: readonly CargoRowForMember[],
): MemberViewResponse['cargos'] {
  return rows.map((row) => ({
    fecha: row.registro_apoyos?.fecha ?? row.created_at,
    estado: row.estado,
    originalCents: toCents(row.monto_original),
    pendienteCents: toCents(row.monto_pendiente),
  }));
}

/** Maps DB rows to MemberViewResponse['pagos'] — same exclusion boundary (D13). */
export function toMemberPagoEntries(
  rows: readonly PagoRowForMember[],
): MemberViewResponse['pagos'] {
  return rows.map((row) => ({
    fecha: row.fecha_pago,
    montoCents: toCents(row.monto_pagado),
  }));
}
