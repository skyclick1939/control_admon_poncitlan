import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKEN_BYTES, TOKEN_CHARS, isTokenShape, toBase64Url } from './member-token';

describe('toBase64Url', () => {
  it('encodes 32 random bytes as 43 unpadded base64url characters', () => {
    const encoded = toBase64Url(randomBytes(TOKEN_BYTES));

    expect(encoded).toHaveLength(TOKEN_CHARS);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('encodes an all-zero and an all-max byte sequence into different, still-valid strings (triangulation)', () => {
    const zeros = toBase64Url(new Uint8Array(TOKEN_BYTES).fill(0));
    const maxed = toBase64Url(new Uint8Array(TOKEN_BYTES).fill(255));

    expect(zeros).toHaveLength(TOKEN_CHARS);
    expect(maxed).toHaveLength(TOKEN_CHARS);
    expect(zeros).not.toBe(maxed);
    expect(zeros).not.toMatch(/[+/=]/);
    expect(maxed).not.toMatch(/[+/=]/);
  });
});

describe('isTokenShape', () => {
  const validToken = toBase64Url(randomBytes(TOKEN_BYTES));

  it('accepts a real, well-formed 43-character base64url token', () => {
    expect(isTokenShape(validToken)).toBe(true);
  });

  it('rejects null', () => {
    expect(isTokenShape(null)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isTokenShape('')).toBe(false);
  });

  it('rejects a 44-character string — one character too long', () => {
    expect(isTokenShape('a'.repeat(44))).toBe(false);
  });

  it('rejects a 4 KB string', () => {
    expect(isTokenShape('a'.repeat(4096))).toBe(false);
  });

  it('rejects a 43-character string containing a non-base64url character', () => {
    const tampered = `${validToken.slice(0, 42)}+`;

    expect(tampered).toHaveLength(TOKEN_CHARS);
    expect(isTokenShape(tampered)).toBe(false);
  });
});

describe('member-token module import graph (design.md D11-timing)', () => {
  it('imports no Supabase or Node IO module (verdict cannot depend on which tokens exist)', () => {
    const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), 'member-token.ts');
    const source = readFileSync(modulePath, 'utf-8');

    const importedSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    const forbiddenSpecifiers = importedSpecifiers.filter((specifier) =>
      /supabase|^node:|^crypto$/i.test(specifier),
    );

    expect(forbiddenSpecifiers).toEqual([]);
  });
});
