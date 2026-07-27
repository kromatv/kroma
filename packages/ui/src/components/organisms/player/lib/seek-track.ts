// The geometry of the segmented seek track.
//
// The bar draws one segment per chapter with a gap between them, so a time and a
// pixel are not related by a single percentage: the gaps carry no time, and each
// segment is only as wide as its chapter is long. Every place that converts
// between the two - the playhead, the storyboard preview, and the drag itself -
// has to use the SAME conversion, or they disagree on screen.
//
// They did: the segments were laid out with an equal `flex` each while the
// playhead was placed at `cur / dur` of the whole track, so with chapters of
// different lengths (a 96s cold open next to a 53-minute act) the playhead sat
// nowhere near the end of its own fill.

import { clamp01 } from './fmt';

/** Just enough of a chapter to lay one out. */
interface TrackSegment {
  startMs: number;
  endMs: number;
}

/** The space between two segments, in px. The track's own `gap`. */
const SEGMENT_GAP = 4;

const spanOf = (seg: TrackSegment) => Math.max(1, seg.endMs - seg.startMs);

/** Each segment's width in px: the track's width, less the gaps, shared out in
 * proportion to how long each chapter runs. This is what the layout produces
 * from `flex={span}`, computed here so the maths can be checked without one. */
function segmentWidths(segs: readonly TrackSegment[], trackWidth: number): number[] {
  if (segs.length === 0) return [];
  const total = segs.reduce((sum, seg) => sum + spanOf(seg), 0);
  const content = Math.max(0, trackWidth - SEGMENT_GAP * (segs.length - 1));
  return segs.map((seg) => (content * spanOf(seg)) / total);
}

/** Where a moment in the film sits on the track, in px from its left edge.
 * A time inside a gap (there are none - gaps sit exactly on chapter boundaries)
 * resolves to the boundary itself. */
function offsetAt(ms: number, segs: readonly TrackSegment[], trackWidth: number): number {
  if (trackWidth <= 0 || segs.length === 0) return 0;
  const widths = segmentWidths(segs, trackWidth);
  let left = 0;
  for (const [at, seg] of segs.entries()) {
    const width = widths[at] ?? 0;
    if (ms <= seg.startMs) return left;
    if (ms <= seg.endMs) return left + width * ((ms - seg.startMs) / spanOf(seg));
    left += width + SEGMENT_GAP;
  }
  return trackWidth;
}

/** The inverse: the moment under a pixel. A press in a gap lands on the start of
 * the segment after it, which is the chapter boundary the user aimed at. */
function msAtOffset(x: number, segs: readonly TrackSegment[], trackWidth: number): number {
  if (trackWidth <= 0 || segs.length === 0) return 0;
  const widths = segmentWidths(segs, trackWidth);
  let left = 0;
  for (const [at, seg] of segs.entries()) {
    const width = widths[at] ?? 0;
    const last = at === segs.length - 1;
    if (x <= left + width || last) {
      const frac = width > 0 ? clamp01((x - left) / width) : 0;
      return seg.startMs + frac * spanOf(seg);
    }
    left += width + SEGMENT_GAP;
  }
  return segs.at(-1)?.endMs ?? 0;
}

export type { TrackSegment };
export { msAtOffset, offsetAt, SEGMENT_GAP, segmentWidths };
