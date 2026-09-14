import { describe, expect, it } from 'vitest';
import { allocateFifo, splitEvenly, toCents, type Charge } from './money';

describe('toCents', () => {
  it('converts pesos to whole cents', () => {
    expect(toCents(100)).toBe(10000);
    expect(toCents(33.33)).toBe(3333);
    expect(toCents(0.01)).toBe(1);
  });

  it('rejects NaN', () => {
    expect(() => toCents(NaN)).toThrow(RangeError);
  });

  it('rejects Infinity in either direction', () => {
    expect(() => toCents(Infinity)).toThrow(RangeError);
    expect(() => toCents(-Infinity)).toThrow(RangeError);
  });
});

describe('splitEvenly', () => {
  const totalsInPesos = [0.01, 100.0, 33.33];

  for (const pesos of totalsInPesos) {
    for (let shares = 1; shares <= 40; shares++) {
      it(`splits $${pesos.toFixed(2)} into ${shares} share(s) summing to the exact total`, () => {
        const total = toCents(pesos);
        const result = splitEvenly(total, shares);

        expect(result).toHaveLength(shares);
        expect(result.reduce((sum, cents) => sum + cents, 0)).toBe(total);
        for (const cents of result) {
          expect(Number.isInteger(cents)).toBe(true);
        }
      });
    }
  }

  it('gives the largest remainder to the first shares, deterministically', () => {
    expect(splitEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEvenly(9000, 3)).toEqual([3000, 3000, 3000]);
  });
});

describe('allocateFifo', () => {
  const charges: Charge[] = [
    { id: 'oldest', pendingCents: 5000 },
    { id: 'newer', pendingCents: 8000 },
  ];

  it('settles the oldest charge and carries the remainder into the next one', () => {
    const result = allocateFifo(6000, charges);

    expect(result.unappliedCents).toBe(0);
    expect(result.allocations).toEqual([
      { chargeId: 'oldest', appliedCents: 5000, remainingCents: 0, settled: true },
      { chargeId: 'newer', appliedCents: 1000, remainingCents: 7000, settled: false },
    ]);
  });

  it('partially settles the oldest charge and leaves the newer one untouched', () => {
    const result = allocateFifo(2000, charges);

    expect(result.unappliedCents).toBe(0);
    expect(result.allocations).toEqual([
      { chargeId: 'oldest', appliedCents: 2000, remainingCents: 3000, settled: false },
    ]);
  });

  it('reports the surplus as unappliedCents when the payment exceeds total pending debt', () => {
    const singleCharge: Charge[] = [{ id: 'only', pendingCents: 5000 }];
    const result = allocateFifo(7500, singleCharge);

    expect(result.unappliedCents).toBe(2500);
    expect(result.allocations).toEqual([
      { chargeId: 'only', appliedCents: 5000, remainingCents: 0, settled: true },
    ]);
  });
});
