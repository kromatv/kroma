import type { IndexerDefinitionView } from './schemas';

export type KindFilter = 'all' | 'public' | 'private';

export interface DefinitionFilter {
  query: string;
  kind: KindFilter;
  /** A base language (`fr`), or `all`. */
  language: string;
}

const baseLanguage = (tag: string) => tag.split('-')[0]?.toLowerCase() ?? '';

const kindMatches = (kind: string, wanted: KindFilter) =>
  wanted === 'all' || (wanted === 'public' ? kind === 'public' : kind !== 'public');

/** The trackers that pass every filter, in catalog order. A semi-private
 * tracker counts as private. */
export function filterDefinitions(
  definitions: readonly IndexerDefinitionView[],
  filter: DefinitionFilter,
): IndexerDefinitionView[] {
  const needle = filter.query.trim().toLowerCase();
  return definitions.filter(
    (d) =>
      kindMatches(d.kind, filter.kind) &&
      (filter.language === 'all' || baseLanguage(d.language) === filter.language) &&
      (!needle ||
        d.name.toLowerCase().includes(needle) ||
        d.description.toLowerCase().includes(needle)),
  );
}

/** Each base language the catalog holds, most trackers first. */
export function languagesIn(definitions: readonly IndexerDefinitionView[]): string[] {
  const counts = new Map<string, number>();
  for (const d of definitions) {
    const base = baseLanguage(d.language);
    if (base) counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([code]) => code);
}
