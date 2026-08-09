import { useLayoutEffect, useRef, useState } from 'react';

/** How long the incoming image's fade runs; the outgoing one must outlive it. */
export const CROSSFADE_MS = 900;

/** The previously shown source, kept for the length of the incoming fade so a
 * change of `src` is a crossfade rather than a blink. Render the returned
 * source underneath, and the current one above with a fade-in animation of
 * the same duration. A LAYOUT effect on purpose: with a passive effect the
 * outgoing image is missing from the first paint after a change, and
 * whatever sits behind the pair flashes through for one frame. */
export function useCrossfade(src: string | null, ms: number = CROSSFADE_MS): string | null {
  const [prev, setPrev] = useState<string | null>(null);
  const last = useRef(src);
  useLayoutEffect(() => {
    if (src === last.current) return;
    setPrev(last.current);
    last.current = src;
    const timer = setTimeout(() => setPrev(null), ms);
    return () => clearTimeout(timer);
  }, [src, ms]);
  return prev;
}
