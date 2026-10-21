// ============================================================================
// src/public-view.ts — public, unauthenticated entry (design.md D1; tasks.md
// task 3.4). Imports lib/escape + lib/types + lib/clipboard ONLY, and MUST
// NEVER import lib/supabase.ts: that keeps supabase-js and the anon key out
// of this bundle entirely (D1's rationale — this page has no session and
// needs no client-side DB access, only a fetch() call to api/debt-view).
//
// Not unit-tested: this is a DOM-wiring entry script (same category as
// src/main.ts and features/admin/index.ts, neither of which has a test
// file) — it has an unconditional top-level side effect (`loadDebtView()`)
// that queries the live DOM, so importing it in a test would execute that
// side effect immediately. The one piece of security-critical logic here
// (escaping user-controlled text) is `lib/escape.ts`'s `escapeHtml`, already
// exhaustively unit-tested in Phase 1 (spec safe-rendering) and reused
// as-is below, never reimplemented.
//
// The per-member breakdown (2026-10-21) is rendered from `DebtViewResponse`'s
// `desglose`. Every nickname, concept name and date is escaped; every money
// figure is already integer cents in the contract, so nothing is re-derived
// here.
// ============================================================================
import './style.css';
import { copyToClipboard } from './lib/clipboard';
import { escapeHtml, setText } from './lib/escape';
import type { DebtViewMiembro, DebtViewResponse } from './lib/types';

/**
 * Money.ts's `formatMXN` is deliberately NOT imported here — this entry keeps
 * a tiny inline formatter. The design (D1 amendment) permits `lib/clipboard.ts`
 * below because it has zero imports; `lib/money.ts` stays out to keep the
 * public bundle minimal.
 */
