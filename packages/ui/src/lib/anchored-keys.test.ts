// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ListKeysAt, type PanelKeyEvent, useListKeys, useRowInView } from './anchored-keys';

function keyEvent(key: string) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event: PanelKeyEvent = { nativeEvent: { key }, preventDefault, stopPropagation };
  return { event, preventDefault, stopPropagation };
}

const ROWS = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

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

const ROW_HEIGHT = 44;
const FOLD = ROW_HEIGHT * 2;
const ROWS_IN_PANEL = 5;

function boxOf(height: number): LayoutChangeEvent {
  return { nativeEvent: { layout: { x: 0, y: 0, width: 200, height } } } as LayoutChangeEvent;
}

function scrolledTo(y: number): NativeSyntheticEvent<NativeScrollEvent> {
  return { nativeEvent: { contentOffset: { x: 0, y } } } as NativeSyntheticEvent<NativeScrollEvent>;
}

function scrolling(measured = true) {
  const scrollTo = vi.fn();
  const { result, rerender } = renderHook((active: number) => useRowInView(active), {
    initialProps: 0,
  });
  result.current.scroll.ref.current = { scrollTo } as unknown as ScrollView;
  act(() => {
    if (measured) result.current.scroll.onLayout(boxOf(FOLD));
    for (let i = 0; i < ROWS_IN_PANEL; i++) {
      result.current.onRowLayout(i, i * ROW_HEIGHT, ROW_HEIGHT);
    }
  });
  return {
    scrollTo,
    walkTo: rerender,
    scrollBy: (y: number) => act(() => result.current.scroll.onScroll(scrolledTo(y))),
  };
}

describe('keeping the active row in sight', () => {
  it('brings a row below the fold up to the bottom edge', () => {
    const panel = scrolling();

    panel.walkTo(ROWS_IN_PANEL - 1);

    expect(panel.scrollTo).toHaveBeenCalledWith({
      y: ROWS_IN_PANEL * ROW_HEIGHT - FOLD,
      animated: false,
    });
  });

  it('brings a row above the fold back down to the top edge', () => {
    const panel = scrolling();
    panel.walkTo(ROWS_IN_PANEL - 1);

    panel.walkTo(0);

    expect(panel.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  });

  it('leaves a row already in sight alone', () => {
    const panel = scrolling();

    panel.walkTo(1);

    expect(panel.scrollTo).not.toHaveBeenCalled();
  });

  it('measures against where the viewer scrolled, not where it last scrolled itself', () => {
    const panel = scrolling();

    panel.scrollBy(3 * ROW_HEIGHT);
    panel.walkTo(1);

    expect(panel.scrollTo).toHaveBeenCalledWith({ y: ROW_HEIGHT, animated: false });
  });

  it('stands down until the scroller has reported its own box', () => {
    const panel = scrolling(false);

    panel.walkTo(ROWS_IN_PANEL - 1);

    expect(panel.scrollTo).not.toHaveBeenCalled();
  });
});
