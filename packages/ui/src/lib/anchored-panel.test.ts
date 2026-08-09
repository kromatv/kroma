// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ListKeysAt,
  type PanelKeyEvent,
  useAnchoredPlacement,
  useListKeys,
  useTriggerFocus,
} from './anchored-panel';

function keyEvent(key: string) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event: PanelKeyEvent = { nativeEvent: { key }, preventDefault, stopPropagation };
  return { event, preventDefault, stopPropagation };
}

const ROWS = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

// A live `at`: `active` has to move as the hook sets it, or every arrow press
// would be measured from the same starting row.
function panel(over: Partial<ListKeysAt> = {}) {
  const state = { active: 0 };
  const onPick = vi.fn();
  const onClose = vi.fn();
  const setActive = vi.fn((index: number) => {
    state.active = index;
  });
  const { result, rerender } = renderHook(() =>
    useListKeys({
      count: ROWS.length,
      active: state.active,
      setActive,
      labelAt: (i) => ROWS[i] as string,
      onPick,
      onClose,
      ...over,
    }),
  );
  const press = (key: string) => {
    const { event, ...spies } = keyEvent(key);
    act(() => result.current.onKeyDown(event));
    rerender();
    return spies;
  };
  return { press, state, setActive, onPick, onClose, result, rerender };
}

