import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * D10 rests on exactly one cross-runtime assumption: `crypto.subtle.digest`
 * (used in the admin browser) and `node:crypto`'s `createHash` (used by the
 * future `api/member-view.ts`) produce the same SHA-256 hex digest for the
 * same input. This file is that assumption's test, not a test of our own
 * production code — there is no `src/lib/digest-agreement.ts` to import.
 */
async function sha256HexViaSubtle(input: string): Promise<string> {
  const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function sha256HexViaNode(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('cross-runtime SHA-256 digest agreement (design.md D10)', () => {
  it('matches the well-known SHA-256 digest of the ASCII string "abc" via crypto.subtle', async () => {
    const subtleHex = await sha256HexViaSubtle('abc');

    expect(subtleHex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('agrees between crypto.subtle and node:crypto for a fixed 43-character token-shaped vector', async () => {
    const fixedVector = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    const subtleHex = await sha256HexViaSubtle(fixedVector);
    const nodeHex = sha256HexViaNode(fixedVector);

    expect(subtleHex).toBe(nodeHex);
    expect(subtleHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('agrees on a second, different fixed vector — proving the match is not a coincidence of one input (triangulation)', async () => {
    const fixedVector = 'the-quick-brown-fox-jumps-over-the-lazy-dog';

    const subtleHex = await sha256HexViaSubtle(fixedVector);
    const nodeHex = sha256HexViaNode(fixedVector);

    expect(subtleHex).toBe(nodeHex);
    expect(subtleHex).not.toBe(await sha256HexViaSubtle('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
  });
});
