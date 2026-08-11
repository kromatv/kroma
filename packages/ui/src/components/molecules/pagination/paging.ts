// The arithmetic under the row: which pages it shows, and which items a page holds.

/** A place in the row: a page to go to, or the run of pages the window hides. */
type PageSlot = number | 'gap';

function clamp(page: number, pageCount: number): number {
  return Math.min(Math.max(Math.trunc(page) || 1, 1), pageCount);
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let at = from; at <= to; at += 1) out.push(at);
  return out;
}

/**
 * The pages the row shows for `page`, first and last always among them, with a
 * `'gap'` where a run is hidden. Always the same length for a given
 * `pageCount`, so the row never reflows as it is paged; a gap that would stand
 * for a single page renders that page instead.
 */
function pageWindow(page: number, pageCount: number, siblings = 1): PageSlot[] {
  const total = Math.max(1, Math.trunc(pageCount) || 1);
  const at = clamp(page, total);
  const side = Math.max(0, Math.trunc(siblings) || 0);
  const width = side * 2 + 5;
  if (total <= width) return range(1, total);

  const left = Math.max(at - side, 1);
  const right = Math.min(at + side, total);
  if (left <= 2) return [...range(1, side * 2 + 3), 'gap', total];
  if (right >= total - 1) return [1, 'gap', ...range(total - side * 2 - 2, total)];
  return [
    1,
    left === 3 ? 2 : 'gap',
    ...range(left, right),
    right === total - 2 ? total - 1 : 'gap',
    total,
  ];
}

/** One page of a list, and the 1-based range it covers. */
interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  /** 1-based index of the first item shown, or 0 when there is nothing. */
  first: number;
  last: number;
  total: number;
}

/** The slice to render, with the page clamped into range. */
function paginate<T>(items: readonly T[], page: number, size: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: current,
    pageCount,
    first: slice.length === 0 ? 0 : start + 1,
    last: start + slice.length,
    total,
  };
}

export type { Page, PageSlot };
export { clamp, pageWindow, paginate };