describe('the roving highlight', () => {
  it('moves down and up one row at a time', () => {
    const p = panel();
    p.press('ArrowDown');
    expect(p.state.active).toBe(1);
    p.press('ArrowDown');
    expect(p.state.active).toBe(2);
    p.press('ArrowUp');
    expect(p.state.active).toBe(1);
  });

  it('stops at each end rather than wrapping', () => {
    const p = panel();
    p.press('ArrowUp');
    expect(p.setActive).not.toHaveBeenCalled();
    for (let i = 0; i < 6; i++) p.press('ArrowDown');
    expect(p.state.active).toBe(ROWS.length - 1);
  });

  it('jumps to the first and last row', () => {
    const p = panel();
    p.press('End');
    expect(p.state.active).toBe(3);
    p.press('Home');
    expect(p.state.active).toBe(0);
  });

  it('steps over a disabled row instead of landing on it', () => {
    const p = panel({ disabledAt: (i) => i === 1 || i === 2 });
    p.press('ArrowDown');
    expect(p.state.active).toBe(3);
  });

  it('lands Home and End on the nearest enabled row', () => {
    const p = panel({ disabledAt: (i) => i === 0 || i === 3 });
    p.press('End');
    expect(p.state.active).toBe(2);
    p.press('Home');
    expect(p.state.active).toBe(1);
  });

  it('picks the active row with Enter and with Space', () => {
    const p = panel();
    p.press('ArrowDown');
    p.press('Enter');
    expect(p.onPick).toHaveBeenCalledWith(1);
    p.press(' ');
    expect(p.onPick).toHaveBeenCalledTimes(2);
  });

  it('refuses to pick a disabled row', () => {
    const p = panel({ disabledAt: (i) => i === 0 });
    p.press('Enter');
    expect(p.onPick).not.toHaveBeenCalled();
  });

  it('closes on Escape and on Tab', () => {
    const p = panel();
    p.press('Escape');
    p.press('Tab');
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('claims every key it answers, so the trigger never reopens the panel', () => {
    // The trigger's own press responder sits under this: a key that reaches it
    // reopens what the panel just closed.
    const p = panel();
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab', 'a']) {
      const event = p.press(key);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    }
  });

  it('leaves a key it does not answer alone', () => {
    const p = panel();
    const event = p.press('F5');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('survives an event with no stopPropagation of its own', () => {
    const { result } = renderHook(() =>
      useListKeys({ count: 2, active: 0, setActive: vi.fn(), onPick: vi.fn(), onClose: vi.fn() }),
    );
    const bare: PanelKeyEvent = { nativeEvent: { key: 'ArrowDown' }, preventDefault: vi.fn() };
    expect(() => act(() => result.current.onKeyDown(bare))).not.toThrow();
  });

  it('exposes move for a pointer path that needs the same skip rules', () => {
    const p = panel({ disabledAt: (i) => i === 1 });
    act(() => p.result.current.move(0, 1));
    expect(p.state.active).toBe(2);
  });
});

describe('type-ahead', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('jumps to the first row a printable key starts', () => {
    const p = panel();
    p.press('c');
    expect(p.state.active).toBe(2);
  });

  it('is case-insensitive', () => {
    const p = panel();
    p.press('D');
    expect(p.state.active).toBe(3);
  });

  it('accumulates quick keys into one prefix', () => {
    const p = panel({ labelAt: (i) => ['Alpha', 'Alto', 'Alba'][i] as string, count: 3 });
    p.press('a');
    p.press('l');
    p.press('t');
    expect(p.state.active).toBe(1);
  });

  it('starts a new prefix after a pause, so the next letter is its own search', () => {
    const p = panel();
    p.press('c');
    expect(p.state.active).toBe(2);
    vi.advanceTimersByTime(501);
    p.press('d');
    expect(p.state.active).toBe(3);
  });

  it('leaves the highlight alone when nothing matches', () => {
    const p = panel();
    p.press('z');
    expect(p.setActive).not.toHaveBeenCalled();
  });

  it('skips a disabled row it would otherwise match', () => {
    const p = panel({ disabledAt: (i) => i === 2 });
    p.press('c');
    expect(p.setActive).not.toHaveBeenCalled();
  });

  it('does nothing at all when the panel has no labels to search', () => {
    const p = panel({ labelAt: undefined });
    p.press('c');
    expect(p.setActive).not.toHaveBeenCalled();
  });
});

describe('useTriggerFocus', () => {
  it('focuses the trigger while the panel lives and hands focus back on close', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const focus = vi.spyOn(trigger, 'focus');
    const { unmount } = renderHook(() => useTriggerFocus({ current: trigger }));
    expect(focus).toHaveBeenCalledTimes(1);
    unmount();
    expect(focus).toHaveBeenCalledTimes(2);
    trigger.remove();
  });

  it('does not throw when there is no trigger yet', () => {
    expect(() => renderHook(() => useTriggerFocus({ current: null }))).not.toThrow();
  });
});

describe('useAnchoredPlacement', () => {
  const rect = { left: 40, right: 240, top: 100, bottom: 130, width: 200, height: 30 };

  function trigger() {
    const el = document.createElement('button');
    el.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => rect });
    return el;
  }

  // The ref is built ONCE per test: it is in the effect's dependencies, so a
  // fresh object each render would re-run the measure forever - which is
  // exactly what a caller's `useRef` guarantees against.
  const anchorTo = (el: HTMLElement | null) => ({ current: el });

  it('measures before paint, so the panel never flashes at the origin', () => {
    const anchor = anchorTo(trigger());
    const { result } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    expect(result.current).toMatchObject({ left: 40, top: rect.bottom + 6 });
  });

  it('stays null when the anchor is not a measurable element', () => {
    const anchor = anchorTo(null);
    const { result } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    expect(result.current).toBeNull();
  });

  it('re-places on resize and on a scroll in any container', () => {
    const el = trigger();
    let top = 100;
    el.getBoundingClientRect = () =>
      ({ ...rect, top, bottom: top + 30, toJSON: () => rect }) as DOMRect;
    const anchor = anchorTo(el);
    // Queued, never called inline: the hook assigns the frame id AFTER the
    // callback returns, so a synchronous rAF would leave its "a frame is
    // already booked" flag set and swallow every later event.
    const queued: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => queued.push(cb));
    const flush = () =>
      act(() => {
        for (const cb of queued.splice(0)) cb(0);
      });
    const { result } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    expect(result.current?.top).toBe(136);

    top = 300;
    act(() => void window.dispatchEvent(new Event('resize')));
    flush();
    expect(result.current?.top).toBe(336);

    top = 420;
    act(() => void window.dispatchEvent(new Event('scroll')));
    flush();
    expect(result.current?.top).toBe(456);
    raf.mockRestore();
  });

  it('coalesces a burst of scrolls into one measure per frame', () => {
    const anchor = anchorTo(trigger());
    const queued: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        queued.push(cb);
        return queued.length;
      });
    renderHook(() => useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }));
    act(() => {
      for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('scroll'));
    });
    expect(queued).toHaveLength(1);
    raf.mockRestore();
  });

  it('stops listening once the panel is gone', () => {
    const anchor = anchorTo(trigger());
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    unmount();
    const events = remove.mock.calls.map((c) => c[0]);
    expect(events).toContain('resize');
    expect(events).toContain('scroll');
    remove.mockRestore();
  });

  it('cancels a frame still queued when it unmounts', () => {
    const anchor = anchorTo(trigger());
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
    const { unmount } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    act(() => void window.dispatchEvent(new Event('scroll')));
    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
    raf.mockRestore();
    cancel.mockRestore();
  });
});
