-- ============================================================================
-- Phase 6 DOWN — revert miembros.status to fullparch + prospecto only
-- control-admon-poncitlan, caja-y-transferencia change
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. STRICTLY scoped
-- to public.miembros' status check constraint; touches nothing else and
-- changes no data.
--
-- FAIL-SAFE: the `do $$ ... $$` block at the TOP asserts that NO row currently
-- uses status = 'interno' BEFORE any DDL runs. If any row does, it raises a
-- clear exception telling the operator to reassign those rows first. This
-- order matters: dropping the constraint first and THEN failing would leave
-- the table unprotected.
-- ============================================================================

-- 0. FAIL-SAFE GUARD. Runs BEFORE the drop so the table is never left
-- unprotected: verify no row uses status='interno' before narrowing.
do $$
declare
  interno_count bigint;
begin
  select count(*) into interno_count
  from public.miembros
  where status = 'interno';

  if interno_count > 0 then
    raise exception 'Rollback blocked: % public.miembros row(s) use status = ''interno''. Reassign those rows to ''fullparch'' or ''prospecto'' first, then re-run this script.', interno_count;
  end if;
end $$;

-- 1. Narrow the constraint atomically back to fullparch + prospecto. The
-- `if exists` on the drop makes a repeat run harmless (idempotent).
alter table public.miembros
  drop constraint if exists miembros_status_check,
  add constraint miembros_status_check
    check (status = any (array['fullparch'::text, 'prospecto'::text]));
