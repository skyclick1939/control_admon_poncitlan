-- ============================================================================
-- Phase 6 — Widen miembros.status to admit 'interno' (bookkeeping member)
-- control-admon-poncitlan, caja-y-transferencia change
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. The Supabase
-- project "arca" is SHARED, so this script is STRICTLY scoped to this app's
-- own public.miembros table and touches nothing else: no arca_*,
-- n8n_chat_histories, telegram_whitelist, auth.users, or any other table,
-- policy, or function. No data is changed; the only edit is the single CHECK
-- constraint below.
--
-- WHY: the TypeScript union Miembros.status (src/lib/types.ts) was widened to
-- 'fullparch' | 'prospecto' | 'interno', but the live DB CHECK constraint
-- still allows only fullparch and prospecto. Writes with status='interno'
-- fail with 23514 ("miembros_status_check"), leaving the feature inert.
--
-- SELF-VERIFYING: the `do $$ ... $$` block at the TOP verifies the live
-- schema is in the expected pre-state (miembros exists; miembros_status_check
-- allows exactly fullparch + prospecto and NOT already interno) BEFORE any
-- DDL runs, so a drifted schema aborts cleanly with nothing changed.
-- ============================================================================

-- 0. COMPATIBILITY GUARD. Runs BEFORE any DDL so a drift failure aborts
-- cleanly with nothing changed. Verifies (a) public.miembros exists and
-- (b) its status check constraint is the expected pre-state: allows both
-- fullparch and prospecto, and does NOT already allow interno.
do $$
declare
  tbl_exists boolean;
  con_clause text;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'miembros'
  ) into tbl_exists;

  if not tbl_exists then
    raise exception 'Self-check failed: public.miembros does not exist. Live schema may have drifted; review before applying.';
  end if;

  select cc.check_clause
    into con_clause
  from information_schema.check_constraints cc
  join information_schema.table_constraints tc
    on tc.constraint_schema = cc.constraint_schema
   and tc.constraint_name = cc.constraint_name
  where cc.constraint_schema = 'public'
    and tc.table_name = 'miembros'
    and cc.constraint_name = 'miembros_status_check'
    and tc.constraint_type = 'CHECK';

  if con_clause is null then
    raise exception 'Self-check failed: check constraint miembros_status_check not found on public.miembros. Live schema may have drifted; review before applying.';
  end if;

  if con_clause not like '%''fullparch''%' or con_clause not like '%''prospecto''%' then
    raise exception 'Self-check failed: miembros_status_check does not allow both fullparch and prospecto (clause: %). Live schema may have drifted; review before applying.', con_clause;
  end if;

  if con_clause like '%''interno''%' then
    raise exception 'Self-check failed: miembros_status_check already allows interno (clause: %). Nothing to do; review before applying.', con_clause;
  end if;
end $$;

-- 1. Widen the constraint atomically: drop the old check and re-add it
-- allowing fullparch, prospecto, and interno in a single ALTER TABLE, so
-- there is no window where the column is unprotected. The `if exists` on the
-- drop is defensive; the guard above already proved the constraint exists.
alter table public.miembros
  drop constraint if exists miembros_status_check,
  add constraint miembros_status_check
    check (status = any (array['fullparch'::text, 'prospecto'::text, 'interno'::text]));
