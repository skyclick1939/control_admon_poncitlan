-- ============================================================================
-- Phase 10 BACKFILL PROPOSALS — a READ-ONLY review list. NO DML.
-- ajustes-y-clasificacion change, tasks.md task 1.6 (design.md D4)
--
-- THIS FILE CONTAINS NO INSERT, UPDATE, DELETE OR DDL. It is a single SELECT
-- meant to be run by the operator and READ. Applying a classification is a
-- SEPARATE, operator-approved step: the operator reviews this list, corrects
-- any proposal that is wrong, and only then writes the `concepto_id` UPDATEs.
-- Classifying one of the club's movements by machine without that review would
-- repeat the class of error this project exists to close (design.md D4).
--
-- WHAT IT LISTS: every public.registro_apoyos and public.registro_egresos row
-- whose `concepto_id` is still null, with its `motivo`, ONE proposed catalog
-- slug derived from keywords in that prose, a `confianza` marker, and the row
-- id. Nothing here modifies data, and re-running it changes nothing.
--
-- HOW TO READ `confianza`:
--   'alta' — exactly ONE keyword rule matched the `motivo`. A single, specific
--            signal.
--   'baja' — no rule matched (slug_propuesto is null: the operator must choose
--            the concept), or more than one rule matched and the winner is the
--            first by priority. Ambiguity is reported, never hidden.
--
-- WHY THE ACCENTED PATTERNS: `unaccent()` is not guaranteed to be installed in
-- the shared "arca" project and this file must not install or require an
-- extension, so rules carry both the plain and the accented spelling of a
-- keyword instead.
-- ============================================================================

with reglas (prioridad, slug, patron) as (
  values
    -- Recoverable: the disbursement creates a debt that returns.
    (1, 'apoyo-accidentados', 'accident'),
    (1, 'apoyo-accidentados', 'lesion'),
    (1, 'apoyo-accidentados', 'lesión'),
    (1, 'apoyo-accidentados', 'lesionad'),
    (1, 'apoyo-accidentados', 'choque'),
    (1, 'apoyo-accidentados', 'volcadura'),
    (1, 'apoyo-accidentados', 'rodada'),
    (1, 'apoyo-accidentados', 'fractura'),
    (1, 'apoyo-accidentados', 'hospital'),
    (1, 'apoyo-accidentados', 'herido'),
    (2, 'apoyo-hermano-caido', 'caido'),
    (2, 'apoyo-hermano-caido', 'caído'),
    (2, 'apoyo-hermano-caido', 'fallec'),
    (2, 'apoyo-hermano-caido', 'defunc'),
    (2, 'apoyo-hermano-caido', 'deceso'),
    (2, 'apoyo-hermano-caido', 'luto'),
    (3, 'apoyo-legal', 'legal'),
    (3, 'apoyo-legal', 'abogado'),
    (3, 'apoyo-legal', 'licenciado'),
    (3, 'apoyo-legal', 'juridic'),
    (3, 'apoyo-legal', 'jurídic'),
    (3, 'apoyo-legal', 'demanda'),
    (3, 'apoyo-legal', 'denuncia'),
    (3, 'apoyo-legal', 'detencion'),
    (3, 'apoyo-legal', 'detención'),
    (3, 'apoyo-legal', 'multa'),
    (4, 'apoyo-aniversario', 'aniversario'),
    (4, 'apoyo-aniversario', 'anivers'),
    -- Non-recoverable: expenses the arca absorbs (design.md D11).
    (5, 'adquisiciones-capitulo', 'adquisic'),
    (5, 'adquisiciones-capitulo', 'compra'),
    (5, 'adquisiciones-capitulo', 'insumo'),
    (5, 'adquisiciones-capitulo', 'material'),
    (5, 'adquisiciones-capitulo', 'utensilio'),
    (5, 'adquisiciones-capitulo', 'herramienta'),
    (5, 'adquisiciones-capitulo', 'equipo'),
    (5, 'adquisiciones-capitulo', 'capitulo'),
    (5, 'adquisiciones-capitulo', 'capítulo'),
    (6, 'donaciones', 'donac'),
    (6, 'donaciones', 'donacion'),
    (6, 'donaciones', 'donación'),
    (6, 'donaciones', 'donativo')
),
movimientos as (
  select
    'registro_apoyos'::text as origen,
    a.id                    as fila_id,
    a.fecha                 as fecha,
    a.motivo                as motivo
  from public.registro_apoyos a
  where a.concepto_id is null

  union all

  select
    'registro_egresos'::text,
    e.id,
    e.fecha,
    e.motivo
  from public.registro_egresos e
  where e.concepto_id is null
)
select
  m.origen                      as origen,
  m.fila_id                     as fila_id,
  m.fecha                       as fecha,
  m.motivo                      as motivo,
  coincidencia.slug             as slug_propuesto,
  case
    when coincidencia.coincidencias = 1 then 'alta'
    else 'baja'
  end                           as confianza
from movimientos m
left join lateral (
  -- ONE proposal per row: the highest-priority matching rule. The window count
  -- runs before LIMIT, so `coincidencias` reports how many rules matched in
  -- total and the confidence marker stays honest about ambiguity.
  select primera.slug, primera.coincidencias
  from (
    select
      r.slug,
      count(*) over () as coincidencias
    from reglas r
    where lower(m.motivo) like '%' || r.patron || '%'
    order by r.prioridad
    limit 1
  ) primera
) coincidencia on true
order by
  coincidencia.slug nulls last,
  m.origen,
  m.fecha,
  m.fila_id;
