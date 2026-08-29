// Free pixel wheel-scrolling with snap-on-stop for the virtualised grid, which
// cannot be a scroll container (its strip is translated and its focused row owns
// that position). The fraction this returns is a fractional row index the strip
// renders at without a transition; null hands the transform back to the row
// transition, and that glide is the snap.

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import { useStableCallback } from '#ui/lib/stable-callback';
import { useWheelTravel } from '#ui/lib/wheel-pan';
import type { GridRows } from './grid-rows';

// Long enough that an inertia tail's sparse final events don't each snap.
const SNAP_AFTER_MS = 160;

/**
 * Returns the fractional row index to render the strip at, or null when no
 * gesture is running.
 */
export function useWheelScroll(
  viewport: RefObject<View | null>,
  rows: GridRows,
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

  const focusRow = useStableCallback((row: number) => rows.focus(row));
  const startRow = useStableCallback(() => rows.focusedRow);

  const lastIndex = lastRow + headerRows;

  const pan = useCallback(
    (delta: number) => {
      if (!active.current) {
        active.current = true;
        frac.current = startRow();
        committed.current = Math.round(frac.current);
      }
      frac.current = Math.min(lastIndex, Math.max(0, frac.current + delta / rowPitch));
      setFraction(frac.current);
      const nearest = Math.round(frac.current);
      if (nearest !== committed.current) {
        committed.current = nearest;
        focusRow(nearest);
      }
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        active.current = false;
        setFraction(null);
      }, SNAP_AFTER_MS);
    },
    [focusRow, startRow, lastIndex, rowPitch],
  );
  useWheelTravel(viewport, pan);

  return fraction;
}
