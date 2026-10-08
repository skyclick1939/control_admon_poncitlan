import { describe, expect, it } from 'vitest';
import { activeMiembros, miembrosSeleccionables } from './miembros';
import type { Miembro } from './types';

function makeMiembro(overrides: Partial<Miembro>): Miembro {
  return {
    id: overrides.id ?? 'id',
    nickname: overrides.nickname ?? 'nickname',
    status: overrides.status ?? 'fullparch',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    activo: overrides.activo ?? true,
    token_generado_en: overrides.token_generado_en ?? null,
  };
}

describe('activeMiembros', () => {
  it('excludes retired (activo=false) members from a mixed list', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', activo: true }),
      makeMiembro({ id: '2', nickname: 'ana', activo: false }),
      makeMiembro({ id: '3', nickname: 'beto', activo: true }),
    ];

    expect(activeMiembros(members).map((m) => m.nickname)).toEqual(['juan', 'beto']);
  });

  it('keeps every member when all are active', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', activo: true }),
      makeMiembro({ id: '2', nickname: 'ana', activo: true }),
    ];

    expect(activeMiembros(members)).toEqual(members);
  });

  it('returns an empty list when every member is retired', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', activo: false }),
      makeMiembro({ id: '2', nickname: 'ana', activo: false }),
    ];

    expect(activeMiembros(members)).toEqual([]);
  });
});

/**
 * `miembrosSeleccionables` is the option list of every selector that charges or
 * pays, so the internal pseudo-member (`Gastos_sin_cargar`) must never appear in
 * it: charging it creates a receivable nobody will pay, which is the defect
 * `phase8_reclasificar_gasto_sin_cargar.sql` had to repair by hand.
 */
describe('miembrosSeleccionables', () => {
  it('excludes the internal pseudo-member (status=interno) from a mixed list', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', status: 'fullparch' }),
      makeMiembro({ id: '2', nickname: 'Gastos_sin_cargar', status: 'interno' }),
      makeMiembro({ id: '3', nickname: 'beto', status: 'prospecto' }),
    ];

    expect(miembrosSeleccionables(members).map((m) => m.nickname)).toEqual(['juan', 'beto']);
  });

  it('excludes retired members, like activeMiembros', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', activo: false }),
      makeMiembro({ id: '2', nickname: 'beto', activo: true }),
    ];

    expect(miembrosSeleccionables(members).map((m) => m.nickname)).toEqual(['beto']);
  });

  it('excludes an internal member even when it is flagged active', () => {
    const members = [makeMiembro({ id: '1', nickname: 'Gastos_sin_cargar', status: 'interno', activo: true })];

    expect(miembrosSeleccionables(members)).toEqual([]);
  });

  it('keeps fullparch and prospecto members', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', status: 'fullparch' }),
      makeMiembro({ id: '2', nickname: 'ana', status: 'prospecto' }),
    ];

    expect(miembrosSeleccionables(members).map((m) => m.status)).toEqual(['fullparch', 'prospecto']);
  });

  it('preserves the input order', () => {
    const members = [
      makeMiembro({ id: '3', nickname: 'c' }),
      makeMiembro({ id: '1', nickname: 'a' }),
      makeMiembro({ id: '2', nickname: 'b' }),
    ];

    expect(miembrosSeleccionables(members).map((m) => m.id)).toEqual(['3', '1', '2']);
  });

  it('does not mutate the list it is given', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', status: 'fullparch' }),
      makeMiembro({ id: '2', nickname: 'Gastos_sin_cargar', status: 'interno' }),
    ];
    const before = [...members];

    miembrosSeleccionables(members);

    expect(members).toEqual(before);
  });

  it('agrees with activeMiembros on everything except the internal member', () => {
    const members = [
      makeMiembro({ id: '1', nickname: 'juan', status: 'fullparch', activo: true }),
      makeMiembro({ id: '2', nickname: 'Gastos_sin_cargar', status: 'interno', activo: true }),
      makeMiembro({ id: '3', nickname: 'ana', status: 'prospecto', activo: false }),
      makeMiembro({ id: '4', nickname: 'beto', status: 'interno', activo: false }),
    ];

    const soloInternos = new Set(
      activeMiembros(members)
        .filter((m) => m.status === 'interno')
        .map((m) => m.id),
    );
    const esperado = activeMiembros(members).filter((m) => !soloInternos.has(m.id));

    expect(miembrosSeleccionables(members)).toEqual(esperado);
  });
});
