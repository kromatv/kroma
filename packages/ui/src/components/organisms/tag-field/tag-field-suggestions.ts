import { matchText } from '#ui/lib/text-match';
import { foldName, holds } from './tag-field-control';

interface Suggesting<T> {
  value: readonly string[];
  query: string;
  filter: boolean;
  nameOf: (item: T) => string;
}

/** What the list holds for a query: the suggestions still to add, the typed
 *  text when it names none of them (`free`), and the one it names exactly. */
interface Suggested<T> {
  shown: readonly T[];
  free: string | null;
  exact: T | undefined;
}

function matched<T>(items: readonly T[], query: string, nameOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, match: matchText(nameOf(item), query) }))
    .filter((scored) => scored.match !== null)
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
    .map((scored) => scored.item);
}

/** The list for a query. Suggestions already among the tags are left out; with
 *  `filter`, the rest are matched against the query, best first. */
function suggestionsOf<T>(items: readonly T[], at: Suggesting<T>): Suggested<T> {
  const { value, filter, nameOf } = at;
  const query = at.query.trim();
  const open = items.filter((item) => !holds(value, nameOf(item)));
  const shown = filter && query !== '' ? matched(open, query, nameOf) : open;
  const folded = foldName(query);
  const named = (item: T) => foldName(nameOf(item)) === folded;
  const free = query === '' || holds(value, query) || items.some(named) ? null : query;
  return { shown, free, exact: shown.find(named) };
}

export type { Suggested };
export { suggestionsOf };
