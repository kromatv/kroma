// @vitest-environment jsdom
//
// The finger half of the rail: on a phone the scrub is a PanResponder, which
// react-native-web never drives, so the gesture is exercised through the
// config the responder was built with.

import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAD } from './alphabet-rail-context';
import { type Slot, useLetterScrub } from './use-letter-scrub';

interface Gesture {
  dx: number;
  dy: number;
  moveY: number;
}

interface PanConfig {
  onMoveShouldSetPanResponderCapture: (event: unknown, gesture: Gesture) => boolean;
  onPanResponderGrant: () => void;
  onPanResponderMove: (event: unknown, gesture: Gesture) => void;
  onPanResponderTerminationRequest: () => boolean;
  onPanResponderRelease: () => void;
  onPanResponderTerminate: () => void;
}

const rn = vi.hoisted(() => ({
  isTV: false,
  config: null as PanConfig | null,
  handlers: { onStartShouldSetResponder: () => true },
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    get isTV() {
      return rn.isTV;
    },
  },
  PanResponder: {
    create: (config: PanConfig) => {
      rn.config ??= config;
      return { panHandlers: rn.handlers };
    },
  },
}));

const ROW = 20;
const TOP = 100;
const SCROLL = 40;

const SLOTS: Slot[] = ['#', 'A', 'B', 'C', 'D'].map((value) => ({ value, present: true }));

beforeEach(() => {
  rn.isTV = false;
  rn.config = null;
  Object.defineProperty(window, 'scrollY', { value: SCROLL, configurable: true });
});

type Measure = (callback: (x: number, y: number) => void) => void;

const domRail = () => ({ getBoundingClientRect: () => ({ top: TOP }) });

const nativeRail = (measure: Measure) => ({ measureInWindow: measure });

function scrub(node: object) {
  const rail = { current: node as unknown as View } as RefObject<View | null>;
  const onJump = vi.fn();
  const view = renderHook(() => useLetterScrub(rail, SLOTS, ROW, onJump));
  if (!rn.config) throw new Error('the responder was never created');
  return { ...view, gesture: rn.config, onJump };
}

const gesture = (over: Partial<Gesture> = {}): Gesture => ({ dx: 0, dy: 0, moveY: 0, ...over });

const rowY = (index: number) => PAD + index * ROW + ROW / 2;

describe('taking the gesture', () => {
  it('takes a finger that runs along the rail, in either direction', () => {
    const { gesture: pan } = scrub(domRail());
    expect(pan.onMoveShouldSetPanResponderCapture(null, gesture({ dy: 20, dx: 2 }))).toBe(true);
    expect(pan.onMoveShouldSetPanResponderCapture(null, gesture({ dy: -20, dx: 2 }))).toBe(true);
  });

  it('leaves a tap to the letter under it', () => {
    const { gesture: pan } = scrub(domRail());
    expect(pan.onMoveShouldSetPanResponderCapture(null, gesture({ dy: 4 }))).toBe(false);
  });

  it('leaves a sideways swipe to whatever is behind the rail', () => {
    const { gesture: pan } = scrub(domRail());
    expect(pan.onMoveShouldSetPanResponderCapture(null, gesture({ dy: 20, dx: 30 }))).toBe(false);
  });

  it('does not give the touch back to an ancestor scroll view', () => {
    const { gesture: pan } = scrub(domRail());
    expect(pan.onPanResponderTerminationRequest()).toBe(false);
  });
});

describe('scrubbing with a finger', () => {
  it('measures the rail against the page it is scrolled to', () => {
    const { gesture: pan, onJump } = scrub(domRail());
    act(() => pan.onPanResponderGrant());
    act(() => pan.onPanResponderMove(null, gesture({ moveY: TOP + SCROLL + rowY(2) })));
    expect(onJump).toHaveBeenCalledWith('B');
  });

  it('adds no page scroll on a surface that has none', () => {
    // A React Native global carries no `scrollY` at all; the rail's own box is
    // the whole origin there.
    Object.defineProperty(window, 'scrollY', { value: undefined, configurable: true });
    const { gesture: pan, onJump } = scrub(domRail());
    act(() => pan.onPanResponderGrant());
    act(() => pan.onPanResponderMove(null, gesture({ moveY: TOP + rowY(2) })));
    expect(onJump).toHaveBeenCalledWith('B');
  });

  it('measures it through the native layout when there is no box to read', () => {
    const { gesture: pan, onJump } = scrub(nativeRail((callback) => callback(0, TOP)));
    act(() => pan.onPanResponderGrant());
    act(() => pan.onPanResponderMove(null, gesture({ moveY: TOP + rowY(3) })));
    expect(onJump).toHaveBeenCalledWith('C');
  });

  it('ignores a move that arrives before the measurement does', () => {
    const { gesture: pan, onJump } = scrub(nativeRail(() => {}));
    act(() => pan.onPanResponderGrant());
    act(() => pan.onPanResponderMove(null, gesture({ moveY: TOP + rowY(2) })));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('reports each letter the finger crosses into, once', () => {
    const { gesture: pan, onJump } = scrub(domRail());
    const origin = TOP + SCROLL;
    act(() => pan.onPanResponderGrant());
    act(() => pan.onPanResponderMove(null, gesture({ moveY: origin + rowY(1) })));
    act(() => pan.onPanResponderMove(null, gesture({ moveY: origin + rowY(1) + 3 })));
    act(() => pan.onPanResponderMove(null, gesture({ moveY: origin + rowY(2) })));
    expect(onJump.mock.calls.flat()).toEqual(['A', 'B']);
  });

  it('drops the bubble when the finger lifts', () => {
    const { gesture: pan, result } = scrub(domRail());
    act(() => pan.onPanResponderGrant());
    act(() => pan.onPanResponderMove(null, gesture({ moveY: TOP + SCROLL + rowY(1) })));
    expect(result.current.bubble).toEqual({ letter: 'A', y: rowY(1) });

    act(() => pan.onPanResponderRelease());
    expect(result.current.bubble).toBeNull();
  });

  it('drops it when the gesture is terminated out from under it', () => {
    const { gesture: pan, result } = scrub(domRail());
    act(() => pan.onPanResponderGrant());
    act(() => pan.onPanResponderMove(null, gesture({ moveY: TOP + SCROLL + rowY(1) })));

    act(() => pan.onPanResponderTerminate());
    expect(result.current.bubble).toBeNull();
  });
});

describe('who gets the gesture at all', () => {
  it('hands the rail its handlers on a surface with a finger', () => {
    expect(scrub(domRail()).result.current.panHandlers).toBe(rn.handlers);
  });

  it('hands a television none, because a television has no finger', () => {
    rn.isTV = true;
    expect(scrub(domRail()).result.current.panHandlers).toBeNull();
  });
});
