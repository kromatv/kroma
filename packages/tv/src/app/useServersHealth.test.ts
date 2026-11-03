// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useServersHealth } from './useServersHealth';

function fakeFetch(replies: Record<string, { ok?: boolean; body?: unknown; throws?: boolean }>) {
  return vi.fn((input: string) => {
    const reply = replies[String(input)];
    if (!reply || reply.throws) return Promise.reject(new Error('offline'));
    return Promise.resolve({
      ok: reply.ok !== false,
      json: () => Promise.resolve(reply.body ?? {}),
    } as Response);
  });
}

const HEALTH = {
  status: 'ok',
  name: 'Salon',
  version: '0.9.3',
  ffprobe: true,
  libraries: 2,
  items: 342,
  shows: 18,
};

const NAS = 'http://nas:4040';
const NAS_HEALTH = `${NAS}/api/health`;

const offline = () => Promise.reject(new Error('offline'));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useServersHealth', () => {
  it('reports the identity a server states in its health answer', async () => {
    vi.stubGlobal('fetch', fakeFetch({ 'http://nas:4040/api/health': { body: HEALTH } }));
    const { result } = renderHook(() => useServersHealth(['http://nas:4040']));

    await waitFor(() => expect(result.current['http://nas:4040']).toBeDefined());
    const probe = result.current['http://nas:4040'];
    expect(probe).toMatchObject({
      online: true,
      name: 'Salon',
      version: '0.9.3',
      libraries: 2,
      items: 342,
      shows: 18,
    });
    expect(probe?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('marks a refused or erroring server offline, with no identity', async () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        'http://dead:4040/api/health': { throws: true },
        'http://busy:4040/api/health': { ok: false },
      }),
    );
    const { result } = renderHook(() => useServersHealth(['http://dead:4040', 'http://busy:4040']));

    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    expect(result.current['http://dead:4040']).toEqual({ online: false });
    expect(result.current['http://busy:4040']).toEqual({ online: false });
  });

  it('counts a server that answers an unreadable body as up but anonymous', async () => {
    vi.stubGlobal('fetch', fakeFetch({ 'http://old:4040/api/health': { body: { status: 'ok' } } }));
    const { result } = renderHook(() => useServersHealth(['http://old:4040']));

    await waitFor(() => expect(result.current['http://old:4040']).toBeDefined());
    expect(result.current['http://old:4040']?.online).toBe(true);
    expect(result.current['http://old:4040']?.version).toBeUndefined();
  });

  it('probes a server that failed again within a second', async () => {
    vi.useFakeTimers();
    let up = false;
    const answering = fakeFetch({ [NAS_HEALTH]: { body: HEALTH } });
    vi.stubGlobal('fetch', (url: string) => (up ? answering(url) : offline()));
    const { result } = renderHook(() => useServersHealth([NAS]));
    await vi.advanceTimersByTimeAsync(0);
    up = true;

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(result.current[NAS]?.online).toBe(true);
  });

  it('backs off a server that keeps failing, up to the slow loop', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(offline);
    vi.stubGlobal('fetch', fetchFn);
    renderHook(() => useServersHealth([NAS]));

    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000 + 12000 + 12000);

    expect(fetchFn).toHaveBeenCalledTimes(7);
  });

  it('keeps the slow loop while every server answers', async () => {
    vi.useFakeTimers();
    const fetchFn = fakeFetch({ [NAS_HEALTH]: { body: HEALTH } });
    vi.stubGlobal('fetch', fetchFn);
    renderHook(() => useServersHealth([NAS]));

    await vi.advanceTimersByTimeAsync(11_999);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('probes nothing and stays empty without urls', async () => {
    const fetchFn = fakeFetch({});
    vi.stubGlobal('fetch', fetchFn);
    const { result } = renderHook(() => useServersHealth([]));

    await waitFor(() => expect(result.current).toEqual({}));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
