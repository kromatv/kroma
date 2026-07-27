// Mouse-wheel / trackpad panning over a row.
//
// The wheel scrolls the row and NOTHING ELSE: it does not move the selection.
// Those are two different intents - "show me what else is here" and "pick this
// one" - and a pointer user expects to look around a row without the highlight
// (and the app's idea of where they are) following the cursor. The next press of
// a direction key pulls the row back to the selection, which is the same rule
// every television UI follows.
//
// Deltas are reported raw, in px; what to do with them is the row's business.

import { type RefObject, useEffect } from 'react';
import type { View } from 'react-native';

/**
 * Report wheel travel over a horizontal row.
 *
 * @param ref the row's viewport (the box the pointer is actually over).
 * @param onPan called with the px to move by, positive = towards the end.
 * @param enabled off while something else owns the pointer.
 */
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
      // A rail is horizontal, and both axes should drive it: a trackpad swipes
      // sideways (deltaX), a mouse only has a wheel (deltaY). Whichever moved
      // more is the gesture.
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      // The page must not scroll underneath: the row is what the pointer is on.
      event.preventDefault();
      onPan(delta);
    };

    // Not passive: this handler calls preventDefault.
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [ref, onPan, enabled]);
}

export { useWheelPan };
