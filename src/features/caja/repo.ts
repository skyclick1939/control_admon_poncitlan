import type { CajaBreakdown } from '../../lib/caja';
import { computeCaja } from '../../lib/caja';
import { toCents } from '../../lib/money';
import { dbClient } from '../../lib/supabase';
import type { ConfiguracionCaja } from '../../lib/types';

export interface EgresoInput {
  /** `auth.users.id` of the recording admin. */
  capturadoPorId: string;
  /** Display name/email of the recording admin (survives account deletion). */
  nombreCapturador: string;
  fecha: string;
  motivo: string;
  /** Decimal MXN pesos; stored as `monto` (matching `registro_pagos.monto_pagado`). */
  montoPesos: number;
}

/**
 * Records one disbursement as a `registro_egresos` ledger row. Mirrors
 * `saveApoyo`'s boundary shape: `monto` stores decimal MXN pesos. No running
 * balance is mutated — caja is derived on read via `computeCaja`.
 */
export async function saveEgreso(input: EgresoInput): Promise<void> {
  const { error } = await dbClient.from('registro_egresos').insert({
    capturado_por: input.capturadoPorId,
    nombre_capturador: input.nombreCapturador,
    fecha: input.fecha,
    motivo: input.motivo,
    monto: input.montoPesos,
  });
  if (error) throw error;
}

export interface AperturaInput {
  /** Decimal MXN pesos; converted to cents at the read boundary via `toCents`. */
  montoAperturaPesos: number;
  /** `auth.users.id` of the editing admin. */
  updatedBy: string;
}

/** UPSERT the configuracion_caja singleton (id=1). Mirrors features/admin/repo.ts updateBankConfig (:73-83). */
export async function saveApertura(input: AperturaInput): Promise<void> {
  const { error } = await dbClient.from('configuracion_caja').upsert({
    id: 1,
    monto_apertura: input.montoAperturaPesos,
    updated_by: input.updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchApertura(): Promise<ConfiguracionCaja | null> {
  const { data, error } = await dbClient
    .from('configuracion_caja')
    .select('id, monto_apertura, updated_by, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data as ConfiguracionCaja | null;
}

/** Aggregates the derived caja over already-fetched rows; `toCents` at the boundary, `computeCaja` over cents. */
export async function fetchCaja(): Promise<CajaBreakdown> {
  const [aperturaRes, pagosRes, egresosRes] = await Promise.all([
    dbClient.from('configuracion_caja').select('monto_apertura').eq('id', 1).maybeSingle(),
    dbClient.from('registro_pagos').select('monto_pagado'),
    dbClient.from('registro_egresos').select('monto'),
  ]);
  const err = aperturaRes.error ?? pagosRes.error ?? egresosRes.error;
  if (err) throw err;
  return computeCaja({
    openingCents: toCents(aperturaRes.data?.monto_apertura ?? 0),
    pagosCents: (pagosRes.data ?? []).map((row) => toCents(row.monto_pagado)),
    egresosCents: (egresosRes.data ?? []).map((row) => toCents(row.monto)),
  });
}
