-- ============================================================================
-- Phase 3 — Bank config: configuracion_bancaria DDL, RLS, seed row
-- evolucion-plataforma-arca, tasks.md task 3.1
--
-- STATUS: APPLIED live 2026-09-14. Executed against the live Supabase
-- project "arca" via the Management API database/query endpoint, with
-- explicit project-owner sign-off obtained beforehand (same precedent as
-- Phase 0 and Phase 2). Read-back verification: pg_policies shows exactly 1
-- policy on configuracion_bancaria, information_schema.role_table_grants
-- shows 0 rows for anon on this table, and the id=1 seed row exists.
--
-- Source: design.md "Database Design > New tables" (configuracion_bancaria)
-- and "> RLS for all 6 tables". Transcribed verbatim; is_admin() already
-- exists live (phase2_roles.sql) so no new helper function is needed here.
--
-- Specs: bank-config (Admin-Writable via RLS; Public Read Only Through the
-- Debt-View Function). configuracion_bancaria is admin-writable via
-- is_admin() (any app_admins row, admin or superadmin) -- NOT
-- is_superadmin()-gated, unlike app_admins' own writes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. configuracion_bancaria — singleton (check (id = 1) makes "one config"
-- structural, per design.md's rationale).
-- ----------------------------------------------------------------------------
create table public.configuracion_bancaria (
  id         smallint primary key default 1 check (id = 1),
  banco      text not null,
  clabe      text not null check (clabe ~ '^[0-9]{18}$'),
  titular    text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. RLS + the load-bearing anon REVOKE (D4). This table is new, so unlike
-- phase2_rls.sql's 4 original tables, there are no pre-existing policies to
-- drop here.
--
-- design.md's RLS table gives SELECT and INSERT/UPDATE/DELETE the identical
-- is_admin() predicate for this table -- one permissive `for all` policy
-- covers all four operations, exactly mirroring phase2_rls.sql's
-- "admins_all_*" policies on miembros/cargos/registro_apoyos/registro_pagos.
-- (CREATE POLICY's FOR clause only accepts one of ALL|SELECT|INSERT|UPDATE|
-- DELETE, never a comma list, so a single FOR ALL is the correct -- and only
-- valid -- way to express "SELECT and every write share the same check".)
-- ----------------------------------------------------------------------------
alter table public.configuracion_bancaria enable row level security;
revoke all on public.configuracion_bancaria from anon;

create policy "admins_all_configuracion_bancaria" on public.configuracion_bancaria
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. Seed the singleton row (tasks.md 3.1 "seed row") -- so the row exists
-- before any admin edits it via the bank-config UI, and api/debt-view.ts has
-- a non-null row to read from day one. Placeholder values only; an admin
-- overwrites these via features/admin/bank-config.ts's UPSERT on id=1.
-- ----------------------------------------------------------------------------
insert into public.configuracion_bancaria (id, banco, clabe, titular, updated_by)
values (1, 'Pendiente de configurar', '000000000000000000', 'Pendiente de configurar', null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Verify: pg_policies shows exactly the 1 new policy
-- ("admins_all_configuracion_bancaria") on configuracion_bancaria;
-- information_schema.role_table_grants shows zero rows for anon on this
-- table; select * from configuracion_bancaria where id=1 returns exactly
-- one placeholder row.
-- ----------------------------------------------------------------------------
