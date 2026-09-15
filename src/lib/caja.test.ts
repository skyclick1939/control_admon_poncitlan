import { describe, expect, it } from 'vitest';
import { computeCaja, type CajaInput } from './caja';

describe('computeCaja', () => {
  it('sums a single pago entry as its full amount (array-sum semantics)', () => {
    const input: CajaInput = {
      openingCents: 5000,
      pagosCents: [10000],
      apoyosCents: [],
      egresosCents: [],
    };

    const result = computeCaja(input);

    expect(result.pagosTotalCents).toBe(10000);
    expect(result.apoyosTotalCents).toBe(0);
    expect(result.cajaCents).toBe(15000);
  });

  it('subtracts a disbursed apoyo from the balance', () => {
    // Handing out an apoyo is cash leaving the club, so it must reduce caja.
    const input: CajaInput = {
      openingCents: 20000,
      pagosCents: [1000, 2500],
      apoyosCents: [1500],
      egresosCents: [300],
    };

    const result = computeCaja(input);

    expect(result.pagosTotalCents).toBe(3500);
    expect(result.apoyosTotalCents).toBe(1500);
    expect(result.egresosTotalCents).toBe(300);
    expect(result.cajaCents).toBe(21700);
  });

  it('returns a negative balance unclamped', () => {
    const input: CajaInput = {
      openingCents: 0,
      pagosCents: [10000],
      apoyosCents: [5000],
      egresosCents: [25000],
    };

    const result = computeCaja(input);

    expect(result.cajaCents).toBe(-20000);
  });

  it('counts every element of each input array exactly once (no dedup)', () => {
    // Two identical pago rows are two separate cash-in events; two identical
    // apoyo rows are two separate disbursements; two identical egreso rows are
    // two separate disbursements. None may be deduplicated.
    const input: CajaInput = {
      openingCents: 0,
      pagosCents: [500, 500, 500],
      apoyosCents: [100, 100],
      egresosCents: [200, 200],
    };

    const result = computeCaja(input);

    expect(result.pagosTotalCents).toBe(1500);
    expect(result.apoyosTotalCents).toBe(200);
    expect(result.egresosTotalCents).toBe(400);
    expect(result.cajaCents).toBe(900);
  });
});
