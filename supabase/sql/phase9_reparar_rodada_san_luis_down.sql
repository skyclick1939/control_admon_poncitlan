-- ============================================================================
-- Phase 9 — DOWN. Reverses `phase9_reparar_rodada_san_luis.sql`
-- control-admon-poncitlan, change `reparacion-rodada-san-luis`
--
-- STATUS: NOT applied. Proven to restore the pre-repair state exactly by a
-- round-trip run inside `begin; … rollback;` against production on 2026-10-04
-- (cargo values, states, the four rows, the reassigned cargo and the motive all
-- returned identical).
--
-- INTENDED RUNNER: an operator. Strictly scoped to this app's own
-- public.registro_pagos, public.cargos and public.registro_apoyos. Touches
-- nothing else in the shared "arca" project.
--
-- WHAT IT RESTORES: the exact state produced before the repair —
--   (a) the four `registro_pagos` rows, with their original ids, amounts,
--       dates, observations, author and creation timestamps;
--   (b) each affected member's cargos, by REPLAYING that member's payments
--       oldest-first and writing back the resulting pending amounts and states,
--       in whole cents, exactly mirroring `aplicarPago`'s `toCents` /
--       `toPesos` / `allocateFifo` behaviour;
--   (c) the cargo that the repair reassigned, back on its original member;
--   (d) the apoyo's original free-text motive.
--
-- WHY A REPLAY: the pre-repair pending amounts were produced by a FIFO pass the
-- application never persists. Replaying reproduces them deterministically
-- instead of trusting a typed list. The replay asserts that the cents it applied
-- equal the cents paid — if they do not, the state was not reproducible and the
-- script aborts rather than writing a wrong number.
--
-- REDACTION NOTE: this file DOES contain the four historical amounts, because a
-- reversible migration cannot re-insert a row without its value. No balance, no
-- per-member total, and no derived arca figure appears anywhere in this
-- repository. See design.md D7.
-- ============================================================================

-- 0. PRE-FLIGHT GUARD — read-only, before any transaction is opened.
do $$
declare
  filas_repuestas  int;
  cargos_del_apoyo int;
  destino_ok       boolean;
  motivo_actual    text;
begin
  -- (a) the four rows must be ABSENT: this script only reverses an applied repair.
  select count(*) into filas_repuestas
  from public.registro_pagos
  where id in (
    'a8e379c3-2d16-4a55-8c5b-e5118279f341',
    'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
    '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
    'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
  );

  if filas_repuestas <> 0 then
    raise exception 'Phase 9 DOWN abortado: las cuatro filas ya existen (% encontradas). Este script solo revierte una reparación aplicada.', filas_repuestas;
  end if;

  -- (b) the reassigned cargo must be on the destination member, whole.
  select exists (
    select 1 from public.cargos c
     where c.id = 'aeebd486-8712-43bb-86b3-89b82d0a0cc9'
       and c.apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557'
       and c.miembro_id = '4eb7a307-f06d-4347-b60e-6d7b2e0be9c4'
       and c.estado = 'pendiente'
       and c.monto_pendiente = c.monto_original
  ) into destino_ok;

  if not destino_ok then
    raise exception 'Phase 9 DOWN abortado: el cargo reasignado no está en el miembro destino. Revisa la deriva antes de aplicar.';
  end if;

  select count(*) into cargos_del_apoyo
  from public.cargos where apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557';

  if cargos_del_apoyo <> 3 then
    raise exception 'Phase 9 DOWN abortado: el apoyo tiene % cargos, se esperaban 3.', cargos_del_apoyo;
  end if;

  -- (c) the original member must not carry a cargo of this apoyo while the
  -- repair is applied.
  if exists (
    select 1 from public.cargos
     where apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557'
       and miembro_id = 'e7e4963a-cde3-47c3-ac11-d301f345be91'
  ) then
    raise exception 'Phase 9 DOWN abortado: el miembro original ya carga un cargo de este apoyo; la reparación no está aplicada.';
  end if;

  select motivo into motivo_actual
  from public.registro_apoyos where id = 'aa451705-807a-4aeb-bb93-32d4ce057557';

  if motivo_actual is null then
    raise exception 'Phase 9 DOWN abortado: el apoyo no existe.';
  end if;
end $$;

begin;

do $$
declare
  v_miembro        uuid;
  pago             record;
  cargo            record;
  restante         bigint;
  pendiente_actual bigint;
  a_pagar          bigint;
  nuevo            bigint;
  aplicado         bigint;
  pendiente_antes  numeric;
  pendiente_despues numeric;
  esperado_total   bigint := 0;
