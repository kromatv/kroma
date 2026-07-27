// Where a row should sit once the selection has moved.
//
// The rule every television row actually follows, and the one the navigator
// library cannot express: KEEP THE OFFSET unless the selection is coming within
// a margin of an edge. Its three behaviours all compute the offset as a pure
// function of the focused index - the selection is pinned left, pinned right, or
// paged - so the row either scrolls under a selection that never moves, or does
// not scroll until the selection is already flush against the edge with nothing
// visible beyond it.
//
// What is wanted instead: the highlight travels freely across the middle of the
// row, and the row only moves when the highlight approaches either end, keeping
// `margin` of look-ahead past it in the direction of travel. That depends on
// where the row already is - it is hysteresis, not a formula on the index - which
// is why this takes the offset as an input as well as returning one.

import type { ViewStyle } from 'react-native';

interface EdgeScrollInput {
  /** Where the row sits now, in px from the start (always ≥ 0). */
  offset: number;
  /** The index that just took focus. */
  index: number;
  /** Item pitch: the tile's own size plus the gap after it. */
  itemSize: number;
  /** The visible length of the row. */
  viewport: number;
  /** How many items there are in total. */
  count: number;
  /** Look-ahead to keep past the selection, in px. One tile reads best: the row
   *  then always shows where you are about to go. */
  margin: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The offset after the selection moved to `index`.
 *
 * Returns `offset` unchanged whenever the selection is comfortably inside the
 * row - which is most presses, and is what makes the highlight (rather than the
 * content) the thing that moves.
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

  // The offsets that keep `margin` of look-ahead on each side of the selection.
  // `atLeast` is what it takes to show the margin AFTER the item; `atMost` is
  // what it takes to show the margin BEFORE it. Both are clamped to the row, so
  // the first and last items simply sit against their end.
  const atLeast = clamp(end + margin - viewport, 0, furthest);
  const atMost = clamp(start - margin, 0, furthest);

  // A row narrower than one item plus both margins cannot honour them; centre on
  // the item instead of flip-flopping between two impossible bounds.
  // Whole pixels out, always. A fractional translateX puts every tile boundary in
  // the row on a sub-pixel, and Chrome rounds each independently: hairline seams
  // between tiles, and a sliver at each end.
  if (atLeast > atMost) return Math.round(clamp(start + itemSize / 2 - viewport / 2, 0, furthest));

  return Math.round(clamp(offset, atLeast, atMost));
}

/** How far the row can travel: everything it holds, less what fits. One
 * definition, because a row whose clamp bound and whose snap bound disagree is
 * exactly how an offset drifts off the pitch grid - the failure this module is
 * written to prevent. */
function maxOffset(count: number, pitch: number, room: number): number {
  return Math.max(0, count * pitch - room);
}

/**
 * The horizontal padding a content style spends, in pixels.
 *
 * Percentages and other non-numeric lengths are ignored rather than guessed at:
 * the pitch maths needs a number, and being wrong by an unknown amount is worse
 * than being wrong by a padding nobody used. Longhands win over the shorthand,
 * which is React Native's own precedence.
 */
function horizontalInset(style: ViewStyle | undefined): number {
  if (!style) return 0;
  const both = typeof style.paddingHorizontal === 'number' ? style.paddingHorizontal : 0;
  const left = typeof style.paddingLeft === 'number' ? style.paddingLeft : both;
  const right = typeof style.paddingRight === 'number' ? style.paddingRight : both;
  return left + right;
}

/**
 * The pitch that fits WHOLE tiles into the row.
 *
 * `itemWidth` is what the design asks for; this is what the viewport can
 * actually hold. A 196pt tile in a 390pt phone leaves two and a fraction, so the
 * third tile is sliced by the edge and the row looks broken rather than
 * scrollable. Rounding to the nearest whole count and sharing the width out
 * gives three tiles of 130 - the same design, sized for the screen it is on.
 *
 * Rounds rather than floors: a viewport half a tile short of another column
 * looks better slightly tighter than with a column's worth of space to spare.
 *
 * The result is a WHOLE NUMBER of pixels, and that is the fix for the seams. A
 * 683pt strip over three columns is 227.667 - so every tile boundary landed on a
 * third of a pixel, Chrome rounded each one on its own, and the row grew hairline
 * gaps between tiles and a sliced sliver at each end (which is what made the
 * poster scrims look like they were not flush to the card edges). A whole-pixel
 * pitch leaves up to `columns - 1` pixels of the strip unused, which nobody can
 * see, instead of a fractional edge on every tile, which everybody could.
 */
function fitPitch(itemWidth: number, viewport: number): number {
  if (itemWidth <= 0 || viewport <= 0) return Math.max(1, Math.round(itemWidth));
  const columns = Math.max(1, Math.round(viewport / itemWidth));
  return Math.max(1, Math.floor(viewport / columns));
}

export type { EdgeScrollInput };
export { edgeScrollOffset, fitPitch, horizontalInset, maxOffset };
