-- ============================================================================
-- Phase 8 DOWN — revert the egreso reclassification back to an apoyo + cargo
-- control-admon-poncitlan, caja-y-transferencia change
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. STRICTLY scoped
-- to this app's own public.registro_apoyos, public.cargos and
-- public.registro_egresos tables; touches nothing else and changes no other
-- data.
--
-- SELF-VERIFYING: the `do $$ ... $$` block at the TOP asserts the exact
-- pre-state (the egreso exists, the apoyo does NOT) before any DML runs, so a
-- re-run aborts cleanly instead of duplicating the apoyo/cargo. The reversal
-- is wrapped in an explicit begin; ... commit; so it is atomic.
-- ============================================================================

-- 0. FAIL-SAFE GUARD. Runs BEFORE any DML so a re-run aborts cleanly: verify
-- the egreso exists and the apoyo does NOT.
do $$
declare
  egreso_exists boolean;
  apoyo_exists boolean;
begin
  select exists (
    select 1 from public.registro_egresos e
    where e.id = '8a7c3e10-0000-4000-8000-000000000008'
  ) into egreso_exists;

  if not egreso_exists then
    raise exception 'Rollback blocked: egreso 8a7c3e10-0000-4000-8000-000000000008 not found. Nothing to revert; review before applying.';
  end if;

  select exists (
    select 1 from public.registro_apoyos a
    where a.id = '91d07a16-1f31-4a40-829d-58593212ea31'
  ) into apoyo_exists;

  if apoyo_exists then
    raise exception 'Rollback blocked: apoyo 91d07a16-1f31-4a40-829d-58593212ea31 already exists. Aborting to avoid duplication; review before applying.';
  end if;
end $$;

-- 1. THE REVERSAL, atomic. Re-creates the apoyo (original id, tipo_division
-- INDIVIDUAL, values copied from the egreso) and its single cargo (original
-- id, monto_original/monto_pendiente = egreso.monto, estado 'pendiente'),
-- then deletes the egreso. created_at is regenerated (now()) — the original
-- timestamps are not recoverable from the egreso and do not affect the
-- classification or the arca balance.
begin;

insert into public.registro_apoyos
  (id, capturado_por, nombre_capturador, fecha, motivo, monto_total, tipo_division)
select
  '91d07a16-1f31-4a40-829d-58593212ea31',
  e.capturado_por,
  e.nombre_capturador,
  e.fecha,
  e.motivo,
  e.monto,
  'INDIVIDUAL'
from public.registro_egresos e
where e.id = '8a7c3e10-0000-4000-8000-000000000008';

insert into public.cargos
  (id, apoyo_id, miembro_id, monto_original, monto_pendiente, estado)
select
  'f9008f0a-fdf0-4f6a-ab43-a7887cd3d510',
  '91d07a16-1f31-4a40-829d-58593212ea31',
  e.beneficiario_id,
  e.monto,
  e.monto,
  'pendiente'
from public.registro_egresos e
where e.id = '8a7c3e10-0000-4000-8000-000000000008';

delete from public.registro_egresos
where id = '8a7c3e10-0000-4000-8000-000000000008';

commit;
