import { describe, expect, it } from 'vitest';
import { mapAdminError } from './errors';

describe('mapAdminError', () => {
  it('maps the guard trigger machine code to the Spanish last-superadmin message', () => {
    expect(mapAdminError({ message: 'ultimo_superadmin_protegido' })).toBe(
      'No se puede eliminar ni degradar al último superadministrador. Debe existir al menos uno.',
    );
  });

  it('falls back to a generic Spanish message for any other error', () => {
    expect(mapAdminError({ message: 'duplicate key value violates unique constraint' })).toBe(
      'Error al actualizar el administrador.',
    );
  });

  it('falls back to the generic message when no message is present', () => {
    expect(mapAdminError({})).toBe('Error al actualizar el administrador.');
  });
});
