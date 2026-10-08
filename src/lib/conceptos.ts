/**
 * Pure concept-catalog matching for the selector (design.md D9). No DOM and no
 * Supabase: the datalist itself is browser behaviour, so this module is the
 * part of the selector that a test can pin — accent- and case-insensitive
 * substring matching, prefix-first ranking, the nature filter and the explicit
 * no-match signal the UI turns into the create affordance.
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

export interface ConceptoSearchResult {
  /** Active concepts of the requested nature, prefix matches first, stable otherwise. */
  readonly matches: Concepto[];
  /**
   * `true` only when a non-empty query matched nothing. That is the signal the
   * capture form renders as "crear concepto <texto>" (design.md D9); it is NOT
   * raised for an empty query, which simply lists the whole nature.
   */
  readonly noMatch: boolean;
}

/**
 * Where the concept selector stands, as the capture form can observe it: no
 * modality chosen, the modality chosen and its concept already resolved, the
 * modality chosen and the typed text matching nothing (the create affordance
 * is offered), or the modality chosen and the operator still typing.
 */
export type ConceptoAyudaEstado = 'sin_modalidad' | 'resuelto' | 'por_crear' | 'escribiendo';

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

/** Narrows a list to one nature. Orthogonal to the active flag and to matching. */
export function filterByNaturaleza(
  conceptos: readonly Concepto[],
  naturaleza: ConceptoNaturaleza,
): Concepto[] {
  return conceptos.filter((concepto) => concepto.naturaleza === naturaleza);
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
 * Filters the catalog by what the operator has typed so far. Matching is
 * substring over the name and the slug, ignoring case and accents; prefix
 * matches rank before interior ones, and concepts of equal rank keep catalog
 * order (datalist order is the only ranking the operator sees).
 */
export function searchConceptos(
  conceptos: readonly Concepto[],
  query: string,
  naturaleza?: ConceptoNaturaleza,
): ConceptoSearchResult {
  const needle = normalizeConceptoText(query);
  const candidates = selectableConceptos(conceptos, naturaleza);

  if (needle === '') {
    return { matches: candidates, noMatch: false };
  }

  const prefix: Concepto[] = [];
  const interior: Concepto[] = [];

  for (const concepto of candidates) {
    const name = normalizeConceptoText(concepto.nombre);
    const slug = normalizeConceptoText(concepto.slug);

    if (name.startsWith(needle) || slug.startsWith(needle)) {
      prefix.push(concepto);
    } else if (name.includes(needle) || slug.includes(needle)) {
      interior.push(concepto);
    }
  }

  const matches = [...prefix, ...interior];
  return { matches, noMatch: matches.length === 0 };
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
 * The one reason the selector can be empty for reasons outside the operator's
 * typing: the concept list is derived from the chosen modality, so without one
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

/** What is left to do once the nature is resolved. Design D10: the concept never replaces the motivo. */
const RESUELTO_HELP: Record<ConceptoNaturaleza, string> = {
  recuperable: 'Naturaleza confirmada: recuperable. El motivo conserva el detalle.',
  no_recuperable: 'Naturaleza confirmada: no recuperable. El motivo conserva el detalle.',
};

/**
 * What is left to do while the concept is not resolved yet. "por_crear" must
 * not read as if the concept already existed (nothing matched the typed text),
 * and "escribiendo" asks for the classification instead of assuming one.
 */
const ESTADO_HELP: Record<'por_crear' | 'escribiendo', string> = {
  por_crear:
    'El concepto es obligatorio y todavía no existe en el catálogo: créalo aquí mismo para continuar.',
  escribiendo: 'El concepto es obligatorio: escribe para buscar su clasificación en el catálogo.',
};

/**
 * Operator-facing help for the concept selector (design.md D9/D10; spec
 * `catalogo-conceptos`). Makes the modality → concept dependency explicit,
 * which is what the operator could not see: the selector only offers the
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

  const estadoHelp = estado === 'resuelto' ? RESUELTO_HELP[naturaleza] : ESTADO_HELP[estado];

  return `${NATURALEZA_HELP[naturaleza]} ${estadoHelp}`;
}
