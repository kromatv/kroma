// @vitest-environment jsdom
//
// The subtitle-generation poll loop.
//
// Two behaviours here are the difference between a usable feature and an
// annoying one: `onComplete` must fire ONCE per generation (it selects the new
// track, so a second firing yanks the viewer's selection mid-film), and the
// loop must STOP once nothing is in flight rather than polling a finished item
// forever on a television.

import type { KromaClient, SubtitleGeneration } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSubtitleGenerations } from './subtitleGenerations';

const gen = (over: Partial<SubtitleGeneration> = {}): SubtitleGeneration =>
  ({ id: 'g1', status: 'running', subId: null, ...over }) as SubtitleGeneration;

/** A client whose poll answers a scripted sequence, repeating the last entry. */
function clientServing(...pages: SubtitleGeneration[][]) {
  let at = 0;
  const subtitleGenerations = vi.fn(async () => pages[Math.min(at++, pages.length - 1)] ?? []);
  const cancelGeneration = vi.fn(async () => undefined);
  return {
    client: { subtitleGenerations, cancelGeneration } as unknown as KromaClient,
    subtitleGenerations,
    cancelGeneration,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Let the pending poll promise settle. */
const settle = () => act(async () => undefined);

describe('polling', () => {
  it('polls once immediately and reports what came back', async () => {
    const { client, subtitleGenerations } = clientServing([gen()]);
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }),
    );
    await settle();
    expect(subtitleGenerations).toHaveBeenCalledWith('item-1');
    expect(result.current.generations).toHaveLength(1);
  });

  it('does not poll at all while inactive', async () => {
    const { client, subtitleGenerations } = clientServing([gen()]);
    renderHook(() =>
      useSubtitleGenerations(client, 'item-1', { active: false, onComplete: vi.fn() }),
    );
    await settle();
    expect(subtitleGenerations).not.toHaveBeenCalled();
  });

  it('keeps polling while something is in flight', async () => {
    const { client, subtitleGenerations } = clientServing([gen()]);
    renderHook(() => useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }));
    await settle();
    expect(subtitleGenerations).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(subtitleGenerations).toHaveBeenCalledTimes(2);
  });

  // A television left on a finished title would otherwise poll for hours.
  it('stops once nothing is in flight', async () => {
    const { client, subtitleGenerations } = clientServing([gen({ status: 'done', subId: 's1' })]);
    renderHook(() => useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }));
    await settle();
    const after = subtitleGenerations.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(subtitleGenerations).toHaveBeenCalledTimes(after);
  });

  it('stops when the list comes back empty', async () => {
    const { client, subtitleGenerations } = clientServing([]);
    renderHook(() => useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }));
    await settle();
    const after = subtitleGenerations.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(subtitleGenerations).toHaveBeenCalledTimes(after);
  });

  it('rides out a failed poll and tries again', async () => {
    const subtitleGenerations = vi
      .fn<() => Promise<SubtitleGeneration[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([gen()]);
    const client = { subtitleGenerations, cancelGeneration: vi.fn() } as unknown as KromaClient;
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }),
    );
    await settle();
    expect(result.current.generations).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.generations).toHaveLength(1);
  });
});

describe('onComplete', () => {
  it('fires with the new track id when a generation finishes', async () => {
    const onComplete = vi.fn();
    const { client } = clientServing([gen()], [gen({ status: 'done', subId: 'sub-9' })]);
    renderHook(() => useSubtitleGenerations(client, 'item-1', { onComplete }));
    await settle();
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(onComplete).toHaveBeenCalledWith('sub-9');
  });

  // It selects the new track, so a repeat would yank the viewer's own choice
  // out from under them later in the film.
  it('fires only once for the same generation', async () => {
    const onComplete = vi.fn();
    const done = gen({ status: 'done', subId: 'sub-9' });
    // Still something in flight, so the loop keeps running past the finish.
    const { client } = clientServing([done, gen({ id: 'g2' })]);
    renderHook(() => useSubtitleGenerations(client, 'item-1', { onComplete }));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores a finished generation that produced no track', async () => {
    const onComplete = vi.fn();
    const { client } = clientServing([gen({ status: 'done', subId: null })]);
    renderHook(() => useSubtitleGenerations(client, 'item-1', { onComplete }));
    await settle();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('starts a clean slate when the item changes', async () => {
    const onComplete = vi.fn();
    const { client } = clientServing([gen({ status: 'done', subId: 'sub-9' })]);
    const { rerender } = renderHook(
      ({ id }) => useSubtitleGenerations(client, id, { onComplete }),
      { initialProps: { id: 'item-1' } },
    );
    await settle();
    expect(onComplete).toHaveBeenCalledTimes(1);
    rerender({ id: 'item-2' });
    await settle();
    // The same generation id counts again: it belongs to a different title now.
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});

describe('cancel and refresh', () => {
  it('drops the row immediately and asks the server to stop', async () => {
    const { client, cancelGeneration } = clientServing([gen()]);
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }),
    );
    await settle();
    act(() => result.current.cancel('g1'));
    expect(result.current.generations).toHaveLength(0);
    expect(cancelGeneration).toHaveBeenCalledWith('item-1', 'g1');
  });

  it('survives a cancellation the server refuses', async () => {
    const { client } = clientServing([gen()]);
    (client as unknown as { cancelGeneration: unknown }).cancelGeneration = vi.fn(async () => {
      throw new Error('nope');
    });
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }),
    );
    await settle();
    act(() => result.current.cancel('g1'));
    expect(result.current.generations).toHaveLength(0);
  });

  // The loop stops itself when idle, so kicking off a new generation has to be
  // able to wake it back up.
  it('re-arms a stopped loop', async () => {
    const { client, subtitleGenerations } = clientServing([]);
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, 'item-1', { onComplete: vi.fn() }),
    );
    await settle();
    const idle = subtitleGenerations.mock.calls.length;
    act(() => result.current.refresh());
    await settle();
    expect(subtitleGenerations.mock.calls.length).toBeGreaterThan(idle);
  });
});
