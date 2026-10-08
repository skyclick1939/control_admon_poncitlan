import type { User } from '@supabase/supabase-js';
import type { App } from '../../app';
import type { Concepto, ConceptoNaturaleza } from '../../lib/conceptos';
import { conceptoAyudaText, conceptoPorId, conceptosOfrecidos, slugifyConcepto } from '../../lib/conceptos';
import { escapeHtml, setText } from '../../lib/escape';
import { activeMiembros } from '../../lib/miembros';
import { splitEvenly, toCents, toPesos } from '../../lib/money';
import type { Miembro } from '../../lib/types';
import { fetchMembers } from '../miembros/repo';
import { createConcepto, fetchConceptos, saveApoyo, saveApoyoSinCargos, setConceptoActivo } from './repo';

export interface ApoyosDeps {
  app: App;
  getCurrentUser: () => User | null;
}

/** Mirrors the original solicitud-de-apoyos module (initializeApoyosModule, validateApoyoForm, handleSaveApoyo). */
export function initApoyos({ app, getCurrentUser }: ApoyosDeps): void {
  const solicitudForm = document.getElementById('solicitud-form') as HTMLFormElement;
  const capturadoPorInput = document.getElementById('capturado_por') as HTMLInputElement;
  const individualMembersListDiv = document.getElementById('individual-members-list')!;
  const membersCheckboxList = document.getElementById('members-checkbox-list')!;
  const divisionInfoDiv = document.getElementById('division-info')!;
  const saveApoyoButton = document.getElementById('save-apoyo-button') as HTMLButtonElement;
  const apoyoFeedback = document.getElementById('apoyo-feedback')!;
  const tipoDivisionSelect = document.getElementById('tipo_division') as HTMLSelectElement;
  const fechaApoyoInput = document.getElementById('fecha_apoyo') as HTMLInputElement;
  const montoApoyoInput = document.getElementById('monto_apoyo') as HTMLInputElement;
  const motivoApoyoInput = document.getElementById('motivo_apoyo') as HTMLInputElement;
  const beneficiarioListDiv = document.getElementById('beneficiario-list')!;
  const apoyoBeneficiarioSelect = document.getElementById('apoyo-beneficiario') as HTMLSelectElement;
  const conceptoApoyoSelect = document.getElementById('concepto_apoyo') as HTMLSelectElement;
  const conceptoHelp = document.getElementById('concepto-help')!;
  const conceptoCreatePanel = document.getElementById('concepto-create-panel')!;
  const conceptoCreateButton = document.getElementById('concepto-create-button') as HTMLButtonElement;
  const nuevoConceptoNombreInput = document.getElementById('nuevo_concepto_nombre') as HTMLInputElement;
  const nuevoConceptoNaturalezaSelect = document.getElementById('nuevo_concepto_naturaleza') as HTMLSelectElement;
  const conceptoFeedback = document.getElementById('concepto-feedback')!;
  const conceptoManageToggle = document.getElementById('concepto-manage-toggle') as HTMLButtonElement;
  const conceptoManagePanel = document.getElementById('concepto-manage-panel')!;
  const conceptoManageList = document.getElementById('concepto-manage-list')!;
  const conceptoManageFeedback = document.getElementById('concepto-manage-feedback')!;

  /** Display label for each catalog nature. UI copy only; the value stays the database union. */
  const NATURALEZA_LABEL: Record<ConceptoNaturaleza, string> = {
    recuperable: 'Recuperable',
    no_recuperable: 'No recuperable',
  };

  /** The dropdown's placeholder: no concept selected yet, and never a valid save value. */
  const CONCEPTO_PLACEHOLDER = '<option value="">-- Seleccione un concepto --</option>';

  /**
   * The in-line creation offered as one more option of the list. It is NOT a
   * catalog id: `conceptoPorId` refuses it, so it can never be saved as a
   * classification (product-owner decision 2026-10-08: the classification is a
   * value CHOSEN from the closed catalog).
   */
  const CREAR_CONCEPTO_VALUE = '__crear__';

  let beneficiarios: Miembro[] = [];
  /** The catalog as last read, plus any concept created in place during this session (design.md D9). */
  let conceptos: Concepto[] = [];

  /**
   * Maps a selected member id to the persisted beneficiary pair (mirrors the
   * egreso form's `beneficiaryFromSelection`): the empty string (the "no
   * beneficiary" option) or an unknown id yields both `null`. PURE.
   */
  function beneficiaryFromSelection(
    memberId: string,
    members: readonly Miembro[],
  ): { beneficiarioId: string | null; nombreBeneficiario: string | null } {
    const member = members.find((m) => m.id === memberId);
    if (!member) return { beneficiarioId: null, nombreBeneficiario: null };
    return { beneficiarioId: member.id, nombreBeneficiario: member.nickname };
  }

  /** Fills the beneficiary selector with active members (internal members included); leaves the "no beneficiary" option first. */
  async function populateBeneficiarios(): Promise<void> {
    try {
      beneficiarios = await fetchMembers();
      apoyoBeneficiarioSelect.innerHTML =
        '<option value="">-- Sin beneficiario --</option>' +
        activeMiembros(beneficiarios)
          .map((member) => `<option value="${member.id}">${escapeHtml(member.nickname)}</option>`)
          .join('');
    } catch (error) {
      console.error('Error al cargar los beneficiarios:', error);
      // The "no beneficiary" option remains; egreso capture still works un-attributed.
    }
  }

  /**
   * The nature the chosen modality can honestly book (design.md D2): the three
   * division modalities create cargos, so they offer only `recuperable`
   * concepts; "sin cargos" creates none, so it offers only `no_recuperable`.
   * Before a modality is chosen there is no honest answer, so the dropdown
   * stays disabled, showing only the placeholder, rather than offering the
   * wrong nature. PURE.
   */
  function currentNaturaleza(): ConceptoNaturaleza | null {
    if (tipoDivisionSelect.value === 'SIN_CARGOS') return 'no_recuperable';
    if (tipoDivisionSelect.value) return 'recuperable';
    return null;
  }

  /**
   * Only one nature is honest for the chosen modality, so the other option is
   * blocked: it would create a concept the capture could not select (design.md
   * D2, spec scenario "A new concept can be created in place").
   */
  function lockNaturalezaDeCreacion(naturaleza: ConceptoNaturaleza): void {
    nuevoConceptoNaturalezaSelect.value = naturaleza;
    for (const option of Array.from(nuevoConceptoNaturalezaSelect.options)) {
      option.disabled = option.value !== naturaleza;
    }
  }

  /**
   * The concept the select currently resolves to, or `null`. The save gate:
   * resolution is by option id, so the placeholder, the create sentinel, an
   * unknown id, a deactivated concept and a concept of the other nature all
   * block the save (spec "Concept Is Required for New Captures").
   */
  function conceptoSeleccionado(): Concepto | null {
    const naturaleza = currentNaturaleza();
    if (naturaleza === null) return null;
    return conceptoPorId(conceptos, conceptoApoyoSelect.value, naturaleza);
  }

  /**
   * Keeps the dropdown in sync with the modality: with no modality there is no
   * honest list, so the select stays disabled and shows only the placeholder.
   * Otherwise it offers, in order, the placeholder, the active concepts of the
   * modality's nature and the in-line creation. An existing selection is kept
   * while it is still offered; any other value falls back to the placeholder,
   * which is what blocks the save.
   */
  function refreshConceptoUi(): void {
    const naturaleza = currentNaturaleza();

    conceptoApoyoSelect.disabled = naturaleza === null;

    if (naturaleza === null) {
      conceptoApoyoSelect.innerHTML = CONCEPTO_PLACEHOLDER;
      conceptoCreatePanel.classList.add('view-hidden');
      setText(conceptoHelp, conceptoAyudaText(null, 'sin_modalidad'));
      return;
    }

    const seleccionPrevia = conceptoPorId(conceptos, conceptoApoyoSelect.value, naturaleza);
    const crearSeleccionado = conceptoApoyoSelect.value === CREAR_CONCEPTO_VALUE;

    conceptoApoyoSelect.innerHTML =
      CONCEPTO_PLACEHOLDER +
      conceptosOfrecidos(conceptos, naturaleza)
        .map(
          (concepto) =>
            `<option value="${escapeHtml(concepto.id)}">${escapeHtml(concepto.nombre)}</option>`,
        )
        .join('') +
      `<option value="${CREAR_CONCEPTO_VALUE}">➕ Crear concepto nuevo…</option>`;

    conceptoApoyoSelect.value = seleccionPrevia
      ? seleccionPrevia.id
      : crearSeleccionado
        ? CREAR_CONCEPTO_VALUE
        : '';

    const resuelto = conceptoSeleccionado();
    const creando = conceptoApoyoSelect.value === CREAR_CONCEPTO_VALUE;

    conceptoCreatePanel.classList.toggle('view-hidden', !creando);
    if (creando) lockNaturalezaDeCreacion(naturaleza);

    if (resuelto) {
      setText(conceptoHelp, conceptoAyudaText(naturaleza, 'resuelto'));
    } else if (creando) {
      setText(conceptoHelp, conceptoAyudaText(naturaleza, 'creando'));
    } else {
      setText(conceptoHelp, conceptoAyudaText(naturaleza, 'sin_seleccion'));
    }
  }

  async function loadConceptos(): Promise<void> {
    try {
      conceptos = await fetchConceptos();
    } catch (error) {
      console.error('Error al cargar el catálogo de conceptos:', error);
      // The dropdown stays empty and the save stays blocked: an unclassified
      // capture is refused rather than silently misclassified (design.md D3).
    }
    renderConceptoManageList();
    refreshConceptoUi();
  }

  /**
   * Lists the whole catalog — active AND deactivated — with an Activar/
   * Desactivar control per row. There is deliberately no delete control: the
   * database refuses to delete a concept that is in use (spec "Concepts Are
   * Deactivated, Never Deleted"). Rendered via `escapeHtml`, never raw.
   */
  function renderConceptoManageList(): void {
    conceptoManageList.innerHTML =
      conceptos.length === 0
        ? '<li class="py-2 text-sm text-gray-500">No hay conceptos en el catálogo.</li>'
        : conceptos
            .map(
              (concepto) => `
        <li class="flex items-center justify-between gap-3 py-2">
          <span class="text-sm ${concepto.activo ? 'text-gray-800' : 'text-gray-400'}">
            ${escapeHtml(concepto.nombre)}
            <span class="block text-xs text-gray-500">${NATURALEZA_LABEL[concepto.naturaleza]}</span>
          </span>
          <span class="flex items-center gap-2">
            <span class="text-xs ${concepto.activo ? 'text-green-700' : 'text-gray-500'}">${concepto.activo ? 'Activo' : 'Desactivado'}</span>
            <button type="button" data-concepto-id="${escapeHtml(concepto.id)}" class="text-xs px-3 py-1 rounded-md transition ${concepto.activo ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-green-100 text-green-800 hover:bg-green-200'}">${concepto.activo ? 'Desactivar' : 'Reactivar'}</button>
          </span>
        </li>`,
            )
            .join('');
  }

  /**
   * Flips one concept's active flag. Deactivating is not deleting: the row stays
   * and its historical classifications with it. If the concept being deactivated
   * is the one currently selected in the capture form, the selection is cleared
   * so the form cannot submit a concept that is no longer offered.
   */
  async function handleToggleConcepto(button: HTMLButtonElement): Promise<void> {
    const id = button.dataset.conceptoId;
    const actual = id ? conceptos.find((concepto) => concepto.id === id) : undefined;
    if (!id || !actual) return;

    conceptoManageFeedback.textContent = '';
    button.disabled = true;

    try {
      const actualizado = await setConceptoActivo(id, !actual.activo);

      // Read the current selection BEFORE replacing the catalog: once the
      // concept is inactive it is no longer offered, so the "same selection"
      // check could no longer be made.
      const seleccionPreviaId = conceptoApoyoSelect.value;
      if (!actualizado.activo && seleccionPreviaId === actualizado.id) {
        conceptoApoyoSelect.value = '';
        conceptoFeedback.textContent = '';
      }

      conceptos = conceptos.map((concepto) => (concepto.id === actualizado.id ? actualizado : concepto));
      renderConceptoManageList();
      validateApoyoForm();
      setText(
        conceptoManageFeedback,
        actualizado.activo
          ? 'Concepto reactivado: vuelve a ofrecerse en el selector.'
          : 'Concepto desactivado: no se elimina y la clasificación histórica se conserva.',
      );
      conceptoManageFeedback.className = 'mt-2 text-sm text-green-700';
    } catch (error) {
      console.error('Error al actualizar el concepto:', error);
      conceptoManageFeedback.textContent = 'No se pudo actualizar el concepto. Intenta de nuevo.';
      conceptoManageFeedback.className = 'mt-2 text-sm text-red-600';
    } finally {
      button.disabled = false;
    }
  }

  function getMembersToCharge(): Miembro[] {
    const members = activeMiembros(app.state.members);
    if (tipoDivisionSelect.value === 'TODOS') return members.filter((m) => m.status !== 'interno');
    if (tipoDivisionSelect.value === 'FULLPARCH') return members.filter((m) => m.status === 'fullparch');
    if (tipoDivisionSelect.value === 'INDIVIDUAL') {
      const checked = Array.from(membersCheckboxList.querySelectorAll<HTMLInputElement>('input:checked'));
      return checked
        .map((box) => members.find((m) => m.id === box.dataset.id))
        .filter((m): m is Miembro => Boolean(m));
    }
    return [];
  }

  function renderApoyosForm(): void {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    solicitudForm.reset();
    capturadoPorInput.value = currentUser.email ?? '';
    fechaApoyoInput.valueAsDate = new Date();

    membersCheckboxList.innerHTML = activeMiembros(app.state.members)
      .map(
        (member) => `
        <div class="flex items-center">
          <input id="member-${member.id}" data-id="${member.id}" type="checkbox" class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 member-checkbox">
          <label for="member-${member.id}" class="ml-2 block text-sm text-gray-900">${escapeHtml(member.nickname)}</label>
        </div>`,
      )
      .join('');

    validateApoyoForm();
    void populateBeneficiarios();
    void loadConceptos();
  }

  function validateApoyoForm(): void {
    refreshConceptoUi();

    const membersToCharge = getMembersToCharge();
    const monto = parseFloat(montoApoyoInput.value) || 0;
    const isSinCargos = tipoDivisionSelect.value === 'SIN_CARGOS';
    const concepto = conceptoSeleccionado();
    const isValid = Boolean(
      fechaApoyoInput.value &&
        motivoApoyoInput.value.trim() &&
        monto > 0 &&
        tipoDivisionSelect.value &&
        concepto &&
        (isSinCargos || membersToCharge.length > 0),
    );

    if (isValid) {
      if (isSinCargos) {
        divisionInfoDiv.innerHTML = `El monto de <strong>$${monto.toFixed(2)}</strong> se registrará como un egreso <strong>absorbido por el Arca (no recuperable)</strong>.`;
      } else {
        const splitsCents = splitEvenly(toCents(monto), membersToCharge.length);
        const min = Math.min(...splitsCents);
        const max = Math.max(...splitsCents);
        const amountText =
          min === max ? `$${toPesos(min).toFixed(2)}` : `entre $${toPesos(min).toFixed(2)} y $${toPesos(max).toFixed(2)}`;
        divisionInfoDiv.innerHTML = `El monto de <strong>$${monto.toFixed(2)}</strong> se dividirá entre <strong>${membersToCharge.length}</strong> miembros. <br>Cada uno pagará <strong>${amountText}</strong>.`;
      }
      divisionInfoDiv.classList.remove('view-hidden');
    } else {
      divisionInfoDiv.classList.add('view-hidden');
    }

    saveApoyoButton.disabled = !isValid;
  }

  async function handleSaveApoyo(e: Event): Promise<void> {
    e.preventDefault();
    apoyoFeedback.textContent = '';
    saveApoyoButton.disabled = true;

    const currentUser = getCurrentUser();
    const membersToCharge = getMembersToCharge();
    const monto = parseFloat(montoApoyoInput.value);
    const isSinCargos = tipoDivisionSelect.value === 'SIN_CARGOS';
    const concepto = conceptoSeleccionado();

    if (!currentUser) {
      saveApoyoButton.disabled = false;
      return;
    }

    if (!concepto) {
      // The button is disabled without a concept; this is the second gate, in
      // case a stale render ever let the submit through (design.md D3).
      apoyoFeedback.textContent = 'El concepto es obligatorio: selecciona uno o créalo aquí mismo.';
      apoyoFeedback.className = 'mt-4 text-sm text-red-600';
      saveApoyoButton.disabled = false;
      return;
    }

    try {
      if (isSinCargos) {
        const { beneficiarioId, nombreBeneficiario } = beneficiaryFromSelection(
          apoyoBeneficiarioSelect.value,
          beneficiarios,
        );
        await saveApoyoSinCargos({
          capturadoPorId: currentUser.id,
          nombreCapturador: currentUser.email ?? '',
          fecha: fechaApoyoInput.value,
          motivo: motivoApoyoInput.value.trim(),
          montoPesos: monto,
          conceptoId: concepto.id,
          beneficiarioId,
          nombreBeneficiario,
        });
      } else {
        await saveApoyo({
          capturadoPorId: currentUser.id,
          nombreCapturador: currentUser.email ?? '',
          fecha: fechaApoyoInput.value,
          motivo: motivoApoyoInput.value.trim(),
          montoPesos: monto,
          tipoDivision: tipoDivisionSelect.value as 'INDIVIDUAL' | 'FULLPARCH' | 'TODOS',
          miembros: membersToCharge,
          conceptoId: concepto.id,
        });
      }

      apoyoFeedback.textContent = isSinCargos
        ? '¡Egreso guardado con éxito!'
        : '¡Apoyo y cargos guardados con éxito!';
      apoyoFeedback.className = 'mt-4 text-sm text-green-600';
      renderApoyosForm();
    } catch (error) {
      console.error('Error al guardar apoyo:', error);
      apoyoFeedback.textContent = `Error al guardar: ${(error as Error).message}`;
      apoyoFeedback.className = 'mt-4 text-sm text-red-600';
    } finally {
      validateApoyoForm();
    }
  }

  solicitudForm.addEventListener('input', validateApoyoForm);
  membersCheckboxList.addEventListener('change', validateApoyoForm);
  /**
   * Choosing the in-line creation opens its panel with the modality's own nature
   * locked; choosing anything else (a concept or the placeholder) closes it.
   * `validateApoyoForm` re-renders the list and the help text either way.
   */
  conceptoApoyoSelect.addEventListener('change', () => {
    conceptoFeedback.textContent = '';

    const naturaleza = currentNaturaleza();
    if (naturaleza !== null && conceptoApoyoSelect.value === CREAR_CONCEPTO_VALUE) {
      lockNaturalezaDeCreacion(naturaleza);
    }

    validateApoyoForm();
  });
  nuevoConceptoNombreInput.addEventListener('input', () => {
    conceptoFeedback.textContent = '';
  });
  nuevoConceptoNaturalezaSelect.addEventListener('change', () => {
    conceptoFeedback.textContent = '';
  });
  conceptoCreateButton.addEventListener('click', async () => {
    const naturaleza = currentNaturaleza();
    if (!naturaleza) return;

    const nombre = nuevoConceptoNombreInput.value.trim();
    if (nombre === '') {
      conceptoFeedback.textContent = 'Escribe el nombre del nuevo concepto para crearlo.';
      conceptoFeedback.className = 'mt-2 text-sm text-red-600';
      return;
    }

    conceptoFeedback.textContent = '';
    conceptoCreateButton.disabled = true;

    try {
      const nuevo = await createConcepto({
        nombre,
        slug: slugifyConcepto(nombre),
        naturaleza,
        createdById: getCurrentUser()?.id ?? null,
      });
      conceptos = [...conceptos, nuevo];
      nuevoConceptoNombreInput.value = '';
      renderConceptoManageList();
      // Re-render first so the new option exists, then select it and let the
      // validation leave the "creating" state.
      refreshConceptoUi();
      conceptoApoyoSelect.value = nuevo.id;
      validateApoyoForm();
    } catch (error) {
      console.error('Error al crear el concepto:', error);
      conceptoFeedback.textContent =
        (error as { code?: string }).code === '23505'
          ? 'Ya existe un concepto con ese nombre. Elígelo de la lista.'
          : 'No se pudo crear el concepto. Intenta de nuevo.';
      conceptoFeedback.className = 'mt-2 text-sm text-red-600';
    } finally {
      conceptoCreateButton.disabled = false;
    }
  });
  tipoDivisionSelect.addEventListener('change', () => {
    individualMembersListDiv.classList.toggle('view-hidden', tipoDivisionSelect.value !== 'INDIVIDUAL');
    beneficiarioListDiv.classList.toggle('view-hidden', tipoDivisionSelect.value !== 'SIN_CARGOS');
    // The modality changed, so the nature it can book changed with it (D2): a
    // concept chosen under the previous modality may belong to the other
    // nature. Clearing it forces an explicit classification under the new one.
    conceptoApoyoSelect.value = '';
    conceptoFeedback.textContent = '';
    validateApoyoForm();
  });
  conceptoManageToggle.addEventListener('click', () => {
    conceptoManagePanel.classList.toggle('view-hidden');
  });
  conceptoManageList.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-concepto-id]');
    if (button) void handleToggleConcepto(button);
  });
  solicitudForm.addEventListener('submit', handleSaveApoyo);

  app.onRefresh(renderApoyosForm);
}
