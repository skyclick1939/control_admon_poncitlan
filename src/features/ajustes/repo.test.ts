import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { planAjuste } from '../../lib/ajustes';
import type { Charge } from '../../lib/money';
import { toCents } from '../../lib/money';
import { construirFilasLibro, registrarAjuste } from './repo';
import type { AjusteCesionInput, AjusteReduccionInput } from './repo';

/**
 * `src/lib/supabase.ts` throws while it is being imported when the VITE_*
 * variables are absent, which is the case in this environment (there is no
 * live session and no `.env`). The builder under test is PURE, so the module
 * is stubbed rather than the environment faked: these tests never touch the
 * network, and nothing here asserts how the async shell talks to PostgREST.
 */
vi.mock('../../lib/supabase', () => ({ dbClient: {} }));

const CTX = { grupoId: 'grupo-1' };

const charges = (...cargos: { id: string; pendingCents: number }[]): Charge[] => cargos;

const reduccion = (overrides: Partial<AjusteReduccionInput> = {}): AjusteReduccionInput => ({
  tipo: 'condonacion',
  miembroId: 'miembro-a',
  montoPesos: 300,
  cargoObjetivoId: null,
  registradoPorId: 'admin-1',
  nombreRegistrador: 'Admin Uno',
  conceptoId: 'concepto-1',
  observaciones: 'Acuerdo de asamblea',
  ...overrides,
});

const cesion = (overrides: Partial<AjusteCesionInput> = {}): AjusteCesionInput => ({
  tipo: 'cesion',
  cedenteId: 'miembro-a',
  receptorId: 'miembro-b',
  montoPesos: 150,
  cargoObjetivoId: 'cargo-1',
  registradoPorId: 'admin-1',
  nombreRegistrador: 'Admin Uno',
  conceptoId: 'concepto-1',
  observaciones: 'Se le pasa el apoyo a la hermana',
  ...overrides,
});

