import { describe, expect, it } from 'vitest';
import { mapAdminError, mapBankConfigError } from './errors';

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

describe('mapBankConfigError', () => {
  it('maps the CLABE check constraint violation to a Spanish format message', () => {
    expect(
      mapBankConfigError({
        message:
          'new row for relation "configuracion_bancaria" violates check constraint "configuracion_bancaria_clabe_check"',
      }),
    ).toBe('La CLABE debe tener exactamente 18 dígitos numéricos.');
  });

  it('falls back to a generic Spanish message for any other error', () => {
    expect(mapBankConfigError({ message: 'permission denied for table configuracion_bancaria' })).toBe(
      'Error al actualizar la configuración bancaria.',
    );
  });

  it('falls back to the generic message when no message is present', () => {
    expect(mapBankConfigError({})).toBe('Error al actualizar la configuración bancaria.');
  });
});
