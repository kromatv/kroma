import { Children, isValidElement, type ReactNode } from 'react';

type Sorted = ReactNode[];

/**
 * A Root's DIRECT children, sorted by part: one array for each part in the
 * order they are given, then one for every child that is none of them. Yoga has
 * no `order` and a container cannot read its own subtree, so a Root that places
 * its parts sorts what it was handed (see DESIGN.md §2).
 */
function sortParts(children: ReactNode, first: unknown): [Sorted, Sorted];
function sortParts(children: ReactNode, first: unknown, second: unknown): [Sorted, Sorted, Sorted];
function sortParts(children: ReactNode, ...parts: unknown[]): Sorted[] {
  const sorted: Sorted[] = [...parts.map((): Sorted => []), []];
  for (const child of Children.toArray(children)) {
    const at = isValidElement(child) ? parts.indexOf(child.type) : -1;
    sorted[at < 0 ? parts.length : at]?.push(child);
  }
  return sorted;
}

export { sortParts };
