import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AJUSTE_TIPOS,
  isAjusteTipo,
  netPositionCents,
  planAjuste,
  planReversa,
  sumAjustesOtorgados,
  type AjusteOriginalRow,
  type AjusteReporteRow,
  type AjusteTipo,
} from './ajustes';
import type { Charge } from './money';

const cargo = (id: string, pendingCents: number): Charge => ({ id, pendingCents });

/** Three cargos, supplied oldest-first as the FIFO contract requires. */
const TRES: Charge[] = [cargo('a', 300), cargo('b', 300), cargo('c', 300)];

const TIPOS_ORDENADOS: AjusteTipo[] = [...AJUSTE_TIPOS];

describe('AJUSTE_TIPOS', () => {
  it('is exactly the four operations the Postgres CHECK allows', () => {
    expect(TIPOS_ORDENADOS).toEqual(['condonacion', 'cesion', 'pago_tercero', 'reversa']);
  });
});

describe('planAjuste', () => {
  it('applies an exact request and settles the cargo', () => {
    const plan = planAjuste(1000, [cargo('a', 1000)]);

    expect(plan.rows).toEqual([
      { cargoId: 'a', deltaCents: -1000, newPendingCents: 0, settled: true },
    ]);
    expect(plan.appliedCents).toBe(1000);
    expect(plan.unappliedCents).toBe(0);
  });

  it('applies a partial request and leaves the cargo unsettled', () => {
    const plan = planAjuste(400, [cargo('a', 1000)]);

    expect(plan.rows).toEqual([
      { cargoId: 'a', deltaCents: -400, newPendingCents: 600, settled: false },
    ]);
    expect(plan.appliedCents).toBe(400);
    expect(plan.unappliedCents).toBe(0);
  });

  it('never allocates beyond a cargo: caps at its pending and reports the remainder', () => {
    const plan = planAjuste(900, [cargo('a', 500)]);

    expect(plan.rows).toEqual([
      { cargoId: 'a', deltaCents: -500, newPendingCents: 0, settled: true },
    ]);
    expect(plan.appliedCents).toBe(500);
    expect(plan.unappliedCents).toBe(400);
    expect(plan.rows.every((row) => row.newPendingCents >= 0)).toBe(true);
  });

  it('fills oldest-first (FIFO) across several cargos', () => {
    const plan = planAjuste(700, TRES);

    expect(plan.rows).toEqual([
      { cargoId: 'a', deltaCents: -300, newPendingCents: 0, settled: true },
      { cargoId: 'b', deltaCents: -300, newPendingCents: 0, settled: true },
      { cargoId: 'c', deltaCents: -100, newPendingCents: 200, settled: false },
    ]);
    expect(plan.appliedCents).toBe(700);
    expect(plan.unappliedCents).toBe(0);
  });

  it('touches only the named cargo when a target is given', () => {
    const plan = planAjuste(100, TRES, 'b');

    expect(plan.rows).toEqual([
      { cargoId: 'b', deltaCents: -100, newPendingCents: 200, settled: false },
    ]);
    expect(plan.appliedCents).toBe(100);
    expect(plan.unappliedCents).toBe(0);
  });

  it('caps a targeted request at that cargo and reports the remainder', () => {
    const plan = planAjuste(400, TRES, 'b');

    expect(plan.rows).toEqual([
      { cargoId: 'b', deltaCents: -300, newPendingCents: 0, settled: true },
    ]);
    expect(plan.appliedCents).toBe(300);
    expect(plan.unappliedCents).toBe(100);
  });

  it('returns nothing and the whole request for an unknown target', () => {
    const plan = planAjuste(500, TRES, 'zzz');

    expect(plan.rows).toEqual([]);
    expect(plan.appliedCents).toBe(0);
    expect(plan.unappliedCents).toBe(500);
  });

  it('returns nothing and the whole request for an empty cargo list', () => {
    const plan = planAjuste(500, []);

    expect(plan.rows).toEqual([]);
    expect(plan.appliedCents).toBe(0);
    expect(plan.unappliedCents).toBe(500);
  });

  it('returns nothing for a non-positive request, reporting it as unapplied', () => {
    for (const amount of [0, -100]) {
      const plan = planAjuste(amount, TRES);

      expect(plan.rows).toEqual([]);
      expect(plan.appliedCents).toBe(0);
      expect(plan.unappliedCents).toBe(amount);
    }
  });

  it('skips cargos with a non-positive pending, emitting no row for them', () => {
    const conVacios: Charge[] = [
      cargo('zero', 0),
      cargo('negativo', -50),
      cargo('ok', 200),
    ];

    const plan = planAjuste(100, conVacios);

    expect(plan.rows).toEqual([
      { cargoId: 'ok', deltaCents: -100, newPendingCents: 100, settled: false },
    ]);
    expect(plan.appliedCents).toBe(100);
    expect(plan.unappliedCents).toBe(0);
  });

  it('does not mutate the cargos it is given', () => {
    const before = TRES.map((item) => ({ ...item }));

    planAjuste(700, TRES);

    expect(TRES).toEqual(before);
  });
});

