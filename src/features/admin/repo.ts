import { dbClient } from '../../lib/supabase';
import type { AppAdmin } from '../../lib/types';

export async function fetchAdmins(): Promise<AppAdmin[]> {
  const { data, error } = await dbClient.from('app_admins').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data as AppAdmin[];
}

export interface NuevoAdminInput {
  /** `auth.users.id` of the account being granted a role. That account must already exist (self-signup is disabled — see Phase 0). */
  userId: string;
  email: string;
  rol: AppAdmin['rol'];
  createdBy: string;
}

export async function addAdmin(input: NuevoAdminInput): Promise<void> {
  const { error } = await dbClient
    .from('app_admins')
    .insert([{ user_id: input.userId, email: input.email, rol: input.rol, created_by: input.createdBy }]);
  if (error) throw error;
}

export async function removeAdmin(userId: string): Promise<void> {
  const { error } = await dbClient.from('app_admins').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function changeAdminRole(userId: string, rol: AppAdmin['rol']): Promise<void> {
  const { error } = await dbClient.from('app_admins').update({ rol }).eq('user_id', userId);
  if (error) throw error;
}
