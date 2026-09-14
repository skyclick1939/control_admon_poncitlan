/**
 * Forced-enrollment gate (spec superadmin-mfa, TOTP Enrollment requirement).
 * A superadmin session without a verified TOTP factor must be blocked from
 * the admin UI until it enrolls. This is the client-side UX gate ONLY — the
 * real boundary is the database's restrictive AAL2 policy on `app_admins`
 * writes (`supabase/sql/phase2_aal2.sql`), which holds even if this gate is
 * bypassed entirely.
 *
 * PURE — zero imports, so it is unit-testable without a live Supabase client
 * (mirrors `lib/money.ts`'s D6 pattern: conversion/side effects stay at the
 * boundary, in `mfa.ts`).
 */
export function requiresForcedEnrollment(isSuperadmin: boolean, hasVerifiedTotp: boolean): boolean {
  return isSuperadmin && !hasVerifiedTotp;
}
