export type Cents = number;

export function toCents(pesos: number): Cents {
  if (!Number.isFinite(pesos)) {
    throw new RangeError(`toCents: expected a finite number, received ${pesos}`);
  }
  return Math.round(pesos * 100);
}

export function toPesos(cents: Cents): number {
  return cents / 100;
}

export function formatMXN(cents: Cents): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(toPesos(cents));
}

/** Largest-remainder split. Guarantees sum(result) === total, exactly. */
export function splitEvenly(total: Cents, shares: number): Cents[] {
  if (!Number.isInteger(shares) || shares <= 0) {
    throw new RangeError(`splitEvenly: shares must be a positive integer, received ${shares}`);
  }

  const base = Math.floor(total / shares);
  const remainder = total - base * shares;

  return Array.from({ length: shares }, (_, index) => base + (index < remainder ? 1 : 0));
}

export interface Charge {
  readonly id: string;
  readonly pendingCents: Cents;
}

export interface Allocation {
  readonly chargeId: string;
  readonly appliedCents: Cents;
  readonly remainingCents: Cents;
  readonly settled: boolean;
}

export interface AllocationResult {
  readonly allocations: Allocation[];
  readonly unappliedCents: Cents;
}

/** FIFO. `charges` MUST already be ordered oldest-first. */
export function allocateFifo(paymentCents: Cents, charges: readonly Charge[]): AllocationResult {
  let remainingPayment = paymentCents;
  const allocations: Allocation[] = [];

  for (const charge of charges) {
    if (remainingPayment <= 0) break;

    const appliedCents = Math.min(remainingPayment, charge.pendingCents);
    const remainingCents = charge.pendingCents - appliedCents;

    allocations.push({
      chargeId: charge.id,
      appliedCents,
      remainingCents,
      settled: remainingCents === 0,
    });

    remainingPayment -= appliedCents;
  }

  return { allocations, unappliedCents: remainingPayment };
}
