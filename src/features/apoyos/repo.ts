import { dbClient } from '../../lib/supabase';
import { splitEvenly, toCents, toPesos } from '../../lib/money';
import type { Miembro } from '../../lib/types';
import { saveEgreso } from '../caja/repo';

export interface NuevoApoyoInput {
  capturadoPorId: string;
  nombreCapturador: string;
  fecha: string;
  motivo: string;
  montoPesos: number;
  tipoDivision: 'INDIVIDUAL' | 'FULLPARCH' | 'TODOS';
  miembros: Pick<Miembro, 'id'>[];
}

/**
 * Mirrors the original `handleSaveApoyo`. Replaces the unrounded
 * `monto / membersToCharge.length` float split (index.html:658) with
 * `splitEvenly` (D6: conversion to/from cents happens only here, at the
 * repository boundary).
 */
export async function saveApoyo(input: NuevoApoyoInput): Promise<void> {
  const { data: apoyoData, error: apoyoError } = await dbClient
    .from('registro_apoyos')
    .insert({
      capturado_por: input.capturadoPorId,
      nombre_capturador: input.nombreCapturador,
      fecha: input.fecha,
      motivo: input.motivo,
      monto_total: input.montoPesos,
      tipo_division: input.tipoDivision,
    })
    .select()
    .single();

  if (apoyoError) throw apoyoError;

  const splitsCents = splitEvenly(toCents(input.montoPesos), input.miembros.length);

  const cargosToInsert = input.miembros.map((miembro, index) => {
    const montoPesos = toPesos(splitsCents[index]);
    return {
      apoyo_id: apoyoData.id,
      miembro_id: miembro.id,
      monto_original: montoPesos,
      monto_pendiente: montoPesos,
      estado: 'pendiente' as const,
    };
  });

  const { error: cargosError } = await dbClient.from('cargos').insert(cargosToInsert);
  if (cargosError) throw cargosError;
}

export interface SinCargosInput {
  capturadoPorId: string;
  nombreCapturador: string;
  fecha: string;
  motivo: string;
  montoPesos: number;
  /** `miembros.id` the expense is attributed to, or `null` for an un-attributed expense. */
  beneficiarioId: string | null;
  /** `miembros.nickname` snapshot at capture, or `null` — survives member deletion. */
  nombreBeneficiario: string | null;
}

/**
 * Records a "Sin cargos" apoyo as a single `registro_egresos` row — an expense,
 * NOT a loan. Deliberately writes NO `registro_apoyos` and NO `cargos` rows, so
 * nothing becomes debt. Delegates one-directionally to the caja feature's
 * `saveEgreso`, keeping the egreso insert in exactly one place.
 */
export async function saveApoyoSinCargos(input: SinCargosInput): Promise<void> {
  await saveEgreso(input);
}
