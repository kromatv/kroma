// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { PAD } from './alphabet-rail-context';
import { clampNum, type Slot, useLetterScrub } from './use-letter-scrub';

const ROW = 20;
const TOP = 100;

const LETTERS = ['#', 'A', 'B', 'C', 'D'];

const all = (present: (letter: string) => boolean): Slot[] =>
  LETTERS.map((value) => ({ value, present: present(value) }));

const EVERY = all(() => true);
const SPARSE = all((letter) => letter === 'A' || letter === 'C');

function scrub(slots: Slot[] = EVERY) {
  const node = document.createElement('div');
  node.getBoundingClientRect = () => ({ top: TOP }) as DOMRect;
  // jsdom implements no pointer capture, and the scrub calls it on every press.
  node.setPointerCapture = vi.fn();
  document.body.append(node);

  const rail = { current: node as unknown as View } as RefObject<View | null>;
  const onJump = vi.fn();
  const view = renderHook(() => useLetterScrub(rail, slots, ROW, onJump));
  return { ...view, node, onJump };
}

const rowY = (index: number) => TOP + PAD + index * ROW + ROW / 2;

function pointer(node: HTMLElement, type: string, clientY: number, buttons = 1) {
  const event = new PointerEvent(type, { clientY, buttons, pointerId: 7, cancelable: true });
  act(() => void node.dispatchEvent(event));
  return event;
}

describe('scrubbing the rail', () => {
  it('jumps to the letter the pointer came down on', () => {
    const { node, onJump } = scrub();
    pointer(node, 'pointerdown', rowY(2));
    expect(onJump).toHaveBeenCalledWith('B');
  });

  it('names that letter in a bubble centred on its row', () => {
    const { node, result } = scrub();
    pointer(node, 'pointerdown', rowY(2));
    expect(result.current.bubble).toEqual({ letter: 'B', y: PAD + 2 * ROW + ROW / 2 });
  });

  it('holds at the first and the last letter past either end of the rail', () => {
    const above = scrub();
    pointer(above.node, 'pointerdown', TOP - 400);
    expect(above.onJump).toHaveBeenCalledWith('#');

    const below = scrub();
    pointer(below.node, 'pointerdown', TOP + 4000);
    expect(below.onJump).toHaveBeenCalledWith('D');
  });

  it('snaps a letter with no section to the nearest one that has one', () => {
    const { node, onJump } = scrub(SPARSE);
    pointer(node, 'pointerdown', rowY(4));
    expect(onJump).toHaveBeenLastCalledWith('C');
    pointer(node, 'pointermove', rowY(0));
    expect(onJump).toHaveBeenLastCalledWith('A');
  });

  it('resolves a tie upwards, so a scrub down never jumps back', () => {
    const { node, onJump } = scrub(SPARSE);
    pointer(node, 'pointerdown', rowY(2));
    expect(onJump).toHaveBeenCalledWith('A');
  });

  it('reports one jump however far the finger travels inside a letter', () => {
    const { node, onJump } = scrub();
    pointer(node, 'pointerdown', rowY(1));
    pointer(node, 'pointermove', rowY(1) + 4);
    pointer(node, 'pointermove', rowY(1) - 4);
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('reports the next letter as the finger crosses into it', () => {
    const { node, onJump } = scrub();
    pointer(node, 'pointerdown', rowY(1));
    pointer(node, 'pointermove', rowY(2));
    pointer(node, 'pointermove', rowY(3));
    expect(onJump.mock.calls.flat()).toEqual(['A', 'B', 'C']);
  });

  it('keeps the scrub when the finger leaves the rail, and swallows the press', () => {
    const { node } = scrub();
    const down = pointer(node, 'pointerdown', rowY(1));
    expect(node.setPointerCapture).toHaveBeenCalledWith(7);
    expect(down.defaultPrevented).toBe(true);
  });

  it('ignores a pointer that is only passing over the rail', () => {
    const { node, onJump, result } = scrub();
    pointer(node, 'pointermove', rowY(2), 0);
    expect(onJump).not.toHaveBeenCalled();
    expect(result.current.bubble).toBeNull();
  });

  it('has nowhere to jump when no letter has a section', () => {
    const { node, onJump, result } = scrub(all(() => false));
    pointer(node, 'pointerdown', rowY(2));
    expect(onJump).not.toHaveBeenCalled();
    expect(result.current.bubble).toBeNull();
  });
});

describe('ending a scrub', () => {
  it('drops the bubble when the finger lifts', () => {
    const { node, result } = scrub();
    pointer(node, 'pointerdown', rowY(1));
    pointer(node, 'pointerup', rowY(1));
    expect(result.current.bubble).toBeNull();
  });

  it('drops it when the gesture is cancelled out from under it', () => {
    const { node, result } = scrub();
    pointer(node, 'pointerdown', rowY(1));
    pointer(node, 'pointercancel', rowY(1));
    expect(result.current.bubble).toBeNull();
  });

  it('jumps again when the next scrub lands on the letter the last one left', () => {
    const { node, onJump } = scrub();
    pointer(node, 'pointerdown', rowY(1));
    pointer(node, 'pointerup', rowY(1));
    pointer(node, 'pointerdown', rowY(1));
    expect(onJump).toHaveBeenCalledTimes(2);
  });

  it('stops listening once the rail unmounts', () => {
    const { node, onJump, unmount } = scrub();
    unmount();
    pointer(node, 'pointerdown', rowY(1));
    expect(onJump).not.toHaveBeenCalled();
  });
});

describe('the rail itself', () => {
  it('hands back no gesture handlers on a pointer platform', () => {
    expect(scrub().result.current.panHandlers).toBeNull();
  });

  it('survives a rail that has not mounted yet', () => {
    const rail = { current: null } as RefObject<View | null>;
    const { result } = renderHook(() => useLetterScrub(rail, EVERY, ROW, vi.fn()));
    expect(result.current.bubble).toBeNull();
  });
});

describe('clampNum', () => {
  it('keeps a value inside its bounds and passes one that already is', () => {
    expect(clampNum(19, 8, 31)).toBe(19);
    expect(clampNum(19, 40, 31)).toBe(31);
    expect(clampNum(19, 24, 31)).toBe(24);
  });
});
