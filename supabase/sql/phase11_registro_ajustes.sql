-- ============================================================================
-- Phase 11 — Adjustments ledger: public.registro_ajustes
-- ajustes-y-clasificacion change, tasks.md task 2.1
--
-- STATUS: APPLIED live 2026-10-06 with the operator's authorization, after
-- two zero-trace proofs against production: the forward run inside a
-- transaction, and a forward+down round-trip, both aborted with a deliberate
-- in-transaction exception and rolled back with an identical read-back.
-- Read-back after applying: the table with 14 columns, one `is_admin()`
-- policy (`admins_all_registro_ajustes`, ALL), zero anon grants, 6 indexes
-- (pkey + 4 lookup + the partial unique reversal guard), 4 CHECK constraints
-- and 5 foreign keys. The `tipo` CHECK was widened in the same session
-- (2026-10-06) to include `pago_tercero` while the table was still empty, and
-- production was re-read back to match this file.
--
-- `tipo` values:
--   condonacion  — the club forgives part of a member's debt (no cash moves).
--   cesion       — a member cedes an obligation to another member.
--   pago_tercero — a third party was paid directly for the member's benefit,
--                  so the debt shrinks without any cash reaching the arca.
--   reversa      — an audited correction of a prior group.
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor or through the
-- Management API. The Supabase project "arca" is SHARED, so this script is
-- STRICTLY scoped to this app's own public tables: it creates one new table,
-- public.registro_ajustes, and nothing else. It never touches arca_*,
-- n8n_chat_histories, telegram_whitelist, auth.users, or any other table,
-- policy or function. is_admin() already exists live (phase2_roles.sql).
--
-- WHY: the application has exactly one action that reduces a debt — a
-- `registro_pagos` row — and it is also the arca's cash-in term. Every debt
-- reduction that is NOT cash therefore has to lie about cash. This ledger is
-- the missing primitive: a debt can be forgiven or moved without pretending
-- it was cash (design.md D1, D5, D7).
--
-- ARCA-NEUTRAL BY CONSTRUCTION (design.md D1): the derived arca (computeCaja)
-- reads `registro_pagos`, `registro_apoyos` and `registro_egresos`, and is
-- DELIBERATELY not modified to read this table. A forgiveness moves no cash,
-- so adding it as an arca term would break the spec's "each row contributes
-- exactly once" invariant. The loss is made visible elsewhere (the "Ajustes
-- otorgados" figure and the "Posición neta" indicator), never in the balance.
--
-- SHAPE — ONE ROW PER AFFECTED CARGO (design.md D5): each row states a FACT
-- ABOUT ONE CARGO: `cargo_id` plus `monto`, the SIGNED change this row applied
-- to that cargo's `monto_pendiente`. A condonación is one row per cargo it
-- reduces. A cesión is TWO rows sharing a `grupo_id`: the ceding member's
-- cargo loses the amount (`monto` negative) and a NEW cargo is created for the
-- receiving member against the same `apoyo_id` (`monto` positive). The club's
-- total receivable and the arca are unchanged by a cesión by construction.
--
-- The rejected alternative — one row per action carrying member, counterpart
-- and a single amount — cannot answer "what exactly did this row change?", so
-- an exact reversal would have to RE-RUN the planner from the same inputs and
-- trust it to stay deterministic across later rule or schema changes. One
-- extra row per cession buys a reversal that is mechanical, auditable row by
-- row, and immune to the planner changing (D5).
--
-- REVERSAL, NOT DELETION (design.md D7): an adjustment is never deleted. A
-- mistake is corrected by `reversa` rows that reference the original GROUP via
-- `grupo_revertido`; the reversal DERIVES the restoration from the original
-- rows' own `monto` and `pendiente_resultante`, so it is exact without
-- re-running any planner. `pendiente_resultante` is the value the original row
-- left in `cargos.monto_pendiente`; the reversal MUST refuse when the cargo's
-- current value no longer equals it, because the counterfactual is meant to be
-- provable, not plausible (D7). A reversed cession additionally removes the
-- cargo the cession created (it exists only because of the cession): that is
-- why `cargo_id` is `on delete set null`, so the ledger row survives while its
-- pointer to a cargo that no longer exists becomes null.
--
-- SELF-VERIFYING: the `do $$ ... $$` block at the TOP verifies compatibility
-- with the live schema before any DDL runs, so a drifted schema or a re-run
-- aborts cleanly with nothing created.
-- ============================================================================

-- 0. COMPATIBILITY GUARD. Runs BEFORE any DDL. Asserts (a) every table this
-- ledger references already exists (its FKs are the reason), (b) the catalog
-- from phase10 is present, and (c) the ledger does not exist yet,
-- so a re-run or a half-applied migration aborts instead of failing mid-file.
do $$
declare
  faltantes text[];
