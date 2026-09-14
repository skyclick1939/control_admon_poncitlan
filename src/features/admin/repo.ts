import { dbClient } from '../../lib/supabase';
import type { AppAdmin, ConfiguracionBancaria } from '../../lib/types';

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

/**
 * The singleton `configuracion_bancaria` row (spec bank-config). `is_admin()`
 * gates SELECT, so a non-admin caller gets zero rows back (RLS denial), not
 * an error — this returns `null` for that case, and also for the (unexpected)
 * case where the seed row is missing.
 */
export async function fetchBankConfig(): Promise<ConfiguracionBancaria | null> {
  const { data, error } = await dbClient
    .from('configuracion_bancaria')
    .select('id, banco, clabe, titular, updated_by, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data as ConfiguracionBancaria | null;
}

export interface BankConfigInput {
  banco: string;
  clabe: string;
  titular: string;
  updatedBy: string;
}

/** Upserts the singleton row (`id: 1`) — covers both "seed row exists, update it" and "no row yet" in one call. */
export async function updateBankConfig(input: BankConfigInput): Promise<void> {
  const { error } = await dbClient.from('configuracion_bancaria').upsert({
    id: 1,
    banco: input.banco,
    clabe: input.clabe,
    titular: input.titular,
    updated_by: input.updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
