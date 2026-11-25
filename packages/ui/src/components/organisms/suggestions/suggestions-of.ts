import type { ReactElement, ReactNode } from 'react';
import { sortParts } from '#ui/lib/parts';
import { matchText } from '#ui/lib/text-match';

const MARKS = /\p{M}/gu;
const SPACES = /\s+/g;

function foldName(name: string): string {
  return name.normalize('NFD').replace(MARKS, '').replace(SPACES, ' ').trim().toLowerCase();
}

/** Whether `names` already holds `name`, compared folded. */
function holds(names: readonly string[], name: string): boolean {
  const folded = foldName(name);
  return names.some((held) => foldName(held) === folded);
}

/** The props every field's `Item` part takes. */
interface SuggestionItemShape {
  value: string;
  disabled?: boolean;
  children?: ReactNode;
}

/** One suggestion as a list holds it: its name, the mark a pick carries off,
 *  and the element that draws its row. */
interface Suggestion {
  key: string;
  name: string;
  face: ReactNode;
  disabled: boolean;
  node: ReactElement;
}

/** The parts of `children` written as `part`, or null where there is none. */
function writtenParts(children: ReactNode, part: unknown): ReactNode {
  const [written] = sortParts(children, part);
  return written.length > 0 ? written : null;
}

/** An `Item` element as the list holds it, its face read from its `media` part. */
function suggestionOf(item: ReactElement<SuggestionItemShape>, media: unknown): Suggestion {
  return {
    key: item.key ?? item.props.value,
    name: item.props.value,
    face: writtenParts(item.props.children, media),
    disabled: item.props.disabled === true,
    node: item,
  };
}

interface Suggesting {
  value: readonly string[];
  query: string;
  filter: boolean;
}

/** What the list holds for a query: the suggestions still to add, the typed
 *  text when it names none of them (`free`), and the one it names exactly. */
interface Suggested {
  shown: readonly Suggestion[];
  free: string | null;
  exact: Suggestion | undefined;
}

function matched(items: readonly Suggestion[], query: string): Suggestion[] {
  return items
    .map((item) => ({ item, match: matchText(item.name, query) }))
    .filter((scored) => scored.match !== null)
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
    .map((scored) => scored.item);
}

/** The list for a query. Suggestions already in `value` are left out; with
 *  `filter`, the rest are matched against the query, best first. */
function suggestionsOf(items: readonly Suggestion[], at: Suggesting): Suggested {
  const { value, filter } = at;
  const query = at.query.trim();
  const open = items.filter((item) => !holds(value, item.name));
  const shown = filter && query !== '' ? matched(open, query) : open;
  const folded = foldName(query);
  const named = (item: Suggestion) => foldName(item.name) === folded;
  const free = query === '' || holds(value, query) || items.some(named) ? null : query;
  return { shown, free, exact: shown.find(named) };
}

export type { Suggested, Suggestion, SuggestionItemShape };
export { holds, suggestionOf, suggestionsOf, writtenParts };
