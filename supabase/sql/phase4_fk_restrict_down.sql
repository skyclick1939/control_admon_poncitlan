-- ============================================================================
-- Phase 4 DOWN script — FK restrict
-- evolucion-plataforma-arca
--
-- Reverses phase4_fk_restrict.sql, recreating the exact original constraints
-- verbatim (same name, same columns, ON DELETE CASCADE -- confirmed live via
-- the read-only information_schema query documented in phase4_fk_restrict.sql,
-- not assumed).
--
-- STATUS: rollback for phase4_fk_restrict.sql, kept ready per the same
-- rollback-readiness practice Phase 0/2/3 used. Not run -- the RESTRICT
-- change has not been applied live yet.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. cargos.miembro_id -> miembros.id: RESTRICT -> CASCADE (original)
-- ----------------------------------------------------------------------------
alter table public.cargos
  drop constraint cargos_miembro_id_fkey,
  add constraint cargos_miembro_id_fkey
    foreign key (miembro_id) references public.miembros(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- 2. registro_pagos.miembro_id -> miembros.id: RESTRICT -> CASCADE (original)
-- ----------------------------------------------------------------------------
alter table public.registro_pagos
  drop constraint registro_pagos_miembro_id_fkey,
  add constraint registro_pagos_miembro_id_fkey
    foreign key (miembro_id) references public.miembros(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- Verify: information_schema.referential_constraints shows delete_rule =
-- 'CASCADE' for both constraints again, matching the pre-Phase-4 live state.
-- ----------------------------------------------------------------------------
