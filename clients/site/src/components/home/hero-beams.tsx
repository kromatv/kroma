import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { mountBeams } from '#site/lib/beams';

interface HeroBeamsProps {
  anchorRef: RefObject<HTMLElement | null>;
}

// Client-only: the canvas prerenders empty (SSR draws nothing), then this
// effect mounts the animation and tears it down on unmount, so a route change
// never leaks the RAF loop.
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
      // Radial mask fades the opaque canvas into the page charcoal at the
      // edges, so there is no visible seam where the hero ends.
      className="pointer-events-none absolute inset-0 size-full [mask-image:radial-gradient(115%_80%_at_50%_28%,black_45%,transparent_85%)]"
    />
  );
}
