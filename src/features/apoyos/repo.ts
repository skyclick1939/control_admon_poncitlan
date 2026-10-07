import { dbClient } from '../../lib/supabase';
import { splitEvenly, toCents, toPesos } from '../../lib/money';
import type { Concepto, ConceptoNaturaleza } from '../../lib/conceptos';
import type { Miembro } from '../../lib/types';
import { saveEgreso } from '../caja/repo';

/**
 * Catalog reads and the in-line creation write (design.md D9). They live in
 * this feature because the Apoyos form is the app's only capture surface — it
 * records apoyos AND, through the "sin cargos" modality, egresos — and no
 * feature may import another. `saveEgreso` receives only the resulting
 * `concepto_id`, so the shared catalog gets one reader and one writer.
 */
export async function fetchConceptos(): Promise<Concepto[]> {
  const { data, error } = await dbClient
    .from('catalogo_conceptos')
    .select('id, slug, nombre, naturaleza, activo')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return data as Concepto[];
}

export interface NuevoConceptoInput {
  nombre: string;
  /** `slugifyConcepto(nombre)`; `catalogo_conceptos.slug` is UNIQUE. */
  slug: string;
  naturaleza: ConceptoNaturaleza;
  /** `auth.users.id` of the admin creating it, or `null` when unavailable. */
  createdById: string | null;
}

/** Creates one catalog entry in place, so adding a concept never needs a migration or a second screen. */
export async function createConcepto(input: NuevoConceptoInput): Promise<Concepto> {
  const { data, error } = await dbClient
    .from('catalogo_conceptos')
    .insert({
      nombre: input.nombre,
      slug: input.slug,
      naturaleza: input.naturaleza,
      created_by: input.createdById,
    })
    .select('id, slug, nombre, naturaleza, activo')
    .single();
  if (error) throw error;
  return data as Concepto;
}

export interface NuevoApoyoInput {
  capturadoPorId: string;
  nombreCapturador: string;
  fecha: string;
  motivo: string;
  montoPesos: number;
  tipoDivision: 'INDIVIDUAL' | 'FULLPARCH' | 'TODOS';
  miembros: Pick<Miembro, 'id'>[];
  /**
   * `catalogo_conceptos.id`. REQUIRED: a new apoyo must carry a concept
   * (design.md D3), so it is a plain `string` here — the compiler is the
   * second gate behind the form's validation.
   */
  conceptoId: string;
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
      concepto_id: input.conceptoId,
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
  /** `catalogo_conceptos.id`. REQUIRED, and always `no_recuperable` — the form only offers that nature here (design.md D2/D3). */
  conceptoId: string;
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
