interface PageMetrics {
  top: number;
  offsetFromStart: number;
  viewport: number;
  content: number;
}

function pageOffset({ top, offsetFromStart, viewport, content }: PageMetrics): number {
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
  if (top - margin < current) return Math.min(Math.max(top - margin, 0), last);
  if (top + size + margin > current + viewport) {
    return Math.min(Math.max(top + size + margin - viewport, 0), last);
  }
  return current;
}

export type { NearestMetrics, PageMetrics };
export { nearestOffset, pageOffset };
