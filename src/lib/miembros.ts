import type { Miembro } from './types';

/**
 * Members eligible for a new cargo (apoyo) or a payment. A retired member
 * (`activo = false`) keeps their history but is excluded from every new-debt
 * surface (design.md Member lifecycle DDL; spec member-lifecycle,
 * "Retirement via activo Flag"). PURE — mirrors `money.ts`'s D6 pattern.
 */
export function activeMiembros(members: readonly Miembro[]): Miembro[] {
  return members.filter((member) => member.activo);
}
