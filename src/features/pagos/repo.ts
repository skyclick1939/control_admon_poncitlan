import { dbClient } from '../../lib/supabase';
import { allocateFifo, toCents, toPesos } from '../../lib/money';
import type { Charge } from '../../lib/money';
import type { CargoConApoyo } from '../../lib/types';

export async function fetchCargosPendientes(miembroId: string): Promise<CargoConApoyo[]> {
  const { data, error } = await dbClient
    .from('cargos')
    .select('*, registro_apoyos(motivo, fecha)')
    .eq('miembro_id', miembroId)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as CargoConApoyo[];
}

export interface AplicarPagoInput {
  miembroId: string;
  montoPagadoPesos: number;
  fechaPago: string;
  observaciones: string;
  registradoPorId: string;
}

/**
 * Mirrors the original `handleSavePago`. Replaces the `nuevoMontoPendiente <= 0.001`
 * float epsilon (index.html:793) with `allocateFifo`'s exact `remainingCents === 0`
 * check. `registro_pagos.monto_pagado` still records the full original input amount
 * (never the FIFO-decremented remainder) — matching the original's behavior of
 * re-reading the raw input rather than the loop-mutated variable.
 */
export async function aplicarPago(input: AplicarPagoInput): Promise<{ unappliedCents: number }> {
  const { data: cargosPendientes, error: fetchError } = await dbClient
    .from('cargos')
    .select('id, monto_pendiente')
    .eq('miembro_id', input.miembroId)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (fetchError) throw fetchError;

  const charges: Charge[] = (cargosPendientes as { id: string; monto_pendiente: number }[]).map((cargo) => ({
    id: cargo.id,
    pendingCents: toCents(cargo.monto_pendiente),
  }));

  const { allocations, unappliedCents } = allocateFifo(toCents(input.montoPagadoPesos), charges);

  for (const allocation of allocations) {
    const { error: updateError } = await dbClient
      .from('cargos')
      .update({
        monto_pendiente: toPesos(allocation.remainingCents),
        estado: allocation.settled ? 'pagado' : 'pendiente',
      })
      .eq('id', allocation.chargeId);
    if (updateError) throw updateError;
  }

  const { error: insertPagoError } = await dbClient.from('registro_pagos').insert({
    miembro_id: input.miembroId,
    monto_pagado: input.montoPagadoPesos,
    fecha_pago: input.fechaPago,
    observaciones: input.observaciones,
    registrado_por: input.registradoPorId,
  });
  if (insertPagoError) throw insertPagoError;

  return { unappliedCents };
}
