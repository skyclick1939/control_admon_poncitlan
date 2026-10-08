import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  NATURALEZAS,
  conceptosPresentes,
  filterByNaturaleza,
  isConceptoNaturaleza,
  matchesConceptoFiltro,
  normalizeConceptoText,
  resolveConcepto,
  searchConceptos,
  slugifyConcepto,
  type Concepto,
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

describe('searchConceptos', () => {
  it('matches with or without accents (accent-insensitive substring)', () => {
    expect(ids(searchConceptos(CATALOGO, 'donacion', 'no_recuperable').matches)).toEqual(['1']);
    expect(ids(searchConceptos(CATALOGO, 'donación', 'no_recuperable').matches)).toEqual(['1']);
    expect(ids(searchConceptos(CATALOGO, 'caido', 'recuperable').matches)).toEqual(['6']);
    expect(ids(searchConceptos(CATALOGO, 'caído', 'recuperable').matches)).toEqual(['6']);
  });

  it('matches case-insensitively', () => {
    expect(ids(searchConceptos(CATALOGO, 'ANIVERSARIO', 'recuperable').matches)).toEqual(['4']);
    expect(ids(searchConceptos(CATALOGO, 'DoNaCiOnEs', 'no_recuperable').matches)).toEqual(['1']);
  });

  it('returns every active concept of the nature, in catalog order, when the query is empty', () => {
    const result = searchConceptos(CATALOGO, '   ', 'recuperable');

    expect(ids(result.matches)).toEqual(['2', '3', '4', '6']);
    expect(result.noMatch).toBe(false);
  });

  it('ranks prefix matches before interior matches', () => {
    const ranking: Concepto[] = [
      { id: 'interior', slug: 'gasto-interior', nombre: 'Gasto interior', naturaleza: 'recuperable', activo: true },
      { id: 'prefix-late', slug: 'interior-tarde', nombre: 'Interior tarde', naturaleza: 'recuperable', activo: true },
      { id: 'prefix-early', slug: 'interior-temprano', nombre: 'Interior temprano', naturaleza: 'recuperable', activo: true },
    ];

    expect(ids(searchConceptos(ranking, 'interior').matches)).toEqual([
      'prefix-late',
      'prefix-early',
      'interior',
    ]);
  });

  it('keeps catalog order for concepts of equal rank (stable)', () => {
    const sameRank: Concepto[] = [
      { id: 'first', slug: 'aniversario-uno', nombre: 'Aniversario uno', naturaleza: 'recuperable', activo: true },
      { id: 'second', slug: 'aniversario-dos', nombre: 'Aniversario dos', naturaleza: 'recuperable', activo: true },
    ];

    expect(ids(searchConceptos(sameRank, 'aniversario').matches)).toEqual(['first', 'second']);
    expect(ids(searchConceptos([...sameRank].reverse(), 'aniversario').matches)).toEqual(['second', 'first']);
  });

  it('signals no match only when a non-empty query matched nothing', () => {
    const hipoteca = searchConceptos(CATALOGO, 'hipoteca', 'recuperable');
    expect(hipoteca.matches).toEqual([]);
    expect(hipoteca.noMatch).toBe(true);

    expect(searchConceptos(CATALOGO, '', 'recuperable').noMatch).toBe(false);
  });

  it('never offers an inactive concept', () => {
    const result = searchConceptos(CATALOGO, 'adquisiciones', 'no_recuperable');

    expect(result.matches).toEqual([]);
    expect(result.noMatch).toBe(true);
    expect(ids(searchConceptos(CATALOGO, '', 'no_recuperable').matches)).toEqual(['1']);
  });

  it('never offers a concept of the wrong nature for the modality', () => {
    // spec scenario: "A recoverable concept cannot be booked as an expense".
    expect(searchConceptos(CATALOGO, 'accidentados', 'no_recuperable').matches).toEqual([]);
    // spec scenario: "A non-recoverable concept cannot create a debt".
    expect(searchConceptos(CATALOGO, 'donaciones', 'recuperable').matches).toEqual([]);
  });

  it('matches the slug as well as the name', () => {
    expect(ids(searchConceptos(CATALOGO, 'hermano-caido', 'recuperable').matches)).toEqual(['6']);
  });

  it('does not mutate the catalog it is given', () => {
    const before = [...CATALOGO];

    searchConceptos(CATALOGO, 'a');

    expect(CATALOGO).toEqual(before);
  });
});

describe('filterByNaturaleza', () => {
  it('keeps only the requested nature, preserving catalog order and the active flag', () => {
    expect(ids(filterByNaturaleza(CATALOGO, 'no_recuperable'))).toEqual(['1', '5']);
    expect(ids(filterByNaturaleza(CATALOGO, 'recuperable'))).toEqual(['2', '3', '4', '6']);
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
