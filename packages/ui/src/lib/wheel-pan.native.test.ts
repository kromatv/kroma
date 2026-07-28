// @vitest-environment jsdom
//
// Mouse-wheel / trackpad panning, both halves.
//
// The rule the web half encodes is "show me what else is here", not "pick this
// one": the wheel moves the row and never the selection. Three things make that
// work and all three are invisible from the signature - both axes drive a
// horizontal row (a trackpad swipes sideways, a mouse only has a wheel), the
// page underneath must not scroll, and a zero delta must not be reported at all
// or the row snaps back on every inertia tail frame. The native half is a no-op
// with the same signature, because a television has no pointer and the caller
// must not have to know which platform it is on.

import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { useWheelPan as useWheelPanNative } from './wheel-pan';
import { useWheelPan as useWheelPanWeb } from './wheel-pan.web';

/** The RNW View IS the DOM node, which is what the web half relies on. */
function viewport() {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return { current: node } as unknown as RefObject<View | null>;
}

function wheel(ref: RefObject<View | null>, init: WheelEventInit) {
  const event = new WheelEvent('wheel', { cancelable: true, ...init });
  (ref.current as unknown as HTMLElement).dispatchEvent(event);
  return event;
}

describe('the web half', () => {
  it('reports wheel travel in raw px', () => {
    const ref = viewport();
    const onPan = vi.fn();
    renderHook(() => useWheelPanWeb(ref, onPan));
    wheel(ref, { deltaY: 120 });
    expect(onPan).toHaveBeenCalledWith(120);
  });

  it('takes whichever axis moved more', () => {
    const ref = viewport();
    const onPan = vi.fn();
    renderHook(() => useWheelPanWeb(ref, onPan));

    // A trackpad swiped sideways.
    wheel(ref, { deltaX: 80, deltaY: 10 });
    expect(onPan).toHaveBeenLastCalledWith(80);

    // A mouse, which only has a wheel.
    wheel(ref, { deltaX: 0, deltaY: -45 });
    expect(onPan).toHaveBeenLastCalledWith(-45);
  });

  it('compares magnitudes, not signs', () => {
    const ref = viewport();
    const onPan = vi.fn();
    renderHook(() => useWheelPanWeb(ref, onPan));
    // A large negative X beats a small positive Y.
    wheel(ref, { deltaX: -90, deltaY: 5 });
    expect(onPan).toHaveBeenCalledWith(-90);
  });

  it('stops the page scrolling underneath', () => {
    const ref = viewport();
    renderHook(() => useWheelPanWeb(ref, vi.fn()));
    // The row is what the pointer is on, so the page must not move.
    expect(wheel(ref, { deltaY: 60 }).defaultPrevented).toBe(true);
  });

  it('ignores a zero delta entirely', () => {
    const ref = viewport();
    const onPan = vi.fn();
    renderHook(() => useWheelPanWeb(ref, onPan));
    const event = wheel(ref, { deltaX: 0, deltaY: 0 });
    expect(onPan).not.toHaveBeenCalled();
    // Not even prevented: a zero-delta wheel event is not this row's gesture,
    // and swallowing it would block whatever else wanted it.
    expect(event.defaultPrevented).toBe(false);
  });

  it('is silent while disabled, and wakes when re-enabled', () => {
    const ref = viewport();
    const onPan = vi.fn();
    const { rerender } = renderHook(({ on }) => useWheelPanWeb(ref, onPan, on), {
      initialProps: { on: false },
    });
    wheel(ref, { deltaY: 60 });
    expect(onPan).not.toHaveBeenCalled();

    rerender({ on: true });
    wheel(ref, { deltaY: 60 });
    expect(onPan).toHaveBeenCalledOnce();
  });

  it('lets go of the node on unmount', () => {
    const ref = viewport();
    const onPan = vi.fn();
    const { unmount } = renderHook(() => useWheelPanWeb(ref, onPan));
    unmount();
    wheel(ref, { deltaY: 60 });
    // A listener left on a detached row keeps the row's closure alive and keeps
    // answering for a viewport that is gone.
    expect(onPan).not.toHaveBeenCalled();
  });

  it('does nothing when there is no node yet', () => {
    const empty = { current: null } as RefObject<View | null>;
    expect(() => renderHook(() => useWheelPanWeb(empty, vi.fn()))).not.toThrow();
  });
});

describe('the native half', () => {
  it('is a silent no-op with the same signature', () => {
    const ref = viewport();
    const onPan = vi.fn();
    // The caller spells this the same way on every platform; a television just
    // has no pointer to listen to.
    expect(() => renderHook(() => useWheelPanNative(ref, onPan))).not.toThrow();
    wheel(ref, { deltaY: 120 });
    expect(onPan).not.toHaveBeenCalled();
  });

  it('attaches nothing, so the page keeps its own wheel', () => {
    const ref = viewport();
    renderHook(() => useWheelPanNative(ref, vi.fn()));
    expect(wheel(ref, { deltaY: 60 }).defaultPrevented).toBe(false);
  });
});
