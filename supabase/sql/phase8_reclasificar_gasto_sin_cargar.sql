-- ============================================================================
-- Phase 8 — Reclassify one non-recoverable arca disbursement from apoyo to egreso
-- control-admon-poncitlan, caja-y-transferencia change
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. The Supabase
-- project "arca" is SHARED, so this script is STRICTLY scoped to this app's
-- own public.registro_apoyos, public.cargos and public.registro_egresos
-- tables and touches nothing else: no arca_*, n8n_chat_histories,
-- telegram_whitelist, auth.users, or any other table, policy, or function.
--
-- WHY: one $1,000 disbursement (a non-recoverable expense absorbed by the
-- arca) was recorded through the APOYOS (loan) flow against the internal
-- bookkeeping member Gastos_sin_cargar. A loan implies a receivable that
-- returns; this money does not. It must stop appearing in "Apoyos entregados
-- (recuperables)" and appear in "Egresos (no recuperables)" instead, and its
-- phantom pending cargo — which the 'interno' status hides from every debtor
-- surface — must disappear. Both registro_apoyos and registro_egresos
-- subtract from the arca, so the arca balance is unchanged: only the
-- classification moves.
--
-- SELF-VERIFYING: the `do $$ ... $$` block at the TOP asserts the exact
-- pre-state before any DML runs, so a drifted row or a re-run aborts cleanly
-- with nothing changed. The correction itself is wrapped in an explicit
-- begin; ... commit; so it is atomic.
-- ============================================================================

-- 0. COMPATIBILITY GUARD. Runs BEFORE any DML so a drift failure or re-run
-- aborts cleanly with nothing changed. Verifies:
--   (a) the apoyo exists with monto_total = 1000;
--   (b) its cargo exists, belongs to that apoyo, and is assigned to a member
--       whose status = 'interno';
--   (c) no matching egreso already exists (so a re-run aborts instead of
--       duplicating).
do $$
declare
  apoyo_monto numeric;
  cargo_ok boolean;
  egreso_dup boolean;
begin
  select a.monto_total
    into apoyo_monto
  from public.registro_apoyos a
  where a.id = '91d07a16-1f31-4a40-829d-58593212ea31';

  if apoyo_monto is null then
    raise exception 'Self-check failed: apoyo 91d07a16-1f31-4a40-829d-58593212ea31 not found. Live data may have drifted; review before applying.';
  end if;

  if apoyo_monto <> 1000 then
    raise exception 'Self-check failed: apoyo 91d07a16-1f31-4a40-829d-58593212ea31 has monto_total %, expected 1000. Live data may have drifted; review before applying.', apoyo_monto;
  end if;

  select exists (
    select 1
    from public.cargos c
    join public.miembros m on m.id = c.miembro_id
    where c.id = 'f9008f0a-fdf0-4f6a-ab43-a7887cd3d510'
      and c.apoyo_id = '91d07a16-1f31-4a40-829d-58593212ea31'
      and m.status = 'interno'
  ) into cargo_ok;

  if not cargo_ok then
    raise exception 'Self-check failed: cargo f9008f0a-fdf0-4f6a-ab43-a7887cd3d510 not found for apoyo 91d07a16-1f31-4a40-829d-58593212ea31, or its member is not status=''interno''. Live data may have drifted; review before applying.';
  end if;

  select exists (
    select 1
    from public.registro_egresos e
    join public.registro_apoyos a on a.id = '91d07a16-1f31-4a40-829d-58593212ea31'
    where e.monto = a.monto_total
      and e.motivo = a.motivo
  ) into egreso_dup;

  if egreso_dup then
    raise exception 'Self-check failed: a registro_egresos row already matches apoyo 91d07a16-1f31-4a40-829d-58593212ea31 (monto/motivo). Aborting to avoid duplication; review before applying.';
  end if;
end $$;

-- 1. THE CORRECTION, atomic. Inserts ONE egreso carrying the apoyo's amount,
-- date, motive and capturer, attributed to the internal member (beneficiary),
-- then deletes the phantom cargo and the apoyo. The egreso id is fixed so the
-- down script can target it exactly. Rows are targeted by their exact ids
-- from the guard above, never by a fuzzy predicate.
begin;

insert into public.registro_egresos
  (id, monto, fecha, motivo, capturado_por, nombre_capturador, beneficiario_id, nombre_beneficiario)
select
  '8a7c3e10-0000-4000-8000-000000000008',
  a.monto_total,
  a.fecha,
  a.motivo,
  a.capturado_por,
  a.nombre_capturador,
  m.id,
  m.nickname
from public.registro_apoyos a
join public.cargos c
  on c.apoyo_id = a.id
 and c.id = 'f9008f0a-fdf0-4f6a-ab43-a7887cd3d510'
join public.miembros m
  on m.id = c.miembro_id
 and m.status = 'interno'
where a.id = '91d07a16-1f31-4a40-829d-58593212ea31';

delete from public.cargos
where id = 'f9008f0a-fdf0-4f6a-ab43-a7887cd3d510';

delete from public.registro_apoyos
where id = '91d07a16-1f31-4a40-829d-58593212ea31';

commit;
