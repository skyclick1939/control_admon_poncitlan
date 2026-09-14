// ============================================================================
// src/public-view.ts — public, unauthenticated entry (design.md D1; tasks.md
// task 3.4). Imports lib/escape + lib/types ONLY, and MUST NEVER import
// lib/supabase.ts: that keeps supabase-js and the anon key out of this
// bundle entirely (D1's rationale — this page has no session and needs no
// client-side DB access, only a fetch() call to api/debt-view).
//
// Not unit-tested: this is a DOM-wiring entry script (same category as
// src/main.ts and features/admin/index.ts, neither of which has a test
// file) — it has an unconditional top-level side effect (`loadDebtView()`)
// that queries the live DOM, so importing it in a test would execute that
// side effect immediately. The one piece of security-critical logic here
// (escaping user-controlled text) is `lib/escape.ts`'s `escapeHtml`, already
// exhaustively unit-tested in Phase 1 (spec safe-rendering) and reused
// as-is below, never reimplemented.
// ============================================================================
import { escapeHtml, setText } from './lib/escape';
import type { DebtViewResponse } from './lib/types';

/**
 * Money.ts's `formatMXN` is deliberately NOT imported here — tasks.md 3.4
 * restricts this entry to `lib/escape`/`lib/types` only, so this tiny
 * formatter is duplicated inline rather than adding a third `lib/*` import.
 */
function formatCentsMXN(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

function renderDeudorRow(deudor: DebtViewResponse['deudores'][number]): string {
  return `
    <tr>
      <td class="px-4 py-2 text-sm text-gray-900">${escapeHtml(deudor.nickname)}</td>
      <td class="px-4 py-2 text-sm text-right text-red-600 font-medium">${formatCentsMXN(deudor.pendienteCents)}</td>
    </tr>`;
}

function renderBanco(banco: DebtViewResponse['banco']): string {
  if (!banco) {
    return '<p class="text-sm text-gray-500">Información bancaria no disponible por el momento.</p>';
  }
  return `
    <dl class="grid grid-cols-1 gap-2 text-sm">
      <div><dt class="font-medium text-gray-700">Banco</dt><dd>${escapeHtml(banco.banco)}</dd></div>
      <div><dt class="font-medium text-gray-700">CLABE</dt><dd class="font-mono">${escapeHtml(banco.clabe)}</dd></div>
      <div><dt class="font-medium text-gray-700">Titular</dt><dd>${escapeHtml(banco.titular)}</dd></div>
    </dl>`;
}

async function loadDebtView(): Promise<void> {
  const totalEl = document.getElementById('vista-total-pendiente')!;
  const deudoresBody = document.getElementById('vista-deudores-body')!;
  const bancoContainer = document.getElementById('vista-banco')!;
  const errorEl = document.getElementById('vista-error')!;
  const generatedAtEl = document.getElementById('vista-generated-at')!;

  try {
    const response = await fetch('/api/debt-view');
    if (!response.ok) throw new Error(`debt-view respondió ${response.status}`);
    const data = (await response.json()) as DebtViewResponse;

    setText(totalEl, formatCentsMXN(data.totalPendienteCents));
    deudoresBody.innerHTML = data.deudores.map(renderDeudorRow).join('');
    bancoContainer.innerHTML = renderBanco(data.banco);
    setText(generatedAtEl, new Date(data.generatedAt).toLocaleString('es-MX'));
  } catch (error) {
    console.error('No se pudo cargar la información pública de deuda:', error);
    errorEl.classList.remove('view-hidden');
  }
}

void loadDebtView();
