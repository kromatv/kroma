interface PageMetrics {
  top: number;
  offsetFromStart: number;
  viewport: number;
  content: number;
  /** The row's height; with `lead`, lets the first row reveal the page's start. */
  size?: number;
  /** The content's own top padding: a row starting there is the page's first. */
  lead?: number;
}

function pageOffset({ top, offsetFromStart, viewport, content, size, lead }: PageMetrics): number {
  if (lead != null && size != null && top <= lead && top + size <= viewport) {
    return 0;
  }
  const last = Math.max(0, content - viewport);
  return Math.min(Math.max(top - offsetFromStart, 0), last);
}

interface NearestMetrics {
  top: number;
  size: number;
  current: number;
  margin: number;
  viewport: number;
  content: number;
}

/** The offset that shows a row whole with `margin` to spare, moving the page
 *  only when the row is not already there. */
function nearestOffset({ top, size, current, margin, viewport, content }: NearestMetrics): number {
  const last = Math.max(0, content - viewport);
  if (top - margin < current) {
    return Math.min(Math.max(top - margin, 0), last);
  }
  if (top + size + margin > current + viewport) {
    return Math.min(Math.max(top + size + margin - viewport, 0), last);
  }
  return current;
}

/** {@link nearestOffset}, carried on to an end of the content when what lies
 *  between the row and that end is shorter than the row, so a heading or the
 *  content's padding, and the row stays whole there. */
function bandOffset(metrics: NearestMetrics): number {
  const { top, size, margin, viewport, content } = metrics;
  const offset = nearestOffset(metrics);
  const last = Math.max(0, content - viewport);
  if (last - offset < size && top - margin >= last) {
    return last;
  }
  if (offset < size && top + size + margin <= viewport) {
    return 0;
  }
  return offset;
}

export type { NearestMetrics, PageMetrics };
export { bandOffset, nearestOffset, pageOffset };
