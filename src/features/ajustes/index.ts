/**
 * The adjustments capture module for the `ajustes-y-clasificacion` change: the
 * operator-facing form for a debt reduction that is NOT cash (forgiveness,
 * direct payment to a third party, or a cession) plus the recents list where a
 * recorded group is reversed.
 *
 * All planning lives in `src/lib/ajustes.ts` and all persistence in `./repo.ts`
 * (the single writer). This module only reads the DOM, keeps the selectors in
 * sync and reports what the plan would do — so none of it can invent a
 * different allocation than the writer applies.
 */

import type { User } from '@supabase/supabase-js';
import type { App } from '../../app';
import type { AjusteTipo } from '../../lib/ajustes';
import { planAjuste } from '../../lib/ajustes';
import type { Concepto } from '../../lib/conceptos';
import { resolveConcepto } from '../../lib/conceptos';
import { escapeHtml, setText } from '../../lib/escape';
import { activeMiembros } from '../../lib/miembros';
import type { Charge } from '../../lib/money';
import { formatMXN, toCents } from '../../lib/money';
import type { AjusteRegistro, CargoAjustable, RegistrarAjusteInput } from './repo';
import {
  fetchAjustesRecientes,
  fetchCargosAjustables,
  fetchConceptos,
  registrarAjuste,
  revertirAjuste,
} from './repo';

export interface AjustesDeps {
  app: App;
  getCurrentUser: () => User | null;
}

export interface AjustesApi {
  /** Called by the shell on every navigation to the ajustes view (mirrors `CajaApi.refresh`). */
  refresh: () => Promise<void>;
}

/** Spanish labels for the ledger's four types (spec ajustes-adeudo). */
const TIPO_LABEL: Record<AjusteTipo, string> = {
  condonacion: 'Condonación',
  pago_tercero: 'Pago a tercero',
  cesion: 'Cesión',
  reversa: 'Reversa',
};

/** Only the three types the capture form creates; a `reversa` is produced by its own action. */
type TipoCapturable = 'condonacion' | 'pago_tercero' | 'cesion';

/** The cargo selector's default option, restored whenever the cargo list is rebuilt. */
const CARGO_FIFO_OPTION = '<option value="">El más antiguo primero (FIFO)</option>';

/** The miembro/contraparte selectors' shared placeholder. */
const MIEMBRO_PLACEHOLDER = '<option value="">-- Seleccione un miembro --</option>';

/** One operator action: every ledger row sharing a `grupo_id`. */
interface GrupoAjuste {
  readonly grupoId: string;
  readonly tipo: AjusteTipo;
  /** The newest `created_at` in the group; the group is ordered by this. */
  fecha: string;
  readonly rows: AjusteRegistro[];
}

/**
 * Resolves a required element by id, throwing when the markup drifts. Called
 * once at init so a renamed or dropped id fails loudly during app boot instead
 * of silently disabling the module.
 */
function mustGetById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`El módulo de Ajustes no encontró el elemento #${id} en index.html.`);
  }
  return element as T;
}

