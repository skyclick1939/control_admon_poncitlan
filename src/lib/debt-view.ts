import { toCents } from './money';

export interface CargoPendienteRow {
  monto_pendiente: number;
  miembros: { nickname: string } | null;
}

export interface DeudorEntry {
  readonly nickname: string;
  readonly pendienteCents: number;
}

export interface AggregatedDebt {
  readonly totalPendienteCents: number;
  readonly deudores: DeudorEntry[];
}

/**
 * Aggregates pending cargos per member into whole cents, sorted descending
 * by debt (design.md sequence diagram: public debt view). Rows with no
 * resolved member or a non-positive pendiente are excluded — defensive
 * against join edge cases even though the `estado='pendiente'` query filter
 * should already guarantee a positive amount. PURE, mirrors `money.ts`'s D6
 * pattern: no DB access here, only aggregation over already-fetched rows.
 */
export function aggregateDebtByMember(rows: readonly CargoPendienteRow[]): AggregatedDebt {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const nickname = row.miembros?.nickname;
    if (!nickname) continue;

    const cents = toCents(row.monto_pendiente);
    if (cents <= 0) continue;

    totals.set(nickname, (totals.get(nickname) ?? 0) + cents);
  }

  const deudores = [...totals.entries()]
    .map(([nickname, pendienteCents]) => ({ nickname, pendienteCents }))
    .sort((a, b) => b.pendienteCents - a.pendienteCents);

  const totalPendienteCents = deudores.reduce((sum, deudor) => sum + deudor.pendienteCents, 0);

  return { totalPendienteCents, deudores };
}
