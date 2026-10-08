import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  NATURALEZAS,
  conceptoAyudaText,
  conceptoPorId,
  conceptosOfrecidos,
  conceptosPresentes,
  isConceptoNaturaleza,
  matchesConceptoFiltro,
  normalizeConceptoText,
  notaConceptosDisponibles,
  ofreceAtajoApoyos,
  resolveConcepto,
  slugifyConcepto,
  type Concepto,
  type ConceptoAyudaEstado,
  type ConceptoNaturaleza,
} from './conceptos';

/**
 * Fixture shaped like `public.catalogo_conceptos`. Names mirror the operator's
 * concepts; the inactive row is deliberate (design.md D2, spec
 * `catalogo-conceptos` "Concepts Are Deactivated, Never Deleted").
 */
const CATALOGO: Concepto[] = [
  { id: '1', slug: 'donaciones', nombre: 'Donaciones', naturaleza: 'no_recuperable', activo: true },
  {
    id: '2',
    slug: 'apoyo-accidentados',
    nombre: 'Apoyo a accidentados',
    naturaleza: 'recuperable',
    activo: true,
  },
  { id: '3', slug: 'apoyo-legal', nombre: 'Apoyo legal', naturaleza: 'recuperable', activo: true },
  {
    id: '4',
    slug: 'apoyo-aniversario',
    nombre: 'Apoyo aniversario',
    naturaleza: 'recuperable',
    activo: true,
  },
  {
    id: '5',
    slug: 'adquisiciones-capitulo',
    nombre: 'Adquisiciones del capítulo',
    naturaleza: 'no_recuperable',
    activo: false,
  },
  {
    id: '6',
    slug: 'apoyo-hermano-caido',
    nombre: 'Apoyo hermano caído',
    naturaleza: 'recuperable',
    activo: true,
  },
];

const ids = (conceptos: readonly Concepto[]): string[] => conceptos.map((concepto) => concepto.id);

describe('NATURALEZAS', () => {
  it('is exactly the two natures the Postgres CHECK allows', () => {
    expect(NATURALEZAS).toEqual(['recuperable', 'no_recuperable']);
  });
});

describe('normalizeConceptoText', () => {
  it('lowercases and trims', () => {
    expect(normalizeConceptoText('  Apoyo Aniversario  ')).toBe('apoyo aniversario');
  });

  it('strips diacritics in both directions', () => {
    expect(normalizeConceptoText('Capítulo')).toBe('capitulo');
    expect(normalizeConceptoText('caído')).toBe('caido');
    expect(normalizeConceptoText('DONACIÓN')).toBe('donacion');
  });

  it('is idempotent for an already-normalized value', () => {
    expect(normalizeConceptoText('apoyo legal')).toBe('apoyo legal');
  });
});

/**
 * `conceptosOfrecidos` is the dropdown's option list. The product owner's
 * decision (2026-10-08) is that the classification is a value CHOSEN from the
 * closed catalog, so the list is exactly what the catalog offers for the
 * modality's nature: active only, one nature only, catalog order.
 */
describe('conceptosOfrecidos', () => {
  it('lists the active concepts of one nature, in catalog order', () => {
    expect(ids(conceptosOfrecidos(CATALOGO, 'recuperable'))).toEqual(['2', '3', '4', '6']);
    expect(ids(conceptosOfrecidos(CATALOGO, 'no_recuperable'))).toEqual(['1']);
  });

  it('drops a deactivated concept and keeps the rest of its nature', () => {
    const catalogo: Concepto[] = [
      { id: 'activo', slug: 'activo', nombre: 'Activo', naturaleza: 'no_recuperable', activo: true },
      {
        id: 'inactivo',
        slug: 'inactivo',
        nombre: 'Inactivo',
        naturaleza: 'no_recuperable',
        activo: false,
      },
    ];

    expect(ids(conceptosOfrecidos(catalogo, 'no_recuperable'))).toEqual(['activo']);
  });

  it('never offers a concept of the other nature', () => {
    for (const concepto of conceptosOfrecidos(CATALOGO, 'recuperable')) {
      expect(concepto.naturaleza).toBe('recuperable');
    }
    for (const concepto of conceptosOfrecidos(CATALOGO, 'no_recuperable')) {
      expect(concepto.naturaleza).toBe('no_recuperable');
    }
  });

  it('does not mutate the catalog it is given', () => {
    const before = [...CATALOGO];

    conceptosOfrecidos(CATALOGO, 'recuperable');

    expect(CATALOGO).toEqual(before);
  });
});

