import { describe, expect, it, vi } from 'vitest';
import { TIMING_REPORT_ROUTE, withTimings } from './timed-fetch';
import type { TimingSink } from './timing-sink';

function sinkSpy() {
  const add = vi.fn<TimingSink['add']>();
  const sink: TimingSink = { add, flush: async () => {} };
  return { sink, add };
}

function answering(serverTiming: string | null): typeof globalThis.fetch {
  const headers = new Headers(serverTiming ? { 'server-timing': serverTiming } : {});
  return vi.fn(async () => new Response('{}', { headers }));
}

describe('withTimings', () => {
  it('reports what the device waited next to what the server spent', async () => {
    const { sink, add } = sinkSpy();
    const ticks = [100, 160];
    const fetchFn = withTimings(
      answering('total;dur=12.5, scope;desc="GET /api/home"'),
      sink,
      () => ticks.shift() ?? 0,
    );

    await fetchFn('https://kroma.test/api/home');

    expect(add).toHaveBeenCalledWith({
      kind: 'api',
      name: 'GET /api/home',
      ms: 60,
      serverMs: 12.5,
    });
  });

  it('reports nothing for an answer the server did not time', async () => {
    const { sink, add } = sinkSpy();

    await withTimings(answering(null), sink)('https://kroma.test/api/health');

    expect(add).not.toHaveBeenCalled();
  });

  it('never reports the report itself', async () => {
    const { sink, add } = sinkSpy();

    await withTimings(
      answering(`total;dur=1, scope;desc="${TIMING_REPORT_ROUTE}"`),
      sink,
    )('https://kroma.test/api/perf/client');

    expect(add).not.toHaveBeenCalled();
  });
});
