/**
 * Public debt breakdown: the member-level view of "what is owed", "what was
 * paid in cash" and "what was covered without cash". PURE, like
 * `debt-view.ts` and `money.ts`: no I/O, integer cents only, aggregation over
 * already-fetched rows. Money never travels as pesos past the boundary; every
 * input figure is converted with `toCents` before any arithmetic so a float
 * artefact cannot leak into a figure a human reads.
 */

import { toCents } from './money.js';
import type { Cents } from './money.js';

/** The member fields the breakdown needs; nothing else is read. */
export interface MiembroRef {
  readonly id: string;
  readonly nickname: string;
  readonly activo: boolean;
  readonly status: 'fullparch' | 'prospecto' | 'interno';
}

/** One cargo row as stored, before aggregation. */
export interface CargoDesgloseRow {
  readonly id: string;
  readonly miembro: MiembroRef | null;
  readonly monto_original: number;
  readonly monto_pendiente: number;
  readonly estado: 'pendiente' | 'pagado';
  readonly fecha: string;
  readonly etiqueta: string | null;
}

/** One payment row as stored, before aggregation. */
export interface PagoDesgloseRow {
  readonly miembro: MiembroRef | null;
  readonly monto_pagado: number;
  readonly fecha_pago: string;
}

/**
 * One ledger row from `registro_ajustes`. `monto` is a SIGNED delta: negative
 * reduces the debt, positive increases it (a cession's receiving side).
 */
export interface AjusteDesgloseRow {
  readonly miembro: MiembroRef | null;
  readonly cargo_id: string | null;
  readonly monto: number;
  readonly tipo: 'condonacion' | 'cesion' | 'pago_tercero' | 'reversa';
  readonly created_at: string;
}

/** One cargo of a member, in cents, with the label the caller resolved for it. */
export interface AdeudoDesglose {
  readonly id: string;
  readonly etiqueta: string;
  readonly fecha: string;
  readonly originalCents: Cents;
  readonly cubiertoCents: Cents;
  readonly pendienteCents: Cents;
  readonly estado: 'pendiente' | 'pagado';
}

/** One cash payment of a member, in cents. */
export interface AbonoDesglose {
  readonly fecha: string;
  readonly montoCents: Cents;
}

/**
 * One member's position. `abonadoCents` is cash received; `sinEfectivoCents` is
 * debt covered by adjustments; `aplicadoCents` is the part of the cash that
 * landed on covered debt; `noAplicadoCents` is cash that exceeded it (an
 * overpayment is reported, never hidden).
 */
export interface MiembroDesglose {
  readonly id: string;
  readonly nickname: string;
  readonly pendienteCents: Cents;
  readonly abonadoCents: Cents;
  readonly cubiertoCents: Cents;
  readonly sinEfectivoCents: Cents;
  readonly aplicadoCents: Cents;
  readonly noAplicadoCents: Cents;
  readonly adeudos: AdeudoDesglose[];
  readonly abonos: AbonoDesglose[];
}

export interface EtiquetaPendiente {
  readonly etiqueta: string;
  readonly pendienteCents: Cents;
}

export interface PublicBreakdown {
  readonly miembros: MiembroDesglose[];
  readonly porEtiqueta: EtiquetaPendiente[];
  readonly totalPendienteCents: Cents;
  readonly totalAbonadoCents: Cents;
}

/** Label for cargos whose apoyo carries no motive text. */
const SIN_ETIQUETA = 'Sin motivo';

/**
 * Eligibility mirrors `debt-view.ts`'s `aggregateDebtByMember`: a row with no
 * resolved member, a retired member (`activo=false`) or an internal member
 * (`status='interno'`) is not part of the public picture. Keeping the three
 * conditions in ONE predicate is what stops the breakdown from disagreeing
 * with the public debt view it sits next to.
 */
function esElegible(miembro: MiembroRef | null): miembro is MiembroRef {
  if (miembro === null) return false;
  if (miembro.activo === false) return false;
  if (miembro.status === 'interno') return false;
  return true;
}

/**
 * A cession CREATES the receiving cargo at `original = pending`, and the ledger
 * records a POSITIVE row for that creation (`ajustes/repo.ts`
 * `construirFilasLibro`). That row describes the birth of the debt, not money
 * or forgiveness applied to it: counting it as non-cash coverage would credit
 * the receiver with `cubierto` they never had.
 *
 * Its exact undoing must be excluded with it, and symmetrically: reversing a
 * cession deletes the receiving cargo and writes ONE member-level reversal row
 * whose `monto` is the NEGATIVE mirror of that creation (`revertirAjuste`,
 * `monto: toPesos(-deltaCents)`). A negative `reversa` row can only come from
 * that mirror — every other member's reversal is positive — so excluding one
 * without the other would leave phantom non-cash coverage on the receiver.
 * Every other row counts: `pago_tercero` (real coverage with someone else's
 * money), `condonacion`, and a positive `reversa` that undoes either of them.
 */
function describeCreacionDelCargo(ajuste: AjusteDesgloseRow): boolean {
  if (ajuste.tipo === 'cesion' && ajuste.monto > 0 && ajuste.cargo_id !== null) return true;
  return ajuste.tipo === 'reversa' && ajuste.monto < 0;
}