describe('construirFilasLibro', () => {
  describe('reducción (condonación y pago a tercero)', () => {
    it('writes one row per planned cargo: the SIGNED delta and the pending it left', () => {
      const plan = planAjuste(
        toCents(300),
        charges({ id: 'cargo-1', pendingCents: toCents(200) }, { id: 'cargo-2', pendingCents: toCents(500) }),
      );
      // FIFO: cargo-1 is fully forgiven (200), cargo-2 loses the remaining 100.
      expect(plan.rows.map((row) => row.cargoId)).toEqual(['cargo-1', 'cargo-2']);

      const rows = construirFilasLibro(reduccion(), plan, CTX);

      expect(rows).toEqual([
        {
          grupo_id: 'grupo-1',
          tipo: 'condonacion',
          miembro_id: 'miembro-a',
          cargo_id: 'cargo-1',
          monto: -200,
          pendiente_resultante: 0,
          concepto_id: 'concepto-1',
          contraparte_miembro_id: null,
          observaciones: 'Acuerdo de asamblea',
          registrado_por: 'admin-1',
          nombre_registrador: 'Admin Uno',
          grupo_revertido: null,
        },
        {
          grupo_id: 'grupo-1',
          tipo: 'condonacion',
          miembro_id: 'miembro-a',
          cargo_id: 'cargo-2',
          monto: -100,
          pendiente_resultante: 400,
          concepto_id: 'concepto-1',
          contraparte_miembro_id: null,
          observaciones: 'Acuerdo de asamblea',
          registrado_por: 'admin-1',
          nombre_registrador: 'Admin Uno',
          grupo_revertido: null,
        },
      ]);
    });

    it('records a pago_tercero under its own tipo, with no counterpart and no cargo invented', () => {
      const plan = planAjuste(toCents(150), charges({ id: 'cargo-1', pendingCents: toCents(500) }));

      const rows = construirFilasLibro(reduccion({ tipo: 'pago_tercero' }), plan, CTX);

      expect(rows).toEqual([
        {
          grupo_id: 'grupo-1',
          tipo: 'pago_tercero',
          miembro_id: 'miembro-a',
          cargo_id: 'cargo-1',
          monto: -150,
          pendiente_resultante: 350,
          concepto_id: 'concepto-1',
          contraparte_miembro_id: null,
          observaciones: 'Acuerdo de asamblea',
          registrado_por: 'admin-1',
          nombre_registrador: 'Admin Uno',
          grupo_revertido: null,
        },
      ]);
    });

    it('propagates the author, the name snapshot and the concept onto every row', () => {
      const plan = planAjuste(
        toCents(300),
        charges({ id: 'cargo-1', pendingCents: toCents(200) }, { id: 'cargo-2', pendingCents: toCents(500) }),
      );

      const rows = construirFilasLibro(
        reduccion({
          registradoPorId: null,
          nombreRegistrador: 'Admin Borrado',
          conceptoId: null,
          observaciones: '',
        }),
        plan,
        CTX,
      );

      // A deleted admin leaves `registrado_por` null; the snapshot survives.
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.registrado_por).toBeNull();
        expect(row.nombre_registrador).toBe('Admin Borrado');
        expect(row.concepto_id).toBeNull();
        expect(row.observaciones).toBe('');
      }
    });

    it('throws when the plan moved nothing', () => {
      const plan = planAjuste(toCents(0), charges({ id: 'cargo-1', pendingCents: toCents(500) }));

      expect(plan.rows).toEqual([]);
      expect(() => construirFilasLibro(reduccion({ montoPesos: 0 }), plan, CTX)).toThrow(Error);
    });
  });

  describe('cesión', () => {
    it('writes exactly two rows tied by grupo_id: the ceder loses, the receiver gains', () => {
      const plan = planAjuste(toCents(150), charges({ id: 'cargo-1', pendingCents: toCents(200) }), 'cargo-1');
      expect(plan.rows).toHaveLength(1);

      const rows = construirFilasLibro(cesion(), plan, { grupoId: 'grupo-1', nuevoCargoId: 'cargo-nuevo' });

      expect(rows).toEqual([
        {
          grupo_id: 'grupo-1',
          tipo: 'cesion',
          miembro_id: 'miembro-a',
          cargo_id: 'cargo-1',
          monto: -150,
          pendiente_resultante: 50,
          concepto_id: 'concepto-1',
          contraparte_miembro_id: 'miembro-b',
          observaciones: 'Se le pasa el apoyo a la hermana',
          registrado_por: 'admin-1',
          nombre_registrador: 'Admin Uno',
          grupo_revertido: null,
        },
        {
          grupo_id: 'grupo-1',
          tipo: 'cesion',
          miembro_id: 'miembro-b',
          cargo_id: 'cargo-nuevo',
          // The receiver's debt is the POSITIVE mirror of the ceder's delta.
          monto: 150,
          pendiente_resultante: 150,
          concepto_id: 'concepto-1',
          contraparte_miembro_id: 'miembro-a',
          observaciones: 'Se le pasa el apoyo a la hermana',
          registrado_por: 'admin-1',
          nombre_registrador: 'Admin Uno',
          grupo_revertido: null,
        },
      ]);
    });

    it('shares one grupo_id between the two rows and names both counterparts', () => {
      const plan = planAjuste(toCents(150), charges({ id: 'cargo-1', pendingCents: toCents(200) }), 'cargo-1');

      const rows = construirFilasLibro(cesion(), plan, { grupoId: 'grupo-1', nuevoCargoId: 'cargo-nuevo' });

      expect(rows[0].grupo_id).toBe(rows[1].grupo_id);
      expect(rows[0].contraparte_miembro_id).toBe('miembro-b');
      expect(rows[1].contraparte_miembro_id).toBe('miembro-a');
    });

    it('throws when the plan is not exactly one obligation', () => {
      // Two cargos in the plan means the cession stopped being a transfer of ONE
      // obligation to ONE receiver — the ledger shape (D5) cannot express it.
      const plan = planAjuste(
        toCents(300),
        charges({ id: 'cargo-1', pendingCents: toCents(200) }, { id: 'cargo-2', pendingCents: toCents(500) }),
      );
      expect(plan.rows).toHaveLength(2);

      expect(() => construirFilasLibro(cesion(), plan, { grupoId: 'grupo-1', nuevoCargoId: 'cargo-nuevo' })).toThrow(
        Error,
      );
    });

    it('throws when the plan moved nothing', () => {
      const plan = planAjuste(toCents(150), []);

      expect(() => construirFilasLibro(cesion(), plan, { grupoId: 'grupo-1', nuevoCargoId: 'cargo-nuevo' })).toThrow(
        Error,
      );
    });

    it('throws when the receiving cargo id was not generated', () => {
      const plan = planAjuste(toCents(150), charges({ id: 'cargo-1', pendingCents: toCents(200) }), 'cargo-1');

      expect(() => construirFilasLibro(cesion(), plan, { grupoId: 'grupo-1' })).toThrow(Error);
      expect(() => construirFilasLibro(cesion(), plan, { grupoId: 'grupo-1', nuevoCargoId: null })).toThrow(Error);
    });
  });
});

describe('registrarAjuste guards', () => {
  it('refuses a cession to the same member before any database read', async () => {
    // The guard runs before the first dbClient call, so the mocked client is
    // never reached; a self-cession would also make the reversal's per-member
    // net delta zero and be rejected by the `monto <> 0` CHECK.
    await expect(registrarAjuste(cesion({ cedenteId: 'miembro-a', receptorId: 'miembro-a' }))).rejects.toThrow(
      /dos miembros distintos/,
    );
  });
});

/**
 * The writer's neutrality is a fact about the SOURCE, not about a database this
 * environment does not have: the ledger exists precisely so a debt reduction
 * never has to lie about cash, so a `registro_pagos` reference reappearing in
 * this file would reintroduce the phantom inflow the change removes. The
 * allocation is asserted to be DELEGATED for the same reason — a second
 * implementation here is what makes old reversals contradictory.
 */
describe('src/features/ajustes/repo.ts source guards', () => {
  const repoPath = resolve(dirname(fileURLToPath(import.meta.url)), './repo.ts');
  const source = readFileSync(repoPath, 'utf-8');

  it('never references registro_pagos', () => {
    expect(source).not.toContain('registro_pagos');
  });

  it('imports planAjuste and planReversa from ../../lib/ajustes', () => {
    expect(source).toMatch(/import\s*\{[^}]*planAjuste[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/ajustes'/);
    expect(source).toMatch(/import\s*\{[^}]*planReversa[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/ajustes'/);
  });
});
