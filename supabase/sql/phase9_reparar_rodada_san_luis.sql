-- ============================================================================
-- Phase 9 — Repair four non-cash rows recorded as `registro_pagos`
-- control-admon-poncitlan, change `reparacion-rodada-san-luis`
--
-- INTENDED RUNNER: an operator, in the Supabase SQL editor or through the
-- Management API. The Supabase project "arca" is SHARED, so this script is
-- strictly scoped to this app's own public.registro_pagos, public.cargos,
-- public.registro_apoyos and public.miembros. It touches nothing else: no
-- arca_*, n8n_chat_histories, telegram_whitelist, auth.users, or any other
-- table, policy or function.
--
-- WHY: four rows were inserted into `registro_pagos` to express a legitimate
-- debt reduction that moved NO money (a cession of a trip's support share
-- between members). `registro_pagos` is the arca's CASH-IN term, so those rows
-- did two things at once: they overstated the arca by their total, and — because
-- `aplicarPago` reduces `cargos` FIFO oldest-first and the parent
-- `registro_apoyos` row was created AFTER them — they cancelled unrelated older
-- debt instead of the intended obligation. The club's receivable was therefore
-- understated by the same total, spread over rows that had nothing to do with
-- the trip.
--
-- WHAT THIS DOES: deletes those four rows and restores exactly the cargos they
-- altered, then moves one cargo that was charged to the wrong member. The
-- parent apoyo and its total are NOT changed: the amount recorded is correct
-- (the pot is divided in equal parts among the attendees, so collected and
-- disbursed are the same figure).
--
-- DERIVED, NOT TYPED: the pre-incident value of each altered cargo exists
-- nowhere in the database, because `aplicarPago` never persists its FIFO
-- allocation. It is RECONSTRUCTED here by reversing the same algorithm from the
-- newest allocated cargo backwards, and the result is asserted. No monetary
-- value is hard-coded in this file; the amounts are read from the rows being
-- deleted. Nothing is sent to /tmp, to a scratch file, or to any external
-- context.
--
-- NO FIGURES BEYOND THIS LINE, deliberately: this repository is public. See
-- openspec/changes/reparacion-rodada-san-luis/design.md D7.
--
-- RE-ENTRANCY: every assertion is written so that a SECOND run fails loudly
-- (the four rows are gone) instead of double-applying.
-- ============================================================================

-- 0. PRE-FLIGHT GUARD — read-only, runs BEFORE any transaction is opened, so a
-- drifted database aborts with nothing changed and no open transaction.
do $$
declare
  filas_borrar        int;
  suma_borrar         numeric;
  apoyos_encontrados  int;
  apoyo_total         numeric;
  apoyo_division      text;
  cargos_del_apoyo    int;
  cargo_ok            boolean;
  ya_movido           int;
  pagos_posteriores   int;
