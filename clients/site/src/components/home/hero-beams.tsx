import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { mountBeams } from '#site/lib/beams';

interface HeroBeamsProps {
  /** The element the burst locks onto (the wheel mark). */
  anchorRef: RefObject<HTMLElement | null>;
}

// Client-only backdrop for the hero: the WebGL burst, anchored to the wheel. The
// canvas prerenders empty (SSR draws nothing), then this effect mounts the
// animation on the client and tears it down on unmount, so a route change never
// leaks the RAF loop. Marked aria-hidden: it is pure decoration.
export function HeroBeams({ anchorRef }: Readonly<HeroBeamsProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountBeams(canvas, { anchor: anchorRef.current });
  }, [anchorRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      // A radial mask keeps the burst bright at the wheel and fades the opaque
      // canvas into the page charcoal at the edges, so there is no visible seam
      // where the hero ends.
      className="pointer-events-none absolute inset-0 size-full [mask-image:radial-gradient(115%_80%_at_50%_28%,black_45%,transparent_85%)]"
    />
  );
}
