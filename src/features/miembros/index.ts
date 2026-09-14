import type { App } from '../../app';
import { escapeHtml } from '../../lib/escape';
import type { Miembro } from '../../lib/types';
import { mapMiembroError } from './errors';
import { addMember, deleteMember, reactivateMember, retireMember } from './repo';

/** Mirrors the original `fetchAndRenderMembers` + `handleAddMember`; extended in Phase 4 with retire/reactivate/delete (spec member-lifecycle). */
export function initMiembros(app: App): void {
  const addMemberForm = document.getElementById('add-member-form') as HTMLFormElement;
  const membersTableBody = document.getElementById('members-table-body')!;
  const memberFeedback = document.getElementById('member-feedback')!;
  const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
  const statusSelect = document.getElementById('status') as HTMLSelectElement;

  function renderRow(member: Miembro): string {
    const toggleLabel = member.activo ? 'Retirar' : 'Reactivar';
    const toggleAction = member.activo ? 'retire' : 'reactivate';
    const estadoLabel = member.activo ? 'Activo' : 'Retirado';
    const estadoClass = member.activo ? 'text-green-600' : 'text-gray-500';

    return `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(member.nickname)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(member.status)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm ${estadoClass}">${estadoLabel}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(member.created_at).toLocaleDateString()}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-right space-x-3">
            <button data-member-id="${escapeHtml(member.id)}" data-action="${toggleAction}" class="member-toggle-button text-indigo-600 hover:text-indigo-800">${toggleLabel}</button>
            <button data-member-id="${escapeHtml(member.id)}" class="member-delete-button text-red-600 hover:text-red-800">Eliminar</button>
          </td>
        </tr>`;
  }

  function render(): void {
    membersTableBody.innerHTML = app.state.members.map(renderRow).join('');
  }

  addMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    memberFeedback.textContent = '';
    const nickname = nicknameInput.value.trim();
    const status = statusSelect.value as 'fullparch' | 'prospecto';

    if (!nickname) {
      memberFeedback.textContent = 'El nickname es obligatorio.';
      memberFeedback.className = 'mt-3 text-sm text-red-600';
      return;
    }

    try {
      await addMember({ nickname, status });
      memberFeedback.textContent = `¡Miembro "${nickname}" agregado!`;
      memberFeedback.className = 'mt-3 text-sm text-green-600';
      addMemberForm.reset();
      await app.refresh();
    } catch (error) {
      const code = (error as { code?: string }).code;
      memberFeedback.textContent = code === '23505' ? 'Error: Ese nickname ya existe.' : 'Error al guardar el miembro.';
      memberFeedback.className = 'mt-3 text-sm text-red-600';
    }
  });

  membersTableBody.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const memberId = target.dataset.memberId;
    if (!memberId) return;

    memberFeedback.textContent = '';

    if (target.classList.contains('member-toggle-button')) {
      try {
        if (target.dataset.action === 'retire') {
          await retireMember(memberId);
          memberFeedback.textContent = 'Miembro retirado.';
        } else {
          await reactivateMember(memberId);
          memberFeedback.textContent = 'Miembro reactivado.';
        }
        memberFeedback.className = 'mt-3 text-sm text-green-600';
        await app.refresh();
      } catch (error) {
        memberFeedback.textContent = mapMiembroError(error as { code?: string });
        memberFeedback.className = 'mt-3 text-sm text-red-600';
      }
      return;
    }

    if (target.classList.contains('member-delete-button')) {
      if (!window.confirm('¿Eliminar este miembro? Esta acción no se puede deshacer.')) return;

      try {
        await deleteMember(memberId);
        memberFeedback.textContent = 'Miembro eliminado.';
        memberFeedback.className = 'mt-3 text-sm text-green-600';
        await app.refresh();
      } catch (error) {
        memberFeedback.textContent = mapMiembroError(error as { code?: string });
        memberFeedback.className = 'mt-3 text-sm text-red-600';
      }
    }
  });

  app.onRefresh(render);
}
