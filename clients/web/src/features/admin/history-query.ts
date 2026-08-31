import type { MessageKey } from '@kroma/core';
import type { SortColumn, SortDirection } from '@kroma/ui/kit';
import { z } from 'zod';
import { type HistorySort, isHistorySort } from '#web/features/admin/history-columns';

const NO_WINDOW = 0;
const MAX_ID_LENGTH = 128;

export const HISTORY_PAGE = 50;

const NEWEST_FIRST: SortColumn = { column: 'endedAt', direction: 'desc' };

export const HISTORY_RANGES = [
  { value: '24h', labelKey: 'admin.range24h', days: 1 },
  { value: '7d', labelKey: 'admin.range7d', days: 7 },
  { value: '30d', labelKey: 'admin.range30d', days: 30 },
  { value: '90d', labelKey: 'admin.range90d', days: 90 },
  { value: '1y', labelKey: 'admin.range1y', days: 365 },
  { value: 'all', labelKey: 'admin.rangeAll', days: NO_WINDOW },
] as const satisfies readonly { value: string; labelKey: MessageKey; days: number }[];

export type HistoryRange = (typeof HISTORY_RANGES)[number]['value'];

export const EVERY_WINDOW = 'all' satisfies HistoryRange;

export interface HistorySearch {
  library?: string;
  user?: string;
  item?: string;
  range?: HistoryRange;
  sort?: HistorySort;
  dir?: SortDirection;
  page?: number;
}

export interface HistoryRequest {
  days: number;
  user?: string;
  library?: string;
  item?: string;
  sort: string;
  limit: number;
  offset: number;
}

const optionalId = () => z.string().min(1).max(MAX_ID_LENGTH).optional().catch(undefined);

const HistoryParams = z
  .object({
    library: optionalId(),
    user: optionalId(),
    item: optionalId(),
    range: z.string().optional().catch(undefined),
    sort: z.string().optional().catch(undefined),
    dir: z.enum(['asc', 'desc']).optional().catch(undefined),
    page: z.coerce.number().int().min(1).optional().catch(undefined),
  })
  .catch({});

export function isHistoryRange(value: unknown): value is HistoryRange {
  return HISTORY_RANGES.some((option) => option.value === value);
}

function daysIn(range: HistoryRange | undefined): number {
  return HISTORY_RANGES.find((option) => option.value === range)?.days ?? NO_WINDOW;
}

/** Page one is absent rather than `1`, so it does not round-trip into the url. */
export function validateHistorySearch(params: Record<string, unknown>): HistorySearch {
  const { library, user, item, range, sort, dir, page } = HistoryParams.parse(params);
  const search: HistorySearch = {};
  if (library) search.library = library;
  if (user) search.user = user;
  if (item) search.item = item;
  if (isHistoryRange(range)) search.range = range;
  if (isHistorySort(sort)) search.sort = sort;
  if (dir) search.dir = dir;
  if (page !== undefined && page > 1) search.page = page;
  return search;
}

/** The order the table draws: the one in the address, or the newest first. */
export function historySort(search: HistorySearch): readonly SortColumn[] {
  return [
    { column: search.sort ?? NEWEST_FIRST.column, direction: search.dir ?? NEWEST_FIRST.direction },
  ];
}

/** Pressing a column out of the sort leaves it out of the address rather than
 *  naming the default. */
export function historyOrderedBy(
  search: HistorySearch,
  sort: readonly SortColumn[],
): HistorySearch {
  const next: HistorySearch = { ...search, sort: undefined, dir: undefined, page: 1 };
  const first = sort[0];
  if (first && isHistorySort(first.column)) {
    next.sort = first.column;
    next.dir = first.direction;
  }
  return next;
}

export function historyRequest(search: HistorySearch): HistoryRequest {
  const page = search.page ?? 1;
  const request: HistoryRequest = {
    days: daysIn(search.range),
    sort: `${search.sort ?? NEWEST_FIRST.column}:${search.dir ?? NEWEST_FIRST.direction}`,
    limit: HISTORY_PAGE,
    offset: (page - 1) * HISTORY_PAGE,
  };
  if (search.user) request.user = search.user;
  if (search.library) request.library = search.library;
  if (search.item) request.item = search.item;
  return request;
}
