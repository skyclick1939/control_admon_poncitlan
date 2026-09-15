export interface CajaInput {
  openingCents: number;
  /** One entry per `registro_pagos` row (full `monto_pagado`). */
  pagosCents: readonly number[];
  /** One entry per `registro_apoyos` row (full `monto_total`). */
  apoyosCents: readonly number[];
  /** One entry per `registro_egresos` row. */
  egresosCents: readonly number[];
}

export interface CajaBreakdown {
  openingCents: number;
  pagosTotalCents: number; // Σ pagosCents (no dedup — each row counted once)
  apoyosTotalCents: number; // Σ apoyosCents (no dedup — each row counted once)
  egresosTotalCents: number; // Σ egresosCents
  cajaCents: number; // opening + pagosTotal − apoyosTotal − egresosTotal (may be negative, unclamped)
}

/**
 * Derived cash-on-hand ledger (design.md caja). Computes
 * `cajaCents = openingCents + ΣpagosCents − ΣapoyosCents − ΣegresosCents` over
 * already-fetched rows, in integer cents only. PURE — no DB access and no
 * `toCents` call; the repository converts pesos→cents at the boundary before
 * invoking this. Each input array element is summed exactly once (no dedup).
 * Handing out an apoyo is cash leaving the club, so `apoyosCents` is a
 * deduction; an apoyo repayment comes back as a `registro_pagos` row (already
 * counted as inflow), so a fully repaid apoyo nets to zero while an unrepaid
 * one stays negative. Negative balances are returned unclamped.
 */
export function computeCaja(input: CajaInput): CajaBreakdown {
  const pagosTotalCents = input.pagosCents.reduce((sum, pago) => sum + pago, 0);
  const apoyosTotalCents = input.apoyosCents.reduce((sum, apoyo) => sum + apoyo, 0);
  const egresosTotalCents = input.egresosCents.reduce((sum, egreso) => sum + egreso, 0);
  const cajaCents = input.openingCents + pagosTotalCents - apoyosTotalCents - egresosTotalCents;

  return {
    openingCents: input.openingCents,
    pagosTotalCents,
    apoyosTotalCents,
    egresosTotalCents,
    cajaCents,
  };
}
