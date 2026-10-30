import type { DeclaredPurpose, Flow, FlowQuery, FlowVerdict } from '@kromatv/client/network';
import { CORE_CALLER } from '#web/features/admin/network-callers';
import { destination } from '#web/features/admin/network-format';

export const FLOW_LIMIT = 500;

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

/** The server's half of the filters; the host search runs on the page. */
export function flowQuery(filters: FlowFilters): FlowQuery {
  return {
    limit: FLOW_LIMIT,
    ...(filters.caller ? { caller: filters.caller } : {}),
    ...(filters.purpose ? { purpose: filters.purpose } : {}),
    ...(filters.verdict === 'all' ? {} : { verdict: filters.verdict }),
  };
}

/** The connections whose `host:port` holds `search`, case aside. */
export function matchingHost(flows: readonly Flow[], search: string): readonly Flow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return flows;
  return flows.filter((flow) => destination(flow.host, flow.port).toLowerCase().includes(needle));
}

function distinctSorted(values: Iterable<string>): string[] {
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
