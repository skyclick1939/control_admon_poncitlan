import type { User } from '@supabase/supabase-js';
import type { CajaBreakdown } from '../../lib/caja';
import { escapeHtml, setText } from '../../lib/escape';
import { activeMiembros } from '../../lib/miembros';
import { formatMXN } from '../../lib/money';
import type { Miembro } from '../../lib/types';
import { fetchMembers } from '../miembros/repo';
import { fetchApertura, fetchCaja, fetchPorCobrar, saveApertura, saveEgreso } from './repo';

export interface CajaDeps {
  getCurrentUser: () => User | null;
}

export interface CajaApi {
  /** Called by the shell on every navigation to the caja view (mirrors `PagosApi.renderPagosForm`). */
  refresh: () => Promise<void>;
}

/**
 * Maps a selected member id to the persisted beneficiary pair, carrying the
 * `nickname` snapshot so the attribution survives member deletion (mirrors
 * `nombre_capturador`'s rationale). The empty string (the "no beneficiary"
 * option) or an unknown id yields both `null`. PURE.
 */
function beneficiaryFromSelection(
  memberId: string,
  members: readonly Miembro[],
): { beneficiarioId: string | null; nombreBeneficiario: string | null } {
  const member = members.find((m) => m.id === memberId);
  if (!member) return { beneficiarioId: null, nombreBeneficiario: null };
  return { beneficiarioId: member.id, nombreBeneficiario: member.nickname };
}

/**
 * Caja (cash-on-hand) admin view: egreso capture form, the re-settable
 * opening-amount control, and the derived-balance breakdown. Wired into
 * `main.ts` nav by PR 4 (the `#caja-content` markup lands there too) — this
 * module owns the behavior only. Admin-only writes are enforced at the DB by
 * the `is_admin()` RLS policy, the same gate as `configuracion_bancaria`.
 */
