-- ============================================================================
-- Phase 2 — Seed the first superadmin row (bootstrap)
-- evolucion-plataforma-arca, tasks.md task 2.2
--
-- STATUS: drafted, NOT yet applied to the live database. Requires explicit
-- project-owner sign-off before execution (same precedent as Phase 0).
--
-- Companion to phase2_roles.sql — run AFTER that script creates app_admins.
--
-- design.md's bootstrap sequence note: "no superadmin can be created through
-- the UI when none exists. The project owner seeds the first row by SQL;
-- that superadmin logs in at aal1, is forced into enrollment before reaching
-- the admin UI, verifies, and only then can manage admins."
--
-- The project owner's account (per phase0-account-audit.md and HANDOFF.md)
-- is fors@gmail.com. Resolved by subquery, never a hardcoded UUID, so this
-- script is portable and never embeds a value fetched from the live DB.
-- created_by references the same row: this is the bootstrap superadmin, so
-- there is no other admin to attribute creation to.
-- ============================================================================
insert into public.app_admins (user_id, email, rol, created_by)
select id, email, 'superadmin', id
from auth.users
where email = 'fors@gmail.com'
on conflict (user_id) do nothing;

-- Verify exactly one row was affected before proceeding. If zero rows were
-- affected, the email did not match any auth.users row — stop and
-- investigate before continuing to phase2_rls.sql (a table with zero
-- superadmins plus the guard trigger from phase2_guard.sql would leave the
-- admin panel permanently unreachable through normal means).
