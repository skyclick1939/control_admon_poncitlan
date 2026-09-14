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
