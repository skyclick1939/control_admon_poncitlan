# Superadmin MFA Specification

## Purpose

Defines TOTP-based MFA enrollment, challenge, and verification for the superadmin role via `auth.mfa.*`, and mandates that AAL2 is enforced as a database-level RLS boundary on `app_admins` writes, not merely a client-side gate.

## ADDED Requirements

### Requirement: TOTP Enrollment

The system MUST allow a superadmin session to enroll a TOTP factor via `auth.mfa.enroll({ factorType: 'totp' })`, receiving a factor id, QR code, secret, and URI for authenticator-app setup.

#### Scenario: Enrollment returns a usable TOTP factor

- GIVEN an authenticated superadmin session with no enrolled TOTP factor
- WHEN that session calls `enroll({ factorType: 'totp' })`
- THEN the response includes a factor id and a `totp` object with `qr_code`, `secret`, and `uri`

### Requirement: Challenge and Verify

The system MUST allow a superadmin session to raise its Authenticator Assurance Level to `aal2` by calling `challenge({ factorId })` followed by `verify({ factorId, challengeId, code })` with a valid TOTP code.

#### Scenario: Valid code raises session to aal2

- GIVEN a superadmin session at `aal1` with an enrolled, unverified-this-session TOTP factor
- WHEN the session calls `challenge` then `verify` with the correct current TOTP code
- THEN `getAuthenticatorAssuranceLevel()` returns `currentLevel: 'aal2'`

#### Scenario: Invalid code does not elevate the session

- GIVEN a superadmin session at `aal1` with an enrolled TOTP factor and an open challenge
- WHEN the session calls `verify` with an incorrect code
- THEN verification fails and the session remains at `aal1`

### Requirement: Database-Enforced AAL2 on app_admins Writes

The system MUST enforce a `restrictive` Postgres RLS policy on `app_admins` for `INSERT`, `UPDATE`, and `DELETE`, requiring `(select auth.jwt()->>'aal') = 'aal2'`. This check MUST be enforced by the database itself and MUST NOT depend on any client-side or UI-level check to be effective.

#### Scenario: aal1 session write refused by the database

- GIVEN an authenticated superadmin session at `aal1`
- WHEN that session issues an `INSERT` or `UPDATE` against `app_admins` directly against the database (bypassing any client UI)
- THEN Postgres refuses the write due to the restrictive AAL2 policy

#### Scenario: aal2 session write succeeds

- GIVEN an authenticated superadmin session that has completed TOTP verification and holds `aal2`
- WHEN that session issues an `INSERT` or `UPDATE` against `app_admins`
- THEN the write succeeds

#### Scenario: Direct API bypass of the UI still refused at aal1

- GIVEN a valid `aal1` JWT for a superadmin, used with a raw HTTP request to the PostgREST/Supabase API (no browser UI involved)
- WHEN that request attempts to modify `app_admins`
- THEN the database refuses the write, proving the gate is not merely a UI-level control
