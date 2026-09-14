-- ============================================================================
-- Phase 2 — AAL2 restrictive policies on app_admins writes
-- evolucion-plataforma-arca, tasks.md task 2.4
--
-- STATUS: APPLIED live 2026-09-13, with explicit project-owner sign-off
-- (same precedent as Phase 0). Verified read-back: all 3 policies are
-- RESTRICTIVE, scoped to insert/update/delete only.
--
-- Source: design.md "The AAL2 boundary (research C1)". Transcribed verbatim.
--
-- Scoped to WRITES ONLY (insert/update/delete) — a blanket `as restrictive`
-- policy with no `for` clause defaults to `FOR ALL` and would block the aal1
-- SELECT the app needs to discover its own role, locking every session out
-- of its own UI. Three separate policies, never one bare FOR-less restrictive
-- policy.
--
-- Must be applied AFTER phase2_rls.sql's permissive app_admins policies
-- exist: a restrictive policy narrows what the permissive policies already
-- allow, so both layers are required together.
-- ============================================================================
create policy "app_admins_insert_aal2" on public.app_admins
  as restrictive for insert to authenticated
  with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "app_admins_update_aal2" on public.app_admins
  as restrictive for update to authenticated
  using      ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');

create policy "app_admins_delete_aal2" on public.app_admins
  as restrictive for delete to authenticated
  using      ((select auth.jwt()->>'aal') = 'aal2');
