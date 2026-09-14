-- ============================================================================
-- Phase 2 — Last-superadmin protection guard
-- evolucion-plataforma-arca, tasks.md task 2.5
--
-- STATUS: APPLIED live 2026-09-13, with explicit project-owner sign-off
-- (same precedent as Phase 0). Verified read-back: trg_guard_ultimo_superadmin
-- exists on app_admins.
--
-- Source: design.md "Last-superadmin guard (D5)". Transcribed verbatim.
--
-- Statement-level (AFTER ... FOR EACH STATEMENT), not row-level and not an
-- RLS USING check (D5): a per-row USING check evaluates the OLD row
-- individually, so `update app_admins set rol='admin'` demoting two
-- superadmins in one statement would pass both row checks and leave zero.
-- The statement-level trigger sees the final post-statement state once.
-- ============================================================================
create or replace function public.guard_ultimo_superadmin() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.app_admins where rol = 'superadmin') = 0 then
    raise exception 'ultimo_superadmin_protegido' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create trigger trg_guard_ultimo_superadmin
  after update or delete on public.app_admins
  for each statement execute function public.guard_ultimo_superadmin();
