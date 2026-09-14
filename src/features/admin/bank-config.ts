import type { User } from '@supabase/supabase-js';
import { isValidClabe } from './clabe';
import { mapBankConfigError } from './errors';
import { fetchBankConfig, updateBankConfig } from './repo';

export interface BankConfigDeps {
  getCurrentUser: () => User | null;
}

export interface BankConfigApi {
  /** Called by the shell alongside `AdminApi.refresh` on navigation to the shared #admin-content view (mirrors that same refresh-on-navigate convention). */
  refresh: () => Promise<void>;
}

/**
 * Admin-writable bank-transfer info (spec bank-config). Lives inside the
 * shared `#admin-content` view — `is_admin()` gates writes at the DB layer,
 * so this is reachable by any `app_admins` row (admin or superadmin), not
 * superadmin-only.
 */
export function initBankConfig({ getCurrentUser }: BankConfigDeps): BankConfigApi {
  const form = document.getElementById('bank-config-form') as HTMLFormElement;
  const bancoInput = document.getElementById('bank-config-banco') as HTMLInputElement;
  const clabeInput = document.getElementById('bank-config-clabe') as HTMLInputElement;
  const titularInput = document.getElementById('bank-config-titular') as HTMLInputElement;
  const feedback = document.getElementById('bank-config-feedback')!;

  function showError(message: string): void {
    feedback.textContent = message;
    feedback.className = 'mt-3 text-sm text-red-600';
  }

  function showSuccess(message: string): void {
    feedback.textContent = message;
    feedback.className = 'mt-3 text-sm text-green-600';
  }

  async function render(): Promise<void> {
    try {
      const config = await fetchBankConfig();
      if (config) {
        bancoInput.value = config.banco;
        clabeInput.value = config.clabe;
        titularInput.value = config.titular;
      }
    } catch (error) {
      showError(mapBankConfigError(error as { message?: string }));
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.textContent = '';

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const clabe = clabeInput.value.trim();
    if (!isValidClabe(clabe)) {
      showError('La CLABE debe tener exactamente 18 dígitos numéricos.');
      return;
    }

    try {
      await updateBankConfig({
        banco: bancoInput.value.trim(),
        clabe,
        titular: titularInput.value.trim(),
        updatedBy: currentUser.id,
      });
      showSuccess('Configuración bancaria actualizada.');
    } catch (error) {
      showError(mapBankConfigError(error as { message?: string }));
    }
  });

  return { refresh: render };
}
