import { TOKEN_BYTES, toBase64Url } from '../../lib/member-token';
import { setMemberTokenHash } from './repo';

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
 * Attempts to copy `text` to the clipboard. `navigator.clipboard` can be
 * denied or unavailable outside a secure context (design.md D16); callers
 * fall back to a visible, selected input on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
