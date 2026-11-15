/** The page a horizontal pager rests nearest to at a scroll offset, held to the
 *  pages it has: an overscroll past either end reads as that end. */
export function pageAt(offset: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offset / pageWidth)));
}

/** The page an unattended pager turns to: one on, and the first after the last. */
export function nextPage(page: number, count: number): number {
  return count > 0 ? (page + 1) % count : 0;
}
