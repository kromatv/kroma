import {
  Children,
  Fragment,
  isValidElement,
  type JSXElementConstructor,
  type ReactElement,
  type ReactNode,
} from 'react';

type Sorted = ReactNode[];

function opened(child: ReactNode): ReactNode {
  return isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
    ? directChildren(child.props.children)
    : child;
}

/**
 * A Root's DIRECT children, keyed like `Children.toArray`. A fragment is no
 * wrapper: what it holds counts as written in its place, so a part inside one
 * is still seen by its Root.
 */
function directChildren(children: ReactNode): ReactNode[] {
  return Children.map(children, opened) ?? [];
}

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
  for (const child of directChildren(children)) {
    const at = isValidElement(child) ? parts.indexOf(child.type) : -1;
    sorted[at < 0 ? parts.length : at]?.push(child);
  }
  return sorted;
}

/**
 * A Root's DIRECT children that are one part, in the order they were written,
 * typed with that part's props so the Root can read what each declares.
 */
function partsOf<P>(children: ReactNode, part: JSXElementConstructor<P>): ReactElement<P>[] {
  const found: ReactElement<P>[] = [];
  for (const child of directChildren(children)) {
    if (isValidElement<P>(child) && child.type === part) {
      found.push(child);
    }
  }
  return found;
}

export { directChildren, partsOf, sortParts };
