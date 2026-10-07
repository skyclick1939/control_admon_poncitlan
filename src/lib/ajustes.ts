/**
 * Pure adjustment planning and reporting for the `ajustes-y-clasificacion`
 * change (design.md D5/D6/D7). No DOM and no Supabase: this module decides
 * what each `registro_ajustes` row must say and what the "Ajustes otorgados"
 * and "Posición neta" figures are, so the writer and the UI have nothing left
 * to guess. Every function is PURE — no I/O, integer cents only.
 */

import { allocateFifo } from './money';
import type { Cents, Charge } from './money';

/**
 * The four operations the Postgres CHECK on `public.registro_ajustes.tipo`
 * allows. The union is derived from this list and `ajustes.test.ts` asserts
 * the list against the migration file, so the two encodings cannot drift.
 */
export const AJUSTE_TIPOS = ['condonacion', 'cesion', 'pago_tercero', 'reversa'] as const;

export type AjusteTipo = (typeof AJUSTE_TIPOS)[number];

export function isAjusteTipo(value: unknown): value is AjusteTipo {
  return typeof value === 'string' && (AJUSTE_TIPOS as readonly string[]).includes(value);
}

/** One cargo changed by a planned reduction. `deltaCents` is SIGNED (negative reduces the debt). */
export interface AjustePlanRow {
  readonly cargoId: string;
  readonly deltaCents: number;
  readonly newPendingCents: Cents;
  readonly settled: boolean;
}

export interface AjustePlan {
  readonly rows: AjustePlanRow[];
  /** Positive magnitude actually applied. */
  readonly appliedCents: Cents;
  /** requested minus applied; never negative when the request is non-negative. */
  readonly unappliedCents: Cents;
}

/**
 * Plans a debt reduction. With no target, it is FIFO over `cargos` (which the
 * caller supplies oldest-first), mirroring `allocateFifo`. With a target, only
 * that cargo is considered. Never allocates beyond a cargo's pendingCents and
 * never produces a negative new pending. `deltaCents = -appliedCents`.
 *
 * A non-positive request plans nothing and reports the whole request as
 * unapplied, which keeps the "requested minus applied" identity true even for
 * a negative input (the only case where `unappliedCents` is negative).
 * Cargos with a non-positive pending contribute no row: a row exists because
 * something moved.
 */
export function planAjuste(
  amountCents: Cents,
  cargos: readonly Charge[],
  targetCargoId?: string | null,
): AjustePlan {
  if (amountCents <= 0) {
    return { rows: [], appliedCents: 0, unappliedCents: amountCents };
  }

  const targeted = targetCargoId !== undefined && targetCargoId !== null;
  // ONE allocation authority for the whole app: a payment and an adjustment
  // both reduce cargos through `allocateFifo`, so a forgiven cent behaves like a
  // paid cent by construction rather than by a second implementation that could
  // drift. Non-positive pendings are dropped first because a row exists only
  // because something moved, and that also keeps `allocateFifo` from emitting a
  // zero-applied row.
  const elegibles = cargos.filter(
    (cargo) => cargo.pendingCents > 0 && (!targeted || cargo.id === targetCargoId),
  );

  const { allocations, unappliedCents } = allocateFifo(amountCents, elegibles);

  const rows: AjustePlanRow[] = allocations.map((allocation) => ({
    cargoId: allocation.chargeId,
    deltaCents: -allocation.appliedCents,
    newPendingCents: allocation.remainingCents,
    settled: allocation.settled,
  }));

  return { rows, appliedCents: amountCents - unappliedCents, unappliedCents };
}

/** One row of the original adjustment group, as stored in public.registro_ajustes. */
export interface AjusteOriginalRow {
  readonly cargoId: string;
  /** The signed delta the original row applied on that cargo. */
  readonly deltaCents: number;
  /** The value the original row left in cargos.monto_pendiente. */
  readonly pendienteResultanteCents: Cents;
}

