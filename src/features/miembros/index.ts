import type { App } from '../../app';
import { escapeHtml } from '../../lib/escape';
import { addMember } from './repo';

/** Mirrors the original `fetchAndRenderMembers` + `handleAddMember`. */
export function initMiembros(app: App): void {
  const addMemberForm = document.getElementById('add-member-form') as HTMLFormElement;
  const membersTableBody = document.getElementById('members-table-body')!;
  const memberFeedback = document.getElementById('member-feedback')!;
  const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
  const statusSelect = document.getElementById('status') as HTMLSelectElement;

  function render(): void {
    membersTableBody.innerHTML = app.state.members
      .map(
        (member) => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(member.nickname)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(member.status)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(member.created_at).toLocaleDateString()}</td>
        </tr>`,
      )
      .join('');
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

  app.onRefresh(render);
}