/**
 * `conceptoPorId` is the save gate now that the operator picks an option
 * instead of typing: the option VALUE is the concept id, so resolution is by
 * id and a stale or hostile value must resolve to `null` rather than classify
 * a movement. PURE.
 */
describe('conceptoPorId', () => {
  it('resolves an offered concept by its id', () => {
    expect(conceptoPorId(CATALOGO, '3', 'recuperable')?.nombre).toBe('Apoyo legal');
    expect(conceptoPorId(CATALOGO, '1', 'no_recuperable')?.nombre).toBe('Donaciones');
  });

  it('refuses the placeholder and the create sentinel: neither is a catalog row', () => {
    expect(conceptoPorId(CATALOGO, '', 'recuperable')).toBeNull();
    expect(conceptoPorId(CATALOGO, '__crear__', 'recuperable')).toBeNull();
    expect(conceptoPorId(CATALOGO, '__crear__', 'no_recuperable')).toBeNull();
  });

  it('refuses an unknown id', () => {
    expect(conceptoPorId(CATALOGO, '999', 'recuperable')).toBeNull();
    expect(conceptoPorId(CATALOGO, 'apoyo-legal', 'recuperable')).toBeNull();
  });

  it('refuses a deactivated concept even by its exact id', () => {
    expect(conceptoPorId(CATALOGO, '5', 'no_recuperable')).toBeNull();
  });

  it('refuses a concept of the wrong nature for the modality', () => {
    // spec scenario: "A recoverable concept cannot be booked as an expense".
    expect(conceptoPorId(CATALOGO, '1', 'recuperable')).toBeNull();
    // spec scenario: "A non-recoverable concept cannot create a debt".
    expect(conceptoPorId(CATALOGO, '3', 'no_recuperable')).toBeNull();
  });
});

describe('matchesConceptoFiltro', () => {
  it('matches every cargo when the filter is "all" (null), concept or not', () => {
    expect(matchesConceptoFiltro('Apoyo legal', null)).toBe(true);
    expect(matchesConceptoFiltro(null, null)).toBe(true);
    expect(matchesConceptoFiltro(undefined, null)).toBe(true);
  });

  it('matches only the exact stored concept name, never a substring or a different casing', () => {
    expect(matchesConceptoFiltro('Apoyo legal', 'Apoyo legal')).toBe(true);
    expect(matchesConceptoFiltro('Apoyo legal', 'apoyo')).toBe(false);
    expect(matchesConceptoFiltro('Apoyo legal', 'Apoyo Legal')).toBe(false);
    expect(matchesConceptoFiltro('Apoyo legal', 'Apoyo aniversario')).toBe(false);
  });

  it('never matches a cargo recorded before the catalog existed when a concept is selected', () => {
    expect(matchesConceptoFiltro(null, 'Apoyo legal')).toBe(false);
    expect(matchesConceptoFiltro(undefined, 'Apoyo legal')).toBe(false);
  });
});

