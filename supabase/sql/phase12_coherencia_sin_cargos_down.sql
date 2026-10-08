-- ============================================================================
-- Phase 12 DOWN — reverse phase12_coherencia_sin_cargos.sql
--
-- Restores the exact pre-state: the four absorbed-support concepts are removed
-- and the bookkeeping pseudo-member is active again.
--
-- SAFE BY CONSTRUCTION: the concept deletes only remove rows that NOTHING
-- references. `registro_apoyos.concepto_id` and `registro_egresos.concepto_id`
-- are plain `references` (ON DELETE NO ACTION), so Postgres would refuse a
-- delete anyway; the explicit NOT EXISTS makes the intent readable and keeps
-- the statement from failing halfway.
--
-- DOES NOT TOUCH any movement, any cargo, any payment, or the pseudo-member's
-- three historical `registro_egresos` beneficiary rows (their display uses the
-- denormalized `nombre_beneficiario` snapshot).
-- ============================================================================

-- 0. Guard: the reversal is only meaningful while the forward state is present.
do $$
declare
  absorbidos_n int;
  activo_ahora boolean;
begin
  select count(*) into absorbidos_n
    from public.catalogo_conceptos
   where naturaleza = 'no_recuperable' and activo
     and slug in (
       'apoyo-aniversario-absorbido',
       'apoyo-a-accidentados-absorbido',
       'apoyo-hermano-caido-absorbido',
       'apoyo-legal-absorbido'
     );

  select activo into activo_ahora from public.miembros where nickname = 'Gastos_sin_cargar';

  if absorbidos_n = 0 and activo_ahora is true then
    raise exception 'phase12 down: the forward state is not present; nothing to reverse';
  end if;

  if absorbidos_n <> 4 then
    raise notice 'phase12 down: % of the 4 concepts are present; reverting what exists', absorbidos_n;
  end if;
end $$;

-- 1. Remove the four concepts, but only the unreferenced ones.
delete from public.catalogo_conceptos c
 where c.slug in (
         'apoyo-aniversario-absorbido',
         'apoyo-a-accidentados-absorbido',
         'apoyo-hermano-caido-absorbido',
         'apoyo-legal-absorbido'
       )
   and not exists (select 1 from public.registro_apoyos  a where a.concepto_id = c.id)
   and not exists (select 1 from public.registro_egresos e where e.concepto_id = c.id);

-- 2. Reactivate the bookkeeping pseudo-member.
update public.miembros
   set activo = true
 where status = 'interno'
   and nickname = 'Gastos_sin_cargar'
   and activo = false;

-- 3. READ-BACK.
do $$
declare
  restantes int;
  activo_ahora boolean;
begin
  select count(*) into restantes
    from public.catalogo_conceptos
   where slug in (
     'apoyo-aniversario-absorbido',
     'apoyo-a-accidentados-absorbido',
     'apoyo-hermano-caido-absorbido',
     'apoyo-legal-absorbido'
   );
  select activo into activo_ahora from public.miembros where nickname = 'Gastos_sin_cargar';

  if restantes <> 0 then
    raise exception 'phase12 down read-back: % concepts still present (referenced by a movement?)', restantes;
  end if;
  if activo_ahora is not true then
    raise exception 'phase12 down read-back: the pseudo-member was not reactivated';
  end if;

  raise notice 'phase12 down read-back OK: pre-state restored';
end $$;