/** Plain code-unit compare, so ordering never depends on the runtime locale. */
function compararTexto(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

interface Acumulado {
  readonly miembro: MiembroRef;
  readonly adeudos: AdeudoDesglose[];
  readonly abonos: AbonoDesglose[];
  cubiertoCents: number;
  abonadoCents: number;
  /** Signed sum of the counted adjustment rows; `sinEfectivoCents` negates it. */
  ajusteCents: number;
}

/**
 * Builds the public breakdown from already-fetched cargos, payments and
 * adjustment rows. Members are grouped by `miembro.id` only — two members
 * sharing a nickname are two different people and must stay separate. Fully
 * paid cargos appear in `adeudos`: the history is the point, not just the
 * balance.
 */
export function buildPublicBreakdown(input: {
  readonly cargos: readonly CargoDesgloseRow[];
  readonly pagos: readonly PagoDesgloseRow[];
  readonly ajustes: readonly AjusteDesgloseRow[];
}): PublicBreakdown {
  const acumulados = new Map<string, Acumulado>();

  const acumuladoDe = (miembro: MiembroRef): Acumulado => {
    const existente = acumulados.get(miembro.id);
    if (existente) return existente;

    const nuevo: Acumulado = {
      miembro,
      adeudos: [],
      abonos: [],
      cubiertoCents: 0,
      abonadoCents: 0,
      ajusteCents: 0,
    };
    acumulados.set(miembro.id, nuevo);
    return nuevo;
  };

  for (const cargo of input.cargos) {
    if (!esElegible(cargo.miembro)) continue;

    const originalCents = toCents(cargo.monto_original);
    const pendienteCents = Math.max(0, toCents(cargo.monto_pendiente));
    const cubiertoCents = originalCents - pendienteCents;

    const acumulado = acumuladoDe(cargo.miembro);
    acumulado.cubiertoCents += cubiertoCents;
    acumulado.adeudos.push({
      id: cargo.id,
      etiqueta: cargo.etiqueta ?? SIN_ETIQUETA,
      fecha: cargo.fecha,
      originalCents,
      cubiertoCents,
      pendienteCents,
      estado: cargo.estado,
    });
  }

  for (const pago of input.pagos) {
    if (!esElegible(pago.miembro)) continue;

    const montoCents = toCents(pago.monto_pagado);
    const acumulado = acumuladoDe(pago.miembro);
    acumulado.abonadoCents += montoCents;
    acumulado.abonos.push({ fecha: pago.fecha_pago, montoCents });
  }

  for (const ajuste of input.ajustes) {
    if (!esElegible(ajuste.miembro)) continue;
    if (describeCreacionDelCargo(ajuste)) continue;

    // Reversal rows carry no `cargo_id` by schema: a reversal cancels a
    // member-level adjustment, so it is counted at member level too. Bounding
    // the breakdown to rows that still point at a cargo would let an undone
    // forgiveness keep reducing `sinEfectivoCents` forever.
    acumuladoDe(ajuste.miembro).ajusteCents += toCents(ajuste.monto);
  }

  const miembros: MiembroDesglose[] = [];
  const porEtiquetaAcumulado = new Map<string, Cents>();

  for (const acumulado of acumulados.values()) {
    if (acumulado.adeudos.length === 0 && acumulado.abonos.length === 0) continue;

    const pendienteCents = acumulado.adeudos.reduce((suma, adeudo) => suma + adeudo.pendienteCents, 0);
    const sinEfectivoCents = Math.max(0, -acumulado.ajusteCents);
    const aplicadoCents = Math.max(0, acumulado.cubiertoCents - sinEfectivoCents);
    const noAplicadoCents = acumulado.abonadoCents - aplicadoCents;

    const adeudos = [...acumulado.adeudos].sort((a, b) => {
      const porFecha = compararTexto(a.fecha, b.fecha);
      if (porFecha !== 0) return porFecha;
      const porEtiqueta = compararTexto(a.etiqueta, b.etiqueta);
      if (porEtiqueta !== 0) return porEtiqueta;
      return a.originalCents - b.originalCents;
    });

    const abonos = [...acumulado.abonos].sort((a, b) => {
      const porFecha = compararTexto(a.fecha, b.fecha);
      if (porFecha !== 0) return porFecha;
      return a.montoCents - b.montoCents;
    });

    for (const adeudo of adeudos) {
      if (adeudo.pendienteCents <= 0) continue;
      porEtiquetaAcumulado.set(
        adeudo.etiqueta,
        (porEtiquetaAcumulado.get(adeudo.etiqueta) ?? 0) + adeudo.pendienteCents,
      );
    }

    miembros.push({
      id: acumulado.miembro.id,
      nickname: acumulado.miembro.nickname,
      pendienteCents,
      abonadoCents: acumulado.abonadoCents,
      cubiertoCents: acumulado.cubiertoCents,
      sinEfectivoCents,
      aplicadoCents,
      noAplicadoCents,
      adeudos,
      abonos,
    });
  }

  miembros.sort((a, b) => {
    if (a.pendienteCents !== b.pendienteCents) return b.pendienteCents - a.pendienteCents;
    if (a.abonadoCents !== b.abonadoCents) return b.abonadoCents - a.abonadoCents;
    return compararTexto(a.nickname, b.nickname);
  });

  const porEtiqueta: EtiquetaPendiente[] = [...porEtiquetaAcumulado.entries()]
    .map(([etiqueta, pendienteCents]) => ({ etiqueta, pendienteCents }))
    .sort((a, b) => {
      if (a.pendienteCents !== b.pendienteCents) return b.pendienteCents - a.pendienteCents;
      return compararTexto(a.etiqueta, b.etiqueta);
    });

  const totalPendienteCents = miembros.reduce((suma, miembro) => suma + miembro.pendienteCents, 0);
  const totalAbonadoCents = miembros.reduce((suma, miembro) => suma + miembro.abonadoCents, 0);

  return { miembros, porEtiqueta, totalPendienteCents, totalAbonadoCents };
}
