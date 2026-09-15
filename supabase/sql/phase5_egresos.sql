-- ============================================================================
-- Phase 5 — Caja (cash-on-hand) ledger: registro_egresos + configuracion_caja
-- control-admon-poncitlan, caja-y-transferencia change, tasks.md task 3.2
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. The Supabase
-- project "arca" is SHARED, so this script is STRICTLY ADDITIVE: it creates
-- only the two app-owned tables below and never touches arca_*,
-- n8n_chat_histories, telegram_whitelist, auth.users, or any pre-existing
-- table/policy/function. is_admin() already exists live (phase2_roles.sql).
--
-- SELF-VERIFYING: the `do $$ ... $$` block at the TOP verifies compatibility
-- with the live schema before any DDL runs. Task 3.1 called for a live
-- read of information_schema.columns BEFORE authoring this DDL; that read
-- could not run in the apply environment (no DB credential / Supabase CLI
-- there). Its intent — registro_egresos.monto must be able to hold every
-- value the live registro_pagos.monto_pagado can — is satisfied by an
-- in-migration guard instead, which cannot go stale the way a one-off
-- pre-read can.
-- ============================================================================

-- 0. COMPATIBILITY GUARD (satisfies task 3.1's intent in-migration).
-- Checks that the sibling column public.registro_pagos.monto_pagado EXISTS
-- and has data_type 'numeric'. An unconstrained `numeric` (which
-- registro_egresos.monto uses) is a strict SUPERSET of any `numeric(p,s)`,
-- so it can represent every value the live column can; equality with the
-- live precision/scale is therefore (a) unachievable without the live read
-- task 3.1 could not perform, and (b) not required for correctness. Runs
-- BEFORE any DDL so a drift failure aborts cleanly with nothing created.
do $$
declare
  pagos_type text;
begin
  select data_type
    into pagos_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'registro_pagos'
    and column_name = 'monto_pagado';

  if pagos_type is null then
    raise exception 'Self-check failed: public.registro_pagos.monto_pagado not found. Live schema may have drifted; review before applying.';
  end if;

  if pagos_type <> 'numeric' then
    raise exception 'Self-check failed: public.registro_pagos.monto_pagado has data_type %, expected numeric. registro_egresos.monto is unconstrained numeric and may not represent all its values.', pagos_type;
  end if;
end $$;

-- 1. registro_egresos — disbursement ledger, mirroring registro_apoyos' column
-- style (design.md C2). `nombre_capturador` is non-null: it is the only
-- surviving attribution when capturado_por's account is deleted (FK set null).
create table public.registro_egresos (
  id uuid primary key default gen_random_uuid(),
  monto numeric not null,
  fecha date not null,
  motivo text not null,
  capturado_por uuid references auth.users(id) on delete set null,
  nombre_capturador text not null,
  created_at timestamptz not null default now()
);

-- 2. configuracion_caja — singleton (check (id = 1)) holding the stored
-- opening amount, mirroring configuracion_bancaria's singleton pattern.
create table public.configuracion_caja (
  id smallint primary key default 1 check (id = 1),
  monto_apertura numeric not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 3. RLS + load-bearing anon REVOKE. Both tables are new, so there are no
-- pre-existing policies to drop. One permissive `for all` policy per table
-- covers all four operations, mirroring phase3_bank_config.sql.
alter table public.registro_egresos enable row level security;
revoke all on public.registro_egresos from anon;

create policy "admins_all_registro_egresos" on public.registro_egresos
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.configuracion_caja enable row level security;
revoke all on public.configuracion_caja from anon;

create policy "admins_all_configuracion_caja" on public.configuracion_caja
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 4. Seed the singleton so the row exists before any admin writes the opening
-- amount (monto_apertura starts at 0 — a neutral opening).
insert into public.configuracion_caja (id, monto_apertura, updated_by)
values (1, 0, null) on conflict (id) do nothing;
