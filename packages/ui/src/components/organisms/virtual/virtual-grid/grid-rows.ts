// Where a windowed grid's rows sit, and which of them are mounted.
//
// A grid does not scroll: the strip is translated, and it only moves once the
// selection leaves the page on screen. That is the difference from a rail (see
// edge-scroll), whose highlight travels to an edge and pushes the row along -
// a rail's focused tile belongs at the left edge, while a grid has rows above
// and below worth seeing.
//
// Every index here is a row of the LIST, which counts a header as row 0.

/** A windowed grid's rows, as its one outside caller sees them. */
export interface GridRows {
  /** Put the focus on a row, mounting it first where the window does not hold
   *  it yet. */
  focus: (row: number) => void;
  /** The row the focus is on. */
  focusedRow: number;
}

export interface RowSpec {
  /** Rows of tiles, not counting a header. */
  rows: number;
  /** A row's height plus the gap after it. */
  pitch: number;
  header: boolean;
  /** The header's own height, which need not be a row's. */
  headerSize: number;
  /** The height of the box that clips the strip. */
  viewport: number;
}

export interface RowMetrics {
  /** Rows in the list, header included. */
  count: number;
  headerRows: number;
  pitch: number;
  headerSize: number;
  /** Whole rows the viewport shows, at least one. */
  visible: number;
  /** Everything the strip holds, in px. */
  height: number;
}

export interface RowWindow {
  start: number;
  end: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function rowMetrics({ rows, pitch, header, headerSize, viewport }: RowSpec): RowMetrics {
  const size = Math.max(1, pitch);
  const head = header ? headerSize : 0;
  return {
    count: rows + (header ? 1 : 0),
    headerRows: header ? 1 : 0,
    pitch: size,
    headerSize: head,
    visible: Math.max(1, Math.floor(viewport / size)),
    height: head + rows * size,
  };
}

/** The top of a row, in px from the strip's origin. */
export function rowTop(row: number, metrics: RowMetrics): number {
  return row <= 0 ? 0 : metrics.headerSize + (row - metrics.headerRows) * metrics.pitch;
}

/** The row parked at the top of the viewport while `focused` holds the focus.
 *  Whole pages, so a press that stays on the page moves the ring and leaves the
 *  tiles where they are. */
export function pageRow(focused: number, metrics: RowMetrics): number {
  const page = focused - (focused % metrics.visible);
  return Math.min(page, Math.max(metrics.count - metrics.visible, 0));
}

/** How far the strip has travelled while `focused` holds the focus. */
export function stripOffset(focused: number, metrics: RowMetrics): number {
  return rowTop(pageRow(focused, metrics), metrics);
}

/** The same offset for a FRACTIONAL row, which is where a wheel leaves the
 *  strip mid-gesture. Read off the same page-aligned offsets, so letting go
 *  glides on from where the wheel stopped instead of hauling the strip back
 *  through a page. */
export function freeOffset(fraction: number, metrics: RowMetrics): number {
  const last = Math.max(metrics.count - 1, 0);
  const at = clamp(fraction, 0, last);
  const low = Math.floor(at);
  const from = stripOffset(low, metrics);
  const to = stripOffset(Math.min(low + 1, last), metrics);
  return from + (to - from) * (at - low);
}

/** The rows to mount: the page on screen plus `overscan` either side, so the
 *  row a press moves to already exists. The navigator can only reach a node
 *  that is registered. */
export function rowWindow(focused: number, metrics: RowMetrics, overscan: number): RowWindow {
  const top = pageRow(focused, metrics);
  return {
    start: Math.max(0, top - overscan),
    end: Math.min(metrics.count - 1, top + metrics.visible - 1 + overscan),
  };
}
