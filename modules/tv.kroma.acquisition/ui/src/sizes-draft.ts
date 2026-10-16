import type { QualityId, Sizes } from './rules-schemas';

export type SizeTable = 'movie' | 'episode';
export type SizeField = 'min' | 'preferred' | 'max';

export const SIZE_FIELDS: readonly SizeField[] = ['min', 'preferred', 'max'];

export interface SizesDraft {
  cells: Readonly<Record<string, string>>;
  movieRuntime: string;
  episodeRuntime: string;
}

export function cellKey(table: SizeTable, quality: QualityId, field: SizeField): string {
  return `${table}.${quality}.${field}`;
}

function text(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

export function draftOfSizes(sizes: Sizes, qualities: readonly QualityId[]): SizesDraft {
  const cells: Record<string, string> = {};
  for (const table of ['movie', 'episode'] as const) {
    for (const quality of qualities) {
      const limit = sizes[table].find((row) => row.quality === quality);
      cells[cellKey(table, quality, 'min')] = text(limit?.min ?? 0);
      cells[cellKey(table, quality, 'preferred')] = text(limit?.preferred);
      cells[cellKey(table, quality, 'max')] = text(limit?.max);
    }
  }
  return {
    cells,
    movieRuntime: String(sizes.movieRuntime),
    episodeRuntime: String(sizes.episodeRuntime),
  };
}

export function setCell(draft: SizesDraft, key: string, value: string): SizesDraft {
  return { ...draft, cells: { ...draft.cells, [key]: value } };
}

function read(value: string | undefined): number | null | 'bad' {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 'bad';
}

/** The first cell that holds something unreadable or a range out of order;
 *  `null` when the draft is sound. */
export function badCell(draft: SizesDraft, qualities: readonly QualityId[]): string | null {
  for (const runtime of ['movieRuntime', 'episodeRuntime'] as const) {
    const minutes = read(draft[runtime]);
    if (minutes === 'bad' || minutes === null || minutes < 1) return runtime;
  }
  for (const table of ['movie', 'episode'] as const) {
    for (const quality of qualities) {
      const bad = badLimit(draft, table, quality);
      if (bad) return bad;
    }
  }
  return null;
}

function badLimit(draft: SizesDraft, table: SizeTable, quality: QualityId): string | null {
  const values = SIZE_FIELDS.map((field) => read(draft.cells[cellKey(table, quality, field)]));
  const bad = SIZE_FIELDS.find((_, at) => values[at] === 'bad');
  if (bad) return cellKey(table, quality, bad);
  const [min, preferred, max] = values as (number | null)[];
  const ceiling = max ?? Number.POSITIVE_INFINITY;
  const floor = min ?? 0;
  if (floor > ceiling) return cellKey(table, quality, 'max');
  const wanted = preferred ?? floor;
  if (wanted < floor || wanted > ceiling) return cellKey(table, quality, 'preferred');
  return null;
}

function number(value: string | undefined): number | null {
  const parsed = read(value);
  return parsed === 'bad' ? null : parsed;
}

/** The payload for `PUT /acquisition/sizes`. Call it on a draft `badCell`
 *  cleared, which is where unreadable text is caught. */
export function toSizes(draft: SizesDraft, qualities: readonly QualityId[]): Sizes {
  const table = (which: SizeTable) =>
    qualities.map((quality) => ({
      quality,
      min: number(draft.cells[cellKey(which, quality, 'min')]) ?? 0,
      preferred: number(draft.cells[cellKey(which, quality, 'preferred')]),
      max: number(draft.cells[cellKey(which, quality, 'max')]),
    }));
  return {
    movie: table('movie'),
    episode: table('episode'),
    movieRuntime: number(draft.movieRuntime) ?? 1,
    episodeRuntime: number(draft.episodeRuntime) ?? 1,
  };
}
