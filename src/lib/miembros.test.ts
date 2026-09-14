import { describe, expect, it } from 'vitest';
import { activeMiembros } from './miembros';
import type { Miembro } from './types';

function makeMiembro(overrides: Partial<Miembro>): Miembro {
  return {
    id: overrides.id ?? 'id',
    nickname: overrides.nickname ?? 'nickname',
    status: overrides.status ?? 'fullparch',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    activo: overrides.activo ?? true,
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
