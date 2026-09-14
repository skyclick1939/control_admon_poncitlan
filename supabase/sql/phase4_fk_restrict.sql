-- ============================================================================
-- Phase 4 — Member lifecycle: restrict FK deletes on cargos/registro_pagos
-- evolucion-plataforma-arca, tasks.md task 4.2
--
-- STATUS: APPLIED live 2026-09-14, with explicit project-owner sign-off
-- (same gate as Phase 0, Phase 2, Phase 3).
-- Read-back verification: information_schema.referential_constraints shows
-- cargos_miembro_id_fkey -> RESTRICT, registro_pagos_miembro_id_fkey ->
-- RESTRICT, and cargos_apoyo_id_fkey (-> registro_apoyos) unchanged at
-- CASCADE, confirming the out-of-scope constraint was not touched.
--
-- Source: design.md "Member lifecycle DDL" -- explicitly warns not to
-- hardcode default constraint names. Real names were read live via a
-- read-only information_schema query (safe, no sign-off needed for a SELECT)
-- against the "arca" Supabase project (ref qjswicjxwsbwnxrrowsi):
--
--   select tc.table_name, tc.constraint_name, rc.delete_rule
--   from information_schema.table_constraints tc
--   join information_schema.referential_constraints rc
--     on tc.constraint_name = rc.constraint_name and tc.table_schema = rc.constraint_schema
--   join information_schema.constraint_column_usage ccu
--     on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
--   where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
--     and tc.table_name in ('cargos', 'registro_pagos') and ccu.table_name = 'miembros';
--
-- Result (2026-09-14): both constraints already use Postgres's default
-- naming (cargos_miembro_id_fkey, registro_pagos_miembro_id_fkey) and are
-- currently ON DELETE CASCADE -- confirmed, not assumed.
--
-- Explicitly out of scope: cargos.apoyo_id -> registro_apoyos keeps CASCADE
-- (design.md, tasks.md 4.2). This script never touches that constraint.
--
-- Spec: member-lifecycle ("Restricted Deletion" requirement).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. cargos.miembro_id -> miembros.id: CASCADE -> RESTRICT
-- ----------------------------------------------------------------------------
alter table public.cargos
  drop constraint cargos_miembro_id_fkey,
  add constraint cargos_miembro_id_fkey
    foreign key (miembro_id) references public.miembros(id) on delete restrict;

-- ----------------------------------------------------------------------------
-- 2. registro_pagos.miembro_id -> miembros.id: CASCADE -> RESTRICT
-- ----------------------------------------------------------------------------
alter table public.registro_pagos
  drop constraint registro_pagos_miembro_id_fkey,
  add constraint registro_pagos_miembro_id_fkey
    foreign key (miembro_id) references public.miembros(id) on delete restrict;

-- ----------------------------------------------------------------------------
-- 3. Verify: information_schema.referential_constraints shows delete_rule =
-- 'RESTRICT' for both cargos_miembro_id_fkey and registro_pagos_miembro_id_fkey;
-- deleting a miembros row with any cargos or registro_pagos row referencing
-- it now raises 23503 instead of cascading.
-- ----------------------------------------------------------------------------
