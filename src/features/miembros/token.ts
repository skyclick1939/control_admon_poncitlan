import { TOKEN_BYTES, toBase64Url } from '../../lib/member-token';
import { copyToClipboard } from '../../lib/clipboard';
import { setMemberTokenHash } from './repo';

// Re-exported for `features/miembros/index.ts` (line 15), which still imports
// the copy helper from this module. The shared implementation now lives in
// `lib/clipboard.ts` (dependency-free — design.md D1 amendment).
export { copyToClipboard };

export interface GeneratedMemberToken {
  /** Full member-facing URL, ready to display in the one-time reveal (D16). */
  readonly url: string;
  readonly clipboardSucceeded: boolean;
}

/** Builds the member-facing link for a plaintext token (design.md D16), matching the `mi-cuenta` Vite entry. */
function buildMemberLink(plaintextToken: string): string {
  return `${window.location.origin}/mi-cuenta/?token=${plaintextToken}`;
}

/**
 * Issues or rotates a member's access token (design.md D9/D10/D16).
 * `crypto.getRandomValues` supplies 256 bits of entropy, base64url-encoded
 * as the plaintext; its SHA-256 hex digest — computed here via
 * `crypto.subtle`, never elsewhere — is the only thing persisted, through
 * `setMemberTokenHash`. The plaintext is copied to the clipboard when
 * possible and returned to the caller for the one-time reveal; it is never
 * written to `app.state` or any other module.
 */
export async function generateMemberToken(memberId: string): Promise<GeneratedMemberToken> {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const plaintextToken = toBase64Url(bytes);

  const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintextToken));
  const tokenHash = Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  await setMemberTokenHash(memberId, tokenHash);

  const url = buildMemberLink(plaintextToken);
  const clipboardSucceeded = await copyToClipboard(url);

  return { url, clipboardSucceeded };
}
