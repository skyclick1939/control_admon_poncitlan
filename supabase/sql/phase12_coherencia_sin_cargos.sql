-- ============================================================================
-- Phase 12 — One mechanism for an expense the arca absorbs
-- control-admon-poncitlan, coherence follow-up to caja-y-transferencia
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor (or the Management
-- API, as phase 9/10/11 were run). The Supabase project "arca" is SHARED, so
-- this script is STRICTLY scoped to this app's own public.catalogo_conceptos
-- and public.miembros rows and touches nothing else: no arca_*, n8n_*, auth.*,
-- policy, or function.
--
-- WHY: two paths recorded the same event — an expense the arca absorbs. The
-- designed one is `tipo_division = 'SIN_CARGOS'`, which writes a
-- public.registro_egresos row and creates no debt. The legacy one charged a
-- real public.cargos row to the bookkeeping pseudo-member `Gastos_sin_cargar`
-- (`status = 'interno'`), creating a receivable nobody will ever pay.
-- phase8_reclasificar_gasto_sin_cargar.sql had to repair exactly that by hand
-- once. This phase retires the legacy path and gives the absorbed path the
-- classifications it lacked.
--
-- ADDITIVE AND REVERSIBLE. Every statement is either an INSERT behind
-- `on conflict (slug) do nothing` or a single boolean flip; phase12_..._down.sql
-- restores the pre-state.
--
-- SELF-VERIFYING: the `do $$ ... $$` block at the TOP asserts the exact
-- pre-state before any DML runs, so a drifted database or a re-run aborts
-- cleanly with nothing changed.
-- ============================================================================

-- 0. COMPATIBILITY GUARD. Runs BEFORE any DML. Verifies:
--   (a) exactly one internal member exists, and it is the bookkeeping
--       pseudo-member — a second one would mean this script's target is
--       ambiguous, which must abort rather than guess;
--   (b) it is still active (otherwise the retirement already ran);
--   (c) it carries no cargos and no payments: a live receivable or a payment
--       would mean the retirement is no longer a bookkeeping cleanup, and that
--       decision belongs to a person, not to this script;
--   (d) none of the four concepts to be created already exists under another
--       nature, which would make the insert a silent no-op.
do $$
declare
  internos      int;
  interno_id    uuid;
  interno_act   boolean;
  interno_nick  text;
  cargos_n      int;
  pagos_n       int;
  choque_n      int;
begin
  select count(*) into internos from public.miembros where status = 'interno';
  if internos <> 1 then
    raise exception 'phase12: expected exactly 1 internal member, found %', internos;
  end if;

  select id, activo, nickname into interno_id, interno_act, interno_nick
  from public.miembros where status = 'interno';

  if interno_nick <> 'Gastos_sin_cargar' then
    raise exception 'phase12: the internal member is %, not the bookkeeping pseudo-member', interno_nick;
  end if;

  if interno_act is not true then
    raise exception 'phase12: % is already retired; nothing to do', interno_nick;
  end if;

  select count(*) into cargos_n from public.cargos where miembro_id = interno_id;
  select count(*) into pagos_n  from public.registro_pagos where miembro_id = interno_id;
  if cargos_n <> 0 or pagos_n <> 0 then
    raise exception 'phase12: % still carries % cargos and % payments; aborting for a human decision',
      interno_nick, cargos_n, pagos_n;
  end if;

  select count(*) into choque_n
  from public.catalogo_conceptos
  where slug in (
    'apoyo-aniversario-absorbido',
    'apoyo-a-accidentados-absorbido',
    'apoyo-hermano-caido-absorbido',
    'apoyo-legal-absorbido'
  );
  if choque_n <> 0 then
    raise exception 'phase12: % of the four concepts already exist; aborting to avoid a silent no-op', choque_n;
  end if;

  raise notice 'phase12 guard OK: retiring % and creating 4 non-recoverable support concepts', interno_nick;
end $$;

-- 1. The four support purposes, in their absorbed (non-recoverable) nature.
-- The catalog's recoverable set uses these same purposes; keeping both natures
-- for every purpose is what stops the operator from ever again facing a capture
-- with no honest concept to pick. `created_by` stays null: this is a migration,
-- not a person's capture.
insert into public.catalogo_conceptos (slug, nombre, naturaleza) values
  ('apoyo-aniversario-absorbido',      'Apoyo aniversario (absorbido por el Arca)',      'no_recuperable'),
  ('apoyo-a-accidentados-absorbido',   'Apoyo a accidentados (absorbido por el Arca)',   'no_recuperable'),
  ('apoyo-hermano-caido-absorbido',    'Apoyo hermano caído (absorbido por el Arca)',    'no_recuperable'),
  ('apoyo-legal-absorbido',            'Apoyo legal (absorbido por el Arca)',            'no_recuperable')
on conflict (slug) do nothing;

-- 2. Retire the pseudo-member. Not a DELETE: public.registro_egresos.beneficiario_id
-- references it (three historical rows) and their display uses the denormalized
-- nombre_beneficiario snapshot, which survives this flip untouched.
update public.miembros
   set activo = false
 where status = 'interno'
   and nickname = 'Gastos_sin_cargar'
   and activo = true;

-- 3. READ-BACK. Fails loudly if the intended state did not land.
do $$
declare
  recuperables_n int;
  absorbidos_n   int;
  activo_ahora   boolean;
begin
  select count(*) into recuperables_n
    from public.catalogo_conceptos where naturaleza = 'recuperable' and activo;
  select count(*) into absorbidos_n
    from public.catalogo_conceptos where naturaleza = 'no_recuperable' and activo;
  select activo into activo_ahora from public.miembros where nickname = 'Gastos_sin_cargar';

  if recuperables_n <> 4 then
    raise exception 'phase12 read-back: expected 4 active recoverable concepts, found %', recuperables_n;
  end if;
  if absorbidos_n <> 6 then
    raise exception 'phase12 read-back: expected 6 active non-recoverable concepts, found %', absorbidos_n;
  end if;
  if activo_ahora is not false then
    raise exception 'phase12 read-back: the pseudo-member is still active';
  end if;

  raise notice 'phase12 read-back OK: 4 recoverable + 6 non-recoverable concepts, pseudo-member retired';
end $$;
