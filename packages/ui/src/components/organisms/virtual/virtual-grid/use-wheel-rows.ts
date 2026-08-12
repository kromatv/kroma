// Free pixel wheel-scrolling with snap-on-stop for the virtualised grid, which
// cannot be a scroll container (the library translates a strip and its virtual
// focus nodes own that position). react-tv-space-navigation is PATCHED
// (patches/react-tv-space-navigation@*.patch) to accept `freeScrollFraction`: a
// fractional item index rendered without a transition.

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import type { SpatialNavigationVirtualizedListRef } from 'react-tv-space-navigation';
import { useWheelTravel } from '#ui/lib/wheel-pan';

// Long enough that an inertia tail's sparse final events don't each snap.
const SNAP_AFTER_MS = 160;

/**
 * Returns the fractional row index to pass to the grid as `freeScrollFraction`,
 * or null when no gesture is running.
 */
export function useWheelScroll(
  viewport: RefObject<View | null>,
  list: RefObject<SpatialNavigationVirtualizedListRef | null>,
  lastRow: number,
  headerRows: number,
  rowPitch: number,
): number | null {
  const [fraction, setFraction] = useState<number | null>(null);
  // A wheel delivers faster than React re-renders, so the maths never reads state.
  const frac = useRef(0);
  const active = useRef(false);
  const committed = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (settle.current) clearTimeout(settle.current);
    };
  }, []);

  const lastIndex = lastRow + headerRows;

  const pan = useCallback(
    (delta: number) => {
      if (!active.current) {
        active.current = true;
        frac.current = list.current?.currentlyFocusedItemIndex ?? 0;
        committed.current = Math.round(frac.current);
      }
      frac.current = Math.min(lastIndex, Math.max(0, frac.current + delta / rowPitch));
      setFraction(frac.current);
      const nearest = Math.round(frac.current);
      if (nearest !== committed.current) {
        committed.current = nearest;
        list.current?.focus(nearest);
      }
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        // Handing the transform back to the row transition is the snap.
        active.current = false;
        const target = Math.round(frac.current);
        if (target !== committed.current) {
          committed.current = target;
          list.current?.focus(target);
        }
        setFraction(null);
      }, SNAP_AFTER_MS);
    },
    [list, lastIndex, rowPitch],
  );
  useWheelTravel(viewport, pan);

  return fraction;
}
