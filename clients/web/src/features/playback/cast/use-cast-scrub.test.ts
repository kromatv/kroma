// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCastScrub } from './use-cast-scrub.hook';

function mount(positionMs = 60_000) {
  const send = vi.fn(async () => null);
  const hook = renderHook(({ at }) => useCastScrub({ positionMs: at, durationMs: 600_000, send }), {
    initialProps: { at: positionMs },
  });
  return { ...hook, send };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('seeking a television from here', () => {
  it('reads the playhead and the runtime in seconds', () => {
    const { result } = mount();

    expect(result.current.cur).toBe(60);
    expect(result.current.dur).toBe(600);
    expect(result.current.seekPreview).toBeNull();
  });

  it('moves only the preview while a scrub is in flight', () => {
    const { result, send } = mount();

    act(() => result.current.scrubPreview(300));

    expect(result.current.seekPreview).toBe(300);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends one seek on commit and keeps the handle where it was left', () => {
    const { result, send } = mount();
    act(() => result.current.scrubPreview(300));

    act(() => result.current.scrubCommit());

    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'seek', positionMs: 300_000 });
    expect(result.current.seekPreview).toBe(300);
  });

  it('lets go of the handle once the television reports a position near it', () => {
    const { result, rerender } = mount();
    act(() => result.current.scrubPreview(300));
    act(() => result.current.scrubCommit());

    rerender({ at: 301_000 });

    expect(result.current.seekPreview).toBeNull();
  });

  it('lets go after four seconds when the television never follows', () => {
    vi.useFakeTimers();
    const { result } = mount();
    act(() => result.current.scrubPreview(300));
    act(() => result.current.scrubCommit());

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.seekPreview).toBeNull();
  });

  it('sends nothing when there is no scrub to commit', () => {
    const { result, send } = mount();

    act(() => result.current.scrubCommit());

    expect(send).not.toHaveBeenCalled();
  });
});
