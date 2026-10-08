/**
 * Pure concept-catalog logic for the capture form's dropdown (design.md D2/D3,
 * product-owner decision 2026-10-08): the classification is a value CHOSEN
 * from the closed catalog, so the offered options are exactly what the catalog
 * holds for the modality's nature. No DOM and no Supabase — the `<select>`
 * itself is browser behaviour — so this module is the part of the selector a
 * test can pin: which concepts are offered, and which option id the save gate
 * accepts.
 */

/**
 * The two natures the Postgres CHECK on `catalogo_conceptos.naturaleza` allows.
 * The union is derived from this list and `conceptos.test.ts` asserts the list
 * against the migration file, so the two encodings cannot drift apart.
 */
export const NATURALEZAS = ['recuperable', 'no_recuperable'] as const;

export type ConceptoNaturaleza = (typeof NATURALEZAS)[number];

/** Row of `public.catalogo_conceptos` (design.md D2/D3/D11). */
export interface Concepto {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
  readonly naturaleza: ConceptoNaturaleza;
  /** `false` means deactivated: kept for history, never offered again. */
  readonly activo: boolean;
}

/**
 * Where the concept dropdown stands, as the capture form can observe it: no
 * modality chosen (so no honest list at all), the modality chosen and nothing
 * selected yet, the modality chosen and a concept resolved, or the operator
 * creating a concept in place.
 */
export type ConceptoAyudaEstado = 'sin_modalidad' | 'sin_seleccion' | 'resuelto' | 'creando';

export function isConceptoNaturaleza(value: unknown): value is ConceptoNaturaleza {
  return typeof value === 'string' && (NATURALEZAS as readonly string[]).includes(value);
}

/**
 * Accent- and case-insensitive comparison form. NFD decomposition plus removal
 * of the combining marks folds "caído" onto "caido" and "Capítulo" onto
 * "capitulo" without a per-character translation table.
 */
