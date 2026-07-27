// @vitest-environment jsdom
//
// The "Suggestions IA" poll loop.
//
// The server generates the section lazily behind an LLM, so `null` means "still
// working" rather than "nothing" - and the difference decides whether the
// detail screen shows a spinner or gives up. The ceiling matters too: a model
// that never answers must stop the loop rather than poll a television forever.

import type { KromaClient, Section } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiSuggest } from './aiSuggest';

const section = (items: unknown[] = [{ id: 'a' }]) => ({ title: 'For you', items }) as Section;

/** A client answering a scripted sequence, repeating the last entry. */
function clientServing(...pages: (Section | null)[]) {
  let at = 0;
  const aiSuggest = vi.fn(async () => pages[Math.min(at++, pages.length - 1)] ?? null);
  return { client: { aiSuggest } as unknown as KromaClient, aiSuggest };
}

const settle = () => act(async () => undefined);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAiSuggest', () => {
  it('reports the section as soon as one arrives', async () => {
    const { client } = clientServing(section());
    const { result } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    expect(result.current.section?.items).toHaveLength(1);
    expect(result.current.pending).toBe(false);
  });

  // An empty section is a real answer - the model ran and found nothing - so
  // the caller renders nothing instead of spinning forever.
  it('treats an empty section as a real answer, not as still-working', async () => {
    const { client } = clientServing(section([]));
    const { result } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    expect(result.current.section?.items).toHaveLength(0);
    expect(result.current.pending).toBe(false);
  });

  it('keeps polling while the server answers null', async () => {
    const { client, aiSuggest } = clientServing(null, null, section());
    const { result } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    expect(result.current.pending).toBe(true);
    expect(aiSuggest).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(aiSuggest).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(result.current.section).not.toBeNull();
    expect(result.current.pending).toBe(false);
  });

  // A model that never answers must not keep a television polling all evening.
  it('gives up after the ceiling', async () => {
    const { client, aiSuggest } = clientServing(null);
    const { result } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    for (let i = 0; i < 14; i++) {
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
    }
    expect(result.current.pending).toBe(false);
    expect(result.current.section).toBeNull();
    // 1 immediate + 12 retries, and then it stops asking.
    expect(aiSuggest).toHaveBeenCalledTimes(13);
  });

  it('stops pending when the request fails', async () => {
    const client = {
      aiSuggest: vi.fn(async () => {
        throw new Error('offline');
      }),
    } as unknown as KromaClient;
    const { result } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    expect(result.current.pending).toBe(false);
  });

  it('does not poll at all while inactive', async () => {
    const { client, aiSuggest } = clientServing(section());
    renderHook(() => useAiSuggest(client, 'item-1', { active: false }));
    await settle();
    expect(aiSuggest).not.toHaveBeenCalled();
  });

  it('starts over for a different title', async () => {
    const { client, aiSuggest } = clientServing(section());
    const { result, rerender } = renderHook(({ id }) => useAiSuggest(client, id), {
      initialProps: { id: 'item-1' },
    });
    await settle();
    expect(result.current.section).not.toBeNull();
    rerender({ id: 'item-2' });
    await settle();
    expect(aiSuggest).toHaveBeenLastCalledWith('item-2');
  });

  it('stops polling once unmounted', async () => {
    const { client, aiSuggest } = clientServing(null);
    const { unmount } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(aiSuggest).toHaveBeenCalledTimes(1);
  });
});

describe('progress', () => {
  // The LLM run is opaque, so this is an elapsed-time ESTIMATE. It must never
  // read as finished before the work actually lands.
  it('climbs while pending but never reaches 1', async () => {
    const { client } = clientServing(null);
    const { result } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    expect(result.current.progress).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    const early = result.current.progress;
    expect(early).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.progress).toBeGreaterThan(early);
    expect(result.current.progress).toBeLessThanOrEqual(0.96);
  });

  it('stays at zero when nothing is pending', async () => {
    const { client } = clientServing(section());
    const { result } = renderHook(() => useAiSuggest(client, 'item-1'));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.progress).toBe(0);
  });
});
