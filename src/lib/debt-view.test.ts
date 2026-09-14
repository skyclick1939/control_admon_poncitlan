import { describe, expect, it } from 'vitest';
import { aggregateDebtByMember, type CargoPendienteRow } from './debt-view';

describe('aggregateDebtByMember', () => {
  it('sums multiple pending cargos for the same member into one entry', () => {
    const rows: CargoPendienteRow[] = [
      { monto_pendiente: 100, miembros: { nickname: 'juan' } },
      { monto_pendiente: 50.5, miembros: { nickname: 'juan' } },
    ];

    const result = aggregateDebtByMember(rows);

    expect(result.deudores).toEqual([{ nickname: 'juan', pendienteCents: 15050 }]);
  });

  it('sorts multiple members descending by total pendiente', () => {
    const rows: CargoPendienteRow[] = [
      { monto_pendiente: 20, miembros: { nickname: 'ana' } },
      { monto_pendiente: 500, miembros: { nickname: 'beto' } },
      { monto_pendiente: 100, miembros: { nickname: 'carla' } },
    ];

    const result = aggregateDebtByMember(rows);

    expect(result.deudores.map((deudor) => deudor.nickname)).toEqual(['beto', 'carla', 'ana']);
  });

  it('excludes rows with no resolved member', () => {
    const rows: CargoPendienteRow[] = [
      { monto_pendiente: 100, miembros: { nickname: 'juan' } },
      { monto_pendiente: 999, miembros: null },
    ];

    const result = aggregateDebtByMember(rows);

    expect(result.deudores).toEqual([{ nickname: 'juan', pendienteCents: 10000 }]);
  });

  it('excludes non-positive pendiente amounts', () => {
    const rows: CargoPendienteRow[] = [{ monto_pendiente: 0, miembros: { nickname: 'juan' } }];

    const result = aggregateDebtByMember(rows);

    expect(result.deudores).toEqual([]);
    expect(result.totalPendienteCents).toBe(0);
  });

  it('totals exactly the sum of every deudor entry', () => {
    const rows: CargoPendienteRow[] = [
      { monto_pendiente: 33.33, miembros: { nickname: 'ana' } },
      { monto_pendiente: 66.67, miembros: { nickname: 'beto' } },
    ];

    const result = aggregateDebtByMember(rows);

    expect(result.totalPendienteCents).toBe(result.deudores.reduce((sum, deudor) => sum + deudor.pendienteCents, 0));
    expect(result.totalPendienteCents).toBe(10000);
  });
});
