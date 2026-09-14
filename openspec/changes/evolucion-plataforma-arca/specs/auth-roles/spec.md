# Auth Roles Specification

## Purpose

Defines the superadmin/admin role model, its `app_admins` backing table, role-scoped RLS on the four base tables, closed self-signup, and protection against total lockout via last-superadmin self-demotion/deletion.

## ADDED Requirements

### Requirement: Role Table

The system MUST store admin role assignments in a dedicated `app_admins` table keyed to `auth.users.id`, with a `role` column constrained to exactly `superadmin` or `admin`. No other role value SHALL be accepted.

#### Scenario: Valid role persists

- GIVEN a Supabase user id and role `admin`
- WHEN a row is inserted into `app_admins` with that id and role
- THEN the row persists and is retrievable by id

#### Scenario: Invalid role rejected

- GIVEN a Supabase user id
- WHEN a row is inserted into `app_admins` with role `owner`
- THEN the database rejects the insert with a constraint violation

### Requirement: Self-Signup Disabled

The system MUST set `disable_signup: true` on the Supabase Auth configuration, closing public self-registration for this project.

#### Scenario: Signup attempt rejected

- GIVEN `disable_signup` is `true`
- WHEN an unauthenticated client calls the sign-up endpoint with a new email/password
- THEN the request is refused and no `auth.users` row is created

### Requirement: anon Denied on Base Tables

The system MUST deny `SELECT` (and all other operations) to the `anon` role on `miembros`, `cargos`, `registro_apoyos`, and `registro_pagos`.

#### Scenario: Anonymous select denied on every base table

- GIVEN no authenticated session (the `anon` role)
- WHEN a `SELECT` is issued against `miembros`, `cargos`, `registro_apoyos`, or `registro_pagos`
- THEN each query returns zero rows or a permission-denied error, never data

### Requirement: Role-Scoped Access on Base Tables

The system MUST grant authenticated access to `miembros`, `cargos`, `registro_apoyos`, `registro_pagos` only to sessions whose user id has a matching `app_admins` row. An authenticated user without an `app_admins` row MUST be denied all access to these tables.

#### Scenario: Authenticated non-admin denied

- GIVEN an authenticated session whose user id has no row in `app_admins`
- WHEN that session queries any of the four base tables
- THEN access is denied

#### Scenario: Admin operates on financial tables

- GIVEN an authenticated session with an `app_admins` row of role `admin`
- WHEN that session inserts a `registro_apoyos` or `registro_pagos` row
- THEN the insert succeeds

### Requirement: Last Superadmin Self-Protection

The system MUST NOT allow a superadmin to demote its own `app_admins` role or delete its own `app_admins` row when it is the last remaining row with role `superadmin`.

#### Scenario: Sole superadmin blocked from self-demotion

- GIVEN exactly one `app_admins` row with role `superadmin`, belonging to the acting user
- WHEN that user attempts to update its own row to role `admin`
- THEN the operation is refused and the row remains `superadmin`

#### Scenario: Sole superadmin blocked from self-deletion

- GIVEN exactly one `app_admins` row with role `superadmin`, belonging to the acting user
- WHEN that user attempts to delete its own `app_admins` row
- THEN the operation is refused and the row remains

#### Scenario: Non-last superadmin may self-demote

- GIVEN two or more `app_admins` rows with role `superadmin`, one belonging to the acting user
- WHEN that user updates its own row to role `admin`
- THEN the operation succeeds
