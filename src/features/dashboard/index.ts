import { dbClient } from '../../lib/supabase';
import { escapeHtml, setText } from '../../lib/escape';
import { formatMXN } from '../../lib/money';
import type { CargoConMiembro, RegistroApoyo, RegistroPago } from '../../lib/types';
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
    dbClient.from('cargos').select('miembro_id, monto_pendiente, miembros(nickname)'),
    dbClient.from('registro_apoyos').select('monto_total'),
    dbClient.from('registro_pagos').select('monto_pagado'),
  ]);

  if (cargosError || apoyosError || pagosError) {
    console.error('Error fetching dashboard data', { cargosError, apoyosError, pagosError });
    return;
  }

  // The untyped supabase-js client heuristically infers `miembros` as an array from the
  // plural table name; at runtime (and per PostgREST's many-to-one embed rules for
  // cargos.miembro_id -> miembros.id) it is a single object, matching the original code's
  // `cargo.miembros.nickname` access.
  const cargos = cargosData as unknown as CargoConMiembro[];
  const apoyos: Pick<RegistroApoyo, 'monto_total'>[] = apoyosData;
  const pagos: Pick<RegistroPago, 'monto_pagado'>[] = pagosData;

  const totalApoyos = apoyos.reduce((sum, item) => sum + item.monto_total, 0);
  const totalPagos = pagos.reduce((sum, item) => sum + item.monto_pagado, 0);
  const totalDeuda = cargos.reduce((sum, item) => sum + item.monto_pendiente, 0);

  const deudasPorMiembro = cargos.reduce<Record<string, Deudor>>((acc, cargo) => {
    if (cargo.miembros && cargo.monto_pendiente > 0.01) {
      const existing = acc[cargo.miembro_id] ?? { nickname: cargo.miembros.nickname, total: 0 };
      existing.total += cargo.monto_pendiente;
      acc[cargo.miembro_id] = existing;
    }
    return acc;
  }, {});

  const deudoresList = Object.values(deudasPorMiembro).sort((a, b) => b.total - a.total);

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