export function initAjustes({ app, getCurrentUser }: AjustesDeps): AjustesApi {
  const ajusteForm = mustGetById<HTMLFormElement>('ajuste-form');
  const ajusteTipoSelect = mustGetById<HTMLSelectElement>('ajuste-tipo');
  const ajusteMiembroSelect = mustGetById<HTMLSelectElement>('ajuste-miembro-select');
  const ajusteContraparteWrap = mustGetById<HTMLDivElement>('ajuste-contraparte-wrap');
  const ajusteContraparteSelect = mustGetById<HTMLSelectElement>('ajuste-contraparte-select');
  const ajusteMontoInput = mustGetById<HTMLInputElement>('ajuste-monto');
  const ajusteCargoTargetSelect = mustGetById<HTMLSelectElement>('ajuste-cargo-target');
  const ajusteConceptoInput = mustGetById<HTMLInputElement>('ajuste-concepto');
  const ajusteConceptoOptions = mustGetById<HTMLDataListElement>('ajuste-concepto-options');
  const ajusteObservacionesInput = mustGetById<HTMLTextAreaElement>('ajuste-observaciones');
  const ajustePreview = mustGetById<HTMLDivElement>('ajuste-preview');
  const ajusteFeedback = mustGetById<HTMLDivElement>('ajuste-feedback');
  const saveAjusteButton = mustGetById<HTMLButtonElement>('save-ajuste-button');
  const ajustesRecientesBody = mustGetById<HTMLTableSectionElement>('ajustes-recientes-body');

  /** The catalog as last read. The concept is only a label here: it creates no debt. */
  let conceptos: Concepto[] = [];
  /** The selected member's pending cargos, oldest first (the order the planner follows). */
  let cargosAjustables: CargoAjustable[] = [];

  function showFeedback(message: string, tone: 'green' | 'yellow' | 'red'): void {
    setText(ajusteFeedback, message);
    const color = tone === 'green' ? 'text-green-600' : tone === 'yellow' ? 'text-yellow-700' : 'text-red-600';
    ajusteFeedback.className = `text-sm ${color}`;
  }

  function clearFeedbackAndPreview(): void {
    setText(ajusteFeedback, '');
    ajusteFeedback.className = 'text-sm';
    setText(ajustePreview, '');
  }

  /** Fills both member selectors with active members, placeholder first. */
  function populateMemberSelects(): void {
    const options = activeMiembros(app.state.members)
      .map((member) => `<option value="${member.id}">${escapeHtml(member.nickname)}</option>`)
      .join('');
    ajusteMiembroSelect.innerHTML = MIEMBRO_PLACEHOLDER + options;
    ajusteContraparteSelect.innerHTML = MIEMBRO_PLACEHOLDER + options;
  }

  /** Rebuilds the target selector: the FIFO default first, then one option per pending cargo. */
  function setCargoOptions(cargos: readonly CargoAjustable[]): void {
    ajusteCargoTargetSelect.innerHTML =
      CARGO_FIFO_OPTION +
      cargos
        .map((cargo) => {
          const motivo = cargo.registro_apoyos?.motivo ?? 'Cargo sin motivo';
          const pendiente = formatMXN(toCents(cargo.monto_pendiente));
          return `<option value="${cargo.id}">${escapeHtml(motivo)} — ${pendiente}</option>`;
        })
        .join('');
  }

  /** The counterpart only exists for a cession; every other type has none (design.md D5). */
  function syncContraparteVisibility(): void {
    ajusteContraparteWrap.classList.toggle('view-hidden', ajusteTipoSelect.value !== 'cesion');
  }

  /**
   * Shows what the current inputs would move, using the SAME `planAjuste` the
   * writer uses. `setText` only: the strings carry operator-typed money and are
   * never parsed as markup.
   */
  function updatePreview(): void {
    const monto = parseFloat(ajusteMontoInput.value);
    const montoCents = Number.isFinite(monto) ? toCents(monto) : 0;
    const target = ajusteCargoTargetSelect.value || null;
    const charges: Charge[] = cargosAjustables.map((cargo) => ({
      id: cargo.id,
      pendingCents: toCents(cargo.monto_pendiente),
    }));

    const plan = planAjuste(montoCents, charges, target);

    if (plan.appliedCents === 0) {
      setText(ajustePreview, 'No hay adeudo pendiente que ajustar con ese monto.');
      return;
    }

    let texto = `Se aplicará ${formatMXN(plan.appliedCents)}`;
    if (plan.unappliedCents > 0) {
      texto += `; quedará sin aplicar ${formatMXN(plan.unappliedCents)}.`;
    }
    setText(ajustePreview, texto);
  }

  /** Reads the selector into the three capturable types, or null when the value is not one of them. */
  function readTipoCapturable(): TipoCapturable | null {
    const value = ajusteTipoSelect.value;
    return value === 'condonacion' || value === 'pago_tercero' || value === 'cesion' ? value : null;
  }

  async function loadConceptos(): Promise<void> {
    try {
      conceptos = await fetchConceptos();
    } catch (error) {
      console.error('Error al cargar el catálogo de conceptos:', error);
      conceptos = [];
    }

    // Every nature is offered: the adjustment's concept is a label, not a debt.
    ajusteConceptoOptions.innerHTML = conceptos
      .filter((concepto) => concepto.activo)
      .map((concepto) => `<option value="${escapeHtml(concepto.nombre)}"></option>`)
      .join('');
  }

  async function loadCargosAjustables(): Promise<void> {
    const miembroId = ajusteMiembroSelect.value;
    if (!miembroId) {
      cargosAjustables = [];
      setCargoOptions(cargosAjustables);
      updatePreview();
      return;
    }

    try {
      cargosAjustables = await fetchCargosAjustables(miembroId);
    } catch (error) {
      console.error('Error al cargar los cargos del miembro:', error);
      cargosAjustables = [];
    }

    setCargoOptions(cargosAjustables);
    updatePreview();
  }

  /** Maps a member id to its nickname, falling back to the id when the member is unknown. */
  function memberLabel(miembroId: string): string {
    return app.state.members.find((member) => member.id === miembroId)?.nickname ?? miembroId;
  }

  /** Groups the fetched ledger rows by `grupo_id`, keeping the newest `created_at` per group. */
  function groupAdjustments(rows: readonly AjusteRegistro[]): GrupoAjuste[] {
    const porGrupo = new Map<string, GrupoAjuste>();

    for (const row of rows) {
      const grupo = porGrupo.get(row.grupo_id);
      if (!grupo) {
        porGrupo.set(row.grupo_id, {
          grupoId: row.grupo_id,
          tipo: row.tipo,
          fecha: row.created_at,
          rows: [row],
        });
        continue;
      }
      grupo.rows.push(row);
      if (new Date(row.created_at).getTime() > new Date(grupo.fecha).getTime()) {
        grupo.fecha = row.created_at;
      }
    }

    return [...porGrupo.values()];
  }

  /** The distinct nicknames of the group's rows, in first-seen order. */
  function groupMemberNames(grupo: GrupoAjuste): string {
    const nombres: string[] = [];
    const vistos = new Set<string>();

    for (const row of grupo.rows) {
      if (vistos.has(row.miembro_id)) continue;
      vistos.add(row.miembro_id);
      nombres.push(memberLabel(row.miembro_id));
    }

    return nombres.join(', ');
  }

  /** One `<tr>` per adjustment group. Every interpolated value is escaped. */
  function renderGroupRow(grupo: GrupoAjuste, revertidos: ReadonlySet<string>): string {
    const primeraFila = grupo.rows[0];
    const concepto = primeraFila.catalogo_conceptos?.nombre ?? '';
    const observaciones = primeraFila.observaciones ?? '';

    // The group's reduction is the magnitude of its negative deltas; a cession's
    // positive receiving row is a mirror, not a second grant. A reversal is a
    // correction, not a grant, so its amount column shows a dash instead of a
    // figure that would read like one.
    const reduccionCents = grupo.rows
      .filter((row) => row.monto < 0)
      .reduce((total, row) => total + toCents(-row.monto), 0);
    const montoTexto = grupo.tipo === 'reversa' ? '—' : formatMXN(reduccionCents);

    const puedeRevertir = grupo.tipo !== 'reversa' && !revertidos.has(grupo.grupoId);
    const acciones = puedeRevertir
      ? `<button data-grupo-id="${escapeHtml(grupo.grupoId)}" class="ajuste-revertir-button text-red-600 hover:text-red-800">Revertir</button>`
      : '—';

    return `
      <tr>
        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${escapeHtml(new Date(grupo.fecha).toLocaleDateString())}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-800">${escapeHtml(TIPO_LABEL[grupo.tipo])}</td>
        <td class="px-4 py-3 text-sm text-gray-800">${escapeHtml(groupMemberNames(grupo))}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(montoTexto)}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${escapeHtml(concepto)}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${escapeHtml(observaciones)}</td>
        <td class="px-4 py-3 whitespace-nowrap text-sm">${acciones}</td>
      </tr>`;
  }

  async function renderRecientes(): Promise<void> {
    let rows: AjusteRegistro[];
    try {
      rows = await fetchAjustesRecientes();
    } catch (error) {
      console.error('Error al cargar los ajustes recientes:', error);
      ajustesRecientesBody.innerHTML =
        '<tr><td colspan="7" class="px-4 py-3 text-center text-sm text-red-600">No se pudieron cargar los ajustes recientes.</td></tr>';
      return;
    }

    if (rows.length === 0) {
      ajustesRecientesBody.innerHTML =
        '<tr><td colspan="7" class="px-4 py-3 text-center text-sm text-gray-500">Sin ajustes registrados.</td></tr>';
      return;
    }

    // A group already corrected by a reversal is not reversible again, and a
    // reversal is itself never reversible.
    const revertidos = new Set(
      rows
        .filter((row) => row.tipo === 'reversa' && row.grupo_revertido !== null)
        .map((row) => row.grupo_revertido as string),
    );

    ajustesRecientesBody.innerHTML = groupAdjustments(rows)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .map((grupo) => renderGroupRow(grupo, revertidos))
      .join('');
  }

  async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    clearFeedbackAndPreview();

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const tipo = readTipoCapturable();
    const miembroId = ajusteMiembroSelect.value;
    const contraparteId = ajusteContraparteSelect.value;
    const montoPesos = parseFloat(ajusteMontoInput.value);
    const cargoObjetivoId = ajusteCargoTargetSelect.value || null;
    const observaciones = ajusteObservacionesInput.value.trim();
    const conceptoTexto = ajusteConceptoInput.value.trim();

    if (!tipo) {
      showFeedback('Selecciona un tipo de ajuste.', 'red');
      return;
    }
    if (!miembroId) {
      showFeedback('Selecciona el miembro cuyo adeudo se va a ajustar.', 'red');
      return;
    }
    if (!Number.isFinite(montoPesos) || montoPesos <= 0) {
      showFeedback('El monto debe ser un número mayor a cero.', 'red');
      return;
    }
    if (tipo === 'cesion') {
      if (!contraparteId) {
        showFeedback('Selecciona el miembro que recibe el adeudo.', 'red');
        return;
      }
      if (contraparteId === miembroId) {
        showFeedback('Una cesión necesita dos miembros distintos.', 'red');
        return;
      }
    }

    // The concept is optional; when typed it must resolve to an ACTIVE catalog concept.
    let conceptoId: string | null = null;
    if (conceptoTexto !== '') {
      const concepto = resolveConcepto(conceptos, conceptoTexto);
      if (!concepto) {
        showFeedback('El concepto no existe en el catálogo.', 'red');
        return;
      }
      conceptoId = concepto.id;
    }

    const base = {
      montoPesos,
      cargoObjetivoId,
      registradoPorId: currentUser.id,
      nombreRegistrador: currentUser.email ?? 'Administrador',
      conceptoId,
      observaciones,
    };
    const input: RegistrarAjusteInput =
      tipo === 'cesion'
        ? { ...base, tipo, cedenteId: miembroId, receptorId: contraparteId }
        : { ...base, tipo, miembroId };

    saveAjusteButton.disabled = true;
    try {
      const { appliedCents, unappliedCents } = await registrarAjuste(input);
      await refresh();
      if (unappliedCents > 0) {
        showFeedback(
          `¡Ajuste registrado con éxito! Solo se aplicaron ${formatMXN(appliedCents)}; ${formatMXN(unappliedCents)} quedaron sin aplicar porque el adeudo pendiente era menor.`,
          'yellow',
        );
      } else {
        showFeedback('¡Ajuste registrado con éxito!', 'green');
      }
    } catch (error) {
      console.error('Error al registrar el ajuste:', error);
      showFeedback(`Error: ${(error as Error).message}`, 'red');
    } finally {
      saveAjusteButton.disabled = false;
    }
  }

  async function handleRevertir(grupoId: string): Promise<void> {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    // A cancellation is not a reversal: without a reason there is no correction to record.
    const motivo = window.prompt('Motivo de la reversa:');
    if (motivo === null) return;

    const confirmado = window.confirm(
      'La reversa restaura los cargos a su valor anterior y no borra el ajuste original. ¿Deseas continuar?',
    );
    if (!confirmado) return;

    try {
      await revertirAjuste({
        grupoId,
        registradoPorId: currentUser.id,
        nombreRegistrador: currentUser.email ?? 'Administrador',
        observaciones: motivo,
      });
      await refresh();
      showFeedback('Reversa registrada: el ajuste original se conserva como antecedente.', 'green');
    } catch (error) {
      console.error('Error al revertir el ajuste:', error);
      showFeedback(`Error: ${(error as Error).message}`, 'red');
    }
  }

  /**
   * Repopulates the selectors and the recents list from the current app state.
   * The shell already calls this on navigation (and the submit handler calls it
   * after a write), so the module registers no `onRefresh` listener: a second
   * refresh path would only duplicate work.
   */
  async function refresh(): Promise<void> {
    populateMemberSelects();
    ajusteForm.reset();
    cargosAjustables = [];
    setCargoOptions(cargosAjustables);
    syncContraparteVisibility();
    clearFeedbackAndPreview();

    await Promise.all([loadConceptos(), renderRecientes()]);
  }

  ajusteTipoSelect.addEventListener('change', () => {
    syncContraparteVisibility();
    updatePreview();
  });
  ajusteMiembroSelect.addEventListener('change', () => {
    void loadCargosAjustables();
  });
  ajusteMontoInput.addEventListener('input', updatePreview);
  ajusteCargoTargetSelect.addEventListener('change', updatePreview);
  ajusteForm.addEventListener('submit', handleSubmit);
  ajustesRecientesBody.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.ajuste-revertir-button');
    const grupoId = button?.dataset.grupoId;
    if (grupoId) void handleRevertir(grupoId);
  });

  return { refresh };
}
