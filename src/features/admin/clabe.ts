/**
 * Matches the DB's `check (clabe ~ '^[0-9]{18}$')` constraint (design.md
 * Database Design — `configuracion_bancaria`). Client-side pre-validation
 * only; the database check is the real boundary.
 */
export function isValidClabe(clabe: string): boolean {
  return /^[0-9]{18}$/.test(clabe);
}
