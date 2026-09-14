// ============================================================================
// src/member-view.ts — zero-session, token-scoped entry (design.md D11;
// tasks.md task 4.6). Imports lib/escape + lib/types ONLY, and MUST NEVER
// import lib/supabase.ts: that keeps supabase-js and the anon key out of
// this bundle entirely (D1's rationale, same as src/public-view.ts).
//
// Deviation from design.md's Module Boundaries listing (which also names
// lib/member-view.ts as an allowed import): that module's exports
// (summarizeMemberHistory, toMemberCargoEntries/toMemberPagoEntries) exist
// to compute MemberViewResponse server-side in api/member-view.ts. The
// response this entry receives is already fully computed and field-excluded
// (D13), so there is nothing left to reuse here — importing it unused would
// fail this project's strict `noUnusedLocals` build. Mirrors public-view.ts's
// own precedent of not importing lib/money.ts despite formatting cents.
//
// Not unit-tested: same category as src/public-view.ts — a DOM-wiring entry
// script with an unconditional top-level side effect (`loadMemberView()`).
// The security-critical logic (escaping) is lib/escape.ts's `escapeHtml`,
// already exhaustively unit-tested and reused as-is below.
//
// The token is read only to build the request URL. It is never written back
// into the DOM (spec member-private-view) and this page never links
// same-origin except to /vista/, whose no-referrer meta tag (mi-cuenta's own
// page also carries no-referrer) keeps it out of any request log.
// ============================================================================
import { escapeHtml, setText } from './lib/escape';
import type { MemberViewResponse } from './lib/types';

function formatCentsMXN(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

function renderCargoRow(cargo: MemberViewResponse['cargos'][number]): string {
  return `
    <tr>
      <td class="px-4 py-2 text-sm text-gray-900">${escapeHtml(cargo.fecha)}</td>
      <td class="px-4 py-2 text-sm text-gray-900 capitalize">${escapeHtml(cargo.estado)}</td>
      <td class="px-4 py-2 text-sm text-right text-gray-900">${formatCentsMXN(cargo.originalCents)}</td>
      <td class="px-4 py-2 text-sm text-right text-red-600 font-medium">${formatCentsMXN(cargo.pendienteCents)}</td>
    </tr>`;
}

function renderPagoRow(pago: MemberViewResponse['pagos'][number]): string {
  return `
    <tr>
      <td class="px-4 py-2 text-sm text-gray-900">${escapeHtml(pago.fecha)}</td>
      <td class="px-4 py-2 text-sm text-right text-green-600 font-medium">${formatCentsMXN(pago.montoCents)}</td>
    </tr>`;
}

async function loadMemberView(): Promise<void> {
  const errorEl = document.getElementById('mi-cuenta-error')!;
  const contentEl = document.getElementById('mi-cuenta-content')!;
  const nicknameEl = document.getElementById('mi-cuenta-nickname')!;
  const generatedAtEl = document.getElementById('mi-cuenta-generated-at')!;
  const totalPendienteEl = document.getElementById('mi-cuenta-total-pendiente')!;
  const totalPagadoEl = document.getElementById('mi-cuenta-total-pagado')!;
  const cargosBody = document.getElementById('mi-cuenta-cargos-body')!;
  const pagosBody = document.getElementById('mi-cuenta-pagos-body')!;

  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  try {
    const response = await fetch(`/api/member-view?token=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error(`member-view respondió ${response.status}`);
    const data = (await response.json()) as MemberViewResponse;

    setText(nicknameEl, data.nickname);
    setText(generatedAtEl, new Date(data.generatedAt).toLocaleString('es-MX'));
    setText(totalPendienteEl, formatCentsMXN(data.totalPendienteCents));
    setText(totalPagadoEl, formatCentsMXN(data.totalPagadoCents));
    cargosBody.innerHTML = data.cargos.map(renderCargoRow).join('');
    pagosBody.innerHTML = data.pagos.map(renderPagoRow).join('');
    contentEl.classList.remove('view-hidden');
  } catch (error) {
    console.error('No se pudo cargar la cuenta del miembro:', error);
    errorEl.classList.remove('view-hidden');
  }
}

void loadMemberView();
