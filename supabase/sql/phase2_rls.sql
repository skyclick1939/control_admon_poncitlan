-- ============================================================================
-- Phase 2 — RLS: drop blanket policies, add is_admin()-scoped policies
-- evolucion-plataforma-arca, tasks.md task 2.3
--
-- STATUS: drafted, NOT yet applied to the live database. Requires explicit
-- project-owner sign-off before execution (same precedent as Phase 0).
--
-- Must be applied AFTER phase2_roles.sql (is_admin()/is_superadmin() must
-- exist) and BEFORE phase2_aal2.sql (the AAL2 restrictive policies narrow
-- the permissive app_admins policies created here).
--
-- SCOPE NOTE (flagged for reviewer — see apply report "Ambiguity Found"):
-- design.md's "RLS for all 6 tables" table describes the END STATE across
-- Phases 2 AND 3, not a literal Phase-2 script. `configuracion_bancaria`
-- does not exist yet — it is created in Phase 3 (task 3.1) together with its
-- own is_admin() policies. This script therefore covers the 5 tables that
-- exist as of Phase 2: miembros, cargos, registro_apoyos, registro_pagos,
-- app_admins.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop pre-existing policies on the 4 original tables.
--
-- DEVIATION FLAGGED (see apply report "Ambiguity Found"): tasks.md 2.3 and
-- design.md's RLS section literally say to drop "the 4 blanket ALL to
-- authenticated policies". This script also drops the 4 pre-existing
-- blanket SELECT policies ("Permitir lectura a usuarios autenticados",
-- verbatim names from phase0_down.sql) on the same 4 tables.
--
-- Reasoning: Postgres OR-combines permissive policies for the same command.
-- Leaving the old SELECT-for-any-authenticated-user policy in place would
-- mean a non-admin authenticated session still passes SELECT through that
-- stale policy, even after the new is_admin()-scoped policy is added below.
-- That directly contradicts the auth-roles spec's "Authenticated non-admin
-- denied" requirement (specs/auth-roles/spec.md). Dropping only the ALL
-- policies as literally written would not close that gap. This is a
-- corrective interpretation, not new SQL improvised beyond design.md's
-- intent — the reviewer should confirm before this script runs.
-- ----------------------------------------------------------------------------
drop policy if exists "Permitir lectura a usuarios autenticados" on public.miembros;
drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.miembros;
drop policy if exists "Permitir lectura a usuarios autenticados" on public.cargos;
drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.cargos;
drop policy if exists "Permitir lectura a usuarios autenticados" on public.registro_apoyos;
drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.registro_apoyos;
drop policy if exists "Permitir lectura a usuarios autenticados" on public.registro_pagos;
drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.registro_pagos;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS + the load-bearing anon REVOKE (D4) on every table this
-- script governs. `revoke all ... from anon` already ran in Phase 0 (0.4)
-- for the 4 original tables; repeating it here is idempotent and keeps this
-- script self-contained. `app_admins` is new and needs it for the first
-- time — Supabase's default privileges grant `anon`/`authenticated` ALL on
-- newly created public-schema tables (observed in Phase 0's audit of the
-- original 4 tables' pre-existing grants), so this REVOKE is load-bearing
-- here too, not a defensive no-op.
-- ----------------------------------------------------------------------------
alter table public.miembros enable row level security;
alter table public.cargos enable row level security;
alter table public.registro_apoyos enable row level security;
alter table public.registro_pagos enable row level security;
alter table public.app_admins enable row level security;

revoke all on public.miembros from anon;
revoke all on public.cargos from anon;
revoke all on public.registro_apoyos from anon;
revoke all on public.registro_pagos from anon;
revoke all on public.app_admins from anon;

-- ----------------------------------------------------------------------------
-- 3. is_admin()-scoped policies on the 4 original tables.
--
-- design.md's RLS table gives SELECT and INSERT/UPDATE/DELETE the identical
-- is_admin() predicate for these 4 tables, so one permissive `for all`
-- policy per table covers all four operations (Postgres FOR ALL = select +
-- insert + update + delete). This differs from app_admins below only
-- because app_admins' SELECT and write predicates diverge.
-- ----------------------------------------------------------------------------
create policy "admins_all_miembros" on public.miembros
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins_all_cargos" on public.cargos
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins_all_registro_apoyos" on public.registro_apoyos
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins_all_registro_pagos" on public.registro_pagos
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. app_admins policies.
--
-- SELECT uses is_admin() — "an admin must read its own role at aal1"
-- (design.md). Writes use is_superadmin(). The AAL2 restrictive layer that
-- further narrows writes to aal2-only sessions is a SEPARATE script
-- (phase2_aal2.sql), applied on top of these permissive policies.
-- ----------------------------------------------------------------------------
create policy "app_admins_select" on public.app_admins
  as permissive for select to authenticated
  using (public.is_admin());

create policy "app_admins_insert" on public.app_admins
  as permissive for insert to authenticated
  with check (public.is_superadmin());

create policy "app_admins_update" on public.app_admins
  as permissive for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy "app_admins_delete" on public.app_admins
  as permissive for delete to authenticated
  using (public.is_superadmin());
