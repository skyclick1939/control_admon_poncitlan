-- ============================================================================
-- Phase 2 — Manual test reference (NOT executed by this batch)
-- evolucion-plataforma-arca, tasks.md task 2.6
--
-- These queries are for a HUMAN to run manually, after phase2_roles.sql,
-- phase2_seed_superadmin.sql, phase2_rls.sql, phase2_aal2.sql and
-- phase2_guard.sql are reviewed, approved, and applied to the live project.
-- Nothing in this file has been run against the live database.
--
-- Run each block in the Supabase SQL editor (or psql) using a REAL aal1 or
-- aal2 JWT for the seeded superadmin, obtained via the app's normal
-- login + TOTP flow — do not fabricate a JWT. `set local role authenticated`
-- plus `set local request.jwt.claims` makes a psql/SQL-editor session
-- impersonate PostgREST's row-security context for that JWT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Test 1 — aal1 insert/update on app_admins refused.
-- Replace <aal1-jwt-sub> with the seeded superadmin's auth.users.id and run
-- with a JWT claims payload whose "aal" is "aal1" (a session that has NOT
-- completed TOTP verification yet).
-- EXPECTED: both statements fail — the "app_admins_insert_aal2" /
-- "app_admins_update_aal2" restrictive policy rejects them.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "<aal1-jwt-sub>", "aal": "aal1", "role": "authenticated"}';

insert into public.app_admins (user_id, email, rol, created_by)
values ('<some-other-user-id>', 'test-aal1@example.com', 'admin', '<aal1-jwt-sub>');
-- EXPECTED: ERROR — new row violates row-level security policy for table "app_admins"

update public.app_admins set rol = 'admin' where user_id = '<aal1-jwt-sub>';
-- EXPECTED: ERROR — same restrictive-policy rejection (0 rows affected, or an RLS error)
rollback;

-- ----------------------------------------------------------------------------
-- Test 2 — aal2 succeeds.
-- Same as Test 1, but "aal": "aal2" (a session that HAS completed TOTP
-- verification via features/auth/mfa.ts's challenge()/verify()).
-- EXPECTED: the insert succeeds (is_superadmin() permissive check also
-- passes, since <aal1-jwt-sub> is the seeded superadmin).
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "<aal1-jwt-sub>", "aal": "aal2", "role": "authenticated"}';

insert into public.app_admins (user_id, email, rol, created_by)
values ('<some-other-user-id>', 'test-aal2@example.com', 'admin', '<aal1-jwt-sub>');
-- EXPECTED: INSERT 0 1
rollback;

-- ----------------------------------------------------------------------------
-- Test 3 — anon denied on all 5 tables that exist as of Phase 2.
-- (configuracion_bancaria does not exist until Phase 3 — see phase2_rls.sql's
-- scope note.)
-- EXPECTED: every SELECT below returns 0 rows or a permission-denied error,
-- never data.
-- ----------------------------------------------------------------------------
begin;
set local role anon;
select 1 from public.miembros limit 1;
select 1 from public.cargos limit 1;
select 1 from public.registro_apoyos limit 1;
select 1 from public.registro_pagos limit 1;
select 1 from public.app_admins limit 1;
rollback;

-- ----------------------------------------------------------------------------
-- Test 4 — demoting/deleting the last superadmin raises
-- ultimo_superadmin_protegido.
-- Run as the seeded superadmin at aal2 (the guard trigger runs regardless of
-- RLS, but the write must first pass RLS to reach the trigger).
-- EXPECTED: both statements fail with a P0001 error whose message is
-- exactly "ultimo_superadmin_protegido" — this is the code
-- features/admin/errors.ts's mapAdminError() matches on.
-- ----------------------------------------------------------------------------
begin;
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "<seeded-superadmin-id>", "aal": "aal2", "role": "authenticated"}';

update public.app_admins set rol = 'admin' where user_id = '<seeded-superadmin-id>';
-- EXPECTED: ERROR:  ultimo_superadmin_protegido

-- delete from public.app_admins where user_id = '<seeded-superadmin-id>';
-- EXPECTED: ERROR:  ultimo_superadmin_protegido
rollback;
