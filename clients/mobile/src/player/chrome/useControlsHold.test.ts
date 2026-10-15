// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useControlsHold } from './useControlsHold';

function controls() {
  const give = vi.fn();
  const hold = vi.fn(() => give);
  return { hold, give };
}

describe('useControlsHold', () => {
  it('holds the controls up once however many times a touch takes it', () => {
    const { hold } = controls();
    const { result } = renderHook(() => useControlsHold(hold));

    result.current.take();
    result.current.take();

    expect(hold).toHaveBeenCalledTimes(1);
  });

  it('gives the hold back, and takes a fresh one after that', () => {
    const { hold, give } = controls();
    const { result } = renderHook(() => useControlsHold(hold));

    result.current.take();
    result.current.give();
    result.current.take();

    expect(give).toHaveBeenCalledTimes(1);
    expect(hold).toHaveBeenCalledTimes(2);
  });

  it('gives nothing back when nothing was taken', () => {
    const { give } = controls();
    const { result } = renderHook(() => useControlsHold(undefined));

    result.current.take();
    result.current.give();

    expect(give).not.toHaveBeenCalled();
  });

  it('never leaves the controls pinned up when the player unmounts mid-touch', () => {
    const { hold, give } = controls();
    const { result, unmount } = renderHook(() => useControlsHold(hold));
    result.current.take();

    unmount();

    expect(give).toHaveBeenCalledTimes(1);
  });
});
