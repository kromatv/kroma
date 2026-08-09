// Mouse-wheel handling for the one list that IS its surface's scroll: the
// virtualised grid, which translates its rows and has no overflow of its own
// to catch a wheel. A horizontal rail is a REAL scroller and never comes here;
// the browser routes its wheel natively.

import { type RefObject, useEffect } from 'react';
import type { ScrollView, View } from 'react-native';

type WheelHost = RefObject<View | ScrollView | null>;

const LINE_PX = 16;

function unitPx(mode: number, viewport: number): number {
  if (mode === WheelEvent.DOM_DELTA_LINE) return LINE_PX;
  if (mode === WheelEvent.DOM_DELTA_PAGE) return viewport;
  return 1;
}

/**
 * Reports raw px along whichever axis moved more and consumes the gesture.
 * Only for a list that owns its surface's scroll entirely; anything that
 * scrolls one axis while the page owns the other must be a real scroller.
 */
function useWheelTravel(ref: WheelHost, onTravel: (delta: number) => void, enabled = true): void {
  useEffect(() => {
    // The RNW View IS the DOM node, but the types do not say so.
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || !enabled) return;
    const onWheel = (event: WheelEvent) => {
      // ctrl + wheel is pinch zoom. It is the browser's gesture, not the list's.
      if (event.ctrlKey) return;
      const x = event.deltaX * unitPx(event.deltaMode, window.innerWidth);
      const y = event.deltaY * unitPx(event.deltaMode, window.innerHeight);
      const delta = Math.abs(x) > Math.abs(y) ? x : y;
      if (delta === 0) return;
      event.preventDefault();
      onTravel(delta);
    };
    // Not passive: the handler calls preventDefault.
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [ref, onTravel, enabled]);
}

export type { WheelHost };
export { useWheelTravel };
