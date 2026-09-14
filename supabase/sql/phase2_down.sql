-- ============================================================================
-- Phase 2 DOWN script — evolucion-plataforma-arca
--
-- Reverses phase2_roles.sql, phase2_seed_superadmin.sql, phase2_rls.sql,
-- phase2_aal2.sql, and phase2_guard.sql, in the order that keeps each step
-- valid to run. Only run this if Phase 2 needs to be rolled back after being
-- applied to the live database.
--
-- ORDER MATTERS (design.md, Migration/Rollout): the guard trigger must be
-- dropped BEFORE anything else touches app_admins, or it can block this
-- rollback's own operations on that table.
--
-- STATUS: drafted, NOT yet applied — this is a contingency script, prepared
-- ahead of Phase 2's live execution per the same rollback-readiness practice
-- Phase 0 used (see phase0_down.sql, written before Phase 0 ran live).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop the guard trigger + function first — nothing else on app_admins
-- should proceed while it's live.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_guard_ultimo_superadmin on public.app_admins;
drop function if exists public.guard_ultimo_superadmin();

-- ----------------------------------------------------------------------------
-- 2. Drop the AAL2 restrictive policies (phase2_aal2.sql).
-- ----------------------------------------------------------------------------
drop policy if exists "app_admins_insert_aal2" on public.app_admins;
drop policy if exists "app_admins_update_aal2" on public.app_admins;
drop policy if exists "app_admins_delete_aal2" on public.app_admins;

-- ----------------------------------------------------------------------------
-- 3. Drop the is_admin()/is_superadmin()-scoped permissive policies
-- (phase2_rls.sql) on the 4 original tables and on app_admins.
-- ----------------------------------------------------------------------------
drop policy if exists "admins_all_miembros" on public.miembros;
drop policy if exists "admins_all_cargos" on public.cargos;
drop policy if exists "admins_all_registro_apoyos" on public.registro_apoyos;
drop policy if exists "admins_all_registro_pagos" on public.registro_pagos;
drop policy if exists "app_admins_select" on public.app_admins;
drop policy if exists "app_admins_insert" on public.app_admins;
drop policy if exists "app_admins_update" on public.app_admins;
drop policy if exists "app_admins_delete" on public.app_admins;

-- ----------------------------------------------------------------------------
-- 4. Recreate the original 8 blanket policies and re-grant anon on the 4
-- original tables. This is exactly phase0_down.sql's policy-recreation
-- section (phase2_rls.sql dropped these same 8 policies), included here
-- verbatim so this script is self-contained and doesn't require running two
-- files in sequence during an incident.
--
-- Deliberately NOT disabling row level security on these 4 tables: RLS was
-- already enabled on them before this SDD change started (the pre-existing
-- policies only take effect with RLS enabled) — `alter table ... enable row
-- level security` in phase2_rls.sql re-asserted an existing state, so there
-- is nothing to revert here. Disabling RLS now would produce a state that
-- never existed pre-Phase-2 (fully open tables), which is not what rollback
-- means.
-- ----------------------------------------------------------------------------
grant all on public.miembros, public.cargos, public.registro_apoyos, public.registro_pagos to anon;

drop policy if exists "Permitir lectura a usuarios autenticados" on public.miembros;
create policy "Permitir lectura a usuarios autenticados"
  on public.miembros as permissive for select to public
  using (auth.role() = 'authenticated'::text);

drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.miembros;
create policy "Permitir todas las acciones a usuarios autenticados"
  on public.miembros as permissive for all to public
  using (auth.role() = 'authenticated'::text);

drop policy if exists "Permitir lectura a usuarios autenticados" on public.cargos;
create policy "Permitir lectura a usuarios autenticados"
  on public.cargos as permissive for select to public
  using (auth.role() = 'authenticated'::text);

drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.cargos;
create policy "Permitir todas las acciones a usuarios autenticados"
  on public.cargos as permissive for all to public
  using (auth.role() = 'authenticated'::text);

drop policy if exists "Permitir lectura a usuarios autenticados" on public.registro_apoyos;
create policy "Permitir lectura a usuarios autenticados"
  on public.registro_apoyos as permissive for select to public
  using (auth.role() = 'authenticated'::text);

drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.registro_apoyos;
create policy "Permitir todas las acciones a usuarios autenticados"
  on public.registro_apoyos as permissive for all to public
  using (auth.role() = 'authenticated'::text);

drop policy if exists "Permitir lectura a usuarios autenticados" on public.registro_pagos;
create policy "Permitir lectura a usuarios autenticados"
  on public.registro_pagos as permissive for select to public
  using (auth.role() = 'authenticated'::text);

drop policy if exists "Permitir todas las acciones a usuarios autenticados" on public.registro_pagos;
create policy "Permitir todas las acciones a usuarios autenticados"
  on public.registro_pagos as permissive for all to public
  using (auth.role() = 'authenticated'::text);

-- ----------------------------------------------------------------------------
-- 5. Drop app_admins entirely, and the role-check functions.
--
-- Explicit drops rather than `drop table ... cascade`: this project avoids
-- implicit/cascading behavior throughout (see the "never select(*)" and
-- "no bare restrictive policy" conventions elsewhere in this change) so a
-- rollback under incident pressure is auditable statement-by-statement,
-- not dependent on Postgres's dependency-graph inference.
-- ----------------------------------------------------------------------------
drop table if exists public.app_admins;
drop function if exists public.is_admin();
drop function if exists public.is_superadmin();

-- ----------------------------------------------------------------------------
-- 6. Verify: pg_policies for the 4 original tables should show exactly the
-- 8 pre-Phase-2 policies again, app_admins should not exist, and any
-- surviving session should behave exactly as it did before Phase 2 (any
-- authenticated user has full CRUD on the 4 original tables, same as the
-- Phase-0-through-Phase-1 window).
-- ----------------------------------------------------------------------------
