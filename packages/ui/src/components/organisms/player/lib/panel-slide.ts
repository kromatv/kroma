import { useEffect, useState } from 'react';

/** How long the picture takes to reach the settings card, and the panel to
 *  reach its edge. One number for both, so the two read as one movement. */
export const CARD_MS = 340;

export interface PanelSlide {
  mounted: boolean;
  shown: boolean;
  /** Bumped on every open. Keyed on, it starts the panel's own state fresh
   *  while the wrapper stays mounted long enough for the exit to play. */
  run: number;
}

/**
 * Keeps the settings panel in the tree while it leaves, so the picture expands
 * from under a panel that is still sliding out rather than one that vanished a
 * frame earlier.
 */
export function usePanelSlide(open: boolean): PanelSlide {
  const [mounted, setMounted] = useState(open);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setRun((n) => n + 1);
      return;
    }
    const out = setTimeout(() => setMounted(false), CARD_MS);
    return () => clearTimeout(out);
  }, [open]);
  return { mounted, shown: open, run };
}
