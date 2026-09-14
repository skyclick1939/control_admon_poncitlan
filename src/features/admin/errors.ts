/**
 * Maps the `guard_ultimo_superadmin` trigger's stable machine code
 * (design.md D5 — `raise exception 'ultimo_superadmin_protegido'`) to a
 * Spanish UI message. The database stays language-neutral; this is the one
 * place that translates it.
 */
export function mapAdminError(error: { message?: string }): string {
  if (error.message?.includes('ultimo_superadmin_protegido')) {
    return 'No se puede eliminar ni degradar al último superadministrador. Debe existir al menos uno.';
  }
  return 'Error al actualizar el administrador.';
}
