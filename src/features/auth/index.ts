import type { User } from '@supabase/supabase-js';
import { getSessionUser, signIn, signOut } from './session';

export interface AuthCallbacks {
  onLogin: (user: User) => void | Promise<void>;
  onLogout: () => void;
}

/** Wires the login form and logout button (login/logout only — MFA lands in Phase 2). */
export function initAuth(callbacks: AuthCallbacks): void {
  const loginForm = document.getElementById('login-form') as HTMLFormElement;
  const errorMessage = document.getElementById('error-message')!;
  const logoutButton = document.getElementById('logout-button')!;
  const loginButton = document.getElementById('login-button') as HTMLButtonElement;
  const emailInput = document.getElementById('email') as HTMLInputElement;
  const passwordInput = document.getElementById('password') as HTMLInputElement;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.textContent = '';
    loginButton.disabled = true;
    try {
      const user = await signIn(emailInput.value, passwordInput.value);
      if (user) await callbacks.onLogin(user);
    } catch {
      errorMessage.textContent = 'Correo o contraseña incorrectos.';
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    await signOut();
    callbacks.onLogout();
  });
}

/** Mirrors the original `checkUserSession`. */
export async function checkSession(callbacks: AuthCallbacks): Promise<void> {
  const user = await getSessionUser();
  if (user) await callbacks.onLogin(user);
  else callbacks.onLogout();
}
