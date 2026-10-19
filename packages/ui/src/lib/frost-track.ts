import { webWindow } from './dom';
import { frostFollowsScroll } from './frost-motion';

/** Reads where a frosted surface sits and returns the write that follows it. */
export type FrostMeasure = () => (() => void) | null;

/** Re-runs every registered measure once the page settles from a mount, a
 *  focus move, a resize, or a scroll where the engine cannot follow one, all
 *  reads before any write. */
export interface FrostTracker {
  watch(measure: FrostMeasure): () => void;
}

const SETTLE_MS = 120;

/** One tracker per frame; inert where there is no window to listen to. */
export function createFrostTracker(): FrostTracker {
  const measures = new Set<FrostMeasure>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const writes = [...measures].map((measure) => measure());
    for (const write of writes) write?.();
  };
  const settle = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SETTLE_MS);
  };
  return {
    watch(measure) {
      const win = webWindow();
      if (measures.size === 0 && win) {
        if (!frostFollowsScroll()) {
          win.addEventListener('scroll', settle, { capture: true, passive: true });
        }
        win.addEventListener('resize', settle);
        win.addEventListener('focusin', settle, { capture: true, passive: true });
      }
      measures.add(measure);
      measure()?.();
      settle();
      return () => {
        measures.delete(measure);
        if (measures.size === 0 && win) {
          win.removeEventListener('scroll', settle, { capture: true });
          win.removeEventListener('resize', settle);
          win.removeEventListener('focusin', settle, { capture: true });
          if (timer) clearTimeout(timer);
          timer = null;
        }
      };
    },
  };
}
