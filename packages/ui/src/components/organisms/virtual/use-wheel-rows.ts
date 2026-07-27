// Mouse-wheel scrolling for the navigator library's virtualised grid: FREE
// pixels while the wheel turns, snap to the nearest row when it stops - the
// behaviour of CSS `scroll-snap-type: y proximity`, on a list that cannot be a
// scroll container.
//
// It cannot be one because it never scrolls: the library TRANSLATES a strip to
// `scrollOffsetsArray[currentlyFocusedItemIndex]`, and its virtual focus nodes -
// the thing that lets a D-pad reach unmounted rows - own that position. Every
// scheme that quantised the wheel into row-sized `focus()` calls was tried and
// felt wrong two different ways: banking a row's height of travel meant turning
// the wheel with nothing happening, and per-event heuristics fell apart on
// macOS's accelerated deltas. The missing piece was a fractional position, so
// the library is PATCHED (patches/react-tv-space-navigation@*.patch) to accept
// `freeScrollFraction`: a fractional item index rendered WITHOUT a transition.
//
// The gesture, in three parts:
//  - every wheel event moves the strip immediately: fraction += delta / pitch,
//    rendered 1:1 with the input, no banking, no thresholds;
//  - crossing a row still calls `focus(row)` - invisible while the fraction
//    drives the transform, but it keeps the library's render window AND the
//    selection tracking the viewport, so the next D-pad press continues from
//    what is on screen;
//  - when the events stop, the fraction is cleared: the transform falls back to
//    the focused row's offset, and the transition (200ms ease-out, re-enabled by
//    the null) glides the strip from wherever the wheel left it onto the row
//    boundary. That glide IS the snap.

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import type { SpatialNavigationVirtualizedListRef } from 'react-tv-space-navigation';
import { useWheelPan } from '#ui/lib/wheel-pan';

/** How long after the last wheel event the gesture counts as over - and the
 * snap starts. Short enough to feel attached to the gesture, long enough that
 * an inertia tail's sparse final events don't each trigger a snap. */
const SNAP_AFTER_MS = 160;

/**
 * Free wheel-scrolling with snap-on-stop.
 *
 * Returns the fractional item index to pass to the grid as
 * `freeScrollFraction`, or null when no gesture is running (rows + transitions
 * behave exactly as without the wheel).
 *
 * @param viewport the box the pointer is actually over.
 * @param list the grid's list ref - indices are ROWS.
 * @param lastRow the last row index (content rows; the header, when present, is
 *   row 0 of the list and is folded in via `headerRows`).
 * @param headerRows 1 when a header occupies the list's row 0, else 0.
 * @param rowPitch the row's height in px: what a pixel of wheel travel is
 *   measured against, so on-screen distance equals input distance.
 */
export function useWheelScroll(
  viewport: RefObject<View | null>,
  list: RefObject<SpatialNavigationVirtualizedListRef | null>,
  lastRow: number,
  headerRows: number,
  rowPitch: number,
): number | null {
  const [fraction, setFraction] = useState<number | null>(null);
  /** The gesture's live position; state is its committed shadow. A wheel
   *  delivers faster than React re-renders, so the maths never reads state. */
  const frac = useRef(0);
  const active = useRef(false);
  /** The row last handed to `focus()`, so crossing is detected without asking
   *  the list (whose index is what we last set anyway). */
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
        // Gesture start: pick up from wherever the selection is. (If the
        // previous gesture's snap glide is still in flight this rounds to its
        // destination - at most half a row of skip, gone in a frame.)
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
        // The wheel stopped: make sure the nearest row holds the focus, then
        // hand the transform back to the row transition - the snap.
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
  useWheelPan(viewport, pan);

  return fraction;
}
