-- ============================================================================
-- Phase 10 DOWN — remove the concept catalog and its two columns
-- ajustes-y-clasificacion change, tasks.md task 1.1
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. Reverses ONLY what
-- phase10_catalogo_conceptos.sql added, in reverse order: the two
-- `concepto_id` columns and their indexes, then the catalog table itself.
-- Touches nothing else in the shared "arca" project.
--
-- WHAT IS LOST: any concept assigned to a movement. Both columns are nullable
-- and hold a classification, not an amount, so no balance, cargo or pago is
-- affected — but the classification is not recoverable from this file. Take a
-- copy of `select id, concepto_id from public.registro_apoyos` and the same
-- from public.registro_egresos first if the classifications matter.
--
-- No fail-safe assertion is needed: `if exists` on every statement makes a
-- re-run a no-op, and the drop order below (columns before the table) is what
-- keeps the FK from blocking it.
-- ============================================================================

-- 1. The indexes go first so the column drops below are cheap and explicit.
drop index if exists public.registro_apoyos_concepto_id_idx;
drop index if exists public.registro_egresos_concepto_id_idx;

-- 2. The classification columns. Dropping a column drops its FK constraint
-- with it; nothing else in either table depends on them.
alter table public.registro_apoyos
  drop column if exists concepto_id;

alter table public.registro_egresos
  drop column if exists concepto_id;

-- 3. The catalog, now that nothing references it.
drop table if exists public.catalogo_conceptos;
