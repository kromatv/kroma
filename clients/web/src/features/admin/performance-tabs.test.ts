import type { PerfOverview, PerfScopeRow, PerfSegmentRow } from '@kromatv/client/performance';
import { describe, expect, it } from 'vitest';
import {
  closed,
  idFromUrl,
  openDrawer,
  opening,
  scopeId,
  shownIn,
  urlId,
} from './performance-tabs';

const spread = { count: 1, totalMs: 1, meanMs: 1, p50Ms: 1, p95Ms: 1, p99Ms: 1, maxMs: 1 };

const route: PerfScopeRow = {
  kind: 'request',
  name: 'GET /api/home',
  ...spread,
  serverErrors: 0,
  clientErrors: 0,
  segmentsPerCall: 0,
  kinds: {},
  maxSegments: 0,
  worstRepeat: null,
  bytesPerCall: null,
  parts: [],
  flags: [],
};

const statement: PerfSegmentRow = {
  key: '4611686018427387904',
  kind: 'sql',
  label: 'SELECT 1',
  origin: 'core',
  ...spread,
  rowsPerCall: 1,
  fullScanStepsPerCall: 0,
  sorts: 0,
  autoIndexes: 0,
  callers: [],
  flags: [],
};

const overview: PerfOverview = {
  window: '1h',
  enabled: true,
  switchable: true,
  generatedAtMs: 0,
  requests: [route],
  jobs: [],
  segments: [statement],
};

describe('scopeId', () => {
  it('names a route by its kind and its template', () => {
    expect(scopeId({ kind: 'request', name: 'GET /api/shows/{id}' })).toBe(
      'request:GET /api/shows/{id}',
    );
  });
});

describe('urlId', () => {
  it('round-trips a key too long for a JavaScript number', () => {
    const key = '4611686018427387904';

    expect(idFromUrl(urlId(key))).toBe(key);
    expect(Number(urlId(key))).toBeNaN();
  });

  it('reads nothing from an absent value', () => {
    expect(idFromUrl(undefined)).toBeUndefined();
  });
});

describe('opening', () => {
  it('keeps the drawer already open beneath the new one', () => {
    const search = opening({ tab: 'slow', slow: urlId('7') }, { segment: statement.key });

    expect(search).toEqual({ tab: 'slow', slow: 'k7', segment: urlId(statement.key) });
  });

  it('opens a route from a closed page', () => {
    expect(opening({ window: '7d' }, { scope: 'request:GET /api/home' })).toEqual({
      window: '7d',
      scope: 'request:GET /api/home',
    });
  });
});

describe('closed', () => {
  it('closes every drawer and keeps the tab and the period', () => {
    const search = closed({ tab: 'jobs', window: '24h', scope: 'x', segment: 'k1', slow: 'k2' });

    expect(search).toEqual({ tab: 'jobs', window: '24h' });
  });
});

describe('openDrawer', () => {
  it('shows a segment over the route it was opened from', () => {
    const search = opening({ scope: 'request:GET /api/home' }, { segment: statement.key });

    expect(openDrawer(search, overview)).toEqual({ segment: statement });
  });

  it('falls back to the route when the period does not list the segment', () => {
    const search = opening({ scope: 'request:GET /api/home' }, { segment: '12' });

    expect(openDrawer(search, overview)).toEqual({ scope: route });
  });

  it('falls back to the slow request a segment was opened from', () => {
    const search = opening({ slow: urlId('7') }, { segment: '12' });

    expect(openDrawer(search, overview)).toEqual({ slow: '7' });
  });

  it('opens a slow request before the overview has loaded', () => {
    expect(openDrawer({ slow: urlId('7') }, null)).toEqual({ slow: '7' });
  });
});

describe('shownIn', () => {
  it('shows requests over the last hour until the URL says otherwise', () => {
    expect(shownIn({})).toEqual({ tab: 'requests', window: '1h' });
    expect(shownIn({ tab: 'slow', window: '7d' })).toEqual({ tab: 'slow', window: '7d' });
  });
});
