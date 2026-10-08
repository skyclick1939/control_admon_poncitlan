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

/**
 * Members eligible to be charged or to receive a payment in a NEW transaction.
 * `status='interno'` marks a bookkeeping pseudo-member (for example
 * `Gastos_sin_cargar`): charging it creates a receivable nobody will pay, which
 * is the defect phase8 had to repair by hand. Retired members stay excluded too.
 * PURE — mirrors `aggregateDebtByMember`'s existing internal exclusion.
 */
export function miembrosSeleccionables(members: readonly Miembro[]): Miembro[] {
  return members.filter((member) => member.activo && member.status !== 'interno');
}
