/**
 * The adjustments data layer for the `ajustes-y-clasificacion` change: the ONE
 * writer of `public.registro_ajustes` and its read surfaces.
 *
 * `supabase-js` has no multi-statement transaction, so this module does not
 * pretend to have one. Every multi-row write stays inside ONE
 * `.insert([...])` / `.upsert([...])` call — a single SQL statement IS atomic —
 * and the ledger is written BEFORE the cargos are mutated, so a partial failure
 * leaves a visible explanation instead of an invisible forgiveness.
 *
 * The allocation is not re-implemented here: `planAjuste`/`planReversa`
 * (src/lib/ajustes.ts) own it, and the PURE `construirFilasLibro` translates
 * their output into ledger rows, so the semantics are unit-tested without a
 * database and the async functions stay thin.
 */

import { planAjuste, planReversa } from '../../lib/ajustes';
import type { AjusteOriginalRow, AjustePlan, AjusteReporteRow, AjusteTipo } from '../../lib/ajustes';
import { toCents, toPesos } from '../../lib/money';
import type { Cents, Charge } from '../../lib/money';
import { dbClient } from '../../lib/supabase';
import type { RegistroAjuste } from '../../lib/types';

/** The ledger row as it is INSERTed (pesos, snake_case). */
export interface RegistroAjusteInsert {
  grupo_id: string;
  tipo: AjusteTipo;
  miembro_id: string;
  cargo_id: string | null;
  monto: number;
  pendiente_resultante: number | null;
  concepto_id: string | null;
  contraparte_miembro_id: string | null;
  observaciones: string;
  registrado_por: string | null;
  nombre_registrador: string;
  grupo_revertido: string | null;
}

export interface AjusteBaseInput {
  /** auth.users.id of the recording admin, or null when unavailable. */
  registradoPorId: string | null;
  /** Name snapshot that survives account deletion. */
  nombreRegistrador: string;
  /** catalogo_conceptos.id, or null. */
  conceptoId: string | null;
  observaciones: string;
}

export interface AjusteReduccionInput extends AjusteBaseInput {
  tipo: 'condonacion' | 'pago_tercero';
  miembroId: string;
  /** Positive MXN pesos. */
  montoPesos: number;
  /** cargos.id to target, or null for oldest-first (FIFO). */
  cargoObjetivoId: string | null;
}

export interface AjusteCesionInput extends AjusteBaseInput {
  tipo: 'cesion';
  cedenteId: string;
  receptorId: string;
  montoPesos: number;
  /** cargos.id to target, or null for the ceding member's oldest pending cargo. */
  cargoObjetivoId: string | null;
}

export type RegistrarAjusteInput = AjusteReduccionInput | AjusteCesionInput;

/**
 * PURE. Builds the ledger rows for one operator action, in insertion order.
 *
 * The rows state FACTS ABOUT ONE CARGO (design.md D5): `monto` is the signed
 * delta applied to that cargo's `monto_pendiente` and `pendiente_resultante` is
 * the value the row left behind — which is what later makes a reversal exactly
 * provable without re-planning anything.
 *
 * A cession is TWO rows sharing `grupo_id`, derived from the single planned row
 * AND the receiving cargo id the caller already generated: the receiving row
 * carries the POSITIVE mirror of the ceder's delta, because the new cargo is
 * born with exactly the ceded amount as its pending. Anything else is refused
 * rather than recorded: a row exists only because something moved, and a
 * cession moves ONE obligation to ONE receiver.
 */
