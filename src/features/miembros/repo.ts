import { dbClient } from '../../lib/supabase';
import type { CargoHistorial, Miembro, RegistroPago } from '../../lib/types';

export async function fetchMembers(): Promise<Miembro[]> {
  const { data, error } = await dbClient
    .from('miembros')
    // Explicit column list, not select('*') (design.md D15): token_hash has
    // no business in client state. token_generado_en is the non-secret
    // timestamp the "Generado el ..." label needs.
    .select('id, nickname, status, created_at, activo, token_generado_en')
    .order('nickname', { ascending: true });
  if (error) throw error;
  return data as Miembro[];
}

export interface NuevoMiembroInput {
  nickname: string;
  status: Miembro['status'];
}

export async function addMember(input: NuevoMiembroInput): Promise<void> {
  const { error } = await dbClient.from('miembros').insert([input]);
  if (error) throw error;
}

/** Retires a member (`activo = false`) — reversible, preserves all history (design.md Member lifecycle DDL). */
export async function retireMember(id: string): Promise<void> {
  const { error } = await dbClient.from('miembros').update({ activo: false }).eq('id', id);
  if (error) throw error;
}

/** Reactivates a previously retired member (`activo = true`). */
export async function reactivateMember(id: string): Promise<void> {
  const { error } = await dbClient.from('miembros').update({ activo: true }).eq('id', id);
  if (error) throw error;
}

/**
 * Deletes a member row outright. Succeeds only when no `cargos` or
 * `registro_pagos` row references it — otherwise Postgres refuses with
 * 23503 (`ON DELETE RESTRICT`, spec member-lifecycle "Restricted Deletion"),
 * which the caller maps via `mapMiembroError`.
 */
export async function deleteMember(id: string): Promise<void> {
  const { error } = await dbClient.from('miembros').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Full cargo history for one member — every `cargo` regardless of `estado`
 * (design.md D14; spec member-payment-history "Full Per-Member History
 * Retrieval"). No `estado` filter and no `activo` filter: that omission is
 * the whole point of this admin surface, including for retired members.
 */
export async function fetchCargosMiembro(miembroId: string): Promise<CargoHistorial[]> {
  const { data, error } = await dbClient
    .from('cargos')
    .select('id, monto_original, monto_pendiente, estado, created_at, registro_apoyos(motivo, fecha)')
    .eq('miembro_id', miembroId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // The untyped supabase-js client heuristically infers `registro_apoyos` as an
  // array from the plural table name; at runtime (and per PostgREST's many-to-one
  // embed rules for cargos.apoyo_id -> registro_apoyos.id) it is a single object
  // or null, matching CargoHistorial (dashboard/index.ts precedent).
  return data as unknown as CargoHistorial[];
}

/** Full payment history for one member, newest first. No `activo` filter. */
export async function fetchPagosMiembro(miembroId: string): Promise<RegistroPago[]> {
  const { data, error } = await dbClient
    .from('registro_pagos')
    .select('*')
    .eq('miembro_id', miembroId)
    .order('fecha_pago', { ascending: false });
  if (error) throw error;
  return data as RegistroPago[];
}

/**
 * Issues or rotates a member's access token (design.md D9/D10/D16; spec
 * member-access-token "Single Live Token With Atomic Rotation"). Writing a
 * new digest overwrites the previous one in the same operation — that
 * overwrite IS the revocation (D9), not a separate step. `tokenHash` must
 * already be the lowercase SHA-256 hex digest; this function never
 * receives or stores the plaintext token (D10).
 */
export async function setMemberTokenHash(id: string, tokenHash: string): Promise<void> {
  const { error } = await dbClient
    .from('miembros')
    .update({ token_hash: tokenHash, token_generado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
