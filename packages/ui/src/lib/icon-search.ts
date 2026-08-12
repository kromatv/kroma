import { fuzzyQuery, fuzzyScore, fuzzySearch } from './fuzzy-search';
import { iconEntry } from './icon-catalog';

/** A glyph the query reached, and the tags that carried it there - empty when
 * the name itself matched. */
interface IconHit<T extends string> {
  name: T;
  tags: readonly string[];
}

interface IconSearchOptions {
  /** One of `iconCategories()`; absent searches every category. */
  category?: string;
}

// A tag hit is handicapped rather than banished to its own bucket: a name of
// the same quality still wins, while `trash` tagged "delete" beats the names a
// query only scatters through (`device-tablet-exclamation` holds d-e-l-e-t-e).
const TAG_HANDICAP = 24;

interface Scored<T extends string> extends IconHit<T> {
  score: number;
}

function taggedHit<T extends string>(name: T, query: string): Scored<T> | null {
  const matched: { tag: string; score: number }[] = [];
  for (const tag of iconEntry(name)?.tags ?? []) {
    const score = fuzzyScore(tag, query);
    if (score !== null) matched.push({ tag, score });
  }
  matched.sort((a, b) => b.score - a.score);
  const best = matched[0];
  if (!best) return null;
  return { name, tags: matched.map((hit) => hit.tag), score: best.score - TAG_HANDICAP };
}

/**
 * The glyphs a query reaches, best first: the ones whose NAME it matches, and
 * the ones only a TAG matched, merged by how well each matched. Tags need the
 * catalogue (`setIconCatalog`); without it this is the name search alone.
 */
function searchIcons<T extends string>(
  names: readonly T[],
  query: string,
  { category }: IconSearchOptions = {},
): IconHit<T>[] {
  const pool = category ? names.filter((name) => iconEntry(name)?.category === category) : names;
  if (!fuzzyQuery(query)) return pool.map((name) => ({ name, tags: [] }));

  const hits: Scored<T>[] = fuzzySearch(pool, query).map((hit) => ({
    name: hit.text,
    tags: [],
    score: hit.score,
  }));
  const named = new Set(hits.map((hit) => hit.name));
  for (const name of pool) {
    if (named.has(name)) continue;
    const hit = taggedHit(name, query);
    if (hit) hits.push(hit);
  }
  hits.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  return hits.map(({ name, tags }) => ({ name, tags }));
}

export type { IconHit, IconSearchOptions };
export { searchIcons };
