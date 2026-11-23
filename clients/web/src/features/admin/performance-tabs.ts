import type { PerfWindow } from '@kromatv/client/performance';

export const PERF_TABS = ['requests', 'jobs', 'statements', 'functions', 'slow', 'live'] as const;

export type PerfTab = (typeof PERF_TABS)[number];

export const PERF_WINDOWS: readonly PerfWindow[] = ['1h', '24h', '7d', '30d'];

/** An id as the URL holds it. The letter in front keeps the router from
 *  reading it as a number, which would lose the last digits of a segment key. */
export function urlId(id: string): string {
  return `k${id}`;
}

/** The id a URL value names, or `undefined` for none. */
export function idFromUrl(value: string | undefined): string | undefined {
  return value?.startsWith('k') ? value.slice(1) : value;
}

/** What the Performance page shows, as its URL holds it: the tab, the period,
 *  and the one row whose drawer is open. */
export interface PerfSearch {
  tab?: PerfTab;
  window?: PerfWindow;
  scope?: string;
  segment?: string;
  slow?: string;
}