export function construirFilasLibro(
  input: RegistrarAjusteInput,
  plan: AjustePlan,
  ctx: { grupoId: string; nuevoCargoId?: string | null },
): RegistroAjusteInsert[] {
  if (plan.rows.length === 0) {
    throw new Error('El ajuste no mueve ningún cargo: no hay nada que registrar.');
  }

  if (input.tipo === 'cesion') {
    if (plan.rows.length !== 1) {
      throw new Error('Una cesión mueve una sola obligación, pero el plan afecta más de un cargo.');
    }

    const row = plan.rows[0];
    const nuevoCargoId = ctx.nuevoCargoId;
    if (nuevoCargoId === undefined || nuevoCargoId === null) {
      throw new Error('Una cesión necesita el cargo del receptor y no se generó su identificador.');
    }

    // Rows are returned as one array so the writer inserts them in ONE statement.
    return [
      {
        grupo_id: ctx.grupoId,
        tipo: 'cesion',
        miembro_id: input.cedenteId,
        cargo_id: row.cargoId,
        monto: toPesos(row.deltaCents),
        pendiente_resultante: toPesos(row.newPendingCents),
        concepto_id: input.conceptoId,
        contraparte_miembro_id: input.receptorId,
        observaciones: input.observaciones,
        registrado_por: input.registradoPorId,
        nombre_registrador: input.nombreRegistrador,
        grupo_revertido: null,
      },
      {
        grupo_id: ctx.grupoId,
        tipo: 'cesion',
        miembro_id: input.receptorId,
        cargo_id: nuevoCargoId,
        monto: toPesos(-row.deltaCents),
        // The new cargo's whole pending is the ceded amount.
        pendiente_resultante: toPesos(-row.deltaCents),
        concepto_id: input.conceptoId,
        contraparte_miembro_id: input.cedenteId,
        observaciones: input.observaciones,
        registrado_por: input.registradoPorId,
        nombre_registrador: input.nombreRegistrador,
        grupo_revertido: null,
      },
    ];
  }

  return plan.rows.map((row) => ({
    grupo_id: ctx.grupoId,
    tipo: input.tipo,
    miembro_id: input.miembroId,
    cargo_id: row.cargoId,
    monto: toPesos(row.deltaCents),
    pendiente_resultante: toPesos(row.newPendingCents),
    concepto_id: input.conceptoId,
    contraparte_miembro_id: null,
    observaciones: input.observaciones,
    registrado_por: input.registradoPorId,
    nombre_registrador: input.nombreRegistrador,
    grupo_revertido: null,
  }));
}

/** The pending cargo as the writer reads it: what the plan needs plus what an upsert must preserve. */
interface CargoPendienteFila {
  id: string;
  apoyo_id: string | null;
  monto_original: number;
  monto_pendiente: number;
}

export interface AjusteRegistro {
  id: string;
  grupo_id: string;
  tipo: AjusteTipo;
  miembro_id: string;
  cargo_id: string | null;
  monto: number;
  pendiente_resultante: number | null;
  concepto_id: string | null;
  contraparte_miembro_id: string | null;
  observaciones: string | null;
  nombre_registrador: string;
  grupo_revertido: string | null;
  created_at: string;
  catalogo_conceptos: { nombre: string } | null;
  contraparte: { nickname: string } | null;
}

/**
 * The ledger with its two display embeds. `contraparte` must be disambiguated
 * by its FK NAME: `registro_ajustes` has two foreign keys into `miembros`
 * (`miembro_id` and `contraparte_miembro_id`), so the bare table name is
 * ambiguous for PostgREST.
 */
const AJUSTE_SELECT =
  '*, catalogo_conceptos(nombre), contraparte:miembros!registro_ajustes_contraparte_miembro_id_fkey(nickname)';

