// Where a row should sit once the selection has moved: the highlight travels
// freely across the middle of the row, and the row only moves once the
// highlight comes within `margin` of an edge, keeping that much look-ahead
// past it. That depends on where the row already is — it is hysteresis, not a
// formula on the index — which is why this takes the offset as an input as
// well as returning one.

import type { ViewStyle } from 'react-native';

interface EdgeScrollInput {
  /** Where the row sits now, in px from the start (always ≥ 0). */
  offset: number;
  index: number;
  /** Item pitch: the tile's own size plus the gap after it. */
  itemSize: number;
  viewport: number;
  count: number;
  /** Look-ahead to keep past the selection, in px. One tile reads best. */
  margin: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The offset after the selection moved to `index`. Returns `offset` unchanged
 * whenever the selection is comfortably inside the row, which is what makes
 * the highlight, rather than the content, the thing that moves.
 */
function edgeScrollOffset({
  offset,
  index,
  itemSize,
  viewport,
  count,
  margin,
}: EdgeScrollInput): number {
  if (viewport <= 0 || itemSize <= 0) return 0;
  const furthest = Math.max(0, count * itemSize - viewport);
  const start = index * itemSize;
  const end = start + itemSize;

  // `atLeast` is what it takes to show the margin after the item; `atMost` is
  // what it takes to show it before. Both clamp to the row, so the first and
  // last items simply sit against their end.
  const atLeast = clamp(end + margin - viewport, 0, furthest);
  const atMost = clamp(start - margin, 0, furthest);

  // A row narrower than one item plus both margins can't honour them; centre
  // on the item instead of flip-flopping between two impossible bounds.
  // Rounded to a whole pixel: a fractional translateX puts tile boundaries on
  // sub-pixels, which Chrome rounds independently into hairline seams.
  if (atLeast > atMost) return Math.round(clamp(start + itemSize / 2 - viewport / 2, 0, furthest));

  return Math.round(clamp(offset, atLeast, atMost));
}

/** How far the row can travel: everything it holds, less what fits. The one
 * definition the clamp bound and the snap bound both use, so they can't
 * disagree and let an offset drift off the pitch grid. */
function maxOffset(count: number, pitch: number, room: number): number {
  return Math.max(0, count * pitch - room);
}

/**
 * The horizontal padding a content style spends, in pixels. Percentages and
 * other non-numeric lengths are ignored rather than guessed at, and longhands
 * win over the shorthand, matching React Native's own precedence.
 */
function horizontalInset(style: ViewStyle | undefined): number {
  if (!style) return 0;
  const both = typeof style.paddingHorizontal === 'number' ? style.paddingHorizontal : 0;
  const left = typeof style.paddingLeft === 'number' ? style.paddingLeft : both;
  const right = typeof style.paddingRight === 'number' ? style.paddingRight : both;
  return left + right;
}

/**
 * The pitch that fits whole tiles into the row: rounds `itemWidth` to the
 * nearest whole count of columns and shares the viewport out between them, so
 * the last tile is never sliced by the edge. Always a whole number of pixels
 * — a fractional pitch puts tile boundaries on sub-pixels, which Chrome
 * rounds independently into hairline seams.
 */
function fitPitch(itemWidth: number, viewport: number): number {
  if (itemWidth <= 0 || viewport <= 0) return Math.max(1, Math.round(itemWidth));
  const columns = Math.max(1, Math.round(viewport / itemWidth));
  return Math.max(1, Math.floor(viewport / columns));
}

export type { EdgeScrollInput };
export { edgeScrollOffset, fitPitch, horizontalInset, maxOffset };
