import type { User } from '@supabase/supabase-js';
import { netPositionCents, sumAjustesOtorgados } from '../../lib/ajustes';
import type { AjusteReporteRow } from '../../lib/ajustes';
import type { CajaBreakdown } from '../../lib/caja';
import { setText } from '../../lib/escape';
import { formatMXN } from '../../lib/money';
import { fetchAjustesReporte, fetchApertura, fetchCaja, fetchPorCobrar, saveApertura } from './repo';

export interface CajaDeps {
  getCurrentUser: () => User | null;
}

export interface CajaApi {
  /** Called by the shell on every navigation to the caja view (mirrors `PagosApi.renderPagosForm`). */
  refresh: () => Promise<void>;
}

/**
 * Caja (cash-on-hand) admin view: the re-settable opening-amount control and
 * the derived-balance breakdown. Wired into `main.ts` nav by PR 4 (the
 * `#caja-content` markup lands there too) — this module owns the behavior only.
 * Admin-only writes are enforced at the DB by the `is_admin()` RLS policy, the
 * same gate as `configuracion_bancaria`.
 */
export function initCaja({ getCurrentUser }: CajaDeps): CajaApi {
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
  const cajaAjustesTotal = document.getElementById('caja-ajustes-total')!;
  const cajaAjustesDetalle = document.getElementById('caja-ajustes-detalle')!;
  const cajaPosicionNeta = document.getElementById('caja-posicion-neta')!;

  function showAperturaError(message: string): void {
    aperturaFeedback.textContent = message;
    aperturaFeedback.className = 'mt-3 text-sm text-red-600';
  }

  function showAperturaSuccess(message: string): void {
    aperturaFeedback.textContent = message;
    aperturaFeedback.className = 'mt-3 text-sm text-green-600';
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

  /**
   * The two figures that stay OUTSIDE the balance (design.md D6): "Ajustes
   * otorgados" groups the granted reductions by concept, and "Posición neta"
   * adds the receivable to the derived arca. Neither is a term of
   * `computeCaja`: `renderBreakdown` above still prints the balance untouched.
   */
  function renderAjustesReporte(
    rows: readonly AjusteReporteRow[],
    breakdown: CajaBreakdown,
    porCobrarCents: number,
  ): void {
    const { totalCents, porConcepto } = sumAjustesOtorgados(rows);

    setText(cajaAjustesTotal, formatMXN(totalCents));
    setText(
      cajaAjustesDetalle,
      porConcepto.length === 0
        ? 'Sin ajustes registrados.'
        : porConcepto
            .map((grupo) => `${grupo.conceptoNombre}: ${formatMXN(grupo.totalCents)}`)
            .join(' · '),
    );
    setText(cajaPosicionNeta, formatMXN(netPositionCents(breakdown.cajaCents, porCobrarCents)));
  }

  async function render(): Promise<void> {
    try {
      const [breakdown, apertura, porCobrarCents, ajustesRows] = await Promise.all([
        fetchCaja(),
        fetchApertura(),
        fetchPorCobrar(),
        fetchAjustesReporte(),
      ]);
      renderBreakdown(breakdown, porCobrarCents);
      renderAjustesReporte(ajustesRows, breakdown, porCobrarCents);
      aperturaMontoInput.value = apertura ? String(apertura.monto_apertura) : '';
    } catch (error) {
      console.error('Error al cargar la caja:', error);
      setText(cajaTotal, 'Error');
      cajaTotal.className = 'text-red-600';
      // A failed load must not leave the previous period's numbers on screen.
      setText(cajaAjustesTotal, '—');
      setText(cajaAjustesDetalle, '—');
      setText(cajaPosicionNeta, '—');
    }
  }

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

  return { refresh: render };
}