function formatCentsMXN(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

/** `fecha` arrives as a Postgres `date` (`YYYY-MM-DD`); noon avoids a TZ shift. */
function formatFecha(value: string): string {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return parsed.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderBanco(banco: DebtViewResponse['banco']): string {
  if (!banco) {
    return '<p class="text-sm text-gray-500">Información bancaria no disponible por el momento.</p>';
  }
  return `
    <dl class="grid grid-cols-1 gap-2 text-sm">
      <div><dt class="font-medium text-gray-700">Banco</dt><dd>${escapeHtml(banco.banco)}</dd></div>
      <div>
        <dt class="font-medium text-gray-700">CLABE</dt>
        <dd class="font-mono flex items-center gap-2">
          <span>${escapeHtml(banco.clabe)}</span>
          <button type="button" class="clabe-copy-button text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50" data-clabe="${escapeHtml(banco.clabe)}" aria-label="Copiar CLABE al portapapeles">Copiar</button>
          <span class="clabe-copy-feedback text-xs" role="status" aria-live="polite"></span>
        </dd>
      </div>
      <div><dt class="font-medium text-gray-700">Titular</dt><dd>${escapeHtml(banco.titular)}</dd></div>
    </dl>`;
}

const CLABE_COPY_SUCCESS = 'Copiado al portapapeles.';
const CLABE_COPY_FAILURE = 'No se pudo copiar; copia la CLABE manualmente.';

/** Delegated CLABE copy handler for `#vista-banco` (spec public-clabe-copy). */
function handleClabeCopy(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest('.clabe-copy-button');
  if (!button) return;

  const clabe = button.getAttribute('data-clabe');
  if (!clabe) return;

  const feedback = button.parentElement?.querySelector('.clabe-copy-feedback');
  if (!feedback) return;

  void copyToClipboard(clabe).then((succeeded) => {
    setText(feedback, succeeded ? CLABE_COPY_SUCCESS : CLABE_COPY_FAILURE);
    feedback.classList.toggle('text-green-600', succeeded);
    feedback.classList.toggle('text-red-600', !succeeded);
  });
}

/** Club-level pending by concept, largest first, with a proportional bar. */
function renderPorConcepto(items: DebtViewResponse['porConcepto']): string {
  if (items.length === 0) {
    return '<p class="text-sm text-gray-500">Sin adeudos pendientes.</p>';
  }

  const total = items.reduce((sum, item) => sum + item.pendienteCents, 0);

  return `<ul class="space-y-3">${items
    .map((item) => {
      const pct = total > 0 ? Math.round((item.pendienteCents / total) * 100) : 0;
      return `
        <li>
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="text-gray-800">${escapeHtml(item.concepto)}</span>
            <span class="text-gray-600 tabular-nums whitespace-nowrap">${formatCentsMXN(item.pendienteCents)} <span class="text-gray-400">· ${pct}%</span></span>
          </div>
          <div class="mt-1 h-2 w-full rounded-full bg-gray-100">
            <div class="h-2 rounded-full bg-red-500" style="width:${pct}%"></div>
          </div>
        </li>`;
    })
    .join('')}</ul>`;
}

function renderAdeudos(miembro: DebtViewMiembro): string {
  if (miembro.adeudos.length === 0) {
    return '<p class="text-sm text-gray-500">Sin adeudos registrados.</p>';
  }

  const rows = miembro.adeudos
    .map(
      (adeudo) => `
        <tr class="border-t border-gray-200">
          <td class="py-1.5 pr-3 text-gray-800">${escapeHtml(adeudo.concepto)}</td>
          <td class="hidden sm:table-cell py-1.5 pr-3 text-gray-500 whitespace-nowrap">${formatFecha(adeudo.fecha)}</td>
          <td class="hidden sm:table-cell py-1.5 pr-3 text-right text-gray-700 tabular-nums whitespace-nowrap">${formatCentsMXN(adeudo.originalCents)}</td>
          <td class="py-1.5 pr-3 text-right text-green-700 tabular-nums whitespace-nowrap">${formatCentsMXN(adeudo.cubiertoCents)}</td>
          <td class="py-1.5 text-right font-medium tabular-nums whitespace-nowrap ${adeudo.pendienteCents > 0 ? 'text-red-600' : 'text-gray-400'}">${formatCentsMXN(adeudo.pendienteCents)}</td>
        </tr>`,
    )
    .join('');

  return `
    <table class="min-w-full text-sm">
      <caption class="sr-only">Adeudos del miembro, del más antiguo al más reciente</caption>
      <thead>
        <tr>
          <th scope="col" class="py-1 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Concepto</th>
          <th scope="col" class="hidden sm:table-cell py-1 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
          <th scope="col" class="hidden sm:table-cell py-1 pr-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Original</th>
          <th scope="col" class="py-1 pr-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cubierto</th>
          <th scope="col" class="py-1 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderAbonos(miembro: DebtViewMiembro): string {
  if (miembro.abonos.length === 0) {
    return '<p class="text-sm text-gray-500">Sin abonos registrados.</p>';
  }

  const rows = miembro.abonos
    .map(
      (abono) => `
        <tr class="border-t border-gray-200">
          <td class="py-1.5 pr-3 text-gray-500 whitespace-nowrap">${formatFecha(abono.fecha)}</td>
          <td class="py-1.5 text-right text-gray-800 tabular-nums whitespace-nowrap">${formatCentsMXN(abono.montoCents)}</td>
        </tr>`,
    )
    .join('');

  return `
    <table class="min-w-full text-sm">
      <caption class="sr-only">Abonos registrados, del más antiguo al más reciente</caption>
      <thead>
        <tr>
          <th scope="col" class="py-1 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
          <th scope="col" class="py-1 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * The member-level reconciliation notes. `sinEfectivo` explains why the pending
 * balance can be lower than `original − abonado`; `noAplicado` reports money
 * recorded beyond the balance at the time, which the schema allows and which
 * must never be silently dropped.
 */
function renderNotas(miembro: DebtViewMiembro): string {
  const notes: string[] = [];

  if (miembro.sinEfectivoCents > 0) {
    notes.push(
      `Cubierto sin efectivo: <span class="tabular-nums">${formatCentsMXN(miembro.sinEfectivoCents)}</span> (condonaciones, cesiones o pagos de terceros).`,
    );
  }
  if (miembro.noAplicadoCents > 0) {
    notes.push(
      `Pago no aplicado a un adeudo: <span class="tabular-nums">${formatCentsMXN(miembro.noAplicadoCents)}</span>.`,
    );
  } else if (miembro.noAplicadoCents < 0) {
    notes.push(
      `Cubierto sin abono registrado: <span class="tabular-nums">${formatCentsMXN(-miembro.noAplicadoCents)}</span>.`,
    );
  }

  if (notes.length === 0) return '';
  return `<p class="mt-3 text-xs text-amber-700">${notes.join(' ')}</p>`;
}

function renderDetalle(miembro: DebtViewMiembro): string {
  // One column, always: the detail lives inside a table cell, so a side-by-side
  // layout at lg left ~430px per table and clipped the `Saldo` column.
  return `
    <div class="grid grid-cols-1 gap-6">
      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Adeudos</h3>
        <div class="overflow-x-auto">${renderAdeudos(miembro)}</div>
      </div>
      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Abonos registrados</h3>
        <div class="overflow-x-auto">${renderAbonos(miembro)}</div>
      </div>
    </div>
    ${renderNotas(miembro)}`;
}

function renderMiembro(miembro: DebtViewMiembro, index: number): string {
  const detalleId = `detalle-miembro-${index}`;
  const saldoClass = miembro.pendienteCents > 0 ? 'text-red-600' : 'text-gray-400';

  return `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2">
        <button type="button" class="btn-detalle w-full text-left text-sm font-medium text-gray-900 hover:text-blue-600" aria-expanded="false" aria-controls="${detalleId}" data-detalle="${detalleId}">
          <span class="inline-block w-3 text-gray-400" data-chevron aria-hidden="true">▸</span>${escapeHtml(miembro.nickname)}
        </button>
      </td>
      <td class="px-4 py-2 text-sm text-right text-green-700 tabular-nums whitespace-nowrap">${formatCentsMXN(miembro.abonadoCents)}</td>
      <td class="px-4 py-2 text-sm text-right font-medium tabular-nums whitespace-nowrap ${saldoClass}">${formatCentsMXN(miembro.pendienteCents)}</td>
    </tr>
    <tr id="${detalleId}" class="detalle detalle-oculto bg-gray-50">
      <td colspan="3" class="px-4 py-4 border-l-2 border-gray-200">${renderDetalle(miembro)}</td>
    </tr>`;
}

function renderDesglose(miembros: DebtViewResponse['desglose']): string {
  if (miembros.length === 0) {
    return '<tr><td colspan="3" class="px-4 py-6 text-center text-sm text-gray-500">Sin movimientos registrados.</td></tr>';
  }
  return miembros.map(renderMiembro).join('');
}

/** One delegated handler: expanding a member never re-fetches or re-renders. */
function handleDesgloseClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest('.btn-detalle');
  if (!(button instanceof HTMLElement)) return;

  const detalleId = button.getAttribute('data-detalle');
  if (!detalleId) return;

  const detalle = document.getElementById(detalleId);
  if (!detalle) return;

  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  // Class toggle, not `hidden`: see the layer-order note in vista/index.html.
  detalle.classList.toggle('detalle-oculto', expanded);

  const chevron = button.querySelector('[data-chevron]');
  if (chevron) chevron.textContent = expanded ? '▸' : '▾';
}

async function loadDebtView(): Promise<void> {
  const totalEl = document.getElementById('vista-total-pendiente')!;
  const cajaEl = document.getElementById('vista-caja')!;
  const totalAbonadoEl = document.getElementById('vista-total-abonado')!;
  const desgloseBody = document.getElementById('vista-desglose-body')!;
  const porConceptoContainer = document.getElementById('vista-por-concepto')!;
  const bancoContainer = document.getElementById('vista-banco')!;
  const errorEl = document.getElementById('vista-error')!;
  const generatedAtEl = document.getElementById('vista-generated-at')!;

  bancoContainer.addEventListener('click', handleClabeCopy);
  desgloseBody.addEventListener('click', handleDesgloseClick);
  document.getElementById('vista-imprimir')?.addEventListener('click', () => window.print());

  try {
    const response = await fetch('/api/debt-view');
    if (!response.ok) throw new Error(`debt-view respondió ${response.status}`);
    const data = (await response.json()) as DebtViewResponse;

    setText(totalEl, formatCentsMXN(data.totalPendienteCents));
    setText(cajaEl, formatCentsMXN(data.cajaCents));
    // Negative caja renders red and unblocked — never hidden, clamped, or gated (spec caja: Negative Caja Is Allowed).
    cajaEl.className = `text-2xl font-bold mt-1 ${data.cajaCents < 0 ? 'text-red-600' : 'text-green-600'}`;
    setText(totalAbonadoEl, formatCentsMXN(data.totalAbonadoCents));
    porConceptoContainer.innerHTML = renderPorConcepto(data.porConcepto);
    desgloseBody.innerHTML = renderDesglose(data.desglose);
    bancoContainer.innerHTML = renderBanco(data.banco);
    setText(generatedAtEl, new Date(data.generatedAt).toLocaleString('es-MX'));
  } catch (error) {
    console.error('No se pudo cargar la información pública de deuda:', error);
    errorEl.classList.remove('view-hidden');
  }
}

void loadDebtView();
