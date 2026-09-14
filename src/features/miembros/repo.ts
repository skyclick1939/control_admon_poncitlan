import { dbClient } from '../../lib/supabase';
import type { Miembro } from '../../lib/types';

export async function fetchMembers(): Promise<Miembro[]> {
  const { data, error } = await dbClient
    .from('miembros')
    .select('*')
    .order('nickname', { ascending: true });
  if (error) throw error;
  return data as Miembro[];
}

export interface NuevoMiembroInput {
  nickname: string;
  status: 'fullparch' | 'prospecto';
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
