# Bank Config Specification

## Purpose

Defines write and read rules for `configuracion_bancaria`: admin/superadmin-writable via RLS, and publicly readable only indirectly through the public-debt-view function, never through a second direct public grant or view.

## ADDED Requirements

### Requirement: Admin-Writable via RLS

The system MUST allow `INSERT`, `UPDATE`, and `DELETE` on `configuracion_bancaria` only to authenticated sessions whose user id has a matching `app_admins` row (role `admin` or `superadmin`). All other sessions, including `anon` and authenticated non-admins, MUST be denied write access.

#### Scenario: Admin updates bank info

- GIVEN an authenticated session with an `app_admins` row of role `admin`
- WHEN that session updates a `configuracion_bancaria` row
- THEN the update succeeds

#### Scenario: Non-admin authenticated user denied write

- GIVEN an authenticated session with no `app_admins` row
- WHEN that session attempts to update a `configuracion_bancaria` row
- THEN the operation is refused

### Requirement: Public Read Only Through the Debt-View Function

`configuracion_bancaria` MUST NOT be readable directly by the `anon` role, and MUST NOT be exposed through any second public view, grant, or policy. Public access to bank account information MUST occur exclusively through the public-debt-view serverless function's server-side `service_role` query.

#### Scenario: Anon direct select denied

- GIVEN no authenticated session (the `anon` role)
- WHEN a `SELECT` is issued directly against `configuracion_bancaria`
- THEN the query is denied

#### Scenario: Public function still surfaces bank info

- GIVEN `configuracion_bancaria` denies direct `anon` reads
- WHEN the public debt-view function is called with no authentication
- THEN its response still includes current bank account info, read server-side via `service_role`
