// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGridFocus } from './useGridFocus';

/** Render the grid hook and expose a helper that presses a key inside `act`,
 * returning whether the hook reported the key as handled. */
function grid(opts: Parameters<typeof useGridFocus>[0]) {
  const view = renderHook((p: Parameters<typeof useGridFocus>[0]) => useGridFocus(p), {
    initialProps: opts,
  });
  const press = (key: Parameters<ReturnType<typeof useGridFocus>['onKey']>[0]) => {
    let handled = false;
    act(() => {
      handled = view.result.current.onKey(key);
    });
    return handled;
  };
  return { ...view, press };
}

describe('useGridFocus', () => {
  it('starts at initial (default 0) and moves right within a row', () => {
    const { result, press } = grid({ count: 6, cols: 3 });
    expect(result.current.index).toBe(0);
    expect(press('Right')).toBe(true);
    expect(result.current.index).toBe(1);
  });

  it('honours the initial index', () => {
    const { result } = grid({ count: 6, cols: 3, initial: 4 });
    expect(result.current.index).toBe(4);
  });

  it('clamps ◀ at the first column and ▶ at the last column (no wrap)', () => {
    const { result, press } = grid({ count: 6, cols: 3 });
    // At col 0, Left is consumed but does not move.
    expect(press('Left')).toBe(true);
    expect(result.current.index).toBe(0);
    // Walk to the last column, then Right must not overflow.
    act(() => result.current.setIndex(2));
    expect(press('Right')).toBe(true);
    expect(result.current.index).toBe(2);
  });

  it('stops ▶ at the last populated cell of a ragged final row', () => {
    // count 5, cols 3: index 4 sits at col 1 with no cell to its right.
    const { result, press } = grid({ count: 5, cols: 3, initial: 4 });
    expect(press('Right')).toBe(true);
    expect(result.current.index).toBe(4);
  });

  it('moves down a full column and up a full column', () => {
    const { result, press } = grid({ count: 9, cols: 3, initial: 0 });
    expect(press('Down')).toBe(true);
    expect(result.current.index).toBe(3);
    expect(press('Up')).toBe(true);
    expect(result.current.index).toBe(0);
  });

  it('▲ off the top row calls onExit("top") and reports handled only when onExit exists', () => {
    const onExit = vi.fn();
    const { press } = grid({ count: 6, cols: 3, onExit });
    expect(press('Up')).toBe(true);
    expect(onExit).toHaveBeenCalledWith('top');
    // Without an onExit, the same edge press is reported unhandled.
    const bare = grid({ count: 6, cols: 3 });
    expect(bare.press('Up')).toBe(false);
  });

  it('▼ past the last row calls onExit("bottom")', () => {
    const onExit = vi.fn();
    // index 4 + cols 3 = 7 >= count 6 → bottom edge.
    const { press } = grid({ count: 6, cols: 3, initial: 4, onExit });
    expect(press('Down')).toBe(true);
    expect(onExit).toHaveBeenCalledWith('bottom');
  });

  it('Enter activates the focused index; Back goes back', () => {
    const onActivate = vi.fn();
    const onBack = vi.fn();
    const { press } = grid({ count: 6, cols: 3, initial: 2, onActivate, onBack });
    expect(press('Enter')).toBe(true);
    expect(onActivate).toHaveBeenCalledWith(2);
    expect(press('Back')).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('reports Enter/Back unhandled when no callback is wired', () => {
    const { press } = grid({ count: 6, cols: 3 });
    expect(press('Enter')).toBe(false);
    expect(press('Back')).toBe(false);
  });

  it('an empty grid still lets ▲ exit and Back go back', () => {
    const onExit = vi.fn();
    const onBack = vi.fn();
    const { press } = grid({ count: 0, cols: 3, onExit, onBack });
    expect(press('Up')).toBe(true);
    expect(onExit).toHaveBeenCalledWith('top');
    expect(press('Back')).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    // A movement key with nothing to move to is simply unhandled.
    expect(press('Right')).toBe(false);
  });

  it('hover(i) returns a focus setter for that cell', () => {
    const { result } = grid({ count: 6, cols: 3 });
    act(() => result.current.hover(5)());
    expect(result.current.index).toBe(5);
  });
});