/** All adjustments for one member, newest first, with their concept and counterpart. */
export async function fetchAjustesMiembro(miembroId: string): Promise<AjusteRegistro[]> {
  const { data, error } = await dbClient
    .from('registro_ajustes')
    .select(AJUSTE_SELECT)
    .eq('miembro_id', miembroId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // The untyped client infers the plural table name as an array; at runtime a
  // to-one embed is an object or null (src/features/miembros/repo.ts precedent).
  return data as unknown as AjusteRegistro[];
}

/**
 * The most recent ledger rows, `reversa` rows included — the recents list is
 * also the reversal list, and a reversal that was hidden from it could not be
 * seen or undone.
 */
export async function fetchAjustesRecientes(limit = 50): Promise<AjusteRegistro[]> {
  const { data, error } = await dbClient
    .from('registro_ajustes')
    .select(AJUSTE_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as AjusteRegistro[];
}

/** Every ledger row mapped for the "Ajustes otorgados" figure (see src/lib/ajustes.ts). */
export async function fetchAjustesReporte(): Promise<AjusteReporteRow[]> {
  const { data, error } = await dbClient
    .from('registro_ajustes')
    .select('tipo, monto, catalogo_conceptos(nombre)');
  if (error) throw error;

  const filas = (data ?? []) as unknown as {
    tipo: AjusteTipo;
    monto: number;
    catalogo_conceptos: { nombre: string } | null;
  }[];

  return filas.map((fila) => ({
    tipo: fila.tipo,
    montoCents: toCents(fila.monto),
    conceptoNombre: fila.catalogo_conceptos?.nombre ?? null,
  }));
}

export interface RegistrarAjusteResult {
  grupoId: string;
  appliedCents: Cents;
  unappliedCents: Cents;
  /** cargos touched, plus (for a cession) the cargo created for the receiver. */
  cargoIds: string[];
}

/**
 * The single writer for `registro_ajustes`. It NEVER writes the payments
 * ledger: a forgiveness or a cession moves no cash, and faking a cash row is
 * exactly the anti-pattern this ledger exists to remove.
 *
 * Write order, and why: the receiver's cargo (cession only), then the ledger
 * rows in ONE statement, then the touched cargos in ONE statement. The ledger
 * goes first so a failure between the two leaves the intended change on record —
 * visible and correctable by `revertirAjuste` — rather than a silent mutation
 * nothing explains.
 */
export async function registrarAjuste(input: RegistrarAjusteInput): Promise<RegistrarAjusteResult> {
  const esCesion = input.tipo === 'cesion';
  // Ceding to oneself moves nothing and would make the reversal's per-member
  // net delta zero, which the `monto <> 0` CHECK rejects. Refuse before any read.
  if (input.tipo === 'cesion' && input.cedenteId === input.receptorId) {
    throw new Error('Una cesión necesita dos miembros distintos: no se puede ceder un adeudo al mismo miembro.');
  }
  const miembroOrigenId = input.tipo === 'cesion' ? input.cedenteId : input.miembroId;

  const { data, error } = await dbClient
    .from('cargos')
    .select('id, apoyo_id, monto_original, monto_pendiente')
    .eq('miembro_id', miembroOrigenId)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const cargos = (data ?? []) as CargoPendienteFila[];
  const cargoPorId = new Map(cargos.map((cargo) => [cargo.id, cargo]));

  const charges: Charge[] = cargos.map((cargo) => ({
    id: cargo.id,
    pendingCents: toCents(cargo.monto_pendiente),
  }));

  // A cession moves ONE obligation: with no explicit target it takes the ceding
  // member's oldest pending cargo, and `cargos` is already oldest-first.
  const targetCargoId = esCesion ? input.cargoObjetivoId ?? cargos[0]?.id ?? null : input.cargoObjetivoId;

  const plan = planAjuste(toCents(input.montoPesos), charges, targetCargoId);

  const grupoId = crypto.randomUUID();
  const nuevoCargoId = input.tipo === 'cesion' ? crypto.randomUUID() : null;

  // Throws before any write when nothing moves, so an empty adjustment cannot
  // leave a half-applied trace.
  const rows = construirFilasLibro(input, plan, { grupoId, nuevoCargoId });

  if (input.tipo === 'cesion') {
    // The receiving cargo is born against the SAME apoyo_id as the ceded one:
    // the club's total receivable is unchanged by construction (design.md D5).
    const cargoCedido = cargoPorId.get(plan.rows[0].cargoId);
    const { error: insertCargoError } = await dbClient.from('cargos').insert({
      id: nuevoCargoId,
      apoyo_id: cargoCedido?.apoyo_id ?? null,
      miembro_id: input.receptorId,
      monto_original: toPesos(plan.appliedCents),
      monto_pendiente: toPesos(plan.appliedCents),
      estado: 'pendiente',
    });
    if (insertCargoError) throw insertCargoError;
  }

  const { error: insertAjustesError } = await dbClient.from('registro_ajustes').insert(rows);
  if (insertAjustesError) throw insertAjustesError;

  const { error: upsertCargosError } = await dbClient.from('cargos').upsert(
    plan.rows.map((row) => {
      // Every planned row comes from the cargos read above, so the lookup is total.
      const cargo = cargoPorId.get(row.cargoId)!;
      return {
        id: row.cargoId,
        apoyo_id: cargo.apoyo_id,
        miembro_id: miembroOrigenId,
        monto_original: cargo.monto_original,
        monto_pendiente: toPesos(row.newPendingCents),
        estado: row.settled ? 'pagado' : 'pendiente',
      };
    }),
  );
  if (upsertCargosError) throw upsertCargosError;

  const cargoIds = plan.rows.map((row) => row.cargoId);
  if (nuevoCargoId !== null) cargoIds.push(nuevoCargoId);

  return { grupoId, appliedCents: plan.appliedCents, unappliedCents: plan.unappliedCents, cargoIds };
}

export interface RevertirAjusteInput {
  grupoId: string;
  registradoPorId: string | null;
  nombreRegistrador: string;
  observaciones: string;
}

/**
 * Reverses one adjustment GROUP (design.md D7): an adjustment is never deleted,
 * it is corrected by `reversa` rows that reference the group they undo. The
 * restoration is DERIVED from each original row's own `monto` and
 * `pendiente_resultante` via `planReversa`, never re-planned, so a later rule
 * change cannot silently move an old counterfactual.
 *
 * It REFUSES when any referenced cargo no longer holds the value the original
 * row left: the counterfactual is meant to be provable, not plausible. A cargo
 * the group CREATED (a cession's receiving side) is removed instead of
 * restored, because it exists only because of that cession.
 */
export async function revertirAjuste(
  input: RevertirAjusteInput,
): Promise<{ grupoReversaId: string; cargosRestaurados: number }> {
  const { data: grupoData, error: grupoError } = await dbClient
    .from('registro_ajustes')
    .select('*')
    .eq('grupo_id', input.grupoId);
  if (grupoError) throw grupoError;

  const grupo = (grupoData ?? []) as RegistroAjuste[];
  if (grupo.length === 0) {
    throw new Error('No existe el grupo de ajustes que se quiere revertir.');
  }
  if (grupo.some((row) => row.tipo === 'reversa')) {
    throw new Error('Este grupo ya es una reversa: no se puede revertir otra vez.');
  }

  const { data: reversaPrevia, error: reversaPreviaError } = await dbClient
    .from('registro_ajustes')
    .select('id')
    .eq('grupo_revertido', input.grupoId)
    .limit(1);
  if (reversaPreviaError) throw reversaPreviaError;
  if ((reversaPrevia ?? []).length > 0) {
    throw new Error('Este grupo ya fue revertido: no se puede revertir dos veces.');
  }

  const cargoIds = [...new Set(grupo.map((row) => row.cargo_id).filter((id): id is string => id !== null))];

  const actuales = new Map<string, Cents>();
  if (cargoIds.length > 0) {
    const { data: cargosData, error: cargosError } = await dbClient
      .from('cargos')
      .select('id, monto_pendiente')
      .in('id', cargoIds);
    if (cargosError) throw cargosError;
    for (const cargo of (cargosData ?? []) as { id: string; monto_pendiente: number }[]) {
      actuales.set(cargo.id, toCents(cargo.monto_pendiente));
    }
  }

  const miembroPorCargoId = new Map<string, string>();
  for (const row of grupo) {
    if (row.cargo_id !== null) miembroPorCargoId.set(row.cargo_id, row.miembro_id);
  }

  const originales: AjusteOriginalRow[] = grupo
    .filter((row) => row.cargo_id !== null && row.pendiente_resultante !== null)
    .map((row) => ({
      cargoId: row.cargo_id as string,
      deltaCents: toCents(row.monto),
      pendienteResultanteCents: toCents(row.pendiente_resultante as number),
    }));

  const plan = planReversa(originales, actuales);

  if (plan.some((row) => row.mismatched)) {
    throw new Error(
      'No se puede revertir: un cargo ya no coincide con el valor que registró el ajuste original.',
    );
  }

  const aEliminar = plan.filter((row) => row.removeCargo);
  const aRestaurar = plan.filter((row) => !row.removeCargo);

  // The `reversa` rows go FIRST, mirroring `registrarAjuste`: they are derived
  // entirely from the original group and do not depend on the cargo writes, so
  // a failure after them leaves the correction on record instead of a silent
  // mutation nothing explains. ONE row per member, and the partial unique index
  // (grupo_revertido, miembro_id) makes a second reversal impossible at the
  // database, not merely here. `monto` is the net delta the reversal applies,
  // the POSITIVE mirror of what the member's rows took away.
  const deltaPorMiembro = new Map<string, Cents>();
  for (const row of grupo) {
    deltaPorMiembro.set(row.miembro_id, (deltaPorMiembro.get(row.miembro_id) ?? 0) + toCents(row.monto));
  }

  const grupoReversaId = crypto.randomUUID();
  const reversaRows: RegistroAjusteInsert[] = [...deltaPorMiembro.entries()].map(([miembroId, deltaCents]) => ({
    grupo_id: grupoReversaId,
    tipo: 'reversa',
    miembro_id: miembroId,
    cargo_id: null,
    monto: toPesos(-deltaCents),
    pendiente_resultante: null,
    concepto_id: null,
    contraparte_miembro_id: null,
    observaciones: input.observaciones,
    registrado_por: input.registradoPorId,
    nombre_registrador: input.nombreRegistrador,
    grupo_revertido: input.grupoId,
  }));

  const { error: insertReversaError } = await dbClient.from('registro_ajustes').insert(reversaRows);
  if (insertReversaError) throw insertReversaError;

  for (const row of aEliminar) {
    const { error: deleteError } = await dbClient.from('cargos').delete().eq('id', row.cargoId);
    if (deleteError) throw deleteError;
  }

  if (aRestaurar.length > 0) {
    const { data: restaurarData, error: restaurarFetchError } = await dbClient
      .from('cargos')
      .select('id, apoyo_id, monto_original')
      .in('id', aRestaurar.map((row) => row.cargoId));
    if (restaurarFetchError) throw restaurarFetchError;

    const cargoPorId = new Map(
      (
        (restaurarData ?? []) as { id: string; apoyo_id: string | null; monto_original: number }[]
      ).map((cargo) => [cargo.id, cargo]),
    );

    // ONE statement: the restored cargos are all-or-nothing. `monto_original` is
    // untouched — only the pending the adjustment had reduced comes back.
    const { error: restaurarError } = await dbClient.from('cargos').upsert(
      aRestaurar.map((row) => {
        const cargo = cargoPorId.get(row.cargoId)!;
        return {
          id: row.cargoId,
          apoyo_id: cargo.apoyo_id,
          miembro_id: miembroPorCargoId.get(row.cargoId)!,
          monto_original: cargo.monto_original,
          monto_pendiente: toPesos(row.restoredPendingCents),
          // The restored pending is the value the cargo had BEFORE the original
          // row reduced it, and a cargo the planner touched was pending with a
          // positive amount: it comes back pending.
          estado: 'pendiente',
        };
      }),
    );
    if (restaurarError) throw restaurarError;
  }

  return { grupoReversaId, cargosRestaurados: aRestaurar.length };
}
