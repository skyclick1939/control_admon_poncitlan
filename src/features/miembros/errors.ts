/**
 * Maps the `cargos`/`registro_pagos` -> `miembros` FK-restrict violation
 * (Postgres error code 23503, design.md Member lifecycle DDL: `on delete
 * restrict`) to a Spanish UI message. A member with financial history cannot
 * be deleted; retiring (`activo = false`) is the reversible alternative.
 * Mirrors `admin/errors.ts`'s `mapAdminError`/`mapBankConfigError` pattern.
 */
export function mapMiembroError(error: { code?: string }): string {
  if (error.code === '23503') {
    return 'Este miembro tiene historial financiero; usa Retirar.';
  }
  return 'Error al actualizar el miembro.';
}
