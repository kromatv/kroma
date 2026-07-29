// @vitest-environment jsdom
//
// Probing every saved server on the profile gate.
//
// This runs on the screen a user reaches when the app cannot decide where to
// send them, which is exactly when something is already wrong - a server moved,
// the Wi-Fi is on a different network, the NAS is asleep. So it has to answer
// about EVERY saved server, independently, and it has to answer at all.
//
// Independently, because the servers are probed together: one unreachable box
// that hangs the whole batch leaves every other entry without a badge, and the
// gate looks broken rather than the one server looking offline. Hence a probe
// per url, each with its own abort timer, each merging its own result.
//
// And "at all", because a saved server that is simply gone never answers. A
// probe with no timeout hangs until the platform gives up, which on a phone is
// long enough that the user has already force-quit the app.
//
// It also carries the admin-configured name back onto the saved entry, so the
// picker stops saying `192.168.1.20:4040` once the box has told it otherwise.

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface HealthOpts {
  signal?: AbortSignal;
}

/** Every client built, keyed by the url it was built for. */
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

/** Answer `url`'s probe with a name (or nothing). */
const online = (url: string, name?: string) => health.answers.set(url, async () => ({ name }));
/** Answer `url`'s probe with a hang that only an abort ends. */
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
    // The other never answers at all.
    hangs('https://down');
    const { result } = renderHook(() => useServerProbes(['https://down', 'https://up']));

    // The reachable one must not wait for the unreachable one; otherwise the
    // whole gate has no badges and looks broken.
    await waitFor(() => expect(result.current['https://up']?.online).toBe(true));
  });

  it('merges results rather than replacing them', async () => {
    online('https://a');
    online('https://b');
    online('https://c');
    const { result } = renderHook(() => useServerProbes(['https://a', 'https://b', 'https://c']));
    // Three concurrent setState calls: a plain assignment would leave only
    // whichever answered last.
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(3));
  });

  it('reports nothing before any answer arrives', () => {
    online('https://a');
    const { result } = renderHook(() => useServerProbes(['https://a']));
    // The gate renders "checking" rather than a wrong badge.
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
    // A saved server that is simply gone never answers, and a probe with no
    // deadline hangs until the platform gives up - long after the user has
    // force-quit.
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
    // So the picker stops showing a bare ip once the box has said what it is
    // called.
    await waitFor(() => expect(renameServer).toHaveBeenCalledWith('https://a', 'Attic'));
  });

  it('does not persist an empty name over a good one', async () => {
    online('https://a', '');
    const { result } = renderHook(() => useServerProbes(['https://a']));
    await waitFor(() => expect(result.current['https://a']?.online).toBe(true));
    // An unnamed server must not erase the label the user is already reading.
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
    // Setting state on an unmounted screen, and renaming a server the user has
    // navigated away from, are both work nobody asked for.
    expect(result.current).toEqual({});
  });

  it('re-probes when the saved list changes', async () => {
    online('https://a');
    online('https://b');
    const { rerender } = renderHook(({ urls }) => useServerProbes(urls), {
      initialProps: { urls: ['https://a'] },
    });
    await waitFor(() => expect(health.calls).toHaveLength(1));

    rerender({ urls: ['https://a', 'https://b'] });
    // A server added on this screen has to get a badge without a reload.
    await waitFor(() => expect(health.calls.length).toBeGreaterThan(1));
  });

  it('does not re-probe when the same list is passed as a new array', async () => {
    online('https://a');
    const { rerender } = renderHook(({ urls }) => useServerProbes(urls), {
      initialProps: { urls: ['https://a'] },
    });
    await waitFor(() => expect(health.calls).toHaveLength(1));

    // A parent re-render hands over an equal-but-new array; keyed on identity
    // this would probe every server on every render.
    rerender({ urls: ['https://a'] });
    await Promise.resolve();
    expect(health.calls).toHaveLength(1);
  });
});
