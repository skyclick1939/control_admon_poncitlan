import { dbClient } from '../../lib/supabase';
import type { AssuranceLevelStatus, TotpEnrollment } from '../../lib/types';

export { requiresForcedEnrollment } from './mfa-gate';

/**
 * Starts TOTP enrollment. The factor exists after this call but is
 * UNVERIFIED — `verifyTotp` must succeed before the session is upgraded to
 * `aal2` (see design.md's TOTP enrollment sequence diagram).
 */
export async function enrollTotp(friendlyName?: string): Promise<TotpEnrollment> {
  const { data, error } = await dbClient.auth.mfa.enroll({ factorType: 'totp', friendlyName });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Raises a challenge for an already-enrolled factor; returns the challenge id `verifyTotp` needs. */
export async function challengeTotp(factorId: string): Promise<string> {
  const { data, error } = await dbClient.auth.mfa.challenge({ factorId });
  if (error) throw error;
  return data.id;
}

/** Verifies the 6-digit TOTP code. On success, `supabase-js` upgrades the current session to `aal2` in place. */
export async function verifyTotp(factorId: string, challengeId: string, code: string): Promise<void> {
  const { error } = await dbClient.auth.mfa.verify({ factorId, challengeId, code });
  if (error) throw error;
}

/** True when the session already holds at least one verified TOTP factor. */
export async function hasVerifiedTotpFactor(): Promise<boolean> {
  const { data, error } = await dbClient.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.some((factor) => factor.status === 'verified');
}

export async function getAssuranceLevel(): Promise<AssuranceLevelStatus> {
  const { data, error } = await dbClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return {
    currentLevel: data.currentLevel as AssuranceLevelStatus['currentLevel'],
    nextLevel: data.nextLevel as AssuranceLevelStatus['nextLevel'],
  };
}
