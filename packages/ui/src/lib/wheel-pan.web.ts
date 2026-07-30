// Mouse-wheel / trackpad panning over a row. The wheel scrolls the row and
// deliberately does not move the selection; the next direction key pulls the row
// back to it.

import { type RefObject, useEffect } from 'react';
import type { View } from 'react-native';

/** Reports wheel travel over a horizontal row in raw px, positive = towards the end. */
function useWheelPan(
  ref: RefObject<View | null>,
  onPan: (delta: number) => void,
  enabled = true,
): void {
  useEffect(() => {
    // The RNW View IS the DOM node, but the type does not say so.
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || !enabled) return;

    const onWheel = (event: WheelEvent) => {
      // A trackpad swipes sideways (deltaX), a mouse only has a wheel (deltaY);
      // whichever moved more is the gesture.
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      onPan(delta);
    };

    // Not passive: this handler calls preventDefault.
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [ref, onPan, enabled]);
}

export { useWheelPan };