export interface ReversaPlanRow {
  readonly cargoId: string;
  readonly expectedPendingCents: Cents;
  readonly restoredPendingCents: Cents;
  /** true when the original row CREATED this cargo (a cession's receiving side): the reversal removes it instead of restoring it. */
  readonly removeCargo: boolean;
  /** true when the cargo's current value differs from expectedPendingCents (or the cargo is missing): the reversal must refuse. */
  readonly mismatched: boolean;
}

/**
 * Plans the exact reversal of an adjustment group. The restoration is DERIVED
 * from the original rows, never re-planned: previous = pendienteResultanteCents
 * - deltaCents. That is what makes a reversal honest without re-running the
 * planner, so a later rule change cannot silently move an old counterfactual.
 *
 * A positive delta means the original row created the cargo (a cession's
 * receiving side): there is no earlier value to restore, so the reversal
 * removes the cargo instead (`removeCargo`). `mismatched` is the refusal signal
 * — the caller must not apply the plan when any row carries it, because the
 * cargo no longer proves the counterfactual the original row recorded.
 */
export function planReversa(
  originales: readonly AjusteOriginalRow[],
  actuales: ReadonlyMap<string, Cents>,
): ReversaPlanRow[] {
  return originales.map((original) => {
    const expectedPendingCents = original.pendienteResultanteCents;
    const current = actuales.get(original.cargoId);

    return {
      cargoId: original.cargoId,
      expectedPendingCents,
      restoredPendingCents: expectedPendingCents - original.deltaCents,
      removeCargo: original.deltaCents > 0,
      mismatched: current === undefined || current !== expectedPendingCents,
    };
  });
}

/** One ledger row as far as the "Ajustes otorgados" figure cares. */
export interface AjusteReporteRow {
  readonly tipo: AjusteTipo;
  /** SIGNED delta on the cargo. */
  readonly montoCents: number;
  readonly conceptoNombre: string | null;
}

export interface AjusteOtorgadoGrupo {
  readonly conceptoNombre: string;
  readonly totalCents: Cents;
}

/** Label for reduction rows recorded before the concept catalog existed. */
const SIN_CONCEPTO = 'Sin concepto';

/**
 * "Ajustes otorgados": the total debt reduction granted in the period, grouped
 * by concept. Counts only reduction rows (montoCents < 0) of type condonacion,
 * cesion or pago_tercero; `reversa` rows are excluded (the net position is the
 * live measure of an undone forgiveness). A positive row — a cession's
 * receiving side — is not a grant and is excluded too. A null concept groups
 * under the label 'Sin concepto'. Order: total desc, then name asc, compared
 * with plain code-unit ordering so the figure is deterministic regardless of
 * the runtime locale.
 */
export function sumAjustesOtorgados(
  rows: readonly AjusteReporteRow[],
): { readonly totalCents: Cents; readonly porConcepto: AjusteOtorgadoGrupo[] } {
  const totals = new Map<string, Cents>();
  let totalCents: Cents = 0;

  for (const row of rows) {
    if (row.montoCents >= 0 || row.tipo === 'reversa') continue;

    const conceptoNombre = row.conceptoNombre ?? SIN_CONCEPTO;
    const magnitudCents = -row.montoCents;

    totals.set(conceptoNombre, (totals.get(conceptoNombre) ?? 0) + magnitudCents);
    totalCents += magnitudCents;
  }

  const porConcepto = [...totals.entries()]
    .map(([conceptoNombre, groupTotalCents]) => ({ conceptoNombre, totalCents: groupTotalCents }))
    .sort((a, b) => {
      if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
      if (a.conceptoNombre === b.conceptoNombre) return 0;
      return a.conceptoNombre < b.conceptoNombre ? -1 : 1;
    });

  return { totalCents, porConcepto };
}

/** Net position = derived arca + outstanding receivable. Neither term is altered. */
export function netPositionCents(cajaCents: Cents, porCobrarCents: Cents): Cents {
  return cajaCents + porCobrarCents;
}
