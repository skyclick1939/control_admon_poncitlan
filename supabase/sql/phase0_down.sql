-- ============================================================================
-- Phase 0 DOWN script — evolucion-plataforma-arca
-- Reverses tasks 0.3 (disable_signup=true) and 0.4 (REVOKE anon) exactly.
--
-- Snapshot taken: 2026-09-13, live query against Supabase project
-- qjswicjxwsbwnxrrowsi ("arca", shared), via the Management API
-- database/query endpoint. Values below are the verbatim pre-Phase-0 state.
--
-- Scope: this script touches ONLY the 4 tables this app owns
-- (miembros, cargos, registro_apoyos, registro_pagos). It never touches any
-- other table in the shared project and never touches any auth.users row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Re-grant anon table privileges (reverses task 0.4's REVOKE)
--
-- Before Phase 0, information_schema.role_table_grants showed `anon` holding
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on all 4
-- tables (the default Postgres/Supabase grant set) — i.e. GRANT ALL.
-- ----------------------------------------------------------------------------
grant all on public.miembros, public.cargos, public.registro_apoyos, public.registro_pagos to anon;

-- ----------------------------------------------------------------------------
-- 2. Recreate the exact RLS policies observed on pg_policies before Phase 0.
--
-- Phase 0 does NOT drop or modify these policies (that happens in Phase 2)
-- and REVOKE does not remove them either. These statements are a defensive
-- snapshot only, so this DOWN script is self-contained even if something
-- else in the live project touched these policies during the change window.
--
-- Verbatim source (pg_policies, schemaname='public'):
--   table            | policyname                                    | cmd    | roles    | qual
--   -----------------+------------------------------------------------+--------+----------+------------------------------------
--   miembros         | Permitir lectura a usuarios autenticados       | SELECT | {public} | (auth.role() = 'authenticated'::text)
--   miembros         | Permitir todas las acciones a usuarios autenticados | ALL | {public} | (auth.role() = 'authenticated'::text)
--   cargos           | Permitir lectura a usuarios autenticados       | SELECT | {public} | (auth.role() = 'authenticated'::text)
--   cargos           | Permitir todas las acciones a usuarios autenticados | ALL | {public} | (auth.role() = 'authenticated'::text)
--   registro_apoyos  | Permitir lectura a usuarios autenticados       | SELECT | {public} | (auth.role() = 'authenticated'::text)
--   registro_apoyos  | Permitir todas las acciones a usuarios autenticados | ALL | {public} | (auth.role() = 'authenticated'::text)
--   registro_pagos   | Permitir lectura a usuarios autenticados       | SELECT | {public} | (auth.role() = 'authenticated'::text)
--   registro_pagos   | Permitir todas las acciones a usuarios autenticados | ALL | {public} | (auth.role() = 'authenticated'::text)
-- All 8 policies have with_check = null (ALL policies fall back to using qual
-- for the check, which is standard Postgres behavior when omitted).
-- ----------------------------------------------------------------------------

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
-- 3. Re-enable self-signup (reverses task 0.3) — NOT a SQL statement.
--
-- Before Phase 0, GET /v1/projects/qjswicjxwsbwnxrrowsi/config/auth returned
-- disable_signup: false. To roll back, PATCH it back to false via the
-- Supabase Management API (never the Dashboard, per this change's decision
-- to keep the toggle scriptable/auditable):
--
--   curl -X PATCH "https://api.supabase.com/v1/projects/qjswicjxwsbwnxrrowsi/config/auth" \
--     -H "Authorization: Bearer <SUPABASE_MANAGEMENT_API_TOKEN>" \
--     -H "Content-Type: application/json" \
--     -d '{"disable_signup": false}'
--
-- Confirm with a follow-up GET on the same endpoint that disable_signup is
-- back to false.
-- ============================================================================
