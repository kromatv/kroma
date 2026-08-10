// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWheelTravel as useNativeTravel, type WheelHost } from './wheel-pan';
import { useWheelTravel } from './wheel-pan.web';

function host(): WheelHost {
  const el = document.body.appendChild(document.createElement('div'));
  return { current: el } as unknown as WheelHost;
}

function wheel(at: WheelHost, init: WheelEventInit) {
  const event = new WheelEvent('wheel', { cancelable: true, ...init });
  (at.current as unknown as HTMLElement).dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('a list that is its own surface scroll', () => {
  it('takes the vertical wheel and consumes the gesture', () => {
    const onTravel = vi.fn();
    const at = host();
    renderHook(() => useWheelTravel(at, onTravel));
    const event = wheel(at, { deltaY: 120 });
    expect(onTravel).toHaveBeenCalledWith(120);
    expect(event.defaultPrevented).toBe(true);
  });

  it('takes whichever axis moved more', () => {
    const onTravel = vi.fn();
    const at = host();
    renderHook(() => useWheelTravel(at, onTravel));
    wheel(at, { deltaX: 80, deltaY: 20 });
    expect(onTravel).toHaveBeenCalledWith(80);
  });

  it('reads a line delta as pixels', () => {
    const onTravel = vi.fn();
    const at = host();
    renderHook(() => useWheelTravel(at, onTravel));
    wheel(at, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect(onTravel).toHaveBeenCalledWith(48);
  });

  it('reads a page delta as a viewport', () => {
    const onTravel = vi.fn();
    const at = host();
    renderHook(() => useWheelTravel(at, onTravel));
    wheel(at, { deltaY: 2, deltaMode: WheelEvent.DOM_DELTA_PAGE });
    expect(onTravel).toHaveBeenCalledWith(2 * window.innerHeight);
  });

  it('leaves a pinch zoom to the browser', () => {
    const onTravel = vi.fn();
    const at = host();
    renderHook(() => useWheelTravel(at, onTravel));
    const event = wheel(at, { deltaY: 120, ctrlKey: true });
    expect(onTravel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores a zero delta entirely', () => {
    const onTravel = vi.fn();
    const at = host();
    renderHook(() => useWheelTravel(at, onTravel));
    const event = wheel(at, { deltaX: 0, deltaY: 0 });
    expect(onTravel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('is silent while disabled, and wakes when re-enabled', () => {
    const onTravel = vi.fn();
    const at = host();
    const { rerender } = renderHook(({ on }) => useWheelTravel(at, onTravel, on), {
      initialProps: { on: false },
    });
    wheel(at, { deltaY: 120 });
    expect(onTravel).not.toHaveBeenCalled();
    rerender({ on: true });
    wheel(at, { deltaY: 120 });
    expect(onTravel).toHaveBeenCalledTimes(1);
  });

  it('lets go of the node on unmount', () => {
    const onTravel = vi.fn();
    const at = host();
    const { unmount } = renderHook(() => useWheelTravel(at, onTravel));
    unmount();
    const event = wheel(at, { deltaY: 120 });
    expect(onTravel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing when there is no node yet', () => {
    const empty = { current: null } as WheelHost;
    expect(() => renderHook(() => useWheelTravel(empty, vi.fn()))).not.toThrow();
  });
});

describe('the native half', () => {
  it('is a silent no-op with the same signature', () => {
    const onTravel = vi.fn();
    const at = host();
    renderHook(() => useNativeTravel(at, onTravel));
    const event = wheel(at, { deltaY: 120 });
    expect(onTravel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
