import type { User } from '@supabase/supabase-js';
import { escapeHtml } from '../../lib/escape';
import type { AppAdmin } from '../../lib/types';
import { mapAdminError } from './errors';
import { addAdmin, changeAdminRole, fetchAdmins, removeAdmin } from './repo';

export interface AdminDeps {
  getCurrentUser: () => User | null;
}

export interface AdminApi {
  /** Called by the shell on every navigation to the admin view (mirrors `PagosApi.renderPagosForm`), so the list is fresh once a session exists instead of the pre-login fetch this module used to make at init time. */
  refresh: () => Promise<void>;
}

/** Admin management panel: list, add, remove, change role. Wired into `main.ts`'s nav (visible to any `app_admins` row) and refreshed on navigation to the admin view. */
export function initAdmin({ getCurrentUser }: AdminDeps): AdminApi {
  const addAdminForm = document.getElementById('add-admin-form') as HTMLFormElement;
  const adminTableBody = document.getElementById('admin-table-body')!;
  const adminFeedback = document.getElementById('admin-feedback')!;
  const userIdInput = document.getElementById('admin-user-id') as HTMLInputElement;
  const emailInput = document.getElementById('admin-email') as HTMLInputElement;
  const rolSelect = document.getElementById('admin-rol') as HTMLSelectElement;

  function showError(error: unknown): void {
    adminFeedback.textContent = mapAdminError(error as { message?: string });
    adminFeedback.className = 'mt-3 text-sm text-red-600';
  }

  function showSuccess(message: string): void {
    adminFeedback.textContent = message;
    adminFeedback.className = 'mt-3 text-sm text-green-600';
  }

  function renderRow(admin: AppAdmin): string {
    return `
      <tr>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(admin.email)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <select data-user-id="${escapeHtml(admin.user_id)}" class="admin-rol-select rounded border-gray-300 text-sm">
            <option value="admin" ${admin.rol === 'admin' ? 'selected' : ''}>admin</option>
            <option value="superadmin" ${admin.rol === 'superadmin' ? 'selected' : ''}>superadmin</option>
          </select>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-right">
          <button data-user-id="${escapeHtml(admin.user_id)}" class="admin-remove-button text-red-600 hover:text-red-800">Quitar</button>
        </td>
      </tr>`;
  }

  async function render(): Promise<void> {
    try {
      const admins = await fetchAdmins();
      adminTableBody.innerHTML = admins.map(renderRow).join('');
    } catch (error) {
      showError(error);
    }
  }

  addAdminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    adminFeedback.textContent = '';

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const userId = userIdInput.value.trim();
    const email = emailInput.value.trim();
    const rol = rolSelect.value as AppAdmin['rol'];

    if (!userId || !email) {
      adminFeedback.textContent = 'El id de usuario y el correo son obligatorios.';
      adminFeedback.className = 'mt-3 text-sm text-red-600';
      return;
    }

    try {
      await addAdmin({ userId, email, rol, createdBy: currentUser.id });
      showSuccess(`Administrador "${email}" agregado.`);
      addAdminForm.reset();
      await render();
    } catch (error) {
      showError(error);
    }
  });

  adminTableBody.addEventListener('change', async (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('admin-rol-select')) return;

    const userId = target.dataset.userId!;
    const rol = (target as HTMLSelectElement).value as AppAdmin['rol'];

    try {
      await changeAdminRole(userId, rol);
      showSuccess('Rol actualizado.');
      await render();
    } catch (error) {
      showError(error);
      await render();
    }
  });

  adminTableBody.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('admin-remove-button')) return;

    const userId = target.dataset.userId!;

    try {
      await removeAdmin(userId);
      showSuccess('Administrador eliminado.');
      await render();
    } catch (error) {
      showError(error);
    }
  });

  return { refresh: render };
}