describe('planReversa', () => {
  it('restores exactly the pre-adjustment value derived from the original row', () => {
    const original: AjusteOriginalRow = {
      cargoId: 'a',
      deltaCents: -300,
      pendienteResultanteCents: 700,
    };

    const plan = planReversa([original], new Map([['a', 700]]));

    expect(plan).toEqual([
      {
        cargoId: 'a',
        expectedPendingCents: 700,
        restoredPendingCents: 1000,
        removeCargo: false,
        mismatched: false,
      },
    ]);
  });

  it('flags a cargo the original row CREATED for removal instead of restoration', () => {
    const creado: AjusteOriginalRow = {
      cargoId: 'nuevo',
      deltaCents: 500,
      pendienteResultanteCents: 500,
    };

    const plan = planReversa([creado], new Map([['nuevo', 500]]));

    expect(plan).toEqual([
      {
        cargoId: 'nuevo',
        expectedPendingCents: 500,
        restoredPendingCents: 0,
        removeCargo: true,
        mismatched: false,
      },
    ]);
  });

  it('flags a mismatch when the cargo no longer holds the original post-state', () => {
    const original: AjusteOriginalRow = {
      cargoId: 'a',
      deltaCents: -300,
      pendienteResultanteCents: 700,
    };

    const plan = planReversa([original], new Map([['a', 800]]));

    expect(plan[0].mismatched).toBe(true);
    expect(plan[0].expectedPendingCents).toBe(700);
    expect(plan[0].restoredPendingCents).toBe(1000);
  });

  it('flags a mismatch when the cargo is missing entirely', () => {
    const original: AjusteOriginalRow = {
      cargoId: 'a',
      deltaCents: -300,
      pendienteResultanteCents: 700,
    };

    const plan = planReversa([original], new Map());

    expect(plan).toEqual([
      {
        cargoId: 'a',
        expectedPendingCents: 700,
        restoredPendingCents: 1000,
        removeCargo: false,
        mismatched: true,
      },
    ]);
  });

  it('keeps one row per original row, in the order it was given', () => {
    const originales: AjusteOriginalRow[] = [
      { cargoId: 'a', deltaCents: -300, pendienteResultanteCents: 700 },
      { cargoId: 'b', deltaCents: 500, pendienteResultanteCents: 500 },
    ];

    const plan = planReversa(originales, new Map([['a', 700], ['b', 500]]));

    expect(plan.map((row) => row.cargoId)).toEqual(['a', 'b']);
    expect(plan.map((row) => row.mismatched)).toEqual([false, false]);
    expect(plan.map((row) => row.removeCargo)).toEqual([false, true]);
  });

  it('does not mutate the originals it is given', () => {
    const originales: AjusteOriginalRow[] = [
      { cargoId: 'a', deltaCents: -300, pendienteResultanteCents: 700 },
    ];
    const before = originales.map((row) => ({ ...row }));

    planReversa(originales, new Map([['a', 700]]));

    expect(originales).toEqual(before);
  });
});

