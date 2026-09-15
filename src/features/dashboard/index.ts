import { dbClient } from '../../lib/supabase';
import { escapeHtml, setText } from '../../lib/escape';
import { formatMXN, toPesos } from '../../lib/money';
import { aggregateDebtByMember, type CargoPendienteRow } from '../../lib/debt-view';
import type { RegistroApoyo, RegistroPago } from '../../lib/types';
import { fetchCaja } from '../caja/repo';
import { renderApoyosVsPagosChart } from './charts';

interface Deudor {
  nickname: string;
  total: number;
}

/** Mirrors the original `initializeDashboard`: fetches, aggregates, and renders the KPI cards, ranking table, and chart. */
export async function initializeDashboard(): Promise<void> {
  const kpiDeudaTotal = document.getElementById('kpi-deuda-total')!;
  const kpiApoyosTotal = document.getElementById('kpi-apoyos-total')!;
  const kpiPagosTotal = document.getElementById('kpi-pagos-total')!;
  const kpiMiembrosDeuda = document.getElementById('kpi-miembros-deuda')!;
  const kpiCaja = document.getElementById('kpi-caja')!;
  const deudoresTableContainer = document.getElementById('deudores-table-container')!;

  const [
    { data: cargosData, error: cargosError },
    { data: apoyosData, error: apoyosError },
    { data: pagosData, error: pagosError },
  ] = await Promise.all([
    dbClient.from('cargos').select('monto_pendiente, miembros(nickname, activo, status)').eq('estado', 'pendiente'),
    dbClient.from('registro_apoyos').select('monto_total'),
    dbClient.from('registro_pagos').select('monto_pagado'),
  ]);

  if (cargosError || apoyosError || pagosError) {
    console.error('Error fetching dashboard data', { cargosError, apoyosError, pagosError });
    return;
  }

  // Debt now flows through the SAME pure integer-cents aggregator the public
  // view and caja "Por cobrar" use (`aggregateDebtByMember` over
  // `estado='pendiente'` rows), so the admin ranking and the public ranking
  // report identical per-member figures. The internal-member
  // (`status='interno'`) and retired-member exclusions live inside the
  // aggregator — no separate filter here.
  const cargos = cargosData as unknown as CargoPendienteRow[];
  const apoyos: Pick<RegistroApoyo, 'monto_total'>[] = apoyosData;
  const pagos: Pick<RegistroPago, 'monto_pagado'>[] = pagosData;

  const { totalPendienteCents, deudores } = aggregateDebtByMember(cargos);

  const totalApoyos = apoyos.reduce((sum, item) => sum + item.monto_total, 0);
  const totalPagos = pagos.reduce((sum, item) => sum + item.monto_pagado, 0);
  const totalDeuda = toPesos(totalPendienteCents);
  const deudoresList: Deudor[] = deudores.map((deudor) => ({
    nickname: deudor.nickname,
    total: toPesos(deudor.pendienteCents),
  }));

  setText(kpiDeudaTotal, `$${totalDeuda.toFixed(2)}`);
  setText(kpiApoyosTotal, `$${totalApoyos.toFixed(2)}`);
  setText(kpiPagosTotal, `$${totalPagos.toFixed(2)}`);
  setText(kpiMiembrosDeuda, String(deudoresList.length));

  // 5th "Caja" KPI — derived balance via fetchCaja() (already cents) → formatMXN.
  // No raw arithmetic on this card; the three existing float sums are unchanged.
  try {
    const caja = await fetchCaja();
    setText(kpiCaja, formatMXN(caja.cajaCents));
    kpiCaja.className = caja.cajaCents < 0
      ? 'text-3xl font-bold text-red-600 mt-1'
      : 'text-3xl font-bold text-green-600 mt-1';
  } catch (error) {
    console.error('Error fetching caja KPI', error);
    setText(kpiCaja, '—');
  }

  renderDeudoresTable(deudoresTableContainer, deudoresList, totalDeuda);
  renderApoyosVsPagosChart(totalApoyos, totalPagos);
}

function renderDeudoresTable(container: HTMLElement, deudores: Deudor[], totalDeuda: number): void {
  const head = `<thead class="bg-gray-50">
      <tr>
        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Miembro</th>
        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deuda</th>
        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% de la Deuda Total</th>
      </tr>
    </thead>`;

  const body =
    deudores.length === 0
      ? `<tr><td colspan="3" class="text-center py-4 text-gray-500">No hay deudas pendientes. ¡Felicidades!</td></tr>`
      : deudores
          .map((deudor) => {
            const percentage = totalDeuda > 0 ? (deudor.total / totalDeuda) * 100 : 0;
            return `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(deudor.nickname)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-500">$${deudor.total.toFixed(2)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            <div class="w-full bg-gray-200 rounded-full h-2.5">
              <div class="bg-red-600 h-2.5 rounded-full" style="width: ${percentage.toFixed(2)}%"></div>
            </div>
            <span class="text-xs">${percentage.toFixed(1)}%</span>
          </td>
        </tr>
      `;
          })
          .join('');

  container.innerHTML = `<table class="min-w-full divide-y divide-gray-200">${head}<tbody class="bg-white divide-y divide-gray-200">${body}</tbody></table>`;
}
