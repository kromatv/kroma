import type { PerfWindow } from '@kromatv/client/performance';

export const PERF_TABS = ['requests', 'jobs', 'statements', 'functions', 'slow', 'live'] as const;

export type PerfTab = (typeof PERF_TABS)[number];

export const PERF_WINDOWS: readonly PerfWindow[] = ['1h', '24h', '7d', '30d'];

/** What the Performance page shows, as its URL holds it: the tab, the period,
 *  and the one row whose drawer is open. */
export interface PerfSearch {
  tab?: PerfTab;
  window?: PerfWindow;
  scope?: string;
  segment?: string;
  slow?: string;
}
