// @vitest-environment jsdom
//
// The browser targets' half of the remote: Back, the transport keys, and the
// auto-repeat guard.
//
// Directional movement is NOT here any more. The spatial navigator owns it on
// every target at once, and it is covered end to end - through real key events,
// on the real components - in ui/primitives/focusable.test.tsx. What is left in
// this engine is the part the navigator has no opinion about.

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocusNav } from './focus-nav.web';

// jsdom returns a zero rect for every element and does not implement
// scrollIntoView, so we stub both: each focusable gets a hand-placed rect and
// scrollIntoView is a no-op (spatial nav calls it after every move).
function rect(left: number, top: number, w: number, h: number): DOMRect {
  return {
    left,
    top,
    width: w,
    height: h,
    right: left + w,
    bottom: top + h,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function focusable(id: string, r: DOMRect): HTMLButtonElement {
  const el = document.createElement('button');
  el.id = id;
  el.setAttribute('data-focus', '');
  el.getBoundingClientRect = () => r;
  document.body.appendChild(el);
  return el;
}

/** A 2x2 grid of focusables:  a b / c d  (100px cells, 100px gaps). */
function grid2x2() {
  const a = focusable('a', rect(0, 0, 100, 100));
  const b = focusable('b', rect(200, 0, 100, 100));
  const c = focusable('c', rect(0, 200, 100, 100));
  const d = focusable('d', rect(200, 200, 100, 100));
  return { a, b, c, d };
}

function key(k: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useFocusNav handlers', () => {
  it('invokes onBack on Back and onPlayPause on a media key', () => {
    grid2x2();
    const onBack = vi.fn();
    const onPlayPause = vi.fn();
    renderHook(() => useFocusNav({ onBack, onPlayPause }));
    key('Escape'); // -> Back
    expect(onBack).toHaveBeenCalledTimes(1);
    key('MediaPlayPause'); // -> PlayPause
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('swallows a held OK so the browser cannot re-activate the button', () => {
    grid2x2();
    renderHook(() => useFocusNav({}));
    const repeat = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(repeat);
    });
    expect(repeat.defaultPrevented).toBe(true);

    // A deliberate single press is left alone: the <button> activates natively.
    const press = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(press);
    });
    expect(press.defaultPrevented).toBe(false);
  });
});

describe('useFocusNav text-field handling', () => {
  it('leaves Backspace to a text field but lets Escape leave the screen', () => {
    const input = document.createElement('input');
    input.id = 'field';
    input.setAttribute('data-focus', '');
    input.getBoundingClientRect = () => rect(0, 0, 100, 100);
    document.body.appendChild(input);
    input.focus();
    const onBack = vi.fn();
    renderHook(() => useFocusNav({ onBack }));
    key('Backspace');
    expect(onBack).not.toHaveBeenCalled();
    key('Escape');
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('useFocusNav pointer environment', () => {
  // Hover-focus was removed on request: the ring moves on D-pad / arrows only,
  // and a mouse interacts by clicking.
  it('hover does not change focus', () => {
    const { a, b } = grid2x2();
    a.focus();
    renderHook(() => useFocusNav({}));
    act(() => {
      b.dispatchEvent(new Event('pointerover', { bubbles: true }));
    });
    expect(document.activeElement?.id).toBe('a');
  });
});