describe('conceptosPresentes', () => {
  it('lists each concept once, in first-seen order', () => {
    expect(conceptosPresentes(['Donaciones', 'Apoyo legal', 'Donaciones', 'Apoyo legal'])).toEqual([
      'Donaciones',
      'Apoyo legal',
    ]);
  });

  it('drops the rows with no concept: a pre-catalog row is not a concept', () => {
    expect(conceptosPresentes([null, 'Donaciones', undefined, '', 'Apoyo legal'])).toEqual([
      'Donaciones',
      'Apoyo legal',
    ]);
    expect(conceptosPresentes([null, undefined, ''])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const nombres = ['Donaciones', 'Apoyo legal'];
    const before = [...nombres];

    conceptosPresentes(nombres);

    expect(nombres).toEqual(before);
  });
});

describe('resolveConcepto', () => {
  it('resolves an exact name, accent- and case-insensitively', () => {
    expect(resolveConcepto(CATALOGO, 'apoyo hermano caido', 'recuperable')?.id).toBe('6');
    expect(resolveConcepto(CATALOGO, 'APOYO LEGAL', 'recuperable')?.id).toBe('3');
    expect(resolveConcepto(CATALOGO, 'Donaciones', 'no_recuperable')?.id).toBe('1');
  });

  it('resolves an exact slug', () => {
    expect(resolveConcepto(CATALOGO, 'apoyo-aniversario', 'recuperable')?.id).toBe('4');
  });

  it('refuses a partial or unknown value — the save gate is not a substring guess', () => {
    expect(resolveConcepto(CATALOGO, 'apoyo', 'recuperable')).toBeNull();
    expect(resolveConcepto(CATALOGO, 'hipoteca', 'recuperable')).toBeNull();
    expect(resolveConcepto(CATALOGO, '', 'recuperable')).toBeNull();
    expect(resolveConcepto(CATALOGO, '   ', 'recuperable')).toBeNull();
  });

  it('refuses a concept of the wrong nature for the modality', () => {
    expect(resolveConcepto(CATALOGO, 'donaciones', 'recuperable')).toBeNull();
    expect(resolveConcepto(CATALOGO, 'apoyo legal', 'no_recuperable')).toBeNull();
  });

  it('refuses an inactive concept even when the text is exact', () => {
    expect(resolveConcepto(CATALOGO, 'Adquisiciones del capítulo', 'no_recuperable')).toBeNull();
  });
});

describe('isConceptoNaturaleza', () => {
  it('accepts exactly the two catalog natures', () => {
    expect(isConceptoNaturaleza('recuperable')).toBe(true);
    expect(isConceptoNaturaleza('no_recuperable')).toBe(true);
  });

  it('rejects anything else, including a widened or differently-cased value', () => {
    expect(isConceptoNaturaleza('Recuperable')).toBe(false);
    expect(isConceptoNaturaleza('recuperable ')).toBe(false);
    expect(isConceptoNaturaleza('no-recuperable')).toBe(false);
    expect(isConceptoNaturaleza(null)).toBe(false);
    expect(isConceptoNaturaleza(undefined)).toBe(false);
    expect(isConceptoNaturaleza(1)).toBe(false);
  });
});

describe('slugifyConcepto', () => {
  it('lowercases, strips accents, and hyphenates', () => {
    expect(slugifyConcepto('Apoyo hermano caído')).toBe('apoyo-hermano-caido');
    expect(slugifyConcepto('Adquisiciones del capítulo')).toBe('adquisiciones-del-capitulo');
    expect(slugifyConcepto('  Donaciones  ')).toBe('donaciones');
  });

  it('drops punctuation and collapses separator runs', () => {
    expect(slugifyConcepto('Apoyo (legal) -- 2026')).toBe('apoyo-legal-2026');
    expect(slugifyConcepto("Apoyo   a   accidentados'")).toBe('apoyo-a-accidentados');
  });
});

/**
 * `conceptoAyudaText` is the single source of the concept dropdown's help copy
 * (design.md D2/D9/D10). The operator reported that the support concepts seemed
 * missing; the copy is what makes the modality → concept dependency explicit,
 * so the assertion is on what the operator actually reads, not on an internal
 * label. The catalog names are read from the migration rather than copied into
 * this test: the catalog is data and changes, and the copy may never name it.
 */
describe('conceptoAyudaText', () => {
  const sql = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/sql/phase10_catalogo_conceptos.sql'),
    'utf-8',
  );
  const CATALOGO_NOMBRES = [
    ...sql.matchAll(/\(\s*'([a-z0-9-]+)',\s*'([^']*)',\s*'(recuperable|no_recuperable)'\s*\)/g),
  ].map((match) => match[2]);

  /**
   * Every (naturaleza, estado) pair the capture form actually renders:
   * `refreshConceptoUi` picks `sin_modalidad` with no modality, and one of
   * `resuelto` / `creando` / `sin_seleccion` with either nature.
   */
  const PARES_UI: readonly [ConceptoNaturaleza | null, ConceptoAyudaEstado][] = [
    [null, 'sin_modalidad'],
    ['recuperable', 'sin_seleccion'],
    ['recuperable', 'resuelto'],
    ['recuperable', 'creando'],
    ['no_recuperable', 'sin_seleccion'],
    ['no_recuperable', 'resuelto'],
    ['no_recuperable', 'creando'],
  ];

  it('blocks the capture and names the modality the list depends on when there is none', () => {
    const text = conceptoAyudaText(null, 'sin_modalidad');

    expect(text).toContain('Dividir entre');
    expect(text).toContain('no puede continuar');
  });

  it('says a recoverable modality creates a debt and asks to pick one from the list', () => {
    const text = conceptoAyudaText('recuperable', 'sin_seleccion');

    expect(text).toContain('adeudo recuperable');
    expect(text).toContain('solo se ofrecen conceptos recuperables');
    expect(text).toContain('elige un concepto de la lista');
  });

  it('says a non-recoverable modality creates no debt and where the support concepts are offered', () => {
    const text = conceptoAyudaText('no_recuperable', 'sin_seleccion');

    expect(text).toContain('no crea adeudo');
    expect(text).toContain('solo se ofrecen conceptos no recuperables');
    expect(text).toContain('Individual, Fullparch o Todos');
    expect(text).toContain('elige un concepto de la lista');
  });

  it('confirms the chosen nature and that the motivo keeps the detail once resolved', () => {
    const recuperable = conceptoAyudaText('recuperable', 'resuelto');
    expect(recuperable).toMatch(/Naturaleza confirmada[^.]*recuperable/);
    expect(recuperable).toContain('motivo conserva el detalle');

    const noRecuperable = conceptoAyudaText('no_recuperable', 'resuelto');
    expect(noRecuperable).toMatch(/Naturaleza confirmada[^.]*no recuperable/);
    expect(noRecuperable).toContain('motivo conserva el detalle');
  });

  it('asks for the new concept name and nature while creating, never assuming it exists', () => {
    for (const naturaleza of ['recuperable', 'no_recuperable'] as const) {
      const text = conceptoAyudaText(naturaleza, 'creando');

      expect(text).toMatch(/nombre del nuevo concepto/i);
      expect(text).toMatch(/naturaleza/i);
      expect(text).not.toMatch(/ya existe/i);
    }

    expect(conceptoAyudaText('recuperable', 'creando')).toContain('adeudo recuperable');
    expect(conceptoAyudaText('no_recuperable', 'creando')).toContain('no crea adeudo');
  });

  it('never names a catalog concept, on any state: the catalog is data and changes', () => {
    expect(CATALOGO_NOMBRES).toHaveLength(6);

    // Both copy surfaces are checked here: the help text and the note, which is
    // the one that quotes a COUNT. A count is not a name.
    const notas = ([null, 'recuperable', 'no_recuperable'] as const).flatMap((naturaleza) =>
      [0, 1, 2].map((disponibles) => notaConceptosDisponibles(naturaleza, disponibles)),
    );
    const copias: string[] = [
      ...PARES_UI.map(([naturaleza, estado]) => conceptoAyudaText(naturaleza, estado)),
      ...notas.filter((nota): nota is string => nota !== null),
    ];

    for (const copia of copias) {
      const text = normalizeConceptoText(copia);

      for (const nombre of CATALOGO_NOMBRES) {
        expect(text).not.toContain(normalizeConceptoText(nombre));
      }
    }
  });
});

