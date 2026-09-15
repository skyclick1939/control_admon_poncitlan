import { describe, expect, it } from 'vitest';
import { computeCaja, type CajaInput } from './caja';

describe('computeCaja', () => {
  it('sums a single pago entry as its full amount (array-sum semantics)', () => {
    const input: CajaInput = {
      openingCents: 5000,
      pagosCents: [10000],
      egresosCents: [],
    };

    const result = computeCaja(input);

    expect(result.pagosTotalCents).toBe(10000);
    expect(result.cajaCents).toBe(15000);
  });

  it('has no apoyos term: balance is exactly opening + pagos − egresos', () => {
    // saveApoyo creates a receivable that must not move caja; computeCaja takes
    // no apoyos/receivable input, so the formula holds with zero apoyo terms.
    const input: CajaInput = {
      openingCents: 20000,
      pagosCents: [1000, 2500],
      egresosCents: [300],
    };

    const result = computeCaja(input);

    expect(result.pagosTotalCents).toBe(3500);
    expect(result.egresosTotalCents).toBe(300);
    expect(result.cajaCents).toBe(23200);
  });

  it('returns a negative balance unclamped', () => {
    const input: CajaInput = {
      openingCents: 0,
      pagosCents: [10000],
      egresosCents: [25000],
    };

    const result = computeCaja(input);

    expect(result.cajaCents).toBe(-15000);
  });

  it('counts every element of each input array exactly once (no dedup)', () => {
    // Two identical pago rows are two separate cash-in events; two identical
    // egreso rows are two separate disbursements. Neither may be deduplicated.
    const input: CajaInput = {
      openingCents: 0,
      pagosCents: [500, 500, 500],
      egresosCents: [200, 200],
    };

    const result = computeCaja(input);

    expect(result.pagosTotalCents).toBe(1500);
    expect(result.egresosTotalCents).toBe(400);
    expect(result.cajaCents).toBe(1100);
  });
});
