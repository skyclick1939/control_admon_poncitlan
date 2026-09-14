import type { App } from '../../app';
import { escapeHtml, setText } from '../../lib/escape';
import { summarizeMemberHistory } from '../../lib/member-view';
import { toCents, toPesos } from '../../lib/money';
import type { CargoHistorial, Miembro, RegistroPago } from '../../lib/types';
import { mapMiembroError } from './errors';
import {
  addMember,
  deleteMember,
  fetchCargosMiembro,
  fetchPagosMiembro,
  reactivateMember,
  retireMember,
} from './repo';

/** Mirrors the original `fetchAndRenderMembers` + `handleAddMember`; extended in Phase 4 with retire/reactivate/delete (spec member-lifecycle), and in `portal-miembros` Part 1 with the per-member payment history panel (spec member-payment-history). */
export function initMiembros(app: App): void {
  const addMemberForm = document.getElementById('add-member-form') as HTMLFormElement;
  const membersTableBody = document.getElementById('members-table-body')!;
  const memberFeedback = document.getElementById('member-feedback')!;
  const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
  const statusSelect = document.getElementById('status') as HTMLSelectElement;
  const historyPanel = document.getElementById('member-history-panel')!;
  const historyNickname = document.getElementById('member-history-nickname')!;
  const historyTotalOriginal = document.getElementById('member-history-total-original')!;
  const historyTotalPendiente = document.getElementById('member-history-total-pendiente')!;
  const historyTotalPagado = document.getElementById('member-history-total-pagado')!;
  const historyCargosBody = document.getElementById('member-history-cargos-body')!;
  const historyPagosBody = document.getElementById('member-history-pagos-body')!;

  /** `id` of the member whose history panel is currently open, or `null` when closed. */
  let openHistoryMemberId: string | null = null;

  function renderCargoHistoryRow(cargo: CargoHistorial): string {
    const fecha = cargo.registro_apoyos?.fecha ?? cargo.created_at;
    const motivo = cargo.registro_apoyos?.motivo ?? '—';
    const estadoLabel = cargo.estado === 'pagado' ? 'Pagado' : 'Pendiente';
    const estadoClass = cargo.estado === 'pagado' ? 'text-green-600' : 'text-red-600';

    return `
        <tr>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${new Date(fecha).toLocaleDateString()}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-800">${escapeHtml(motivo)}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">$${toPesos(toCents(cargo.monto_original)).toFixed(2)}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">$${toPesos(toCents(cargo.monto_pendiente)).toFixed(2)}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm ${estadoClass}">${estadoLabel}</td>
        </tr>`;
  }

  function renderPagoHistoryRow(pago: RegistroPago): string {
    return `
        <tr>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${new Date(pago.fecha_pago).toLocaleDateString()}</td>
          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">$${toPesos(toCents(pago.monto_pagado)).toFixed(2)}</td>
          <td class="px-4 py-2 text-sm text-gray-500">${escapeHtml(pago.observaciones ?? '—')}</td>
        </tr>`;
  }

  function closeHistoryPanel(): void {
    historyPanel.classList.add('view-hidden');
    openHistoryMemberId = null;
  }

  /** Toggles the inline history panel for `memberId` (design.md "Part 1 UI"). A second click on the same member's button closes it; clicking a different member re-fetches and re-renders. */
  async function toggleHistoryPanel(memberId: string, nickname: string): Promise<void> {
    if (openHistoryMemberId === memberId) {
      closeHistoryPanel();
      return;
    }

    openHistoryMemberId = memberId;
    historyPanel.classList.remove('view-hidden');
    setText(historyNickname, nickname);
    historyCargosBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">Cargando…</td></tr>`;
    historyPagosBody.innerHTML = '';

    try {
      const [cargos, pagos] = await Promise.all([fetchCargosMiembro(memberId), fetchPagosMiembro(memberId)]);
      if (openHistoryMemberId !== memberId) return; // a different member's panel was opened while this fetch was in flight

      const totals = summarizeMemberHistory(cargos, pagos);

      setText(historyTotalOriginal, `$${toPesos(totals.totalOriginalCents).toFixed(2)}`);
      setText(historyTotalPendiente, `$${toPesos(totals.totalPendienteCents).toFixed(2)}`);
      setText(historyTotalPagado, `$${toPesos(totals.totalPagadoCents).toFixed(2)}`);

      historyCargosBody.innerHTML =
        cargos.length === 0
          ? `<tr><td colspan="5" class="text-center py-4 text-gray-500">Sin cargos registrados.</td></tr>`
          : cargos.map(renderCargoHistoryRow).join('');

      historyPagosBody.innerHTML =
        pagos.length === 0
          ? `<tr><td colspan="3" class="text-center py-4 text-gray-500">Sin pagos registrados.</td></tr>`
          : pagos.map(renderPagoHistoryRow).join('');
    } catch (error) {
      if (openHistoryMemberId !== memberId) return;
      console.error('Error al cargar el historial del miembro:', error);
      historyCargosBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">No se pudo cargar el historial.</td></tr>`;
      historyPagosBody.innerHTML = '';
    }
  }

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
            <button data-member-id="${escapeHtml(member.id)}" class="member-history-button text-blue-600 hover:text-blue-800">Ver historial</button>
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

    if (target.classList.contains('member-history-button')) {
      const member = app.state.members.find((m) => m.id === memberId);
      await toggleHistoryPanel(memberId, member?.nickname ?? '');
      return;
    }

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
