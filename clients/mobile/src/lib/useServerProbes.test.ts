// @vitest-environment jsdom
//
// Probes every saved server on the profile gate independently, each with its
// own abort timer, so one unreachable box does not block the others' badges.

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface HealthOpts {
  signal?: AbortSignal;
}

const health = vi.hoisted(() => ({
  answers: new Map<string, () => Promise<{ name?: string }>>(),
  calls: [] as Array<{ url: string; signal?: AbortSignal }>,
}));

const KromaClient = vi.hoisted(() =>
  vi.fn(function Client(this: Record<string, unknown>, { baseUrl }: { baseUrl: string }) {
    this.health = async (opts?: HealthOpts) => {
      health.calls.push({ url: baseUrl, signal: opts?.signal });
      const answer = health.answers.get(baseUrl);
      if (!answer) throw new Error(`unreachable: ${baseUrl}`);
      return answer();
    };
  }),
);

// `clientUserAgent` too: these hooks build their client through
// `#mobile/lib/device`, which stamps the phone's own User-Agent onto it.
vi.mock('@kroma/core', () => ({ KromaClient, clientUserAgent: () => 'Kroma/test' }));

const renameServer = vi.hoisted(() => vi.fn());
vi.mock('./session', () => ({ useSession: () => ({ renameServer }) }));

import { useServerProbes } from './useServerProbes';

const PROBE_TIMEOUT_MS = 4000;

const online = (url: string, name?: string) => health.answers.set(url, async () => ({ name }));
const hangs = (url: string) =>
  health.answers.set(
    url,
    () =>
      new Promise((_resolve, reject) => {
        const call = health.calls.at(-1);
        call?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );

beforeEach(() => {
  health.answers.clear();
  health.calls.length = 0;
  vi.clearAllMocks();
});

describe('probing', () => {
  it('asks every saved server', async () => {
    online('https://a');
    online('https://b');
    const { result } = renderHook(() => useServerProbes(['https://a', 'https://b']));

    await waitFor(() => {
      expect(result.current['https://a']?.online).toBe(true);
      expect(result.current['https://b']?.online).toBe(true);
    });
  });

  it('reports a server it cannot reach as offline', async () => {
    const { result } = renderHook(() => useServerProbes(['https://gone']));
    await waitFor(() => expect(result.current['https://gone']).toEqual({ online: false }));
  });

  it('answers about each server INDEPENDENTLY', async () => {
    online('https://up');
    hangs('https://down');
    const { result } = renderHook(() => useServerProbes(['https://down', 'https://up']));

    await waitFor(() => expect(result.current['https://up']?.online).toBe(true));
  });

  it('merges results rather than replacing them', async () => {
    online('https://a');
    online('https://b');
    online('https://c');
    const { result } = renderHook(() => useServerProbes(['https://a', 'https://b', 'https://c']));
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(3));
  });

  it('reports nothing before any answer arrives', () => {
    online('https://a');
    const { result } = renderHook(() => useServerProbes(['https://a']));
    expect(result.current).toEqual({});
  });

  it('probes nothing when there are no saved servers', () => {
    renderHook(() => useServerProbes([]));
    expect(KromaClient).not.toHaveBeenCalled();
  });
});

describe('the timeout', () => {
  it('carries an abort signal into every probe', async () => {
    online('https://a');
    renderHook(() => useServerProbes(['https://a']));
    await waitFor(() => expect(health.calls).toHaveLength(1));
    expect(health.calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(health.calls[0]?.signal?.aborted).toBe(false);
  });

  it('gives up on a server that never answers', async () => {
    vi.useFakeTimers();
    hangs('https://slow');
    const { result } = renderHook(() => useServerProbes(['https://slow']));
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 100);
    vi.useRealTimers();

    await waitFor(() => expect(result.current['https://slow']).toEqual({ online: false }));
  });
});

describe('the server’s own name', () => {
  it('reports it alongside the badge', async () => {
    online('https://a', 'Attic');
    const { result } = renderHook(() => useServerProbes(['https://a']));
    await waitFor(() =>
      expect(result.current['https://a']).toEqual({ online: true, name: 'Attic' }),
    );
  });

  it('persists it onto the saved entry', async () => {
    online('https://a', 'Attic');
    renderHook(() => useServerProbes(['https://a']));
    await waitFor(() => expect(renameServer).toHaveBeenCalledWith('https://a', 'Attic'));
  });

  it('does not persist an empty name over a good one', async () => {
    online('https://a', '');
    const { result } = renderHook(() => useServerProbes(['https://a']));
    await waitFor(() => expect(result.current['https://a']?.online).toBe(true));
    expect(renameServer).not.toHaveBeenCalled();
  });

  it('does not persist a name for a server that is down', async () => {
    const { result } = renderHook(() => useServerProbes(['https://gone']));
    await waitFor(() => expect(result.current['https://gone']?.online).toBe(false));
    expect(renameServer).not.toHaveBeenCalled();
  });
});

describe('when the screen goes away', () => {
  it('does not report a result after unmount', async () => {
    // A holder rather than a plain `let`: assigning inside the promise callback
    // leaves TypeScript still believing the variable is null at the call below.
    const answer: { fire: (() => void) | null } = { fire: null };
    health.answers.set(
      'https://a',
      () =>
        new Promise<{ name?: string }>((resolve) => {
          answer.fire = () => resolve({ name: 'Attic' });
        }),
    );
    const { result, unmount } = renderHook(() => useServerProbes(['https://a']));
    await waitFor(() => expect(health.calls).toHaveLength(1));

    unmount();
    answer.fire?.();
    await Promise.resolve();
    expect(result.current).toEqual({});
  });

  it('drops the answer of a probe the list has already moved past', async () => {
    const stale: { fail: (() => void) | null } = { fail: null };
    health.answers.set(
      'https://gone',
      () =>
        new Promise<{ name?: string }>((_resolve, reject) => {
          stale.fail = () => reject(new Error('offline'));
        }),
    );
    online('https://a');
    online('https://b');
    const { result, rerender } = renderHook(({ urls }) => useServerProbes(urls), {
      initialProps: { urls: ['https://gone'] },
    });
    await waitFor(() => expect(health.calls).toHaveLength(1));

    rerender({ urls: ['https://a'] });
    await waitFor(() => expect(result.current['https://a']?.online).toBe(true));

    stale.fail?.();
    rerender({ urls: ['https://a', 'https://b'] });
    await waitFor(() => expect(result.current['https://b']?.online).toBe(true));

    expect(result.current['https://gone']).toBeUndefined();
  });

  it('re-probes when the saved list changes', async () => {
    online('https://a');
    online('https://b');
    const { rerender } = renderHook(({ urls }) => useServerProbes(urls), {
      initialProps: { urls: ['https://a'] },
    });
    await waitFor(() => expect(health.calls).toHaveLength(1));

    rerender({ urls: ['https://a', 'https://b'] });
    await waitFor(() => expect(health.calls.length).toBeGreaterThan(1));
  });

  it('does not re-probe when the same list is passed as a new array', async () => {
    online('https://a');
    const { rerender } = renderHook(({ urls }) => useServerProbes(urls), {
      initialProps: { urls: ['https://a'] },
    });
    await waitFor(() => expect(health.calls).toHaveLength(1));

    rerender({ urls: ['https://a'] });
    await Promise.resolve();
    expect(health.calls).toHaveLength(1);
  });
});
