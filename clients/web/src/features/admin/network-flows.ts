import type { DeclaredPurpose, Flow, FlowQuery, FlowVerdict } from '@kromatv/client/network';
import { CORE_CALLER } from '#web/features/admin/network-callers';

export const FLOW_PAGE_SIZE = 50;

export type VerdictFilter = 'all' | FlowVerdict;

export interface FlowFilters {
  caller: string | null;
  purpose: string | null;
  verdict: VerdictFilter;
  host: string;
}

export const NO_FLOW_FILTERS: FlowFilters = {
  caller: null,
  purpose: null,
  verdict: 'all',
  host: '',
};

/** Which page of the journal is showing. `before` is null on the live first
 * page; past it, the id the pages were taken from, so they hold still. */
export interface FlowPosition {
  page: number;
  before: number | null;
}

export const FIRST_FLOW_PAGE: FlowPosition = { page: 1, before: null };

/** The request for one page of the journal under `filters`. */
export function flowQuery(filters: FlowFilters, { page, before }: FlowPosition): FlowQuery {
  const host = filters.host.trim();
  return {
    limit: FLOW_PAGE_SIZE,
    ...(page > 1 ? { offset: (page - 1) * FLOW_PAGE_SIZE } : {}),
    ...(before === null ? {} : { before }),
    ...(filters.caller ? { caller: filters.caller } : {}),
    ...(filters.purpose ? { purpose: filters.purpose } : {}),
    ...(filters.verdict === 'all' ? {} : { verdict: filters.verdict }),
    ...(host ? { host } : {}),
  };
}

/** Where a jump to `page` lands. Leaving the first page anchors on the newest
 * connection on screen; coming back to it goes live again. */
export function flowPositionAt(
  page: number,
  current: FlowPosition,
  shown: readonly Flow[],
): FlowPosition {
  if (page === 1) return FIRST_FLOW_PAGE;
  const newest = shown[0]?.id;
  const anchored = newest === undefined ? null : newest + 1;
  return { page, before: current.before ?? anchored };
}

/** How many pages `total` connections fill; never fewer than one. */
export function flowPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / FLOW_PAGE_SIZE));
}

export function distinctSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function withPicked(values: Iterable<string>, picked: string | null): Iterable<string> {
  return picked ? [...values, picked] : values;
}

/** Every caller worth filtering on: the server first, then each module. */
export function callerChoices(
  purposes: readonly DeclaredPurpose[],
  flows: readonly Flow[],
  picked: string | null,
): string[] {
  const seen = [...purposes, ...flows].map((entry) => entry.caller);
  return distinctSorted(withPicked(seen, picked)).sort(
    (a, b) => Number(b === CORE_CALLER) - Number(a === CORE_CALLER),
  );
}

/** The purposes `caller` declared or used, or every purpose when no caller is picked. */
export function purposeChoices(
  purposes: readonly DeclaredPurpose[],
  flows: readonly Flow[],
  caller: string | null,
  picked: string | null,
): string[] {
  const seen = [...purposes, ...flows]
    .filter((entry) => caller === null || entry.caller === caller)
    .map((entry) => entry.purpose);
  return distinctSorted(withPicked(seen, picked));
}
