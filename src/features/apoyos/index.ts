import type { User } from '@supabase/supabase-js';
import type { App } from '../../app';
import type { Concepto, ConceptoNaturaleza } from '../../lib/conceptos';
import { resolveConcepto, searchConceptos, slugifyConcepto } from '../../lib/conceptos';
import { escapeHtml, setText } from '../../lib/escape';
import { activeMiembros } from '../../lib/miembros';
import { splitEvenly, toCents, toPesos } from '../../lib/money';
import type { Miembro } from '../../lib/types';
import { fetchMembers } from '../miembros/repo';
import { createConcepto, fetchConceptos, saveApoyo, saveApoyoSinCargos } from './repo';

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
  const conceptoApoyoInput = document.getElementById('concepto_apoyo') as HTMLInputElement;
  const conceptoOptionsList = document.getElementById('concepto-options') as HTMLDataListElement;
  const conceptoHelp = document.getElementById('concepto-help')!;
  const conceptoCreatePanel = document.getElementById('concepto-create-panel')!;
  const conceptoCreateMessage = document.getElementById('concepto-create-message')!;
  const conceptoCreateButton = document.getElementById('concepto-create-button') as HTMLButtonElement;
  const nuevoConceptoNaturalezaSelect = document.getElementById('nuevo_concepto_naturaleza') as HTMLSelectElement;
  const conceptoFeedback = document.getElementById('concepto-feedback')!;

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
   * Before a modality is chosen there is no honest answer, so the selector
   * stays disabled and empty rather than offering the wrong nature. PURE.
   */
  function currentNaturaleza(): ConceptoNaturaleza | null {
    if (tipoDivisionSelect.value === 'SIN_CARGOS') return 'no_recuperable';
    if (tipoDivisionSelect.value) return 'recuperable';
    return null;
  }

  /** Keeps the concept options and the in-line creation affordance in sync with the typed text and the modality. */
  function refreshConceptoUi(): void {
    const naturaleza = currentNaturaleza();
    const query = conceptoApoyoInput.value.trim();

    conceptoApoyoInput.disabled = naturaleza === null;

    if (naturaleza === null) {
      conceptoOptionsList.innerHTML = '';
      conceptoCreatePanel.classList.add('view-hidden');
      setText(conceptoHelp, 'Elige primero la división para ver los conceptos disponibles.');
      return;
    }

    const resultado = searchConceptos(conceptos, query, naturaleza);
    conceptoOptionsList.innerHTML = resultado.matches
      .map((concepto) => `<option value="${escapeHtml(concepto.nombre)}"></option>`)
      .join('');

    const resuelto = resolveConcepto(conceptos, query, naturaleza);
    const ofreceCreacion = query !== '' && resuelto === null;

    conceptoCreatePanel.classList.toggle('view-hidden', !ofreceCreacion);
    if (ofreceCreacion) {
      setText(conceptoCreateMessage, `No existe "${query}". Créalo sin salir de aquí:`);
      // Only one nature is honest for this modality, so the other option is
      // blocked: it would create a concept the capture could not select
      // (design.md D2, spec scenario "A new concept can be created in place").
      nuevoConceptoNaturalezaSelect.value = naturaleza;
      for (const option of Array.from(nuevoConceptoNaturalezaSelect.options)) {
        option.disabled = option.value !== naturaleza;
      }
    }

    if (resuelto) {
      setText(
        conceptoHelp,
        naturaleza === 'recuperable'
          ? 'Recuperable: crea un adeudo que se devuelve. El motivo conserva el detalle.'
          : 'No recuperable: lo absorbe el Arca. El motivo conserva el detalle.',
      );
    } else if (ofreceCreacion) {
      setText(conceptoHelp, 'El concepto es obligatorio. Créalo aquí mismo para continuar.');
    } else {
      setText(conceptoHelp, 'El concepto es obligatorio. Escribe para buscar en el catálogo.');
    }
  }

  async function loadConceptos(): Promise<void> {
    try {
      conceptos = await fetchConceptos();
    } catch (error) {
      console.error('Error al cargar el catálogo de conceptos:', error);
      // The selector stays empty and the save stays blocked: an unclassified
      // capture is refused rather than silently misclassified (design.md D3).
    }
    refreshConceptoUi();
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
    const concepto = resolveConcepto(conceptos, conceptoApoyoInput.value, currentNaturaleza() ?? undefined);
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
    const concepto = resolveConcepto(conceptos, conceptoApoyoInput.value, currentNaturaleza() ?? undefined);

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
  conceptoApoyoInput.addEventListener('input', () => {
    conceptoFeedback.textContent = '';
  });
  nuevoConceptoNaturalezaSelect.addEventListener('change', () => {
    conceptoFeedback.textContent = '';
  });
  conceptoCreateButton.addEventListener('click', async () => {
    const naturaleza = currentNaturaleza();
    const nombre = conceptoApoyoInput.value.trim();
    if (!naturaleza || !nombre) return;

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
      conceptoApoyoInput.value = nuevo.nombre;
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
    conceptoApoyoInput.value = '';
    conceptoFeedback.textContent = '';
    validateApoyoForm();
  });
  solicitudForm.addEventListener('submit', handleSaveApoyo);

  app.onRefresh(renderApoyosForm);
}
