import type { LetterMark } from '@kroma/core';
import type { LetterRange } from '@kroma/ui/kit';

/** Where a poster grid's rows sit in its scroll content: the header above
 * them, the gap under each, and how many items share a row. */
export interface GridGeometry {
  header: number;
  gap: number;
  rowH: number;
  cols: number;
  count: number;
}

/** The first and last item whose row crosses the viewport. */
export interface ItemRange {
  first: number;
  last: number;
}

const pitch = (g: GridGeometry) => g.rowH + g.gap;

/** The content offset of a row's top edge. */
export function rowOffset(g: GridGeometry, row: number): number {
  return g.header + row * pitch(g);
}

/** The items whose rows show between `top` and `bottom` of the content, or
 * null while only the header is on screen. */
export function visibleItems(g: GridGeometry, top: number, bottom: number): ItemRange | null {
  const rows = Math.ceil(g.count / g.cols);
  if (rows === 0 || bottom <= top) return null;
  const step = pitch(g);
  const firstRow = Math.max(0, Math.floor((top - g.header - g.rowH) / step) + 1);
  const lastRow = Math.min(rows - 1, Math.ceil((bottom - g.header) / step) - 1);
  if (lastRow < firstRow) return null;
  return { first: firstRow * g.cols, last: Math.min(g.count - 1, lastRow * g.cols + g.cols - 1) };
}

/** The stretch of letters whose sections hold an item on screen. */
export function lettersOnScreen(
  marks: readonly LetterMark[],
  count: number,
  items: ItemRange | null,
): LetterRange | undefined {
  if (items === null) return undefined;
  const shown: string[] = [];
  marks.forEach((mark, i) => {
    const end = (marks[i + 1]?.index ?? count) - 1;
    if (mark.index <= items.last && end >= items.first) shown.push(mark.letter);
  });
  const first = shown[0];
  const last = shown.at(-1);
  return first === undefined || last === undefined ? undefined : { first, last };
}
