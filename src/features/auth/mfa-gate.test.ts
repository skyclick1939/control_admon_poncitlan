import { describe, expect, it } from 'vitest';
import { requiresForcedEnrollment } from './mfa-gate';

describe('requiresForcedEnrollment', () => {
  it('blocks a superadmin session with no verified TOTP factor', () => {
    expect(requiresForcedEnrollment(true, false)).toBe(true);
  });

  it('lets a superadmin session through once it holds a verified TOTP factor', () => {
    expect(requiresForcedEnrollment(true, true)).toBe(false);
  });

  it('never gates a non-superadmin session, enrolled or not', () => {
    expect(requiresForcedEnrollment(false, false)).toBe(false);
    expect(requiresForcedEnrollment(false, true)).toBe(false);
  });
});
