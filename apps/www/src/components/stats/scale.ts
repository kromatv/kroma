// Four gridlines reads best, so it wins a tie; three or five are taken when they
// land on a rounder step, so the top of the axis sits just above the peak
// instead of far above it.
const LINE_COUNTS = [4, 5, 3];
const STEPS = [1, 2, 5];
const POWERS = 12;

interface Scale {
  top: number;
  lines: number;
}

/** The axis to draw for a series peaking at `peak`: a round top, a whole-number
 * step, and as little empty plot above the data as those two allow. */
export function scaleFor(peak: number): Scale {
  let best: Scale | null = null;
  for (let power = 0; power < POWERS; power++) {
    for (const digit of STEPS) {
      const step = digit * 10 ** power;
      for (const lines of LINE_COUNTS) {
        const top = step * lines;
        if (top < Math.max(peak, 1)) continue;
        if (!best || top < best.top) best = { top, lines };
      }
    }
  }
  return best ?? { top: Math.max(peak, 1), lines: LINE_COUNTS[0] as number };
}