/**
 * `notaConceptosDisponibles` is the line that answers the report the operator
 * has now made three times: he opens the dropdown, sees two options and reads a
 * broken field. The note says how many concepts the chosen modality offers, so
 * the form explains itself instead of relying on whoever is on shift. It quotes
 * a COUNT and never a catalog name. PURE.
 */
describe('notaConceptosDisponibles', () => {
  it('is null with no modality: there is no list to describe yet', () => {
    expect(notaConceptosDisponibles(null, 0)).toBeNull();
    expect(notaConceptosDisponibles(null, 3)).toBeNull();
  });

  it('counts the recoverable concepts on offer, singular and plural', () => {
    expect(notaConceptosDisponibles('recuperable', 1)).toBe(
      '1 concepto recuperable disponible para esta modalidad.',
    );
    expect(notaConceptosDisponibles('recuperable', 2)).toBe(
      '2 conceptos recuperables disponibles para esta modalidad.',
    );
  });

  it('says the modality creates no debt and where the support concepts are offered', () => {
    expect(notaConceptosDisponibles('no_recuperable', 1)).toBe(
      'Esta modalidad no crea adeudo: solo sus 1 concepto no recuperable están disponibles. Los conceptos de apoyo son recuperables y se ofrecen con Individual, Fullparch o Todos; si los necesitas absorbidos por el Arca, créalos aquí mismo con «Crear concepto nuevo…».',
    );
    expect(notaConceptosDisponibles('no_recuperable', 2)).toBe(
      'Esta modalidad no crea adeudo: solo sus 2 conceptos no recuperables están disponibles. Los conceptos de apoyo son recuperables y se ofrecen con Individual, Fullparch o Todos; si los necesitas absorbidos por el Arca, créalos aquí mismo con «Crear concepto nuevo…».',
    );
  });
});

