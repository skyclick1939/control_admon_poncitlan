import { describe, expect, it } from 'vitest';
import { aggregateDebtByMember, type CargoPendienteRow } from './debt-view';
import {
  buildPublicBreakdown,
  type AjusteDesgloseRow,
  type CargoDesgloseRow,
  type PagoDesgloseRow,
} from './public-breakdown';

function miembro(id: string, nickname: string, overrides: Partial<CargoDesgloseRow['miembro']> = {}) {
  return { id, nickname, activo: true, status: 'fullparch' as const, ...overrides };
}

function cargo(overrides: Partial<CargoDesgloseRow> = {}): CargoDesgloseRow {
  return {
    id: 'cargo-1',
    miembro: miembro('m1', 'juan'),
    monto_original: 100,
    monto_pendiente: 100,
    estado: 'pendiente',
    fecha: '2026-01-10',
    concepto: 'Apoyo legal',
    ...overrides,
  };
}

function pago(overrides: Partial<PagoDesgloseRow> = {}): PagoDesgloseRow {
  return { miembro: miembro('m1', 'juan'), monto_pagado: 100, fecha_pago: '2026-02-01', ...overrides };
}

function ajuste(overrides: Partial<AjusteDesgloseRow> = {}): AjusteDesgloseRow {
  return {
    miembro: miembro('m1', 'juan'),
    cargo_id: 'cargo-1',
    monto: -50,
    tipo: 'condonacion',
    created_at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildPublicBreakdown', () => {
  it('sums pending debt per member and sorts descending', () => {
    const result = buildPublicBreakdown({
      cargos: [
        cargo({ id: 'a', miembro: miembro('m1', 'ana'), monto_original: 20, monto_pendiente: 20 }),
        cargo({ id: 'b', miembro: miembro('m2', 'beto'), monto_original: 500, monto_pendiente: 500 }),
      ],
      pagos: [],
      ajustes: [],
    });

    expect(result.miembros.map((m) => m.nickname)).toEqual(['beto', 'ana']);
    expect(result.totalPendienteCents).toBe(52000);
  });

  it('groups by member, never by nickname', () => {
    const result = buildPublicBreakdown({
      cargos: [
        cargo({ id: 'a', miembro: miembro('m1', 'juan'), monto_original: 100, monto_pendiente: 100 }),
        cargo({ id: 'b', miembro: miembro('m2', 'juan'), monto_original: 300, monto_pendiente: 300 }),
      ],
      pagos: [],
      ajustes: [],
    });

    expect(result.miembros).toHaveLength(2);
    expect(result.miembros.map((m) => m.pendienteCents)).toEqual([30000, 10000]);
  });

  it('excludes the internal member and the retired member from every aggregate', () => {
    const result = buildPublicBreakdown({
      cargos: [
        cargo({ id: 'a', miembro: miembro('m1', 'juan') }),
        cargo({ id: 'b', miembro: miembro('m2', 'Gastos_sin_cargar', { status: 'interno' }) }),
        cargo({ id: 'c', miembro: miembro('m3', 'baja', { activo: false }) }),
      ],
      pagos: [
        pago({ miembro: miembro('m1', 'juan'), monto_pagado: 10 }),
        pago({ miembro: miembro('m2', 'Gastos_sin_cargar', { status: 'interno' }), monto_pagado: 999 }),
        pago({ miembro: miembro('m3', 'baja', { activo: false }), monto_pagado: 999 }),
      ],
      ajustes: [],
    });

    expect(result.miembros).toHaveLength(1);
    expect(result.totalAbonadoCents).toBe(1000);
    expect(result.porConcepto).toEqual([{ concepto: 'Apoyo legal', pendienteCents: 10000 }]);
  });

  it('reports per-adeudo original, covered and pending from stored columns', () => {
    const result = buildPublicBreakdown({
      cargos: [cargo({ monto_original: 100, monto_pendiente: 30 })],
      pagos: [pago({ monto_pagado: 20 })],
      ajustes: [ajuste({ monto: -50 })],
    });

    const adeudo = result.miembros[0].adeudos[0];
    expect(adeudo.originalCents).toBe(10000);
    expect(adeudo.cubiertoCents).toBe(7000);
    expect(adeudo.pendienteCents).toBe(3000);
    // Member level: the 70 covered split into 20 cash and 50 non-cash.
    expect(result.miembros[0].abonadoCents).toBe(2000);
    expect(result.miembros[0].sinEfectivoCents).toBe(5000);
    expect(result.miembros[0].aplicadoCents).toBe(2000);
    expect(result.miembros[0].noAplicadoCents).toBe(0);
  });

  it('does not credit a cession receiver with covered money', () => {
    // The receiving cargo is born at original = pending = 100, and the ledger
    // records a POSITIVE creation row for it (ajustes/repo.ts construirFilasLibro).
    const result = buildPublicBreakdown({
      cargos: [cargo({ id: 'nuevo', monto_original: 100, monto_pendiente: 100 })],
      pagos: [],
      ajustes: [ajuste({ cargo_id: 'nuevo', monto: 100, tipo: 'cesion' })],
    });

    expect(result.miembros[0].adeudos[0].cubiertoCents).toBe(0);
    expect(result.miembros[0].sinEfectivoCents).toBe(0);
    expect(result.miembros[0].pendienteCents).toBe(10000);
  });

  it('counts a fully ceded cargo as a non-cash reduction, not as a payment', () => {
    const result = buildPublicBreakdown({
      cargos: [cargo({ monto_original: 100, monto_pendiente: 0, estado: 'pagado' })],
      pagos: [],
      ajustes: [ajuste({ monto: -100, tipo: 'cesion' })],
    });

    expect(result.miembros[0].abonadoCents).toBe(0);
    expect(result.miembros[0].sinEfectivoCents).toBe(10000);
    expect(result.miembros[0].noAplicadoCents).toBe(0);
  });

  it('lets a reversal undo the non-cash reduction it cancelled', () => {
    const result = buildPublicBreakdown({
      cargos: [cargo({ monto_original: 100, monto_pendiente: 80 })],
      pagos: [pago({ monto_pagado: 20 })],
      ajustes: [
        ajuste({ monto: -50, tipo: 'condonacion' }),
        // The reversal row is member-level: cargo_id is null by schema.
        ajuste({ cargo_id: null, monto: 50, tipo: 'reversa' }),
      ],
    });

    expect(result.miembros[0].sinEfectivoCents).toBe(0);
    expect(result.miembros[0].abonadoCents).toBe(2000);
    expect(result.miembros[0].adeudos[0].cubiertoCents).toBe(2000);
  });

  it('does not credit a cession receiver when the cession is reversed', () => {
    // Reversing a cession deletes the receiving cargo and writes ONE member-level
    // reversal row whose `monto` is the NEGATIVE mirror of the receiver's
    // creation row (`ajustes/repo.ts` revertirAjuste). Excluding the creation
    // without excluding its mirror would leave phantom non-cash coverage.
    const result = buildPublicBreakdown({
      cargos: [cargo({ id: 'otro', monto_original: 100, monto_pendiente: 100 })],
      pagos: [],
      ajustes: [
        ajuste({ cargo_id: 'cedido', monto: 100, tipo: 'cesion' }),
        ajuste({ cargo_id: null, monto: -100, tipo: 'reversa' }),
      ],
    });

    expect(result.miembros[0].sinEfectivoCents).toBe(0);
    expect(result.miembros[0].pendienteCents).toBe(10000);
  });

  it('reports an overpayment as not applied instead of hiding it', () => {
    const result = buildPublicBreakdown({
      cargos: [cargo({ monto_original: 100, monto_pendiente: 0, estado: 'pagado' })],
      pagos: [pago({ monto_pagado: 150 })],
      ajustes: [],
    });

    expect(result.miembros[0].abonadoCents).toBe(15000);
    expect(result.miembros[0].aplicadoCents).toBe(10000);
    expect(result.miembros[0].noAplicadoCents).toBe(5000);
  });

  it('counts a third-party payment as coverage without inventing a cash payment', () => {
    const result = buildPublicBreakdown({
      cargos: [cargo({ monto_original: 100, monto_pendiente: 60 })],
      pagos: [],
      ajustes: [ajuste({ monto: -40, tipo: 'pago_tercero' })],
    });

    expect(result.miembros[0].abonadoCents).toBe(0);
    expect(result.miembros[0].sinEfectivoCents).toBe(4000);
    expect(result.miembros[0].noAplicadoCents).toBe(0);
  });

  it('aggregates club pending by concept, largest first', () => {
    const result = buildPublicBreakdown({
      cargos: [
        cargo({ id: 'a', miembro: miembro('m1', 'ana'), concepto: 'Apoyo legal', monto_original: 10, monto_pendiente: 10 }),
        cargo({ id: 'b', miembro: miembro('m2', 'beto'), concepto: 'Apoyo legal', monto_original: 90, monto_pendiente: 90 }),
        cargo({ id: 'c', miembro: miembro('m1', 'ana'), concepto: 'Apoyo aniversario', monto_original: 30, monto_pendiente: 30 }),
      ],
      pagos: [],
      ajustes: [],
    });

    expect(result.porConcepto).toEqual([
      { concepto: 'Apoyo legal', pendienteCents: 10000 },
      { concepto: 'Apoyo aniversario', pendienteCents: 3000 },
    ]);
  });

  it('labels rows recorded before the catalog existed as Sin clasificar', () => {
    const result = buildPublicBreakdown({
      cargos: [cargo({ concepto: null })],
      pagos: [],
      ajustes: [],
    });

    expect(result.miembros[0].adeudos[0].concepto).toBe('Sin clasificar');
    expect(result.porConcepto).toEqual([{ concepto: 'Sin clasificar', pendienteCents: 10000 }]);
  });

  it('keeps the adeudo and abono history oldest first', () => {
    const result = buildPublicBreakdown({
      cargos: [
        cargo({ id: 'nuevo', fecha: '2026-03-01', concepto: 'Apoyo aniversario' }),
        cargo({ id: 'viejo', fecha: '2026-01-01', concepto: 'Apoyo legal' }),
      ],
      pagos: [
        pago({ fecha_pago: '2026-02-10', monto_pagado: 10 }),
        pago({ fecha_pago: '2026-01-15', monto_pagado: 20 }),
      ],
      ajustes: [],
    });

    expect(result.miembros[0].adeudos.map((a) => a.concepto)).toEqual(['Apoyo legal', 'Apoyo aniversario']);
    expect(result.miembros[0].abonos.map((a) => a.fecha)).toEqual(['2026-01-15', '2026-02-10']);
  });

  it('omits a member with neither adeudos nor abonos', () => {
    const result = buildPublicBreakdown({ cargos: [], pagos: [], ajustes: [] });

    expect(result.miembros).toEqual([]);
    expect(result.porConcepto).toEqual([]);
    expect(result.totalPendienteCents).toBe(0);
  });

  it('totals exactly what aggregateDebtByMember reports for the same rows', () => {
    const cargos: CargoDesgloseRow[] = [
      cargo({ id: 'a', miembro: miembro('m1', 'ana'), monto_original: 33.33, monto_pendiente: 33.33 }),
      cargo({ id: 'b', miembro: miembro('m2', 'beto'), monto_original: 66.67, monto_pendiente: 0, estado: 'pagado' }),
      cargo({ id: 'c', miembro: miembro('m3', 'Gastos_sin_cargar', { status: 'interno' }), monto_original: 10, monto_pendiente: 10 }),
    ];

    const legacyRows: CargoPendienteRow[] = cargos.map((row) => ({
      monto_pendiente: row.monto_pendiente,
      miembros: row.miembro ? { nickname: row.miembro.nickname, activo: row.miembro.activo, status: row.miembro.status } : null,
    }));

    const result = buildPublicBreakdown({ cargos, pagos: [], ajustes: [] });
    const legacy = aggregateDebtByMember(legacyRows.filter((row) => row.monto_pendiente > 0));

    expect(result.totalPendienteCents).toBe(legacy.totalPendienteCents);
  });
});