begin
  select array_agg(t.nombre order by t.nombre)
    into faltantes
  from (values
    ('miembros'), ('cargos'), ('catalogo_conceptos')
  ) as t(nombre)
  where to_regclass('public.' || t.nombre) is null;

  if faltantes is not null then
    raise exception 'Self-check failed: faltan tablas requeridas en public: %. Live schema may have drifted; review before applying.', faltantes;
  end if;

  if to_regclass('public.registro_ajustes') is not null then
    raise exception 'Self-check failed: public.registro_ajustes already exists. Nothing to do; review before applying.';
  end if;
end $$;

-- 1. registro_ajustes — the ledger itself.
--
-- `tipo` is the operation: `condonacion` (the receivable shrinks),
-- `pago_tercero` (a third party was paid directly, so the receivable shrinks
-- with no cash in), `cesion` (the obligation moves between members), and
-- `reversa` (an audited correction of a prior group). `grupo_id` ties the rows
-- of ONE operator action; it is generated once per action by the single writer
-- (`src/features/ajustes/`).
--
-- `monto` is the SIGNED delta applied to `cargos.monto_pendiente`: negative
-- reduces the debt, positive increases it (only a cesión's receiving side does
-- that). It is never zero — a row exists because something moved.
--
-- `pendiente_resultante` is the cargo's `monto_pendiente` AFTER this row was
-- applied. It is what makes the reversal provable: the reversal refuses to run
-- unless the cargo still holds exactly this value.
--
-- `grupo_revertido` is set only on `reversa` rows and names the `grupo_id`
-- they correct. The shape CHECK keeps the two kinds of rows honest: a reversal
-- carries no post-state of its own (its detail lives in the original rows),
-- while a normal adjustment always records the value it left behind. `cargo_id`
-- is nullable even for a normal row: a reversal that removes the cargo a
-- cession created relies on `on delete set null`, so this ledger row survives
-- its cargo.
--
-- `registrado_por` mirrors the other app tables' author columns (nulls when
-- the admin's account is deleted); `nombre_registrador` is the non-null
-- snapshot that survives that deletion.
create table public.registro_ajustes (
  id                     uuid primary key default gen_random_uuid(),
  grupo_id               uuid not null,
  tipo                   text not null check (tipo in ('condonacion', 'cesion', 'pago_tercero', 'reversa')),
  miembro_id             uuid not null references public.miembros(id) on delete restrict,
  cargo_id               uuid references public.cargos(id) on delete set null,
  monto                  numeric not null check (monto <> 0),
  pendiente_resultante   numeric check (pendiente_resultante is null or pendiente_resultante >= 0),
  concepto_id            uuid references public.catalogo_conceptos(id),
  contraparte_miembro_id uuid references public.miembros(id) on delete restrict,
  observaciones          text,
  registrado_por         uuid references auth.users(id) on delete set null,
  nombre_registrador     text not null,
  grupo_revertido        uuid,
  created_at             timestamptz not null default now(),
  constraint registro_ajustes_reversa_shape check (
    case when tipo = 'reversa'
      then grupo_revertido is not null and pendiente_resultante is null
      else grupo_revertido is null and pendiente_resultante is not null
    end
  )
);

-- 2. RLS + the load-bearing anon REVOKE. The table is new, so there are no
-- pre-existing policies to drop. One permissive `for all` policy covers all
-- four operations, mirroring phase3_bank_config.sql, phase5_egresos.sql and
-- phase10_catalogo_conceptos.sql.
alter table public.registro_ajustes enable row level security;
revoke all on public.registro_ajustes from anon;

create policy "admins_all_registro_ajustes" on public.registro_ajustes
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3. Indexes. `grupo_id` groups a reversal's lookup, `miembro_id` feeds the
-- member's history, `created_at` orders the recents list, and the partial
-- unique index makes a SECOND reversal of the same group impossible at the
-- database, not merely in the writer's logic. `cargo_id` is indexed because it
-- is an FK and the reversal reads cargos through it.
create index registro_ajustes_grupo_id_idx on public.registro_ajustes (grupo_id);
create index registro_ajustes_miembro_id_idx on public.registro_ajustes (miembro_id);
create index registro_ajustes_created_at_idx on public.registro_ajustes (created_at desc);
create index registro_ajustes_cargo_id_idx on public.registro_ajustes (cargo_id);

create unique index registro_ajustes_reversa_unica_idx
  on public.registro_ajustes (grupo_revertido, miembro_id)
  where tipo = 'reversa';
