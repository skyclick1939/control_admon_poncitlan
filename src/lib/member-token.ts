export const TOKEN_BYTES = 32;
export const TOKEN_CHARS = 43; // base64url of 32 bytes, unpadded

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Encodes raw bytes as unpadded base64url (design.md D10). Runtime-agnostic:
 * uses only `btoa`, available as a global in both the browser and Node —
 * never `node:crypto` or `crypto.subtle`, so this module can be shared
 * unchanged between the admin browser and a future Vercel Function.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * D11's pre-DB short-circuit: a pure predicate over the candidate string.
 * It reads no member data, so its verdict cannot be a function of which
 * tokens exist (design.md D11-timing) — only of the string's own shape.
 */
export function isTokenShape(value: string | null): boolean {
  return value !== null && value.length === TOKEN_CHARS && BASE64URL_PATTERN.test(value);
}
