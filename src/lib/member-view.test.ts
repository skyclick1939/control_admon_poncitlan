import { describe, expect, it } from 'vitest';
import { summarizeMemberHistory, type CargoTotalsRow, type PagoTotalsRow } from './member-view';

describe('summarizeMemberHistory', () => {
  it('computes exact cents over a mix of paid and pending cargos plus multiple pagos', () => {
    const cargos: CargoTotalsRow[] = [
      { monto_original: 100, monto_pendiente: 0, estado: 'pagado' },
      { monto_original: 50.5, monto_pendiente: 50.5, estado: 'pendiente' },
      { monto_original: 33.33, monto_pendiente: 33.33, estado: 'pendiente' },
    ];
    const pagos: PagoTotalsRow[] = [{ monto_pagado: 100 }, { monto_pagado: 66.67 }];

    const result = summarizeMemberHistory(cargos, pagos);

    expect(result).toEqual({
      totalOriginalCents: 18383,
      totalPendienteCents: 8383,
      totalPagadoCents: 16667,
    });
  });

  it('returns all-zero totals for a member with no history', () => {
    const result = summarizeMemberHistory([], []);

    expect(result).toEqual({
      totalOriginalCents: 0,
      totalPendienteCents: 0,
      totalPagadoCents: 0,
    });
  });

  it('zeroes totalPendienteCents when every cargo has been paid', () => {
    const cargos: CargoTotalsRow[] = [
      { monto_original: 200, monto_pendiente: 0, estado: 'pagado' },
      { monto_original: 300, monto_pendiente: 0, estado: 'pagado' },
    ];
    const pagos: PagoTotalsRow[] = [{ monto_pagado: 500 }];

    const result = summarizeMemberHistory(cargos, pagos);

    expect(result).toEqual({
      totalOriginalCents: 50000,
      totalPendienteCents: 0,
      totalPagadoCents: 50000,
    });
  });

  it('sums the complete history for a retired member — retirement does not truncate any total', () => {
    const cargos: CargoTotalsRow[] = [
      { monto_original: 120, monto_pendiente: 120, estado: 'pendiente' },
      { monto_original: 80, monto_pendiente: 0, estado: 'pagado' },
    ];
    const pagos: PagoTotalsRow[] = [{ monto_pagado: 80 }];

    const result = summarizeMemberHistory(cargos, pagos);

    expect(result).toEqual({
      totalOriginalCents: 20000,
      totalPendienteCents: 12000,
      totalPagadoCents: 8000,
    });
  });
});
