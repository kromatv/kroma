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
 *
 * A band holding nothing is not a band: a surface whose footer is written
 * around a condition draws no shelf on the pass where the condition is false.
 */
function surfaceBands(children: ReactNode, parts: Readonly<SurfaceParts>): SurfaceBands {
  const kids = Children.toArray(children).filter((node) => !isEmptyBand(node, parts));
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

function isEmptyBand(node: ReactNode, parts: Readonly<SurfaceParts>): boolean {
  if (!isValidElement(node)) return false;
  const band =
    node.type === parts.header || node.type === parts.panel || node.type === parts.footer;
  if (!band) return false;
  const { children } = node.props as { children?: ReactNode };
  return Children.toArray(children).length === 0;
}

export type { SurfaceBands };
export { surfaceBands };
