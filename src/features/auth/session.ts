import type { User } from '@supabase/supabase-js';
import { dbClient } from '../../lib/supabase';

/** Mirrors the original `handleLogin`: resolves `null` on a successful sign-in with no user (no error), never throws for that case. */
export async function signIn(email: string, password: string): Promise<User | null> {
  const { data, error } = await dbClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut(): Promise<void> {
  await dbClient.auth.signOut();
}

export async function getSessionUser(): Promise<User | null> {
  const {
    data: { session },
  } = await dbClient.auth.getSession();
  return session?.user ?? null;
}