/**
 * `ofreceAtajoApoyos` decides the one-click switch offered next to the note: only
 * the modality that creates no debt has support concepts hidden behind another
 * modality, so only it can offer the shortcut. PURE.
 */
describe('ofreceAtajoApoyos', () => {
  it('offers the shortcut only for the modality that creates no debt', () => {
    expect(ofreceAtajoApoyos('no_recuperable')).toBe(true);
    expect(ofreceAtajoApoyos('recuperable')).toBe(false);
    expect(ofreceAtajoApoyos(null)).toBe(false);
  });

  it('returns a boolean, so it emits no copy and can name no catalog concept', () => {
    for (const naturaleza of [null, 'recuperable', 'no_recuperable'] as const) {
      expect(typeof ofreceAtajoApoyos(naturaleza)).toBe('boolean');
    }
  });
});

/**
 * The union in this module and the Postgres CHECK in the migration are two
 * encodings of the same fact. A widened union over a stale CHECK has already
 * bitten this repository, so the agreement is asserted against the file the
 * operator applies rather than trusted.
 */
describe('nature agreement with phase10_catalogo_conceptos.sql', () => {
  const sqlPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../supabase/sql/phase10_catalogo_conceptos.sql',
  );
  const sql = readFileSync(sqlPath, 'utf-8');

  it('declares exactly the TypeScript NATURALEZAS in the CHECK constraint', () => {
    const check = /check\s*\(\s*naturaleza\s+in\s*\(([^)]*)\)/i.exec(sql);

    expect(check).not.toBeNull();
    const declared = [...check![1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();

    expect(declared).toEqual([...NATURALEZAS].sort());
  });

  it('seeds the six operator concepts with the natures the design fixes', () => {
    const seeds = [...sql.matchAll(/\('([a-z0-9-]+)',\s*'([^']*)',\s*'(recuperable|no_recuperable)'\)/g)].map(
      (match) => ({ slug: match[1], nombre: match[2], naturaleza: match[3] }),
    );

    expect(seeds).toEqual([
      { slug: 'apoyo-accidentados', nombre: 'Apoyo a accidentados', naturaleza: 'recuperable' },
      { slug: 'apoyo-hermano-caido', nombre: 'Apoyo hermano caído', naturaleza: 'recuperable' },
      { slug: 'apoyo-legal', nombre: 'Apoyo legal', naturaleza: 'recuperable' },
      { slug: 'apoyo-aniversario', nombre: 'Apoyo aniversario', naturaleza: 'recuperable' },
      { slug: 'adquisiciones-capitulo', nombre: 'Adquisiciones del capítulo', naturaleza: 'no_recuperable' },
      { slug: 'donaciones', nombre: 'Donaciones', naturaleza: 'no_recuperable' },
    ]);
  });
});
