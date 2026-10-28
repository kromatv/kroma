// A horizontal track you can drag along (seek bar, volume slider). The 10-foot
// canvas is authored at a fixed 1920 width and scaled to whatever window it
// lands in, so the track measures itself both in canvas units and on-screen
// pixels and uses the ratio to convert a pointer offset correctly.

import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';
import { pointerToCanvas } from '#ui/lib/player/pointer-to-canvas';

interface DragTrack {
  /** Put on the track view, alongside `onLayout`. */
  ref: React.RefObject<View | null>;
  onLayout: (e: LayoutChangeEvent) => void;
  /** Re-read the on-screen box. Call as a gesture begins: it is the last moment
   *  before the number matters, and the stage may have been resized since. */
  measure: () => void;
  /** The track's width in canvas units, as state, for anything that renders. */
  width: number;
  /** A pointer's `locationX`, relative to the track, as an offset in canvas
   *  units. Null until the track has been measured. */
  offsetOf: (locationX: number) => number | null;
  /** A pointer's `clientX`, in window coordinates, as an offset in canvas
   *  units: what a hover reports, since it has no `locationX`. */
  offsetAtClient: (clientX: number) => number | null;
}

/**
 * Every layer inside the track should be `pointerEvents: 'none'`, so the track is
 * always the event's target and `locationX` is relative to the track itself
 * rather than to whichever fill happened to be under the finger.
 */
function useDragTrack(): DragTrack {
  const ref = useRef<View | null>(null);
  const canvas = useRef(0);
  const screen = useRef(0);
  const left = useRef(0);
  const [width, setWidth] = useState(0);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, _y, measured) => {
      left.current = x;
      screen.current = measured;
    });
  }, []);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = e.nativeEvent.layout.width;
      canvas.current = next;
      setWidth((prev) => (prev === next ? prev : next));
      measure();
    },
    [measure],
  );

  const offsetOf = useCallback((locationX: number): number | null => {
    const inCanvas = canvas.current;
    if (inCanvas <= 0) return null;
    return pointerToCanvas(locationX, screen.current, inCanvas);
  }, []);

  const offsetAtClient = useCallback(
    (clientX: number): number | null => offsetOf(clientX - left.current),
    [offsetOf],
  );

  return { ref, onLayout, measure, width, offsetOf, offsetAtClient };
}

export type { DragTrack };
export { useDragTrack };
