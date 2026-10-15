import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMaster, readyMasterStart, resolveMasterStart } from './master-fetch';

function answers(...statuses: number[]) {
  const fetch = vi.fn();
  for (const status of statuses) fetch.mockResolvedValueOnce({ status });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settled<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return pending;
}

describe('fetchMaster', () => {
  it('hands back the first answer that is not a playlist still being written', async () => {
    const fetch = answers(200);

    const answer = await settled(fetchMaster('/index.m3u8'));

    expect(answer.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks again while the playlist is not written yet', async () => {
    const fetch = answers(503, 200);

    const answer = await settled(fetchMaster('/index.m3u8'));

    expect(answer.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up asking after four answers, and hands back the last', async () => {
    const fetch = answers(503, 503, 503, 503);

    const answer = await settled(fetchMaster('/index.m3u8'));

    expect(answer.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('waits longer between each ask rather than spending the module on retries', async () => {
    answers(503, 503, 503, 503);
    const waits: number[] = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((run: () => void, ms?: number) => {
      waits.push(ms ?? 0);
      run();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    await fetchMaster('/index.m3u8');

    expect(waits).toEqual([500, 1000, 2000]);
  });

  it('never asks again after a refusal', async () => {
    const fetch = answers(401);

    const answer = await settled(fetchMaster('/index.m3u8'));

    expect(answer.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('hands the request the caller signal, so an abandoned anchor drops it', async () => {
    const fetch = answers(200);
    const abort = new AbortController();

    await settled(fetchMaster('/index.m3u8', abort.signal));

    expect(fetch).toHaveBeenCalledWith('/index.m3u8', { signal: abort.signal });
  });

  it('asks nothing more once the anchor it was asked for is abandoned', async () => {
    const fetch = answers(503, 200);
    const abort = new AbortController();

    const answer = fetchMaster('/index.m3u8', abort.signal);
    abort.abort();
    await settled(answer);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('lets a master that cannot be fetched fail to its caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(fetchMaster('/index.m3u8')).rejects.toThrow('offline');
  });
});

describe('resolveMasterStart', () => {
  it('short-circuits to 0 for a start at/near zero (no fetch)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await resolveMasterStart('http://x/master.m3u8', 0)).toBe(0);
    expect(await resolveMasterStart('http://x/master.m3u8', 0.4)).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the server-reported keyframe start from the X-Hls-Start header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ headers: { get: (k: string) => (k === 'X-Hls-Start' ? '12.5' : null) } }),
      ),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 30)).toBe(12.5);
  });

  it('keeps the requested start when the header is present but non-numeric', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ headers: { get: () => 'not-a-number' } })),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 30)).toBe(30);
  });

  it('keeps the requested start when the master names no start of its own', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ headers: { get: () => null } })),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 30)).toBe(30);
  });

  it('asks again while a file still arriving has not written the playlist', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ status: 503, headers: { get: () => null } })
      .mockResolvedValue({ status: 200, headers: { get: () => '2395.5' } });
    vi.stubGlobal('fetch', fetchSpy);

    const start = resolveMasterStart('http://x/master.m3u8', 2400);
    await vi.runAllTimersAsync();

    expect(await start).toBe(2395.5);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps the requested start where the playlist is never written', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 503, headers: { get: () => null } })),
    );

    const start = resolveMasterStart('http://x/master.m3u8', 2400);
    await vi.runAllTimersAsync();

    expect(await start).toBe(2400);
  });

  it('keeps the requested start where the master is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 401, headers: { get: () => null } })),
    );

    expect(await resolveMasterStart('http://x/master.m3u8', 2400)).toBe(2400);
  });

  it('falls back to the requested start when the fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 42)).toBe(42);
  });
});

describe('readyMasterStart', () => {
  it('waits for a playlist still being written even at the start of the film', async () => {
    const fetch = answers(503, 503, 200);

    const start = await settled(readyMasterStart('http://x/master.m3u8', 0));

    expect(start).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('reads the real start the server reports for a later anchor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, headers: { get: () => '112.5' } })),
    );

    expect(await readyMasterStart('http://x/master.m3u8', 117)).toBe(112.5);
  });
});
