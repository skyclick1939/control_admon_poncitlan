import type { User } from '@supabase/supabase-js';
import type { App } from '../../app';
import { escapeHtml, setText } from '../../lib/escape';
import { toCents, toPesos } from '../../lib/money';
import { aplicarPago, fetchCargosPendientes } from './repo';

export interface PagosDeps {
  app: App;
  getCurrentUser: () => User | null;
}

export interface PagosApi {
  /** Called by the shell on every navigation to the pagos view (mirrors the original's per-view `initializePagosModule()` call). */
  renderPagosForm: () => void;
}

/** Mirrors the original registro-de-pagos module (initializePagosModule, handleMemberSelectionForPayment, handleSavePago). */
export function initPagos({ app, getCurrentUser }: PagosDeps): PagosApi {
  const pagoForm = document.getElementById('pago-form') as HTMLFormElement;
  const pagoMiembroSelect = document.getElementById('pago-miembro-select') as HTMLSelectElement;
  const pagoInfoDisplay = document.getElementById('pago-info-display')!;
  const deudaDisplay = document.getElementById('deuda-display')!;
  const deudaNickname = document.getElementById('deuda-nickname')!;
  const deudaTotal = document.getElementById('deuda-total')!;
  const deudaTableBody = document.getElementById('deuda-table-body')!;
  const savePagoButton = document.getElementById('save-pago-button') as HTMLButtonElement;
  const pagoFeedback = document.getElementById('pago-feedback')!;
  const pagoMontoInput = document.getElementById('pago-monto') as HTMLInputElement;
  const pagoFechaInput = document.getElementById('pago-fecha') as HTMLInputElement;
  const pagoObservacionesInput = document.getElementById('pago-observaciones') as HTMLTextAreaElement;

  /** Total pending debt (cents) for the currently selected member — kept in sync by `handleMemberSelectionForPayment`. Used to block an overpayment before it reaches the DB. */
  let currentTotalPendienteCents = 0;

  function renderPagosForm(): void {
    pagoMiembroSelect.innerHTML =
      '<option value="">-- Seleccione un miembro --</option>' +
      app.state.members.map((member) => `<option value="${member.id}">${escapeHtml(member.nickname)}</option>`).join('');
    pagoForm.reset();
    pagoInfoDisplay.classList.add('view-hidden');
    deudaDisplay.classList.add('view-hidden');
    pagoFechaInput.valueAsDate = new Date();
    currentTotalPendienteCents = 0;
  }

  function validatePagoForm(): void {
    const monto = parseFloat(pagoMontoInput.value) || 0;
    const fecha = pagoFechaInput.value;
    savePagoButton.disabled = !(monto > 0 && fecha);
  }

  async function handleMemberSelectionForPayment(memberId: string): Promise<void> {
    if (!memberId) {
      pagoInfoDisplay.classList.add('view-hidden');
      deudaDisplay.classList.add('view-hidden');
      currentTotalPendienteCents = 0;
      return;
    }

    const selectedMember = app.state.members.find((m) => m.id === memberId);
    setText(deudaNickname, selectedMember?.nickname ?? '');

    let cargos;
    try {
      cargos = await fetchCargosPendientes(memberId);
    } catch (error) {
      console.error('Error al cargar cargos del miembro:', error);
      setText(deudaTotal, 'Error');
      deudaTableBody.innerHTML = `<tr><td colspan="3" class="text-red-500 text-center py-4">No se pudo cargar la deuda.</td></tr>`;
      currentTotalPendienteCents = 0;
      return;
    }

    currentTotalPendienteCents = cargos.reduce((sum, cargo) => sum + toCents(cargo.monto_pendiente), 0);
    setText(deudaTotal, `$${toPesos(currentTotalPendienteCents).toFixed(2)}`);

    deudaTableBody.innerHTML =
      cargos.length === 0
        ? `<tr><td colspan="3" class="text-green-500 text-center py-4">¡Este miembro no tiene adeudos!</td></tr>`
        : cargos
            .map(
              (cargo) => `
          <tr>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800">${escapeHtml(cargo.registro_apoyos.motivo)}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${new Date(cargo.registro_apoyos.fecha).toLocaleDateString()}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">$${toPesos(toCents(cargo.monto_pendiente)).toFixed(2)}</td>
          </tr>
        `,
            )
            .join('');

    pagoInfoDisplay.classList.remove('view-hidden');
    deudaDisplay.classList.remove('view-hidden');
    pagoMontoInput.value = '';
    validatePagoForm();
  }

  async function handleSavePago(e: Event): Promise<void> {
    e.preventDefault();
    pagoFeedback.textContent = '';
    savePagoButton.disabled = true;

    const currentUser = getCurrentUser();
    const miembroId = pagoMiembroSelect.value;
    const montoPagadoPesos = parseFloat(pagoMontoInput.value);
    const fechaPago = pagoFechaInput.value;
    const observaciones = pagoObservacionesInput.value.trim();

    if (!currentUser) {
      savePagoButton.disabled = false;
      return;
    }

    const montoPagadoCents = toCents(montoPagadoPesos);
    if (montoPagadoCents > currentTotalPendienteCents) {
      pagoFeedback.textContent = `El pago ($${toPesos(montoPagadoCents).toFixed(2)}) excede la deuda pendiente ($${toPesos(currentTotalPendienteCents).toFixed(2)}). Ajusta el monto antes de guardar.`;
      pagoFeedback.className = 'mt-2 text-sm text-red-600';
      validatePagoForm();
      return;
    }

    try {
      const { unappliedCents } = await aplicarPago({
        miembroId,
        montoPagadoPesos,
        fechaPago,
        observaciones,
        registradoPorId: currentUser.id,
      });

      if (unappliedCents > 0) {
        pagoFeedback.textContent = `Pago registrado, pero $${toPesos(unappliedCents).toFixed(2)} no se aplicaron a ningún cargo pendiente.`;
        pagoFeedback.className = 'mt-2 text-sm text-yellow-700';
      } else {
        pagoFeedback.textContent = '¡Pago registrado y aplicado con éxito!';
        pagoFeedback.className = 'mt-2 text-sm text-green-600';
      }

      pagoForm.reset();
      pagoFechaInput.valueAsDate = new Date();
      await handleMemberSelectionForPayment(miembroId);
    } catch (error) {
      console.error('Error al guardar el pago:', error);
      pagoFeedback.textContent = `Error: ${(error as Error).message}`;
      pagoFeedback.className = 'mt-2 text-sm text-red-600';
    } finally {
      validatePagoForm();
    }
  }

  pagoMiembroSelect.addEventListener('change', (e) => {
    void handleMemberSelectionForPayment((e.target as HTMLSelectElement).value);
  });
  pagoForm.addEventListener('input', validatePagoForm);
  pagoForm.addEventListener('submit', handleSavePago);

  app.onRefresh(renderPagosForm);

  return { renderPagosForm };
}