begin
  select coalesce(sum(monto_pendiente), 0) into pendiente_antes from public.cargos;

  -- (1) the cargo returns to its original member.
  update public.cargos
     set miembro_id = 'e7e4963a-cde3-47c3-ac11-d301f345be91'
   where id = 'aeebd486-8712-43bb-86b3-89b82d0a0cc9';

  -- (2) the original motive is restored.
  update public.registro_apoyos
     set motivo = 'Apoyo rodada San Luis'
   where id = 'aa451705-807a-4aeb-bb93-32d4ce057557';

  -- (3) the four rows are re-inserted with their original identity.
  insert into public.registro_pagos
    (id, miembro_id, monto_pagado, fecha_pago, observaciones, registrado_por, created_at)
  values
    ('a8e379c3-2d16-4a55-8c5b-e5118279f341', 'f99bbe74-16a4-4f52-8390-21ac6e033cd5', 500, '2026-10-04',
     'Saldo de apoyo por rodada San Luis', 'ceeca833-4597-4668-a31f-2acdb2413323', '2026-10-04 19:11:56.782835+00'),
    ('e1b92b19-9a9d-4284-899f-f6443dc3e9c9', 'f99bbe74-16a4-4f52-8390-21ac6e033cd5', 500, '2026-10-04',
     'Monto de apoyo San Luis de Iván transferidos a warrior', 'ceeca833-4597-4668-a31f-2acdb2413323', '2026-10-04 19:13:23.715206+00'),
    ('8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb', 'e7e4963a-cde3-47c3-ac11-d301f345be91', 500, '2026-10-04',
     'Apoyo por rodada San Luis', 'ceeca833-4597-4668-a31f-2acdb2413323', '2026-10-04 19:14:41.064425+00'),
    ('a8c8aa23-46df-485d-8af2-1ff5672f0d8c', 'e7e4963a-cde3-47c3-ac11-d301f345be91', 500, '2026-10-04',
     'Apoyo San Luis de Jonathan sedido por Jonathan', 'ceeca833-4597-4668-a31f-2acdb2413323', '2026-10-04 19:15:18.152303+00');

  -- (4) each affected member's cargos are rebuilt by replaying the member's own
  -- payments, oldest-first, over cargos that existed at that moment, in whole
  -- cents — the exact inverse of what the repair undid.
  for v_miembro in
    select distinct miembro_id from public.registro_pagos
     where id in (
       'a8e379c3-2d16-4a55-8c5b-e5118279f341',
       'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
       '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
       'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
     )
  loop
    -- pristine state: every cargo starts whole, as `saveApoyo` created it.
    update public.cargos
       set monto_pendiente = monto_original,
           estado = 'pendiente'
     where miembro_id = v_miembro;

    aplicado := 0;

    for pago in
      select p.id, p.monto_pagado, p.created_at
      from public.registro_pagos p
      where p.miembro_id = v_miembro
      order by p.created_at, p.id
    loop
      restante := round(pago.monto_pagado * 100)::bigint;

      for cargo in
        select c.id
        from public.cargos c
        where c.miembro_id = v_miembro
          and c.created_at <= pago.created_at
        order by c.created_at, c.id
      loop
        exit when restante <= 0;

        select round(monto_pendiente * 100)::bigint into pendiente_actual
        from public.cargos where id = cargo.id;

        if pendiente_actual <= 0 then
          continue;
        end if;

        a_pagar := least(restante, pendiente_actual);
        nuevo := pendiente_actual - a_pagar;

        update public.cargos
           set monto_pendiente = nuevo::numeric / 100,
               estado = case when nuevo = 0 then 'pagado' else 'pendiente' end
         where id = cargo.id;

        restante := restante - a_pagar;
        aplicado := aplicado + a_pagar;
      end loop;
    end loop;

    -- The replay MUST have consumed exactly the member's payments. If not, the
    -- historical state is not reproducible by this algorithm and the whole
    -- migration aborts.
    select coalesce(sum(round(monto_pagado * 100)::bigint), 0) into esperado_total
    from public.registro_pagos where miembro_id = v_miembro;

    if aplicado <> esperado_total then
      raise exception 'Phase 9 DOWN abortado: para el miembro % se aplicaron % centavos y sus pagos suman %. El estado histórico no es reproducible; no se escribió nada.', v_miembro, aplicado, esperado_total;
    end if;
  end loop;

  -- (5) POST-ASSERTIONS.
  select coalesce(sum(monto_pendiente), 0) into pendiente_despues from public.cargos;

  if pendiente_antes - pendiente_despues <> (
    select sum(monto_pagado) from public.registro_pagos
     where id in (
       'a8e379c3-2d16-4a55-8c5b-e5118279f341',
       'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
       '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
       'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
     )
  ) then
    raise exception 'Phase 9 DOWN abortado: el pendiente total no bajó exactamente lo que suman las cuatro filas repuestas.';
  end if;

  if (select count(*) from public.registro_pagos
       where id in (
         'a8e379c3-2d16-4a55-8c5b-e5118279f341',
         'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
         '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
         'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
       )) <> 4 then
    raise exception 'Phase 9 DOWN abortado: no quedaron las cuatro filas repuestas.';
  end if;

  if exists (
    select 1 from public.cargos
     where apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557'
       and miembro_id = '4eb7a307-f06d-4347-b60e-6d7b2e0be9c4'
  ) then
    raise exception 'Phase 9 DOWN abortado: el cargo no volvió a su miembro original.';
  end if;
end $$;

commit;

-- READ-BACK after the down: the two members' pending totals and the derived arca
-- must match their pre-repair values exactly.
