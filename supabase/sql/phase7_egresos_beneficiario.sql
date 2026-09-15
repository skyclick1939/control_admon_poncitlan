-- ============================================================================
-- Phase 7 — Add beneficiary attribution to registro_egresos
-- control-admon-poncitlan, caja-y-transferencia change
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. The Supabase
-- project "arca" is SHARED, so this script is STRICTLY scoped to this app's
-- own public.registro_egresos table and touches nothing else: no arca_*,
-- n8n_chat_histories, telegram_whitelist, auth.users, or any other table,
-- policy, or function. No data is changed; no existing row is touched; the
-- only edit is the two additive columns below.
--
-- WHY: non-recoverable arca disbursements (grants/expenses that never come
-- back) must be traceable to whom or what they went to — typically the
-- internal bookkeeping member Gastos_sin_cargar. Today registro_egresos
-- records only who CAPTURED the row (capturado_por / nombre_capturador), not
-- who BENEFITED. beneficiario_id + nombre_beneficiario close that gap,
-- mirroring the existing capturado_por / nombre_capturador pair: the id
-- references public.miembros and nulls on member deletion, while the text
-- copy survives that deletion so attribution is not lost.
-- ============================================================================

-- 0. COMPATIBILITY GUARD. Runs BEFORE any DDL so a drift failure aborts
-- cleanly with nothing changed. Verifies (a) public.registro_egresos exists,
-- (b) the FK target public.miembros exists, and (c) neither new column
-- already exists — so a re-run or a drifted schema aborts instead of
-- half-applying.
do $$
declare
  egresos_exists boolean;
  miembros_exists boolean;
  beneficiario_id_exists boolean;
  nombre_beneficiario_exists boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'registro_egresos'
  ) into egresos_exists;

  if not egresos_exists then
    raise exception 'Self-check failed: public.registro_egresos does not exist. Live schema may have drifted; review before applying.';
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'miembros'
  ) into miembros_exists;

  if not miembros_exists then
    raise exception 'Self-check failed: public.miembros does not exist (FK target). Live schema may have drifted; review before applying.';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registro_egresos'
      and column_name = 'beneficiario_id'
  ) into beneficiario_id_exists;

  if beneficiario_id_exists then
    raise exception 'Self-check failed: public.registro_egresos.beneficiario_id already exists. Nothing to do; review before applying.';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registro_egresos'
      and column_name = 'nombre_beneficiario'
  ) into nombre_beneficiario_exists;

  if nombre_beneficiario_exists then
    raise exception 'Self-check failed: public.registro_egresos.nombre_beneficiario already exists. Nothing to do; review before applying.';
  end if;
end $$;

-- 1. beneficiario_id — who/what the disbursement went to, mirroring the
-- capturado_por pattern (nullable: many expenses have no specific
-- beneficiary). `on delete set null` keeps the ledger row when the member is
-- deleted; nombre_beneficiario below preserves the display name.
alter table public.registro_egresos
  add column if not exists beneficiario_id uuid
    references public.miembros(id) on delete set null;

-- 2. nombre_beneficiario — display name of the beneficiary, nullable and
-- holding the name so attribution survives deletion of the member row
-- (mirrors nombre_capturador).
alter table public.registro_egresos
  add column if not exists nombre_beneficiario text;
