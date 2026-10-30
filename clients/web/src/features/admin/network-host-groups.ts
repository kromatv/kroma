import { FlowRoute, type SummaryRow } from '@kromatv/client/network';

export const SUMMARY_WINDOWS = [1, 7, 30] as const;
export type SummaryWindow = (typeof SUMMARY_WINDOWS)[number];

export interface DestinationGroup {
  host: string;
  callers: string[];
  purposes: string[];
  routes: FlowRoute[];
  count: number;
  blocked: number;
  bytesIn: number;
  bytesOut: number;
  lastAt: number;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function fold(host: string, rows: readonly SummaryRow[]): DestinationGroup {
  const seenRoutes = new Set(rows.map((row) => row.route));
  return {
    host,
    callers: sortedUnique(rows.map((row) => row.caller)),
    purposes: sortedUnique(rows.map((row) => row.purpose)),
    routes: FlowRoute.options.filter((route) => seenRoutes.has(route)),
    count: rows.reduce((sum, row) => sum + row.count, 0),
    blocked: rows.reduce((sum, row) => sum + (row.verdict === 'blocked' ? row.count : 0), 0),
    bytesIn: rows.reduce((sum, row) => sum + row.bytesIn, 0),
    bytesOut: rows.reduce((sum, row) => sum + row.bytesOut, 0),
    lastAt: Math.max(...rows.map((row) => row.lastAt)),
  };
}

/** One group per host, the busiest first. */
export function groupByHost(rows: readonly SummaryRow[]): DestinationGroup[] {
  const byHost = new Map<string, SummaryRow[]>();
  for (const row of rows) {
    const group = byHost.get(row.host);
    if (group) group.push(row);
    else byHost.set(row.host, [row]);
  }
  return [...byHost]
    .map(([host, hostRows]) => fold(host, hostRows))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
}
