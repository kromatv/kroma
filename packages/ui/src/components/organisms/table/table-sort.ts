import { createContext, useContext } from 'react';
import type { IconName } from '#ui/lib/glyph';
import { WEB } from '#ui/lib/platform';

type SortDirection = 'asc' | 'desc';

/**
 * One column of the sort, and which way it runs. The array's ORDER is the
 * priority: the first entry orders the rows, the next breaks its ties.
 */
interface SortColumn {
  column: string;
  direction: SortDirection;
}

type SortState = SortDirection | 'none';

interface SortPlace {
  direction: SortDirection;
  rank: number;
}

interface TableSort {
  columns: readonly SortColumn[];
  press: ((column: string) => void) | null;
}

const SortContext = createContext<TableSort | null>(null);

function useTableSort(): TableSort | null {
  return useContext(SortContext);
}

const NEXT_DIRECTION = {
  none: 'asc',
  asc: 'desc',
  desc: null,
} as const satisfies Record<SortState, SortDirection | null>;

const SORT_GLYPH = {
  none: 'arrows-sort',
  asc: 'arrow-narrow-up',
  desc: 'arrow-narrow-down',
} as const satisfies Record<SortState, IconName>;

const ARIA_SORT = {
  none: 'none',
  asc: 'ascending',
  desc: 'descending',
} as const satisfies Record<SortState, string>;

function sortPlace(columns: readonly SortColumn[], column: string): SortPlace | null {
  const at = columns.findIndex((entry) => entry.column === column);
  const found = columns[at];
  return found ? { direction: found.direction, rank: at + 1 } : null;
}

interface SortRules {
  multiple: boolean;
  required: boolean;
}

function nextSort(
  columns: readonly SortColumn[],
  column: string,
  { multiple, required }: SortRules,
): readonly SortColumn[] {
  const place = sortPlace(columns, column);
  const alone = !multiple || (place !== null && columns.length === 1);
  const direction =
    NEXT_DIRECTION[place?.direction ?? 'none'] ?? (required && alone ? 'asc' : null);
  if (!multiple) return direction ? [{ column, direction }] : [];
  if (!direction) return columns.filter((entry) => entry.column !== column);
  if (!place) return [...columns, { column, direction }];
  return columns.map((entry) => (entry.column === column ? { column, direction } : entry));
}

/** React Native has no sort claim and no screen reader on those platforms reads
 *  one, so the rank a heading DRAWS is what reaches assistive tech there. */
function sortClaim(state: SortState): { 'aria-sort'?: string } {
  return WEB ? { 'aria-sort': ARIA_SORT[state] } : {};
}

export type { SortColumn, SortDirection, TableSort };
export { nextSort, SORT_GLYPH, SortContext, sortClaim, sortPlace, useTableSort };