begin
  -- (a) the four rows exist, and their total is positive.
  select count(*), coalesce(sum(monto_pagado), 0)
    into filas_borrar, suma_borrar
  from public.registro_pagos
  where id in (
    'a8e379c3-2d16-4a55-8c5b-e5118279f341',
    'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
    '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
    'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
  );

  if filas_borrar <> 4 then
    raise exception 'Phase 9 abortada: se esperaban 4 filas de registro_pagos, se encontraron %. Si ya se aplicó esta migración, no la vuelvas a correr.', filas_borrar;
  end if;

  if suma_borrar <= 0 then
    raise exception 'Phase 9 abortada: la suma de las filas a borrar no es positiva (%). Revisa los datos antes de aplicar.', suma_borrar;
  end if;

  -- (b) no other payment was recorded AFTER them for the affected members: if
  -- one was, its FIFO allocation also consumed part of an older cargo and the
  -- reversal below would be wrong.
  select count(*)
    into pagos_posteriores
  from public.registro_pagos p
  where p.miembro_id in (
      select miembro_id from public.registro_pagos
       where id in (
         'a8e379c3-2d16-4a55-8c5b-e5118279f341',
         'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
         '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
         'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
       )
    )
    and p.created_at > (
      select min(created_at) from public.registro_pagos
       where id in (
         'a8e379c3-2d16-4a55-8c5b-e5118279f341',
         'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
         '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
         'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
       )
    )
    and p.id not in (
      'a8e379c3-2d16-4a55-8c5b-e5118279f341',
      'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
      '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
      'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
    );

  if pagos_posteriores <> 0 then
    raise exception 'Phase 9 abortada: hay % pagos registrados DESPUÉS de las cuatro filas en los mismos miembros. La reversa por FIFO dejaría de ser exacta; revisa la deriva antes de aplicar.', pagos_posteriores;
  end if;

  -- (c) the parent apoyo and its three cargos are intact.
  select count(*) into apoyos_encontrados
  from public.registro_apoyos
  where id = 'aa451705-807a-4aeb-bb93-32d4ce057557';

  if apoyos_encontrados <> 1 then
    raise exception 'Phase 9 abortada: el apoyo padre no existe. Revisa la deriva antes de aplicar.';
  end if;

  select monto_total, tipo_division into apoyo_total, apoyo_division
  from public.registro_apoyos
  where id = 'aa451705-807a-4aeb-bb93-32d4ce057557';

  select count(*) into cargos_del_apoyo
  from public.cargos
  where apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557';

  if cargos_del_apoyo <> 3 then
    raise exception 'Phase 9 abortada: el apoyo tiene % cargos, se esperaban 3. Revisa la deriva antes de aplicar.', cargos_del_apoyo;
  end if;

  -- (d) the cargo that must be reassigned still sits on the wrong member and is
  -- still whole.
  select exists (
    select 1
    from public.cargos c
    where c.id = 'aeebd486-8712-43bb-86b3-89b82d0a0cc9'
      and c.apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557'
      and c.miembro_id = 'e7e4963a-cde3-47c3-ac11-d301f345be91'
      and c.estado = 'pendiente'
      and c.monto_pendiente = c.monto_original
  ) into cargo_ok;

  if not cargo_ok then
    raise exception 'Phase 9 abortada: el cargo a reasignar no está en el estado esperado (pendiente, saldo completo, en el miembro equivocado). Revisa la deriva antes de aplicar.';
  end if;

  -- (e) re-entrancy: the target member must not already carry a cargo of this
  -- apoyo.
  select count(*) into ya_movido
  from public.cargos
  where apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557'
    and miembro_id = '4eb7a307-f06d-4347-b60e-6d7b2e0be9c4';

  if ya_movido <> 0 then
    raise exception 'Phase 9 abortada: el cargo de este apoyo ya está en el miembro destino. Esta migración ya se aplicó.';
  end if;
end $$;

-- 1. THE CORRECTION, atomic. Order matters: the reversal must run against the
-- cargo set as it is NOW (before the reassignment), which is why the move comes
-- last.
begin;

do $$
declare
  objetivo            record;
  cargo               record;
  pendiente_antes     numeric;
  pendiente_despues   numeric;
  restaurado_total    numeric := 0;
  restaurado_filas    int := 0;
  por_restaurar       numeric;
  asignado             numeric;
  filas_miembro        int;
