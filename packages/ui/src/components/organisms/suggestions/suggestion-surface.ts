import type { ReactNode } from 'react';
import { partsOf } from '#ui/lib/parts';
import type { EntryMetrics } from './entry-metrics';
import type { SuggestingField } from './suggestion-context';
import type { KeyReason } from './suggestion-keys.hook';
import {
  type Suggested,
  type Suggestion,
  type SuggestionItemShape,
  suggestionOf,
  suggestionsOf,
  writtenParts,
} from './suggestions-of';

type SurfaceReason = KeyReason | 'back';

/** The props of a field the presentation reads as they are. */
interface SurfaceLook {
  label: string;
  placeholder?: string;
  invalid: boolean;
  disabled: boolean;
  onFocusChange: (focused: boolean) => void;
}

/** The entry: what it holds, whether the list is open, `closed` when the list
 *  may not draw, and `onNone`, what Enter does with nothing to pick. */
interface SurfaceEntry {
  text: string;
  onText: (text: string) => void;
  open: boolean;
  setOpen: (open: boolean, why: SurfaceReason) => boolean;
  closed: boolean;
  onNone: () => boolean;
}

/** The list: the suggestions for the entry, a row after them, and what draws
 *  in their place. */
interface SurfaceList {
  suggested: Suggested;
  trailing: Suggestion | null;
  empty: ReactNode;
  loading: boolean;
}

/** What a field with suggestions hands the presentation it draws in: the
 *  pointer's entry with its anchored list, or the D-pad's stop with its
 *  dialog. */
interface SuggestionSurface {
  field: SuggestingField;
  metrics: EntryMetrics;
  look: SurfaceLook;
  entry: SurfaceEntry;
  list: SurfaceList;
}

interface EntryControl {
  open: boolean;
  setOpen: (open: boolean, why: SurfaceReason) => boolean;
  type: (text: string) => unknown;
}

/** The entry of a field run by `control`, whose `type` takes what is typed. */
function surfaceEntry(
  control: EntryControl,
  at: Readonly<Pick<SurfaceEntry, 'text' | 'closed' | 'onNone'>>,
): SurfaceEntry {
  return { ...at, onText: control.type, open: control.open, setOpen: control.setOpen };
}

/** A field's own `Item`, `Media` and `Empty`. */
interface ListParts {
  Item: (props: Readonly<SuggestionItemShape>) => ReactNode;
  Media: unknown;
  Empty: unknown;
}

interface Listing {
  value: readonly string[];
  query: string;
  filter?: boolean;
  loading?: boolean;
}

/** The list a field's children offer for what is typed: its items matched
 *  unless `filter` is false, and its `Empty`. */
function suggestionList(children: ReactNode, parts: ListParts, at: Listing): SurfaceList {
  const items = partsOf(children, parts.Item).map((item) => suggestionOf(item, parts.Media));
  const { value, query, filter = true } = at;
  return {
    suggested: suggestionsOf(items, { value, query, filter }),
    trailing: null,
    empty: writtenParts(children, parts.Empty),
    loading: at.loading ?? false,
  };
}

/** Picks `row`, or does what Enter does with nothing to pick. */
function commitRow(surface: SuggestionSurface, row: Suggestion | null | undefined): boolean {
  if (!row || row.disabled) {
    return surface.entry.onNone();
  }
  surface.field.pick(row.name, row.face);
  return true;
}

/** The rows a list draws: the suggestions, then the trailing row. */
function rowsOf({ list }: SuggestionSurface): readonly Suggestion[] {
  return list.trailing === null ? list.suggested.shown : [...list.suggested.shown, list.trailing];
}

/** Whether the list says nothing is left: once something is typed, no
 *  suggestion, and none on its way. */
function saysEmpty({ list, entry }: SuggestionSurface): boolean {
  return list.suggested.shown.length === 0 && !list.loading && entry.text.trim() !== '';
}

/** Whether the list under the entry draws at all. */
function listDrawn(surface: SuggestionSurface): boolean {
  const { entry, list, look } = surface;
  if (!entry.open || entry.closed || look.disabled) {
    return false;
  }
  const empty = list.empty !== null && saysEmpty(surface);
  return rowsOf(surface).length > 0 || list.loading || empty;
}

export type { SuggestionSurface };
export { commitRow, listDrawn, rowsOf, saysEmpty, suggestionList, surfaceEntry };
