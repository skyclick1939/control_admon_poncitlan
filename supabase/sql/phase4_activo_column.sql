-- ============================================================================
-- Phase 4 — Member lifecycle: activo column on miembros
-- evolucion-plataforma-arca, tasks.md task 4.1
--
-- STATUS: APPLIED live 2026-09-14, with explicit project-owner sign-off
-- (same gate as Phase 0, Phase 2, Phase 3 — see tasks.md's sign-off records).
-- Read-back verification: information_schema.columns confirms
-- activo boolean, is_nullable=NO, column_default=true; all 10 pre-existing
-- miembros rows backfilled to activo=true (count=10, filter(activo=true)=10).
--
-- Source: design.md "Member lifecycle DDL"; spec member-lifecycle
-- ("Retirement via activo Flag" requirement).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add activo, defaulting every existing row (and every future insert) to
-- true. `not null default true` backfills existing rows in the same
-- statement -- no separate UPDATE needed.
-- ----------------------------------------------------------------------------
alter table public.miembros add column activo boolean not null default true;

-- ----------------------------------------------------------------------------
-- 2. Verify: every existing miembros row has activo = true; a fresh insert
-- with no activo value also defaults to true.
-- ----------------------------------------------------------------------------
