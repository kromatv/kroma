/** How many pixels of a text its box cuts off, across and down. */
export type TextClip = Readonly<{ width: number; height: number }>;

type Size = Readonly<{ width: number; height: number }>;

type ClipMeasure = Readonly<{
  overflowX: string;
  overflowY: string;
  scroll: Size;
  client: Size;
  lineHeight: number;
}>;

const ROUNDING = 1;

function cut(overflow: string, beyond: number, least: number): number {
  const rounded = Math.round(beyond);
  return overflow !== 'visible' && rounded > least ? rounded : 0;
}

/** What a box cuts off its text: how far its content reaches past it on each
 *  axis the box does not let it spill over. Across, anything past a pixel of
 *  rounding. Down, more than half a line, so a line box shorter than its font
 *  is not taken for a line the box drops. Null when nothing is cut, and for a
 *  box with no area to show a text in. */
export function textClip(measure: ClipMeasure): TextClip | null {
  const { scroll, client } = measure;
  if (client.width <= 0 || client.height <= 0) {
    return null;
  }
  const down = Math.max(ROUNDING, measure.lineHeight / 2);
  const width = cut(measure.overflowX, scroll.width - client.width, ROUNDING);
  const height = cut(measure.overflowY, scroll.height - client.height, down);
  return width > 0 || height > 0 ? { width, height } : null;
}
