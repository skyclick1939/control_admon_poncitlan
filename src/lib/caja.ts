export interface CajaInput {
  openingCents: number;
  /** One entry per `registro_pagos` row (full `monto_pagado`). */
  pagosCents: readonly number[];
  /** One entry per `registro_egresos` row. */
  egresosCents: readonly number[];
}

export interface CajaBreakdown {
  openingCents: number;
  pagosTotalCents: number; // Σ pagosCents (no dedup — each row counted once)
  egresosTotalCents: number; // Σ egresosCents
  cajaCents: number; // opening + pagosTotal − egresosTotal (may be negative, unclamped)
}

/**
 * Derived cash-on-hand ledger (design.md caja). Computes
 * `cajaCents = openingCents + ΣpagosCents − ΣegresosCents` over already-fetched
 * rows, in integer cents only. PURE — no DB access and no `toCents` call; the
 * repository converts pesos→cents at the boundary before invoking this. Each
 * input array element is summed exactly once (no dedup): `saveApoyo` creates a
 * receivable and is intentionally absent from `CajaInput`, so a support can
 * never move caja. Negative balances are returned unclamped.
 */
export function computeCaja(input: CajaInput): CajaBreakdown {
  const pagosTotalCents = input.pagosCents.reduce((sum, pago) => sum + pago, 0);
  const egresosTotalCents = input.egresosCents.reduce((sum, egreso) => sum + egreso, 0);
  const cajaCents = input.openingCents + pagosTotalCents - egresosTotalCents;

  return { openingCents: input.openingCents, pagosTotalCents, egresosTotalCents, cajaCents };
}
