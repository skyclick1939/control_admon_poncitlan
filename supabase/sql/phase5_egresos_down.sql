-- ============================================================================
-- Phase 5 DOWN — caja ledger rollback. Drops ONLY the two new tables; touches
-- no existing table, policy, or function. Neither table has a FK to the
-- other, so order is non-binding; registro_egresos is dropped first for
-- readability.
-- ============================================================================
drop table if exists public.registro_egresos;
drop table if exists public.configuracion_caja;
