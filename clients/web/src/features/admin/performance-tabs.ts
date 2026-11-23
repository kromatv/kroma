import type {
  PerfOverview,
  PerfScopeRow,
  PerfSegmentRow,
  PerfWindow,
} from '@kromatv/client/performance';
import { scopeId } from '#web/features/admin/performance-format';

export const PERF_TABS = ['requests', 'jobs', 'statements', 'functions', 'slow'] as const;

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
 *  and the drawers open on it. */
export interface PerfSearch {
  tab?: PerfTab;
  window?: PerfWindow;
  scope?: string;
  segment?: string;
  slow?: string;
}

/** The search that opens `open`'s drawer over the one already open, which
 *  stays in the URL beneath it. */
export function opening(prev: PerfSearch, open: PerfSearch): PerfSearch {
  return {
    ...prev,
    scope: open.scope ?? prev.scope,
    segment: open.segment === undefined ? prev.segment : urlId(open.segment),
    slow: open.slow === undefined ? prev.slow : urlId(open.slow),
  };
}

/** The search with every drawer closed. */
export function closed(search: PerfSearch): PerfSearch {
  return { ...search, scope: undefined, segment: undefined, slow: undefined };
}

/** The one drawer the page shows. */
export interface OpenDrawer {
  segment?: PerfSegmentRow;
  scope?: PerfScopeRow;
  slow?: string;
}

/** The drawer the URL opens, the innermost first: a segment opened from a
 *  route or a slow request covers it, and a segment this period does not list
 *  leaves it showing. */
export function openDrawer(search: PerfSearch, overview: PerfOverview | null): OpenDrawer {
  const segmentKey = idFromUrl(search.segment);
  const segment = overview?.segments.find((row) => row.key === segmentKey);
  if (segment) {
    return { segment };
  }
  const scopes = overview ? [...overview.requests, ...overview.jobs] : [];
  const scope = scopes.find((row) => scopeId(row) === search.scope);
  return scope ? { scope } : { slow: idFromUrl(search.slow) };
}
