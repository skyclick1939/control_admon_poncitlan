-- ============================================================================
-- Phase 7 DOWN — drop the egresos beneficiary attribution columns
-- control-admon-poncitlan, caja-y-transferencia change
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. STRICTLY scoped
-- to public.registro_egresos' two new columns; touches nothing else and
-- changes no other data.
--
-- No fail-safe assertion is needed here: dropping a NULLABLE column loses
-- only the newly-added beneficiary attribution, not data integrity. The two
-- columns carry no constraint beyond beneficiario_id's FK (which is dropped
-- with the column), and no existing row was backfilled, so there is nothing
-- to preserve or reassign before the drop.
-- ============================================================================

alter table public.registro_egresos
  drop column if exists beneficiario_id;

alter table public.registro_egresos
  drop column if exists nombre_beneficiario;
