import { useEffect, useState } from 'react';
import { redrawStep, showsAnother } from './cast-position';

interface LivePosition {
  /** Where the playhead is at the moment of the call, in ms. */
  position: () => number;
  durationMs: number;
}

/** A playhead that moves by itself, in ms, for a view that draws it. It is
 * read on every frame and re-renders the view only when a bar or a timecode
 * would show something else, so it runs smooth and costs nothing while the
 * playhead is still. */
export function useLivePosition({ position, durationMs }: LivePosition): number {
  const step = redrawStep(durationMs);
  const [shown, setShown] = useState(position);

  useEffect(() => {
    let frame = requestAnimationFrame(function draw() {
      const next = position();
      setShown((was) => (showsAnother(was, next, step) ? next : was));
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [position, step]);

  return shown;
}
