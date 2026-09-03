// @vitest-environment jsdom
//
// The subtitle-generation poll loop.
//
// Two behaviours here are the difference between a usable feature and an
// annoying one: `onComplete` must fire ONCE per generation (it selects the new
// track, so a second firing yanks the viewer's selection mid-film), and the
// loop must STOP once nothing is in flight rather than polling a finished item
// forever on a television.

import { fakeClient } from '@kroma/client/test';
import { GenerationId, ItemId, type SubtitleGeneration, SubtitleId } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSubtitleGenerations } from './subtitleGenerations';

const ITEM = ItemId.parse('item-1');
const OTHER_ITEM = ItemId.parse('item-2');

const gen = (over: Partial<SubtitleGeneration> = {}): SubtitleGeneration =>
  ({ id: GenerationId.parse('g1'), status: 'running', subId: null, ...over }) as SubtitleGeneration;

/** A client whose poll answers a scripted sequence, repeating the last entry. */
function clientServing(...pages: SubtitleGeneration[][]) {
  let at = 0;
  const poll = vi.fn(async () => pages[Math.min(at++, pages.length - 1)] ?? []);
  const cancel = vi.fn(async () => undefined);
  return { client: fakeClient({ subtitles: { generations: poll, cancel } }), poll, cancel };
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
    const { client, poll } = clientServing([gen()]);
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }),
    );
    await settle();
    expect(poll).toHaveBeenCalledWith(ITEM);
    expect(result.current.generations).toHaveLength(1);
  });

  it('does not poll at all while inactive', async () => {
    const { client, poll } = clientServing([gen()]);
    renderHook(() => useSubtitleGenerations(client, ITEM, { active: false, onComplete: vi.fn() }));
    await settle();
    expect(poll).not.toHaveBeenCalled();
  });

  it('keeps polling while something is in flight', async () => {
    const { client, poll } = clientServing([gen()]);
    renderHook(() => useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }));
    await settle();
    expect(poll).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(poll).toHaveBeenCalledTimes(2);
  });

  // A television left on a finished title would otherwise poll for hours.
  it('stops once nothing is in flight', async () => {
    const { client, poll } = clientServing([
      gen({ status: 'done', subId: SubtitleId.parse('s1') }),
    ]);
    renderHook(() => useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }));
    await settle();
    const after = poll.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(poll).toHaveBeenCalledTimes(after);
  });

  it('stops when the list comes back empty', async () => {
    const { client, poll } = clientServing([]);
    renderHook(() => useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }));
    await settle();
    const after = poll.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(poll).toHaveBeenCalledTimes(after);
  });

  it('rides out a failed poll and tries again', async () => {
    const generations = vi
      .fn<() => Promise<SubtitleGeneration[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([gen()]);
    const client = fakeClient({ subtitles: { generations, cancel: vi.fn() } });
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }),
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
    const { client } = clientServing(
      [gen()],
      [gen({ status: 'done', subId: SubtitleId.parse('sub-9') })],
    );
    renderHook(() => useSubtitleGenerations(client, ITEM, { onComplete }));
    await settle();
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(onComplete).toHaveBeenCalledWith(SubtitleId.parse('sub-9'));
  });

  // It selects the new track, so a repeat would yank the viewer's own choice
  // out from under them later in the film.
  it('fires only once for the same generation', async () => {
    const onComplete = vi.fn();
    const done = gen({ status: 'done', subId: SubtitleId.parse('sub-9') });
    // Still something in flight, so the loop keeps running past the finish.
    const { client } = clientServing([done, gen({ id: GenerationId.parse('g2') })]);
    renderHook(() => useSubtitleGenerations(client, ITEM, { onComplete }));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ignores a finished generation that produced no track', async () => {
    const onComplete = vi.fn();
    const { client } = clientServing([gen({ status: 'done', subId: null })]);
    renderHook(() => useSubtitleGenerations(client, ITEM, { onComplete }));
    await settle();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('starts a clean slate when the item changes', async () => {
    const onComplete = vi.fn();
    const { client } = clientServing([gen({ status: 'done', subId: SubtitleId.parse('sub-9') })]);
    const { rerender } = renderHook(
      ({ id }) => useSubtitleGenerations(client, id, { onComplete }),
      { initialProps: { id: ITEM } },
    );
    await settle();
    expect(onComplete).toHaveBeenCalledTimes(1);
    rerender({ id: OTHER_ITEM });
    await settle();
    // The same generation id counts again: it belongs to a different title now.
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});

describe('cancel and refresh', () => {
  it('drops the row immediately and asks the server to stop', async () => {
    const { client, cancel } = clientServing([gen()]);
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }),
    );
    await settle();
    act(() => result.current.cancel(GenerationId.parse('g1')));
    expect(result.current.generations).toHaveLength(0);
    expect(cancel).toHaveBeenCalledWith(ITEM, GenerationId.parse('g1'));
  });

  it('survives a cancellation the server refuses', async () => {
    const client = fakeClient({
      subtitles: {
        generations: vi.fn(async () => [gen()]),
        cancel: vi.fn(async () => {
          throw new Error('nope');
        }),
      },
    });
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }),
    );
    await settle();
    act(() => result.current.cancel(GenerationId.parse('g1')));
    expect(result.current.generations).toHaveLength(0);
  });

  // The loop stops itself when idle, so kicking off a new generation has to be
  // able to wake it back up.
  it('re-arms a stopped loop', async () => {
    const { client, poll } = clientServing([]);
    const { result } = renderHook(() =>
      useSubtitleGenerations(client, ITEM, { onComplete: vi.fn() }),
    );
    await settle();
    const idle = poll.mock.calls.length;
    act(() => result.current.refresh());
    await settle();
    expect(poll.mock.calls.length).toBeGreaterThan(idle);
  });
});
