import { describe, expect, it } from 'vitest';
import { mapMiembroError } from './errors';

describe('mapMiembroError', () => {
  it('maps the FK-restrict violation (23503) to the Retirar-instead-of-Eliminar message', () => {
    expect(mapMiembroError({ code: '23503' })).toBe('Este miembro tiene historial financiero; usa Retirar.');
  });

  it('falls back to a generic Spanish message for any other error code', () => {
    expect(mapMiembroError({ code: '23505' })).toBe('Error al actualizar el miembro.');
  });

  it('falls back to the generic message when no code is present', () => {
    expect(mapMiembroError({})).toBe('Error al actualizar el miembro.');
  });
});
