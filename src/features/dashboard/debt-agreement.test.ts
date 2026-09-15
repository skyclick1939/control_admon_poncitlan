import { describe, expect, it } from 'vitest';
import { aggregateDebtByMember, type CargoPendienteRow } from '../../lib/debt-view';

describe('dashboard ↔ public debt agreement', () => {
  it('aggregates float-peso cargos into exact integer cents (no drift)', () => {
    const rows: CargoPendienteRow[] = [
      { monto_pendiente: 0.1, miembros: { nickname: 'juan', activo: true, status: 'fullparch' } },
      { monto_pendiente: 0.2, miembros: { nickname: 'juan', activo: true, status: 'fullparch' } },
    ];

    const result = aggregateDebtByMember(rows);

    // The public view and (now) the dashboard both render this exact figure.
    expect(result.deudores).toEqual([{ nickname: 'juan', pendienteCents: 30 }]);
    expect(result.totalPendienteCents).toBe(30);

    // The dashboard's previous raw-float reduce drifted away from the true value
    // (the production bug: e.g. Zuomi 3154.47 admin vs 3154.49 public).
    const naiveFloatSum = rows.reduce((sum, row) => sum + row.monto_pendiente, 0);
    expect(naiveFloatSum).not.toBe(0.3);
  });

  it('keeps the internal-member exclusion consistent with the public ranking', () => {
    const rows: CargoPendienteRow[] = [
      { monto_pendiente: 10, miembros: { nickname: 'juan', activo: true, status: 'fullparch' } },
      { monto_pendiente: 99, miembros: { nickname: 'Gastos_sin_cargar', activo: true, status: 'interno' } },
    ];

    const result = aggregateDebtByMember(rows);

    expect(result.deudores).toEqual([{ nickname: 'juan', pendienteCents: 1000 }]);
    expect(result.totalPendienteCents).toBe(1000);
  });
});
