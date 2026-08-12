import { Children, isValidElement, type ReactNode } from 'react';

interface SurfaceParts {
  header: unknown;
  panel: unknown;
  footer: unknown;
}

interface SurfaceBands {
  header: ReactNode;
  panel: ReactNode;
  footer: ReactNode;
  /** Everything that claimed no band, which a Root hands to the panel it draws
   *  for itself. */
  loose: ReactNode[];
}

/**
 * The three bands of an overlay surface, taken from its DIRECT children.
 * Yoga has no `order` and a container cannot read its own subtree, so a Root
 * that wants its header pinned above a scrolling panel sorts what it was given
 * (see DESIGN.md §2). <Dialog> and <Drawer> are both this.
 */
function surfaceBands(children: ReactNode, parts: Readonly<SurfaceParts>): SurfaceBands {
  const kids = Children.toArray(children);
  const find = (which: unknown) => kids.find((node) => isValidElement(node) && node.type === which);
  const header = find(parts.header);
  const panel = find(parts.panel);
  const footer = find(parts.footer);
  return {
    header,
    panel,
    footer,
    loose: kids.filter((node) => node !== header && node !== panel && node !== footer),
  };
}

export type { SurfaceBands };
export { surfaceBands };
