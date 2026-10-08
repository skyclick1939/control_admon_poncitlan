import type { User } from '@supabase/supabase-js';
import type { App } from '../../app';
import { conceptosPresentes, matchesConceptoFiltro } from '../../lib/conceptos';
import { escapeHtml, setText } from '../../lib/escape';
import { miembrosSeleccionables } from '../../lib/miembros';
import { toCents, toPesos } from '../../lib/money';
import type { CargoConApoyo } from '../../lib/types';
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
  const deudaConceptoFilter = document.getElementById('deuda-concepto-filter') as HTMLSelectElement;
  const savePagoButton = document.getElementById('save-pago-button') as HTMLButtonElement;
  const pagoFeedback = document.getElementById('pago-feedback')!;
  const pagoMontoInput = document.getElementById('pago-monto') as HTMLInputElement;
  const pagoFechaInput = document.getElementById('pago-fecha') as HTMLInputElement;
  const pagoObservacionesInput = document.getElementById('pago-observaciones') as HTMLTextAreaElement;
  const pagoNaturaleza = document.getElementById('pago-naturaleza') as HTMLSelectElement;
  const pagoAjusteRouting = document.getElementById('pago-ajuste-routing')!;
  const pagoIrAjustes = document.getElementById('pago-ir-ajustes')!;

  /** Total pending debt (cents) for the currently selected member — kept in sync by `handleMemberSelectionForPayment`. Used to block an overpayment before it reaches the DB. */
  let currentTotalPendienteCents = 0;
  /** The selected member's pending cargos as last fetched. The concept filter runs over this list client-side, so filtering never issues a new query. */
  let cargosPendientes: CargoConApoyo[] = [];

  function renderPagosForm(): void {
    pagoMiembroSelect.innerHTML =
      '<option value="">-- Seleccione un miembro --</option>' +
      miembrosSeleccionables(app.state.members)
        .map((member) => `<option value="${member.id}">${escapeHtml(member.nickname)}</option>`)
        .join('');
    pagoForm.reset();
    // reset() clears the select but does not toggle the routing hint (design.md D8).
    syncAjusteRouting();
    pagoInfoDisplay.classList.add('view-hidden');
    deudaDisplay.classList.add('view-hidden');
    pagoFechaInput.valueAsDate = new Date();
    currentTotalPendienteCents = 0;
    cargosPendientes = [];
    populateConceptoFilter();
    renderDeudaTable();
  }

  /**
   * Fills the concept filter from the concepts actually present in the listed
   * cargos (never the whole catalog), with "all" first, and resets the
   * selection to "all". Called on every member change, so the filter can never
   * carry a concept that the newly selected member does not have.
   */
  function populateConceptoFilter(): void {
    const presentes = conceptosPresentes(
      cargosPendientes.map((cargo) => cargo.registro_apoyos.catalogo_conceptos?.nombre),
    );
    deudaConceptoFilter.innerHTML =
      '<option value="">Todos los conceptos</option>' +
      presentes
        .map((nombre) => `<option value="${escapeHtml(nombre)}">${escapeHtml(nombre)}</option>`)
        .join('');
    deudaConceptoFilter.value = '';
  }

  /**
   * Renders the debt table through the current concept filter. Purely local:
   * the predicate lives in `matchesConceptoFiltro` and is applied to the
   * already-fetched cargos, so no keystroke or selection reaches the network.
   */
  function renderDeudaTable(): void {
    const conceptoSeleccionado = deudaConceptoFilter.value || null;
    const visibles = cargosPendientes.filter((cargo) =>
      matchesConceptoFiltro(cargo.registro_apoyos.catalogo_conceptos?.nombre, conceptoSeleccionado),
    );

    if (visibles.length === 0) {
      deudaTableBody.innerHTML =
        cargosPendientes.length === 0
          ? `<tr><td colspan="3" class="text-green-500 text-center py-4">¡Este miembro no tiene adeudos!</td></tr>`
          : `<tr><td colspan="3" class="text-gray-500 text-center py-4">No hay adeudos pendientes con ese concepto.</td></tr>`;
      return;
    }

    deudaTableBody.innerHTML = visibles
      .map((cargo) => {
        const conceptoNombre = cargo.registro_apoyos.catalogo_conceptos?.nombre ?? '';
        return `
          <tr>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800">${escapeHtml(cargo.registro_apoyos.motivo)}${conceptoNombre ? `<span class="block text-xs text-gray-400">${escapeHtml(conceptoNombre)}</span>` : ''}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${new Date(cargo.registro_apoyos.fecha).toLocaleDateString()}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">$${toPesos(toCents(cargo.monto_pendiente)).toFixed(2)}</td>
          </tr>
        `;
      })
      .join('');
  }

  /**
   * The routing hint is visible ONLY while the selected naturaleza is
   * `'ajuste'` (design.md D8): the third option records nothing in this form,
   * so its only job is to point the operator at the Ajustes module.
   */
  function syncAjusteRouting(): void {
    pagoAjusteRouting.classList.toggle('view-hidden', pagoNaturaleza.value !== 'ajuste');
  }

  function validatePagoForm(): void {
    const monto = parseFloat(pagoMontoInput.value) || 0;
    const fecha = pagoFechaInput.value;
    const naturaleza = pagoNaturaleza.value;
    // An empty or `'ajuste'` naturaleza must never submit: the third option
    // records nothing here, so enabling the button would only produce a pago
    // the operator did not mean to create (design.md D8).
    savePagoButton.disabled = !(monto > 0 && fecha && naturaleza !== '' && naturaleza !== 'ajuste');
  }

  async function handleMemberSelectionForPayment(memberId: string): Promise<void> {
    if (!memberId) {
      pagoInfoDisplay.classList.add('view-hidden');
      deudaDisplay.classList.add('view-hidden');
      currentTotalPendienteCents = 0;
      cargosPendientes = [];
      populateConceptoFilter();
      renderDeudaTable();
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
      cargosPendientes = [];
      populateConceptoFilter();
      return;
    }

    cargosPendientes = cargos;
    currentTotalPendienteCents = cargos.reduce((sum, cargo) => sum + toCents(cargo.monto_pendiente), 0);
    setText(deudaTotal, `$${toPesos(currentTotalPendienteCents).toFixed(2)}`);

    populateConceptoFilter();
    renderDeudaTable();

    pagoInfoDisplay.classList.remove('view-hidden');
    deudaDisplay.classList.remove('view-hidden');
    pagoMontoInput.value = '';
    validatePagoForm();
  }

  async function handleSavePago(e: Event): Promise<void> {
    e.preventDefault();
    pagoFeedback.textContent = '';

    // The naturaleza guard runs BEFORE any read, write or `aplicarPago` call
    // (design.md D8): neither branch below can insert a `registro_pagos` row.
    const naturaleza = pagoNaturaleza.value;
    if (naturaleza === '') {
      pagoFeedback.textContent = 'Selecciona la naturaleza del cobro.';
      pagoFeedback.className = 'mt-2 text-sm text-red-600';
      validatePagoForm();
      return;
    }
    if (naturaleza === 'ajuste') {
      syncAjusteRouting();
      pagoFeedback.textContent =
        'Este cobro no entra al Arca ni se registra como pago. Regístralo en el módulo de Ajustes.';
      pagoFeedback.className = 'mt-2 text-sm text-amber-700';
      validatePagoForm();
      return;
    }

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
      syncAjusteRouting();
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
  deudaConceptoFilter.addEventListener('change', renderDeudaTable);
  pagoNaturaleza.addEventListener('change', () => {
    syncAjusteRouting();
    validatePagoForm();
  });
  pagoIrAjustes.addEventListener('click', () => {
    // The shell's `setupNavigation` listener performs the switch; this only
    // clicks the existing nav link, so no second router is introduced.
    document.querySelector<HTMLElement>('.nav-link[data-view="ajustes-content"]')?.click();
  });
  pagoForm.addEventListener('input', validatePagoForm);
  pagoForm.addEventListener('submit', handleSavePago);

  app.onRefresh(renderPagosForm);

  return { renderPagosForm };
}
