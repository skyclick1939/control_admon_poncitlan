-- ============================================================================
-- Phase 2 — Roles: app_admins table + is_admin()/is_superadmin() helpers
-- evolucion-plataforma-arca, tasks.md task 2.1
--
-- STATUS: APPLIED live 2026-09-13 against the shared Supabase project, with
-- explicit project-owner sign-off (same precedent as Phase 0 — see the
-- "Sign-off record" note at the top of tasks.md's Phase 0 section). Verified
-- read-back: app_admins exists, both functions exist with search_path=''.
--
-- Source: design.md "Database Design > New tables" and "> Role helpers".
-- Transcribed verbatim; no SQL improvised beyond what design.md specifies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. app_admins — one role per user (user_id is the PK, not a surrogate id).
-- ----------------------------------------------------------------------------
create table public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  rol        text not null check (rol in ('superadmin','admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- 2. Role-check helpers.
--
-- SECURITY DEFINER + set search_path = '' (D3): a policy on app_admins that
-- queries app_admins directly recurses infinitely. SECURITY DEFINER bypasses
-- RLS inside the function body and breaks the cycle. The empty search_path
-- is mandatory to prevent search-path hijacking of a definer function.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins
                 where user_id = (select auth.uid()) and rol = 'superadmin');
$$;

revoke execute on function public.is_admin(), public.is_superadmin() from public, anon;
grant  execute on function public.is_admin(), public.is_superadmin() to authenticated;