describe('sumAjustesOtorgados', () => {
  const FILAS: AjusteReporteRow[] = [
    { tipo: 'condonacion', montoCents: -100, conceptoNombre: 'Apoyo legal' },
    { tipo: 'condonacion', montoCents: -50, conceptoNombre: 'Apoyo legal' },
    { tipo: 'pago_tercero', montoCents: -200, conceptoNombre: 'Donaciones' },
    { tipo: 'cesion', montoCents: -150, conceptoNombre: 'Apoyo aniversario' },
    { tipo: 'cesion', montoCents: 150, conceptoNombre: 'Donaciones' },
    { tipo: 'reversa', montoCents: -100, conceptoNombre: 'Apoyo legal' },
    { tipo: 'condonacion', montoCents: -25, conceptoNombre: null },
  ];

  it('sums the magnitudes of reduction rows and groups them by concept', () => {
    const reporte = sumAjustesOtorgados(FILAS);

    expect(reporte.totalCents).toBe(525);
    expect(reporte.porConcepto).toEqual([
      { conceptoNombre: 'Donaciones', totalCents: 200 },
      { conceptoNombre: 'Apoyo aniversario', totalCents: 150 },
      { conceptoNombre: 'Apoyo legal', totalCents: 150 },
      { conceptoNombre: 'Sin concepto', totalCents: 25 },
    ]);
  });

  it('excludes a reversa row even when its amount is a reduction', () => {
    const reporte = sumAjustesOtorgados([
      { tipo: 'reversa', montoCents: -100, conceptoNombre: 'Apoyo legal' },
    ]);

    expect(reporte.totalCents).toBe(0);
    expect(reporte.porConcepto).toEqual([]);
  });

  it('excludes a positive row (a cession receiving side)', () => {
    const reporte = sumAjustesOtorgados([
      { tipo: 'cesion', montoCents: 150, conceptoNombre: 'Donaciones' },
    ]);

    expect(reporte.totalCents).toBe(0);
    expect(reporte.porConcepto).toEqual([]);
  });

  it('groups a null concept under the Sin concepto label', () => {
    const reporte = sumAjustesOtorgados([
      { tipo: 'condonacion', montoCents: -25, conceptoNombre: null },
      { tipo: 'condonacion', montoCents: -75, conceptoNombre: null },
    ]);

    expect(reporte.porConcepto).toEqual([{ conceptoNombre: 'Sin concepto', totalCents: 100 }]);
  });

  it('orders groups by total desc and then by name asc', () => {
    const reporte = sumAjustesOtorgados([
      { tipo: 'condonacion', montoCents: -100, conceptoNombre: 'Zeta' },
      { tipo: 'condonacion', montoCents: -100, conceptoNombre: 'Alfa' },
      { tipo: 'condonacion', montoCents: -300, conceptoNombre: 'Beta' },
    ]);

    expect(reporte.porConcepto.map((grupo) => grupo.conceptoNombre)).toEqual([
      'Beta',
      'Alfa',
      'Zeta',
    ]);
  });

  it('returns a zero total and no groups for an empty ledger', () => {
    expect(sumAjustesOtorgados([])).toEqual({ totalCents: 0, porConcepto: [] });
  });

  it('does not mutate the rows it is given', () => {
    const filas = FILAS.map((fila) => ({ ...fila }));

    sumAjustesOtorgados(filas);

    expect(filas).toEqual(FILAS);
  });
});

describe('netPositionCents', () => {
  it('adds the two terms', () => {
    expect(netPositionCents(1000, 250)).toBe(1250);
    expect(netPositionCents(0, 0)).toBe(0);
  });

  it('allows a negative position, unclamped', () => {
    expect(netPositionCents(-100, 50)).toBe(-50);
  });
});

describe('isAjusteTipo', () => {
  it('accepts exactly the four ledger types', () => {
    expect(isAjusteTipo('condonacion')).toBe(true);
    expect(isAjusteTipo('cesion')).toBe(true);
    expect(isAjusteTipo('pago_tercero')).toBe(true);
    expect(isAjusteTipo('reversa')).toBe(true);
  });

  it('rejects casing, spacing, accent and non-string variants', () => {
    expect(isAjusteTipo('Condonacion')).toBe(false);
    expect(isAjusteTipo('condonacion ')).toBe(false);
    expect(isAjusteTipo(' condonacion')).toBe(false);
    expect(isAjusteTipo('condonación')).toBe(false);
    expect(isAjusteTipo('pago tercero')).toBe(false);
    expect(isAjusteTipo('pago')).toBe(false);
    expect(isAjusteTipo(null)).toBe(false);
    expect(isAjusteTipo(undefined)).toBe(false);
    expect(isAjusteTipo(1)).toBe(false);
    expect(isAjusteTipo({})).toBe(false);
  });
});

/**
 * The union in this module and the Postgres CHECK in the migration are two
 * encodings of the same fact. The migration was applied live, so the agreement
 * is asserted against the file the operator applied rather than trusted.
 */
describe('tipo agreement with phase11_registro_ajustes.sql', () => {
  const sqlPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../supabase/sql/phase11_registro_ajustes.sql',
  );
  const sql = readFileSync(sqlPath, 'utf-8');

  it('declares exactly the TypeScript AJUSTE_TIPOS in the CHECK constraint', () => {
    const check = /check\s*\(\s*tipo\s+in\s*\(([^)]*)\)/i.exec(sql);

    expect(check).not.toBeNull();
    const declared = [...check![1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();

    expect(declared).toEqual([...AJUSTE_TIPOS].sort());
  });
});