export function normalizeConceptoText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Catalog slug for a newly created concept: lowercase, accent-free, hyphenated. */
export function slugifyConcepto(nombre: string): string {
  return normalizeConceptoText(nombre)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Active concepts of one nature, in catalog order — the dropdown's option list.
 * Catalog order is the order the operator sees, so it is preserved rather than
 * re-ranked. PURE: the catalog is not mutated.
 */
export function conceptosOfrecidos(
  conceptos: readonly Concepto[],
  naturaleza: ConceptoNaturaleza,
): Concepto[] {
  return conceptos.filter((concepto) => concepto.activo && concepto.naturaleza === naturaleza);
}

/**
 * The concept a selected option id resolves to, only if it is still offered for
 * that nature. PURE. Anything that is not an OFFERED concept id resolves to
 * `null` — the placeholder's empty value, the create sentinel, an unknown id, a
 * deactivated concept and a concept of the other nature — and `null` is what
 * blocks a save without a valid concept (spec "Concept Is Required for New
 * Captures"). Resolution is by id, never by name: the option value is the id,
 * so a stale label cannot classify a movement.
 */
export function conceptoPorId(
  conceptos: readonly Concepto[],
  id: string,
  naturaleza: ConceptoNaturaleza,
): Concepto | null {
  if (id === '') return null;
  return conceptosOfrecidos(conceptos, naturaleza).find((concepto) => concepto.id === id) ?? null;
}

/** The selectable concepts: activo only. A deactivated concept keeps history but is never offered. */
function selectableConceptos(
  conceptos: readonly Concepto[],
  naturaleza?: ConceptoNaturaleza,
): Concepto[] {
  return conceptos.filter(
    (concepto) => concepto.activo && (naturaleza === undefined || concepto.naturaleza === naturaleza),
  );
}

/**
 * Resolves what the operator typed to exactly one concept, or `null`. The
 * match is exact over the name or the slug (never a substring: a half-typed
 * name must not silently classify a movement) and honours the active flag and
 * the nature filter, so resolving `null` is what blocks a save without a valid
 * concept (spec "Concept Is Required for New Captures").
 */
export function resolveConcepto(
  conceptos: readonly Concepto[],
  text: string,
  naturaleza?: ConceptoNaturaleza,
): Concepto | null {
  const needle = normalizeConceptoText(text);
  if (needle === '') return null;

  return (
    selectableConceptos(conceptos, naturaleza).find(
      (concepto) =>
        normalizeConceptoText(concepto.nombre) === needle || normalizeConceptoText(concepto.slug) === needle,
    ) ?? null
  );
}

/**
 * The pagos debt table's concept filter: `null` means "all concepts" and
 * matches every listed cargo, including rows recorded before the catalog
 * existed. A name matches the STORED concept name exactly — never a substring
 * and never a text search over `motivo` — so the operator filters by the
 * classification and not by the prose (spec "Movements are filterable by
 * concept"). Exact equality is deliberately chosen over accent folding: the
 * option values come from the same cargo read, so folding could only make two
 * distinct concepts collide. PURE.
 */
export function matchesConceptoFiltro(
  nombre: string | null | undefined,
  conceptoSeleccionado: string | null,
): boolean {
  if (conceptoSeleccionado === null) return true;
  return nombre === conceptoSeleccionado;
}

/**
 * The distinct concept names actually present in a list of cargos, in
 * first-seen order. `null`, `undefined` and the empty string (a movement
 * recorded before the catalog existed) contribute no option: that row is not a
 * concept, and the "all" option already shows it (spec "Historical rows may
 * have no concept"). PURE.
 */
export function conceptosPresentes(
  nombres: readonly (string | null | undefined)[],
): string[] {
  const presentes: string[] = [];
  const seen = new Set<string>();

  for (const nombre of nombres) {
    if (!nombre || seen.has(nombre)) continue;
    seen.add(nombre);
    presentes.push(nombre);
  }

  return presentes;
}

/**
 * The one reason the dropdown can be empty for reasons outside the operator's
 * choice: the concept list is derived from the chosen modality, so without one
 * there is no honest list to offer and the capture cannot proceed (design.md
 * D2 — this is the constraint, not a defect).
 */
const SIN_MODALIDAD_HELP =
  'La lista de conceptos depende de la modalidad "Dividir entre": sin elegirla, esta captura no puede continuar.';

/**
 * What the modality's nature means for the capture. The non-recoverable case is
 * the one the operator reported as "the dropdown is missing": it creates no
 * debt, so it can only offer non-recoverable concepts, and the recoverable
 * concepts live behind the other three modalities. No catalog name appears here
 * — the catalog is data and changes.
 */
const NATURALEZA_HELP: Record<ConceptoNaturaleza, string> = {
  recuperable:
    'Esta captura crea un adeudo recuperable, así que solo se ofrecen conceptos recuperables.',
  no_recuperable:
    'Esta modalidad no crea adeudo, así que solo se ofrecen conceptos no recuperables. Los conceptos de apoyo se ofrecen con Individual, Fullparch o Todos.',
};

/**
 * What is left to do once the nature is resolved. Design D10: the concept never
 * replaces the motivo.
 */
const RESUELTO_HELP: Record<ConceptoNaturaleza, string> = {
  recuperable: 'Naturaleza confirmada: recuperable. El motivo conserva el detalle.',
  no_recuperable: 'Naturaleza confirmada: no recuperable. El motivo conserva el detalle.',
};

/**
 * What is left to do while nothing is selected yet. The list is right there, so
 * the copy asks for a choice instead of asking for text.
 */
const SIN_SELECCION_HELP = 'El concepto es obligatorio: elige un concepto de la lista para continuar.';

/**
 * What the in-line creation asks for. It must not read as if the concept
 * already existed: nothing is offered until the name and the nature are given.
 */
const CREANDO_HELP =
  'Escribe el nombre del nuevo concepto y confirma su naturaleza para continuar.';

/**
 * Operator-facing help for the concept dropdown (design.md D2/D3/D10; spec
 * `catalogo-conceptos`). Makes the modality → concept dependency explicit,
 * which is what the operator could not see: the dropdown only offers the
 * concepts of the chosen modality's nature, so with "Sin cargos" the only
 * concepts on offer are the non-recoverable ones. PURE: no DOM, no database,
 * no catalog — the text cannot name a concept, because concepts are data.
 */
export function conceptoAyudaText(
  naturaleza: ConceptoNaturaleza | null,
  estado: ConceptoAyudaEstado,
): string {
  // Both signals mean the same thing: there is no modality, so no list.
  if (naturaleza === null || estado === 'sin_modalidad') return SIN_MODALIDAD_HELP;

  if (estado === 'resuelto') return `${NATURALEZA_HELP[naturaleza]} ${RESUELTO_HELP[naturaleza]}`;
  if (estado === 'creando') return `${NATURALEZA_HELP[naturaleza]} ${CREANDO_HELP}`;

  return `${NATURALEZA_HELP[naturaleza]} ${SIN_SELECCION_HELP}`;
}

/**
 * The one-line note under the concept field naming how many concepts the chosen
 * modality offers, or null when no modality is chosen. It answers, inside the
 * form itself, the report the operator has made three times — he opens the
 * dropdown, sees only the two non-recoverable concepts of "Sin cargos" and
 * concludes the field is broken. It quotes a COUNT and never a catalog name:
 * the catalog is data and changes. PURE.
 */
export function notaConceptosDisponibles(
  naturaleza: ConceptoNaturaleza | null,
  disponibles: number,
): string | null {
  if (naturaleza === null) return null;

  const plural = disponibles !== 1;

  if (naturaleza === 'recuperable') {
    return `${disponibles} ${
      plural ? 'conceptos recuperables' : 'concepto recuperable'
    } disponible${plural ? 's' : ''} para esta modalidad.`;
  }

  return `Esta modalidad no crea adeudo: solo sus ${disponibles} ${
    plural ? 'conceptos no recuperables' : 'concepto no recuperable'
  } están disponibles. Los conceptos de apoyo son recuperables y se ofrecen con Individual, Fullparch o Todos; si los necesitas absorbidos por el Arca, créalos aquí mismo con «Crear concepto nuevo…».`;
}

/**
 * Whether the form should offer the one-click switch to a debt-creating
 * modality. Only the modality that creates no debt hides the support concepts
 * behind the other three, so only it can offer the shortcut. PURE.
 */
export function ofreceAtajoApoyos(naturaleza: ConceptoNaturaleza | null): boolean {
  return naturaleza === 'no_recuperable';
}
