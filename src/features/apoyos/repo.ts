import { dbClient } from '../../lib/supabase';
import { splitEvenly, toCents, toPesos } from '../../lib/money';
import type { Miembro } from '../../lib/types';

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