begin
  select coalesce(sum(monto_pendiente), 0) into pendiente_antes from public.cargos;

  -- Capture the per-member amount to reverse BEFORE deleting the rows.
  create temp table _phase9_objetivos (
    miembro_id uuid primary key,
    total      numeric not null
  ) on commit drop;

  insert into _phase9_objetivos (miembro_id, total)
  select p.miembro_id, sum(p.monto_pagado)
  from public.registro_pagos p
  where p.id in (
    'a8e379c3-2d16-4a55-8c5b-e5118279f341',
    'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
    '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
    'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
  )
  group by p.miembro_id;

  if (select count(*) from _phase9_objetivos) <> 2 then
    raise exception 'Phase 9 abortada: se esperaban 2 miembros afectados, hay %.', (select count(*) from _phase9_objetivos);
  end if;

  delete from public.registro_pagos
  where id in (
    'a8e379c3-2d16-4a55-8c5b-e5118279f341',
    'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
    '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
    'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
  );

  -- Reverse each member's allocation: walk the cargos from the NEWEST allocated
  -- one backwards — the exact inverse of `aplicarPago`'s oldest-first pass — and
  -- restore up to the amount each of them had absorbed.
  for objetivo in select * from _phase9_objetivos loop
    por_restaurar := objetivo.total;
    filas_miembro := 0;

    for cargo in
      select c.id, c.monto_original, c.monto_pendiente
      from public.cargos c
      where c.miembro_id = objetivo.miembro_id
      order by c.created_at desc, c.id desc
    loop
      exit when por_restaurar <= 0;

      asignado := cargo.monto_original - cargo.monto_pendiente;

      if asignado <= 0 then
        continue;  -- this cargo never received part of a payment
      end if;

      if asignado > por_restaurar then
        asignado := por_restaurar;  -- partial restore: stop inside this cargo
      end if;

      update public.cargos
         set monto_pendiente = cargo.monto_pendiente + asignado,
             estado = 'pendiente'
       where id = cargo.id;

      por_restaurar := por_restaurar - asignado;
      filas_miembro := filas_miembro + 1;
    end loop;

    if por_restaurar <> 0 then
      raise exception 'Phase 9 abortada: no se pudo restaurar el total del miembro % (sobran %). Revisa la deriva.', objetivo.miembro_id, por_restaurar;
    end if;

    if filas_miembro <> 6 then
      raise exception 'Phase 9 abortada: se esperaban 6 cargos restaurados para el miembro %, se restauraron %. Revisa la deriva.', objetivo.miembro_id, filas_miembro;
    end if;

    restaurado_total := restaurado_total + objetivo.total;
    restaurado_filas := restaurado_filas + filas_miembro;
  end loop;

  -- Reassign the cargo to the member who actually contributes.
  update public.cargos
     set miembro_id = '4eb7a307-f06d-4347-b60e-6d7b2e0be9c4'
   where id = 'aeebd486-8712-43bb-86b3-89b82d0a0cc9';

  -- Record the agreed distribution rule in the record itself, so the row
  -- explains why the pot is what it is. Amounts are deliberately not repeated
  -- here (public repository).
  update public.registro_apoyos
     set motivo = 'Apoyo rodada San Luis - cooperación de quienes no asistieron, dividida en partes iguales entre los 4 asistentes; Jonathan e Iván cedieron su parte a Zuomi y Warrior.'
   where id = 'aa451705-807a-4aeb-bb93-32d4ce057557';

  -- POST-ASSERTIONS.
  select coalesce(sum(monto_pendiente), 0) into pendiente_despues from public.cargos;

  if pendiente_despues - pendiente_antes <> restaurado_total then
    raise exception 'Phase 9 abortada: el pendiente total cambió % y se esperaba %.', pendiente_despues - pendiente_antes, restaurado_total;
  end if;

  if restaurado_filas <> 12 then
    raise exception 'Phase 9 abortada: se esperaban 12 cargos restaurados, se restauraron %.', restaurado_filas;
  end if;

  if exists (
    select 1 from public.cargos
     where apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557'
       and miembro_id = 'e7e4963a-cde3-47c3-ac11-d301f345be91'
  ) then
    raise exception 'Phase 9 abortada: el miembro equivocado sigue cargando un cargo de este apoyo.';
  end if;

  if (select count(*) from public.cargos
       where apoyo_id = 'aa451705-807a-4aeb-bb93-32d4ce057557'
         and miembro_id = '4eb7a307-f06d-4347-b60e-6d7b2e0be9c4'
         and monto_pendiente = monto_original
         and estado = 'pendiente') <> 1 then
    raise exception 'Phase 9 abortada: el cargo reasignado no quedó íntegro en el miembro destino.';
  end if;

  if (select count(*) from public.registro_pagos
       where id in (
         'a8e379c3-2d16-4a55-8c5b-e5118279f341',
         'e1b92b19-9a9d-4284-899f-f6443dc3e9c9',
         '8612a5ee-3ccb-46de-86bd-8d0db8cdb3fb',
         'a8c8aa23-46df-485d-8af2-1ff5672f0d8c'
       )) <> 0 then
    raise exception 'Phase 9 abortada: las filas a borrar siguen presentes.';
  end if;
end $$;

commit;

-- 2. READ-BACK the operator should see after applying:
--   select m.nickname, sum(c.monto_pendiente) filter (where c.estado = 'pendiente') as pendiente
--     from public.miembros m left join public.cargos c on c.miembro_id = m.id
--    group by m.nickname order by pendiente desc nulls last;
--   select round((select monto_apertura from public.configuracion_caja where id = 1)
--              + (select coalesce(sum(monto_pagado),0) from public.registro_pagos)
--              - (select coalesce(sum(monto_total),0) from public.registro_apoyos)
--              - (select coalesce(sum(monto),0) from public.registro_egresos), 2) as arca;
