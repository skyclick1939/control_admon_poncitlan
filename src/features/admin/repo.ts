import { dbClient } from '../../lib/supabase';
import type { AppAdmin } from '../../lib/types';

export async function fetchAdmins(): Promise<AppAdmin[]> {
  const { data, error } = await dbClient.from('app_admins').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data as AppAdmin[];
}

/**
 * The current session's own `app_admins` row, or `null` when it has none.
 * RLS's `is_admin()`-gated SELECT policy filters out every row for a
 * non-admin caller, so this doubles as an "is this user an admin/superadmin"
 * check without a dedicated server endpoint — used by the shell to gate the
 * admin nav link and the forced-MFA-enrollment screen (specs auth-roles,
 * superadmin-mfa).
 */
export async function checkCurrentAdmin(userId: string): Promise<AppAdmin | null> {
  const { data, error } = await dbClient.from('app_admins').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as AppAdmin | null;
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
