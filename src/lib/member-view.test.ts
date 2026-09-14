import { describe, expect, it } from 'vitest';
import {
  summarizeMemberHistory,
  toMemberCargoEntries,
  toMemberPagoEntries,
  type CargoRowForMember,
  type CargoTotalsRow,
  type PagoRowForMember,
  type PagoTotalsRow,
} from './member-view';

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

describe('toMemberCargoEntries', () => {
  it('uses registro_apoyos.fecha when the join resolves, and maps amounts to whole cents', () => {
    const rows: CargoRowForMember[] = [
      {
        monto_original: 100,
        monto_pendiente: 0,
        estado: 'pagado',
        created_at: '2026-01-01T00:00:00Z',
        registro_apoyos: { fecha: '2026-01-05' },
      },
    ];

    const result = toMemberCargoEntries(rows);

    expect(result).toEqual([
      { fecha: '2026-01-05', estado: 'pagado', originalCents: 10000, pendienteCents: 0 },
    ]);
  });

  it('falls back to created_at when the registro_apoyos join does not resolve', () => {
    const rows: CargoRowForMember[] = [
      {
        monto_original: 50.5,
        monto_pendiente: 50.5,
        estado: 'pendiente',
        created_at: '2026-02-10T00:00:00Z',
        registro_apoyos: null,
      },
    ];

    const result = toMemberCargoEntries(rows);

    expect(result).toEqual([
      {
        fecha: '2026-02-10T00:00:00Z',
        estado: 'pendiente',
        originalCents: 5050,
        pendienteCents: 5050,
      },
    ]);
  });

  it('emits exactly the allowed key set — no motivo, ids, or operator fields (D13)', () => {
    const rows: CargoRowForMember[] = [
      {
        monto_original: 10,
        monto_pendiente: 10,
        estado: 'pendiente',
        created_at: '2026-03-01T00:00:00Z',
        registro_apoyos: { fecha: '2026-03-01' },
      },
    ];

    const [entry] = toMemberCargoEntries(rows);

    expect(Object.keys(entry).sort()).toEqual([
      'estado',
      'fecha',
      'originalCents',
      'pendienteCents',
    ]);
  });
});

describe('toMemberPagoEntries', () => {
  it('maps fecha_pago and monto_pagado to whole cents', () => {
    const rows: PagoRowForMember[] = [{ monto_pagado: 66.67, fecha_pago: '2026-01-10' }];

    const result = toMemberPagoEntries(rows);

    expect(result).toEqual([{ fecha: '2026-01-10', montoCents: 6667 }]);
  });

  it('emits exactly the allowed key set — no observaciones, ids, or operator fields (D13)', () => {
    const rows: PagoRowForMember[] = [{ monto_pagado: 20, fecha_pago: '2026-01-11' }];

    const [entry] = toMemberPagoEntries(rows);

    expect(Object.keys(entry).sort()).toEqual(['fecha', 'montoCents']);
  });
});
