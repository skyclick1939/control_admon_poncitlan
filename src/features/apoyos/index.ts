import type { User } from '@supabase/supabase-js';
import type { App } from '../../app';
import { escapeHtml } from '../../lib/escape';
import { activeMiembros } from '../../lib/miembros';
import { splitEvenly, toCents, toPesos } from '../../lib/money';
import type { Miembro } from '../../lib/types';
import { fetchMembers } from '../miembros/repo';
import { saveApoyo, saveApoyoSinCargos } from './repo';

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

  let beneficiarios: Miembro[] = [];

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
  }

  function validateApoyoForm(): void {
    const membersToCharge = getMembersToCharge();
    const monto = parseFloat(montoApoyoInput.value) || 0;
    const isSinCargos = tipoDivisionSelect.value === 'SIN_CARGOS';
    const isValid = Boolean(
      fechaApoyoInput.value &&
        motivoApoyoInput.value.trim() &&
        monto > 0 &&
        tipoDivisionSelect.value &&
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

    if (!currentUser) {
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
  tipoDivisionSelect.addEventListener('change', () => {
    individualMembersListDiv.classList.toggle('view-hidden', tipoDivisionSelect.value !== 'INDIVIDUAL');
    beneficiarioListDiv.classList.toggle('view-hidden', tipoDivisionSelect.value !== 'SIN_CARGOS');
    validateApoyoForm();
  });
  solicitudForm.addEventListener('submit', handleSaveApoyo);

  app.onRefresh(renderApoyosForm);
}