export function initCaja({ getCurrentUser }: CajaDeps): CajaApi {
  const egresoForm = document.getElementById('egreso-form') as HTMLFormElement;
  const egresoMontoInput = document.getElementById('egreso-monto') as HTMLInputElement;
  const egresoFechaInput = document.getElementById('egreso-fecha') as HTMLInputElement;
  const egresoMotivoInput = document.getElementById('egreso-motivo') as HTMLInputElement;
  const egresoBeneficiarioSelect = document.getElementById('egreso-beneficiario') as HTMLSelectElement;
  const egresoFeedback = document.getElementById('egreso-feedback')!;
  const saveEgresoButton = document.getElementById('save-egreso-button') as HTMLButtonElement;

  const aperturaForm = document.getElementById('apertura-form') as HTMLFormElement;
  const aperturaMontoInput = document.getElementById('apertura-monto') as HTMLInputElement;
  const aperturaFeedback = document.getElementById('apertura-feedback')!;
  const saveAperturaButton = document.getElementById('save-apertura-button') as HTMLButtonElement;

  const cajaOpening = document.getElementById('caja-opening')!;
  const cajaPagosTotal = document.getElementById('caja-pagos-total')!;
  const cajaApoyosTotal = document.getElementById('caja-apoyos-total')!;
  const cajaEgresosTotal = document.getElementById('caja-egresos-total')!;
  const cajaTotal = document.getElementById('caja-total')!;
  const cajaPorCobrar = document.getElementById('caja-por-cobrar')!;

  /** Active members (incl. internal ones) fetched on render, so the beneficiary selector stays current. */
  let beneficiarios: Miembro[] = [];

  function showEgresoError(message: string): void {
    egresoFeedback.textContent = message;
    egresoFeedback.className = 'mt-3 text-sm text-red-600';
  }

  function showEgresoSuccess(message: string): void {
    egresoFeedback.textContent = message;
    egresoFeedback.className = 'mt-3 text-sm text-green-600';
  }

  function showAperturaError(message: string): void {
    aperturaFeedback.textContent = message;
    aperturaFeedback.className = 'mt-3 text-sm text-red-600';
  }

  function showAperturaSuccess(message: string): void {
    aperturaFeedback.textContent = message;
    aperturaFeedback.className = 'mt-3 text-sm text-green-600';
  }

  function validateEgresoForm(): void {
    const monto = parseFloat(egresoMontoInput.value) || 0;
    saveEgresoButton.disabled = !(monto > 0 && egresoFechaInput.value && egresoMotivoInput.value.trim());
  }

  function renderBreakdown(breakdown: CajaBreakdown, porCobrarCents: number): void {
    setText(cajaOpening, formatMXN(breakdown.openingCents));
    setText(cajaPagosTotal, formatMXN(breakdown.pagosTotalCents));
    setText(cajaApoyosTotal, formatMXN(breakdown.apoyosTotalCents));
    setText(cajaEgresosTotal, formatMXN(breakdown.egresosTotalCents));
    setText(cajaTotal, formatMXN(breakdown.cajaCents));
    setText(cajaPorCobrar, formatMXN(porCobrarCents));
    // Negative caja renders red and unblocked — never hidden, clamped, or gated (spec: Negative Caja Is Allowed).
    cajaTotal.className = breakdown.cajaCents < 0 ? 'text-red-600' : 'text-gray-900';
  }

  /** Fills the beneficiary selector with active members (internal members included); leaves the "no beneficiary" option first. */
  async function populateBeneficiarios(): Promise<void> {
    try {
      beneficiarios = await fetchMembers();
      egresoBeneficiarioSelect.innerHTML =
        '<option value="">-- Sin beneficiario --</option>' +
        activeMiembros(beneficiarios)
          .map((member) => `<option value="${member.id}">${escapeHtml(member.nickname)}</option>`)
          .join('');
    } catch (error) {
      console.error('Error al cargar los beneficiarios:', error);
      // The "no beneficiary" option remains; egreso capture still works un-attributed.
    }
  }

  async function render(): Promise<void> {
    egresoForm.reset();
    egresoFechaInput.valueAsDate = new Date();
    validateEgresoForm();
    try {
      const [breakdown, apertura, porCobrarCents] = await Promise.all([
        fetchCaja(),
        fetchApertura(),
        fetchPorCobrar(),
      ]);
      renderBreakdown(breakdown, porCobrarCents);
      aperturaMontoInput.value = apertura ? String(apertura.monto_apertura) : '';
    } catch (error) {
      console.error('Error al cargar la caja:', error);
      setText(cajaTotal, 'Error');
      cajaTotal.className = 'text-red-600';
    }
    await populateBeneficiarios();
  }

  egresoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    egresoFeedback.textContent = '';
    saveEgresoButton.disabled = true;

    const currentUser = getCurrentUser();
    const montoPesos = parseFloat(egresoMontoInput.value);
    const fecha = egresoFechaInput.value;
    const motivo = egresoMotivoInput.value.trim();

    if (!currentUser) {
      saveEgresoButton.disabled = false;
      return;
    }

    try {
      const { beneficiarioId, nombreBeneficiario } = beneficiaryFromSelection(
        egresoBeneficiarioSelect.value,
        beneficiarios,
      );
      await saveEgreso({
        capturadoPorId: currentUser.id,
        nombreCapturador: currentUser.email ?? '',
        fecha,
        motivo,
        montoPesos,
        beneficiarioId,
        nombreBeneficiario,
      });
      showEgresoSuccess('Egreso registrado.');
      await render();
    } catch (error) {
      console.error('Error al guardar el egreso:', error);
      showEgresoError(`Error: ${(error as Error).message}`);
    } finally {
      validateEgresoForm();
    }
  });

  aperturaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    aperturaFeedback.textContent = '';
    saveAperturaButton.disabled = true;

    const currentUser = getCurrentUser();
    const montoAperturaPesos = parseFloat(aperturaMontoInput.value);

    if (!currentUser) {
      saveAperturaButton.disabled = false;
      return;
    }

    if (!Number.isFinite(montoAperturaPesos)) {
      showAperturaError('El monto de apertura debe ser un número válido.');
      saveAperturaButton.disabled = false;
      return;
    }

    try {
      await saveApertura({ montoAperturaPesos, updatedBy: currentUser.id });
      showAperturaSuccess('Monto de apertura actualizado.');
      await render();
    } catch (error) {
      console.error('Error al guardar la apertura:', error);
      showAperturaError(`Error: ${(error as Error).message}`);
    } finally {
      saveAperturaButton.disabled = false;
    }
  });

  egresoForm.addEventListener('input', validateEgresoForm);

  return { refresh: render };
}
