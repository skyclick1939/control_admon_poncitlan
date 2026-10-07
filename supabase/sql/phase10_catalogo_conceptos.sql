-- ============================================================================
-- Phase 10 — Concept catalog: public.catalogo_conceptos + concepto_id columns
-- ajustes-y-clasificacion change, tasks.md task 1.1
--
-- STATUS: APPLIED live 2026-10-04 with the operator's authorization, after two
-- zero-trace proofs against production: the forward run alone wrapped in a
-- transaction, and a forward+down round-trip, both rolled back with an
-- identical read-back. Verified afterwards: six seeded concepts with their
-- natures, both concepto_id columns, RLS enabled with one is_admin() policy,
-- zero anon grants, both indexes present. 63 registro_apoyos and 3
-- registro_egresos rows stay unclassified until the operator approves the
-- guided backfill (task 1.6).
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor. The Supabase
-- project "arca" is SHARED, so this script is STRICTLY scoped to this app's
-- own public tables: it creates public.catalogo_conceptos and adds one column
-- to public.registro_apoyos and public.registro_egresos. It never touches
-- arca_*, n8n_chat_histories, telegram_whitelist, auth.users, or any other
-- table, policy or function. is_admin() already exists live (phase2_roles.sql).
--
-- WHY: every movement was classified only by free prose in `motivo`, so
-- nothing could be found, filtered or totalled by purpose (design.md D2, D11).
-- The catalog names what a movement was for; `motivo` keeps the detail and is
-- never replaced (D10).
--
-- WHY BOTH LEDGERS: two of the operator's six concepts are expenses, not
-- debts. A catalog that classified only apoyos would leave the egresos
-- unclassifiable and would push the operator back toward recording an expense
-- as a debt — the exact mistake phase 8 migrated a row to undo (D11).
--
-- SELF-VERIFYING: the `do $$ ... $$` block at the TOP verifies compatibility
-- with the live schema before any DDL runs, so a drifted schema or a re-run
-- aborts cleanly with nothing created.
-- ============================================================================

-- 0. COMPATIBILITY GUARD. Runs BEFORE any DDL. Asserts (a) both ledgers this
-- migration classifies already exist, (b) the catalog table does not exist
-- yet, and (c) neither `concepto_id` column exists yet — so a re-run or a
-- half-applied migration aborts instead of failing mid-file.
do $$
declare
  apoyos_exists boolean;
  egresos_exists boolean;
  catalogo_exists boolean;
  apoyos_column_exists boolean;
  egresos_column_exists boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'registro_apoyos'
  ) into apoyos_exists;

  if not apoyos_exists then
    raise exception 'Self-check failed: public.registro_apoyos does not exist. Live schema may have drifted; review before applying.';
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'registro_egresos'
  ) into egresos_exists;

  if not egresos_exists then
    raise exception 'Self-check failed: public.registro_egresos does not exist. Live schema may have drifted; review before applying.';
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'catalogo_conceptos'
  ) into catalogo_exists;

  if catalogo_exists then
    raise exception 'Self-check failed: public.catalogo_conceptos already exists. Nothing to do; review before applying.';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registro_apoyos'
      and column_name = 'concepto_id'
  ) into apoyos_column_exists;

  if apoyos_column_exists then
    raise exception 'Self-check failed: public.registro_apoyos.concepto_id already exists. Nothing to do; review before applying.';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registro_egresos'
      and column_name = 'concepto_id'
  ) into egresos_column_exists;

  if egresos_column_exists then
    raise exception 'Self-check failed: public.registro_egresos.concepto_id already exists. Nothing to do; review before applying.';
  end if;
end $$;

-- 1. catalogo_conceptos — the catalog itself. `naturaleza` is the whole point
-- of the table (design.md D2): a disbursement that creates a debt is
-- `recuperable`, one that does not is `no_recuperable`, and the capture form
-- only ever offers the nature the chosen modality can honestly book. The
-- CHECK is the database-side half of that rule and is asserted in
-- src/lib/conceptos.test.ts against src/lib/conceptos.ts's union, so the two
-- encodings cannot drift.
--
-- `activo` is the retirement flag, never a delete (spec "Concepts Are
-- Deactivated, Never Deleted"): the concept_id FKs below are plain
-- `references` (ON DELETE NO ACTION), so Postgres refuses to delete a concept
-- that any movement still uses.
--
-- `created_by` mirrors the other app tables' author columns: it nulls when the
-- admin's account is deleted, which never removes the concept.
create table public.catalogo_conceptos (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  nombre     text not null,
  naturaleza text not null check (naturaleza in ('recuperable', 'no_recuperable')),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- 2. RLS + the load-bearing anon REVOKE. This table is new, so there are no
-- pre-existing policies to drop. One permissive `for all` policy covers all
-- four operations, mirroring phase3_bank_config.sql and phase5_egresos.sql.
alter table public.catalogo_conceptos enable row level security;
revoke all on public.catalogo_conceptos from anon;

create policy "admins_all_catalogo_conceptos" on public.catalogo_conceptos
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3. Seed the operator's six concepts with their nature (design.md D2/D3).
-- The catalog ships pre-seeded so the selector is never empty and never blocks
-- a capture. `on conflict (slug) do nothing` makes the whole file re-runnable
-- once the guard above is bypassed by a partial prior run. created_by stays
-- null: the seed is a migration, not a person's capture.
--
-- Order matters only for the review diff; the six are the operator's own list,
-- the first four recoverable (they create a debt that returns) and the last
-- two non-recoverable (expenses the arca absorbs).
insert into public.catalogo_conceptos (slug, nombre, naturaleza) values
  ('apoyo-accidentados', 'Apoyo a accidentados', 'recuperable'),
  ('apoyo-hermano-caido', 'Apoyo hermano caído', 'recuperable'),
  ('apoyo-legal', 'Apoyo legal', 'recuperable'),
  ('apoyo-aniversario', 'Apoyo aniversario', 'recuperable'),
  ('adquisiciones-capitulo', 'Adquisiciones del capítulo', 'no_recuperable'),
  ('donaciones', 'Donaciones', 'no_recuperable')
on conflict (slug) do nothing;

-- 4. registro_apoyos.concepto_id — NULLABLE on purpose (design.md D3). A row
-- recorded before the catalog existed keeps `null`, which means exactly that:
-- "recorded before the catalog existed". No classification is invented for it
-- (spec "Historical rows may have no concept"); the guided backfill proposes
-- one and the operator approves it before any UPDATE runs (D4). New captures
-- are required to carry a concept by the capture form and by the repository
-- input type, not by a NOT NULL here, which would be a lie about history.
alter table public.registro_apoyos
  add column concepto_id uuid references public.catalogo_conceptos(id);

-- 5. registro_egresos.concepto_id — same shape, same honesty. The non-
-- recoverable concepts live here (design.md D11).
alter table public.registro_egresos
  add column concepto_id uuid references public.catalogo_conceptos(id);

-- 6. Index both FK columns: the debt/movement surfaces filter and embed by
-- concept, and an unindexed FK is also the slower side of the delete check
-- that enforces "deactivated, never deleted".
create index registro_apoyos_concepto_id_idx on public.registro_apoyos (concepto_id);
create index registro_egresos_concepto_id_idx on public.registro_egresos (concepto_id);
