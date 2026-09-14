import { describe, expect, it } from 'vitest';
import { isValidClabe } from './clabe';

describe('isValidClabe', () => {
  it('accepts a valid 18-digit CLABE', () => {
    expect(isValidClabe('1'.repeat(18))).toBe(true);
  });

  it('rejects a CLABE with fewer than 18 digits', () => {
    expect(isValidClabe('1'.repeat(17))).toBe(false);
  });

  it('rejects a CLABE with letters mixed in', () => {
    expect(isValidClabe(`${'1'.repeat(17)}A`)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidClabe('')).toBe(false);
  });
});
